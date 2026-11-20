import MemberModel from "@/models/member-model";
import ProjectModel from "@/models/project-model";

/**
 * Small in-memory caches for questions every chat message asks
 * ("is this user in that workspace?"). Each answer saves a database round
 * trip, which matters when the database is far away (~130 ms each).
 *
 * Only positive answers are cached, so someone who just joined is never
 * locked out. Entries expire quickly; call forgetMemberships() when
 * memberships change (join, create or delete a workspace).
 */
const TTL_MS = 30_000;
const MAX_ENTRIES = 5_000;

const membership = new Map<string, number>(); // "user:workspace" -> cached at
const workspacesOf = new Map<string, { ids: string[]; at: number }>();
const projectWorkspace = new Map<string, string>(); // projects never change workspace

const fresh = (at: number) => Date.now() - at < TTL_MS;
const trim = (map: Map<string, unknown>) => {
  if (map.size > MAX_ENTRIES) map.delete(map.keys().next().value!);
};

export const isWorkspaceMember = async (userId: string, workspaceId: string) => {
  const key = `${userId}:${workspaceId}`;
  const at = membership.get(key);
  if (at && fresh(at)) return true;

  const ok = !!(await MemberModel.exists({ userId, workspaceId }));
  if (ok) {
    membership.set(key, Date.now());
    trim(membership);
  }
  return ok;
};

export const getUserWorkspaceIds = async (userId: string): Promise<string[]> => {
  const cached = workspacesOf.get(userId);
  if (cached && fresh(cached.at)) return cached.ids;

  const ids = (await MemberModel.distinct("workspaceId", { userId })).map(String);
  workspacesOf.set(userId, { ids, at: Date.now() });
  trim(workspacesOf);
  return ids;
};

export const getProjectWorkspaceId = async (projectId: string): Promise<string | null> => {
  const cached = projectWorkspace.get(projectId);
  if (cached) return cached;

  const project = await ProjectModel.findById(projectId).select("workspace").lean();
  if (!project) return null;
  const workspaceId = String(project.workspace);
  projectWorkspace.set(projectId, workspaceId);
  trim(projectWorkspace);
  return workspaceId;
};

export const forgetMemberships = (userId?: string) => {
  if (!userId) {
    membership.clear();
    workspacesOf.clear();
    return;
  }
  workspacesOf.delete(userId);
  for (const key of membership.keys()) {
    if (key.startsWith(`${userId}:`)) membership.delete(key);
  }
};
