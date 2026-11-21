# AGENT.md: Team Task API

Guidance for AI coding agents (and humans) working in this repository.

## Project

Team Task is a real-time team workspace: ClickUp-style tasks, Slack-style chat, Notion-style notes and a calendar with two-way Google Calendar sync. Two repositories, usually checked out side by side:

- `backend/`: this repo, the API ([team-task_backend](https://github.com/Ernie1234/team-task_backend))
- `frontend/`: the React web app ([team-task_frontend](https://github.com/Ernie1234/team-task_frontend))

## Commands

```bash
bun install
bun run dev                 # http://localhost:3000, routes under /api/v1
npx tsc --noEmit -p .       # type-check
bun run lint
bun run seed                # default roles and permissions
```

Before finishing any change: type-check must pass, and run any tests for the area you touched.

## Stack and conventions

- Bun, Express 5, MongoDB with Mongoose, Better Auth (email + code, Google; sessions in `auth_sessions`), Socket.IO, Zod.
- **Auth:** configured in `config/auth.ts` and mounted at `/api/v1/auth` before `express.json()`. `attachSession` sets `req.user` (with `_id` as an ObjectId) and `req.authSession`. Better Auth uses the existing `users` collection (`emailVerified` → `isVerified`, `image` → `profilePicture`); logins live in `auth_accounts`. `migrateLegacyAuth()` copies old `accounts` on start. Don't add express-session or passport back.
- **Live notes:** `services/note-collab-service.ts` holds one Yjs doc per open note (socket events `note:join|seed|update|awareness|leave`). The Yjs state (`note.ydoc`) is the source of truth while editing; `note.content` is a snapshot the editor PATCHes with `live: true` for previews and search.
- **Layers:** `routes/` → `controllers/` (parse and validate with Zod, check membership/permissions) → `services/` (business logic, database) → `models/`. Controllers never talk to Mongoose directly.
- **Validation:** every request body, param and query goes through a Zod schema in `validation/`. Update schemas are `.strict()`.
- **Errors:** throw `BadRequestException`, `NotFoundException`, `UnauthorizedException`, `ForbiddenException` from `utils/appError`; the error middleware formats them.
- **Access control:** check workspace membership (`getMemberRoleInWorkspace` / `utils/membership-cache.ts`) and role permissions before reading or writing workspace data. Private notes and personal calendar data are scoped to their owner.
- **Real-time:** emit through `getSocketService()`: `emitToUser(userId, …)` for personal events, `emitToRooms(["presence:<workspaceId>"], …)` for workspace-wide ones.
- **Remote database:** MongoDB Atlas adds about 130 ms per round trip, so run independent queries with `Promise.all`, use `.lean()` for reads and avoid per-item queries in loops.
- **Background jobs** (`services/calendar-jobs.ts`) start after the server listens and stop in the graceful shutdown handler. Anything new that runs on a timer must do the same.
- **Secrets:** never log tokens, passwords or full user documents. OAuth tokens are encrypted at rest (`utils/token-crypto.ts`).

## Git and commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <summary>

<optional body: what changed and why, wrapped at 72 characters>
```

- **Types:** `feat`, `fix`, `refactor`, `perf`, `style`, `test`, `docs`, `build`, `ci`, `chore`, `revert`. Breaking changes: `feat!:` plus a `BREAKING CHANGE:` footer.
- **Summary:** imperative mood ("add", not "added"), lowercase, no full stop, 72 characters at most.
- **Scope** (optional) is the feature area: `tasks`, `chat`, `notes`, `calendar`, `auth`, `account`, `theme`, `dashboard`, `notifications`, `api`.
- One logical change per commit. Use the body for the why and a short bullet list when a commit touches several areas.
- **Never add co-author trailers or AI attribution** (no `Co-Authored-By:` lines, no "Generated with…" lines) to commits or pull requests.
- Author: `Ernie1234 <anumahjoshuaeneye@gmail.com>`.
- Never commit `.env`, secrets, `uploads/`, `logs/`, `node_modules/` or build output.
- Default branch is `master`. Remotes use SSH, so pushing happens from the developer's own machine.

Examples:

```
feat(calendar): add two-way google calendar sync
fix(tasks): keep subtask counts when filtering by assignee
docs: tick off redis sessions in the roadmap
```

## README upkeep (required)

The READMEs double as the project's feature list and roadmap, and they are what employers read.

- When a feature ships, add it under **Features** as `- [x]`.
- When a roadmap item is done, change its `- [ ]` to `- [x]` in the frontend README **and**, if it is listed there, the backend README.
- Keep environment variables, scripts and setup steps in the READMEs in sync with the code.
- Make the README update in the same push as the feature (its own `docs:` commit is fine).
