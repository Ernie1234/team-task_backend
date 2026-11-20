import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import type { RequestHandler } from "express";
import passport from "passport";
import { config } from "./app.config";
import Logger from "@/utils/logger";
import UserModel, { type UserDocument } from "@/models/user-model";
import MemberModel from "@/models/member-model";
import { chatSocketHandlers } from "@/handlers/chat-socket.handlers";

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  workspaceId?: string;
  user?: any;
}

export type PresencePayload = {
  userId: string;
  isOnline: boolean;
  lastSeen: Date | null;
};

let socketServiceInstance: SocketService | null = null;

// The running SocketService, for code outside the socket layer (e.g. notifications)
export const getSocketService = () => socketServiceInstance;

export class SocketService {
  private io: SocketIOServer;
  // userId -> ids of every socket that user has open (one per tab/device)
  private userSockets: Map<string, Set<string>> = new Map();
  // Last presence state we broadcast per user, so we never send duplicates
  private publishedPresence: Map<string, boolean> = new Map();
  // Per-user queue so DB writes/broadcasts for one user never interleave
  private presenceQueue: Map<string, Promise<void>> = new Map();
  private isShuttingDown = false;

  constructor(server: HTTPServer, sessionMiddleware: RequestHandler) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: config.FRONTEND_ORIGIN,
        credentials: true,
      },
      // Detect dropped connections (closed laptop, lost network) within ~15s
      pingInterval: 10000,
      pingTimeout: 5000,
    });

    this.setupMiddleware(sessionMiddleware);
    this.setupEventHandlers();
    socketServiceInstance = this;
  }

  private setupMiddleware(sessionMiddleware: RequestHandler) {
    // Use the same session middleware from Express
    this.io.use((socket, next) => {
      sessionMiddleware(socket.request as any, {} as any, next as any);
    });

    // Passport middleware for Socket.IO
    this.io.use((socket, next) => {
      passport.initialize()(socket.request as any, {} as any, next as any);
    });

    this.io.use((socket, next) => {
      passport.session()(socket.request as any, {} as any, next as any);
    });

    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const req = socket.request as any;
        
        // Log session information for debugging
        Logger.info('Socket connection attempt:', {
          hasSession: !!req.session,
          sessionID: req.sessionID,
          hasPassport: !!req.session?.passport,
          hasUser: !!req.user,
          cookies: req.headers.cookie ? 'present' : 'missing'
        });
        
        const user = req.user;
        
        if (!user || !user._id) {
          Logger.warn("Socket connection attempted without authentication", {
            hasSession: !!req.session,
            sessionID: req.sessionID,
            passportUser: req.session?.passport?.user
          });
          return next(new Error("Authentication required"));
        }

        // Verify user exists
        const dbUser = await UserModel.findById(user._id);
        if (!dbUser) {
          Logger.warn(`Socket connection attempted by non-existent user ${user._id}`);
          return next(new Error("User not found"));
        }

        socket.userId = user._id.toString();
        socket.workspaceId = dbUser.currentWorkspace?.toString();
        socket.user = dbUser;

        Logger.info(`✅ Socket authenticated for user ${dbUser.name} (${user._id})${dbUser.currentWorkspace ? ` in workspace ${dbUser.currentWorkspace}` : ' (no workspace)'}`);
        next();
      } catch (error) {
        Logger.error("Socket authentication error:", error);
        next(new Error("Authentication failed"));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on("connection", async (socket: AuthenticatedSocket) => {
      try {
        Logger.info(`User ${socket.userId} connected to workspace ${socket.workspaceId}`);

        const userId = socket.userId!;

        // Track this socket; the user is online while at least one socket is open
        const sockets = this.userSockets.get(userId) ?? new Set<string>();
        sockets.add(socket.id);
        this.userSockets.set(userId, sockets);

        // Personal room: every tab of this user, for notifications etc.
        void socket.join(this.userRoom(userId));

        // Join workspace chat room if user has a workspace.
        // Not awaited so every handler below is registered before any event arrives.
        if (socket.workspaceId) {
          void socket.join(`workspace:${socket.workspaceId}`);
        }

        // Presence: subscribe to live online/offline updates for a workspace
        socket.on("presence:subscribe", async (payload, ack) => {
          const respond = typeof ack === "function" ? ack : () => {};
          try {
            const workspaceId = payload?.workspaceId;
            if (!workspaceId || typeof workspaceId !== "string") {
              return respond({ ok: false, error: "workspaceId is required" });
            }

            const isMember = await MemberModel.exists({ userId, workspaceId });
            if (!isMember) {
              return respond({ ok: false, error: "Access denied to workspace" });
            }

            await socket.join(this.presenceRoom(workspaceId));
            const presence = await this.getWorkspacePresence(workspaceId);
            respond({ ok: true, workspaceId, presence });
          } catch (error) {
            Logger.error("Error handling presence:subscribe:", error);
            respond({ ok: false, error: "Failed to load presence" });
          }
        });

        socket.on("presence:unsubscribe", async (payload) => {
          const workspaceId = payload?.workspaceId;
          if (workspaceId && typeof workspaceId === "string") {
            await socket.leave(this.presenceRoom(workspaceId));
          }
        });

        // Set up chat handlers
        chatSocketHandlers(socket, this.io);

        // Handle disconnect
        socket.on("disconnect", (reason) => {
          Logger.info(`User ${userId} socket ${socket.id} disconnected (${reason})`);

          const userSocketIds = this.userSockets.get(userId);
          userSocketIds?.delete(socket.id);
          if (!userSocketIds || userSocketIds.size === 0) {
            this.userSockets.delete(userId);
          }

          // During shutdown close() marks everyone offline in one go
          if (!this.isShuttingDown) {
            this.syncPresence(userId);
          }
        });

        // Mark the user online (no-op if another tab already did)
        this.syncPresence(userId);

        // Handle typing events
        socket.on("typing:start", ({ chatType, workspace, project, otherUserId }) => {
          let roomName = "";
          
          switch (chatType) {
            case "workspace":
              if (workspace) {
                roomName = `workspace:${workspace}`;
              }
              break;
            case "project":
              if (project) {
                roomName = `project:${project}`;
              }
              break;
            case "direct":
              if (otherUserId) {
                const participants = [socket.userId!, otherUserId].sort();
                roomName = `direct:${participants.join(":")}`;
              }
              break;
          }
          
          if (roomName) {
            // DMs aren't socket rooms: deliver to the other user's personal room
            const target = chatType === "direct" ? this.userRoom(otherUserId) : roomName;
            socket.to(target).emit("typing:start", {
              roomName,
              userId: socket.userId,
              user: {
                _id: socket.user._id,
                name: socket.user.name,
              },
              userName: socket.user.name,
              profilePicture: socket.user.profilePicture,
            });
          }
        });

        socket.on("typing:stop", ({ chatType, workspace, project, otherUserId }) => {
          let roomName = "";
          
          switch (chatType) {
            case "workspace":
              if (workspace) {
                roomName = `workspace:${workspace}`;
              }
              break;
            case "project":
              if (project) {
                roomName = `project:${project}`;
              }
              break;
            case "direct":
              if (otherUserId) {
                const participants = [socket.userId!, otherUserId].sort();
                roomName = `direct:${participants.join(":")}`;
              }
              break;
          }
          
          if (roomName) {
            const target = chatType === "direct" ? this.userRoom(otherUserId) : roomName;
            socket.to(target).emit("typing:stop", {
              roomName,
              userId: socket.userId,
            });
          }
        });

      } catch (error) {
        Logger.error("Error in socket connection:", error);
        socket.disconnect();
      }
    });
  }

  // Method to emit to one or more rooms at once (a socket in several gets it once)
  public emitToRooms(rooms: string[], event: string, data: unknown) {
    if (rooms.length === 0) return;
    this.io.to(rooms).emit(event, data);
  }

  /** Drop live connections that belong to a signed-out session (log out of a device) */
  public disconnectSession(sessionId: string) {
    for (const socket of this.io.sockets.sockets.values()) {
      if ((socket.request as { sessionID?: string }).sessionID === sessionId) socket.disconnect(true);
    }
  }

  // Method to emit to every open tab of one user
  public emitToUser(userId: string, event: string, data: unknown) {
    this.io.to(this.userRoom(userId)).emit(event, data);
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  // Method to emit to a specific workspace
  public emitToWorkspace(workspaceId: string, event: string, data: any) {
    this.io.to(`workspace:${workspaceId}`).emit(event, data);
  }

  // Method to get connected users count for a workspace
  public async getWorkspaceUserCount(workspaceId: string): Promise<number> {
    const room = this.io.sockets.adapter.rooms.get(`workspace:${workspaceId}`);
    return room ? room.size : 0;
  }

  // Method to check if user is connected
  public isUserConnected(userId: string): boolean {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }

  // Graceful shutdown: mark connected users offline, disconnect every socket
  // and stop the underlying HTTP server from accepting new connections.
  public async close(): Promise<void> {
    this.isShuttingDown = true;

    // Let in-flight presence writes finish first
    await Promise.allSettled([...this.presenceQueue.values()]);

    const userIds = [...this.userSockets.keys()];
    if (userIds.length > 0) {
      try {
        await UserModel.updateMany(
          { _id: { $in: userIds } },
          { isOnline: false, lastSeen: new Date() }
        );
        Logger.info(`👋 Marked ${userIds.length} connected user(s) offline`);
      } catch (error) {
        Logger.error("Failed to mark users offline during shutdown:", error);
      }
    }
    this.userSockets.clear();
    this.publishedPresence.clear();

    await new Promise<void>((resolve) => {
      this.io.close((error) => {
        if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
          Logger.warn("HTTP server closed with an error:", error);
        }
        resolve();
      });
    });
  }

  // Users can't be online before the server has started, so clear any
  // isOnline flags left behind by a crash or restart.
  public async resetStalePresence(): Promise<void> {
    try {
      const result = await UserModel.updateMany(
        { isOnline: true },
        { isOnline: false, lastSeen: new Date() }
      );
      if (result.modifiedCount > 0) {
        Logger.info(`🧹 Reset ${result.modifiedCount} stale online user(s)`);
      }
    } catch (error) {
      Logger.error("Failed to reset stale presence:", error);
    }
  }

  private presenceRoom(workspaceId: string) {
    return `presence:${workspaceId}`;
  }

  // Current presence for every member of a workspace
  private async getWorkspacePresence(workspaceId: string): Promise<PresencePayload[]> {
    const members = await MemberModel.find({ workspaceId }).populate<{
      userId: UserDocument | null;
    }>("userId", "lastSeen");

    return members
      .filter((member) => member.userId)
      .map((member) => {
        const memberId = String(member.userId!._id);
        const isOnline = this.isUserConnected(memberId);
        return {
          userId: memberId,
          isOnline,
          lastSeen: isOnline ? null : member.userId!.lastSeen ?? null,
        };
      });
  }

  // Persist and broadcast a user's presence if it changed since the last broadcast
  private syncPresence(userId: string) {
    const previous = this.presenceQueue.get(userId) ?? Promise.resolve();

    const next = previous
      .then(async () => {
        const isOnline = this.isUserConnected(userId);
        if (this.publishedPresence.get(userId) === isOnline) return;

        const lastSeen = new Date();
        await UserModel.findByIdAndUpdate(userId, { isOnline, lastSeen });

        if (isOnline) {
          this.publishedPresence.set(userId, true);
        } else {
          this.publishedPresence.delete(userId);
        }

        const workspaceIds = (
          await MemberModel.distinct("workspaceId", { userId })
        ).map(String);

        if (workspaceIds.length > 0) {
          const payload: PresencePayload = {
            userId,
            isOnline,
            lastSeen: isOnline ? null : lastSeen,
          };
          this.io
            .to(workspaceIds.map((id) => this.presenceRoom(id)))
            .emit("presence:update", payload);
        }

        Logger.info(`👤 User ${userId} is now ${isOnline ? "online" : "offline"}`);
      })
      .catch((error) => {
        Logger.error(`Failed to update presence for user ${userId}:`, error);
      });

    this.presenceQueue.set(userId, next);
    next.finally(() => {
      if (this.presenceQueue.get(userId) === next) {
        this.presenceQueue.delete(userId);
      }
    });
  }
}

export default SocketService;