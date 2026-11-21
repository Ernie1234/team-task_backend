import type { Server as SocketIOServer } from "socket.io";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import NoteModel from "@/models/note-model";
import { findVisibleNote } from "@/services/note-service";
import { BadRequestException, NotFoundException } from "@/utils/appError";
import Logger from "@/utils/logger";
import { registerGauge } from "@/utils/metrics";

/*
 * Live co-editing for Notes.
 *
 * Each open note has one shared Yjs document in memory. Browsers send their
 * edits (Yjs updates) and cursors (awareness updates) over Socket.IO; the
 * server merges them, relays them to everyone else on the page, and saves the
 * merged document to MongoDB shortly after editing pauses.
 *
 * Notes written before live editing have only block JSON. The first person to
 * open such a note converts it in their browser ("seed") while anyone else
 * opening it waits a moment for the result.
 */

const SAVE_DELAY_MS = 2_000;
const SAVE_MAX_WAIT_MS = 10_000;
const MAX_UPDATE_BYTES = 1_000_000;
const MAX_DOC_BYTES = 8_000_000;

type Member = { userId: string; clientIds: Set<number> };

type Session = {
  noteId: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  members: Map<string, Member>; // socket id -> who and which cursors
  seeded: boolean;
  seeder: string | null;
  dirty: boolean;
  lastEditedBy: string | null;
  saveTimer: ReturnType<typeof setTimeout> | null;
  firstDirtyAt: number;
  saving: Promise<void> | null;
};

const sessions = new Map<string, Session>();

registerGauge("teamtask_live_notes", "Notes open for live editing", () => sessions.size);
registerGauge("teamtask_live_note_editors", "Tabs editing notes live", () => [...sessions.values()].reduce((sum, s) => sum + s.members.size, 0));
const opening = new Map<string, Promise<Session>>();
let io: SocketIOServer | null = null;

export const roomOf = (noteId: string) => `note:${noteId}`;
export const setNoteCollabServer = (server: SocketIOServer) => {
  io = server;
};
export const hasLiveSession = (noteId: string) => (sessions.get(noteId)?.members.size ?? 0) > 0;

const toBytes = (value: unknown) => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new BadRequestException("Expected binary data");
};

const openSession = async (noteId: string) => {
  const existing = sessions.get(noteId);
  if (existing) return existing;
  const pending = opening.get(noteId);
  if (pending) return pending;

  const load = (async () => {
    const stored = await NoteModel.findById(noteId).select("+ydoc").lean();
    const doc = new Y.Doc({ gc: true });
    if (stored?.ydoc) {
      // Buffer when hydrated; BSON Binary (bytes in .buffer) from a lean query
      const raw = stored.ydoc as unknown;
      Y.applyUpdate(doc, raw instanceof Uint8Array ? raw : (raw as { buffer: Uint8Array }).buffer);
    }
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState(null); // the server has no cursor of its own
    const session: Session = {
      noteId,
      doc,
      awareness,
      members: new Map(),
      seeded: !!stored?.ydoc,
      seeder: null,
      dirty: false,
      lastEditedBy: null,
      saveTimer: null,
      firstDirtyAt: 0,
      saving: null,
    };
    // Remember which cursors belong to which tab, so they can be removed when it leaves
    awareness.on("update", ({ added }: { added: number[] }, origin: unknown) => {
      const member = typeof origin === "string" ? session.members.get(origin) : undefined;
      added.forEach((id) => member?.clientIds.add(id));
    });
    sessions.set(noteId, session);
    return session;
  })();

  opening.set(noteId, load);
  try {
    return await load;
  } finally {
    opening.delete(noteId);
  }
};

const save = async (session: Session) => {
  if (session.saveTimer) clearTimeout(session.saveTimer);
  session.saveTimer = null;
  if (!session.dirty) return session.saving ?? undefined;
  session.dirty = false;
  const state = Y.encodeStateAsUpdate(session.doc);
  const write = NoteModel.updateOne(
    { _id: session.noteId },
    { $set: { ydoc: Buffer.from(state), ...(session.lastEditedBy ? { lastEditedBy: session.lastEditedBy } : {}) } }
  )
    .then(() => undefined)
    .catch((error) => {
      session.dirty = true; // try again with the next change or on close
      Logger.error(`Saving live note ${session.noteId} failed:`, error);
    });
  session.saving = write;
  await write;
  if (session.saving === write) session.saving = null;
};

const scheduleSave = (session: Session) => {
  const now = Date.now();
  if (!session.dirty) session.firstDirtyAt = now;
  session.dirty = true;
  if (session.saveTimer) clearTimeout(session.saveTimer);
  // Save after a pause in typing, but at least every few seconds during long edits
  const wait = Math.max(0, Math.min(SAVE_DELAY_MS, session.firstDirtyAt + SAVE_MAX_WAIT_MS - now));
  session.saveTimer = setTimeout(() => void save(session), wait);
};

const fullState = (session: Session) => ({
  update: Y.encodeStateAsUpdate(session.doc),
  stateVector: Y.encodeStateVector(session.doc),
  awareness: session.awareness.getStates().size
    ? awarenessProtocol.encodeAwarenessUpdate(session.awareness, [...session.awareness.getStates().keys()])
    : null,
});

export type JoinResult =
  | ({ status: "ready" } & ReturnType<typeof fullState>)
  | { status: "seed" }
  | { status: "wait" };

/** A tab opens a note: check access, join its room, and send the current document */
export const joinNote = async (socketId: string, userId: string, workspaceId: string, noteId: string): Promise<JoinResult> => {
  const note = await findVisibleNote(workspaceId, noteId, userId);
  const session = await openSession(String(note._id));
  if (!session.members.has(socketId)) session.members.set(socketId, { userId, clientIds: new Set() });
  await io?.in(socketId).socketsJoin(roomOf(session.noteId));

  if (session.seeded) return { status: "ready", ...fullState(session) };
  // Not converted yet: the first tab converts it, the rest wait for the result
  if (!session.seeder || !session.members.has(session.seeder)) {
    session.seeder = socketId;
    return { status: "seed" };
  }
  return { status: "wait" };
};

const memberSession = (socketId: string, noteId: unknown) => {
  const session = typeof noteId === "string" ? sessions.get(noteId) : undefined;
  if (!session || !session.members.has(socketId)) throw new NotFoundException("Open the note first");
  return session;
};

/** The converted document from the tab that was asked to seed it */
export const seedNote = (socketId: string, noteId: unknown, rawUpdate: unknown) => {
  const session = memberSession(socketId, noteId);
  if (!session.seeded) {
    if (session.seeder !== socketId) throw new BadRequestException("Another tab is preparing this note");
    const update = toBytes(rawUpdate);
    if (update.byteLength > MAX_UPDATE_BYTES) throw new BadRequestException("This note is too large to open for live editing");
    Y.applyUpdate(session.doc, update, socketId);
    session.seeded = true;
    session.seeder = null;
    session.lastEditedBy = session.members.get(socketId)!.userId;
    scheduleSave(session);
  }
  // Everyone who was waiting gets the document
  const state = fullState(session);
  io?.to(roomOf(session.noteId)).except(socketId).emit("note:ready", { noteId: session.noteId, ...state });
  return { status: "ready" as const, ...state };
};

/** An edit from one tab: merge it and pass it on */
export const applyNoteUpdate = (socketId: string, noteId: unknown, rawUpdate: unknown) => {
  const session = memberSession(socketId, noteId);
  if (!session.seeded) throw new BadRequestException("This note isn't ready yet");
  const update = toBytes(rawUpdate);
  if (update.byteLength > MAX_UPDATE_BYTES) throw new BadRequestException("That change is too large");
  Y.applyUpdate(session.doc, update, socketId);
  session.lastEditedBy = session.members.get(socketId)!.userId;
  io?.to(roomOf(session.noteId)).except(socketId).emit("note:update", { noteId: session.noteId, update });
  scheduleSave(session);
  if (session.dirty && Y.encodeStateAsUpdate(session.doc).byteLength > MAX_DOC_BYTES) {
    Logger.warn(`Live note ${session.noteId} is over ${MAX_DOC_BYTES} bytes`);
  }
};

/** Cursor and selection of one tab */
export const applyNoteAwareness = (socketId: string, noteId: unknown, rawUpdate: unknown) => {
  const session = memberSession(socketId, noteId);
  const update = toBytes(rawUpdate);
  if (update.byteLength > 64_000) throw new BadRequestException("Cursor update too large");
  awarenessProtocol.applyAwarenessUpdate(session.awareness, update, socketId);
  io?.to(roomOf(session.noteId)).except(socketId).emit("note:awareness", { noteId: session.noteId, update });
};

const closeIfEmpty = async (session: Session) => {
  if (session.members.size) return;
  await save(session);
  // Someone may have opened it again while it was saving
  if (session.members.size || sessions.get(session.noteId) !== session) return;
  sessions.delete(session.noteId);
  session.awareness.destroy();
  session.doc.destroy();
};

const removeMember = (session: Session, socketId: string) => {
  const member = session.members.get(socketId);
  if (!member) return;
  session.members.delete(socketId);
  void io?.in(socketId).socketsLeave(roomOf(session.noteId));
  if (member.clientIds.size) {
    const ids = [...member.clientIds];
    awarenessProtocol.removeAwarenessStates(session.awareness, ids, "server");
    io?.to(roomOf(session.noteId)).emit("note:awareness", {
      noteId: session.noteId,
      update: awarenessProtocol.encodeAwarenessUpdate(session.awareness, ids),
    });
  }
  if (session.seeder === socketId && !session.seeded) {
    // The tab converting the note left: let a waiting tab take over
    session.seeder = null;
    io?.to(roomOf(session.noteId)).emit("note:reseed", { noteId: session.noteId });
  }
  void closeIfEmpty(session);
};

export const leaveNote = (socketId: string, noteId: unknown) => {
  const session = typeof noteId === "string" ? sessions.get(noteId) : undefined;
  if (session) removeMember(session, socketId);
};

/** A tab closed or lost its connection */
export const leaveAllNotes = (socketId: string) => {
  sessions.forEach((session) => removeMember(session, socketId));
};

/** The note was deleted: close it for everyone without saving */
export const closeDeletedNotes = (noteIds: string[]) => {
  noteIds.forEach((noteId) => {
    const session = sessions.get(noteId);
    if (!session) return;
    if (session.saveTimer) clearTimeout(session.saveTimer);
    io?.to(roomOf(noteId)).emit("note:closed", { noteId, reason: "deleted" });
    void io?.in(roomOf(noteId)).socketsLeave(roomOf(noteId));
    sessions.delete(noteId);
    session.awareness.destroy();
    session.doc.destroy();
  });
};

/** The note became private: everyone except the owner loses the live session */
export const revokeNoteAccess = (noteId: string, ownerId: string) => {
  const session = sessions.get(noteId);
  if (!session) return;
  [...session.members].forEach(([socketId, member]) => {
    if (member.userId === ownerId) return;
    io?.to(socketId).emit("note:closed", { noteId, reason: "private" });
    removeMember(session, socketId);
  });
};

/** Before shutdown: write every open note */
export const flushNoteSessions = async () => {
  await Promise.allSettled([...sessions.values()].map((s) => save(s)));
};
