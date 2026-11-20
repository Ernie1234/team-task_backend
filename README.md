# Team Task API

The backend for **Team Task**, a real-time team workspace with tasks, chat, notes and calendar. REST + WebSocket API built with Bun, Express 5, MongoDB and Socket.IO.

The web app lives in [team-task_frontend](https://github.com/Ernie1234/team-task_frontend). Its README has screenshots, the full feature list and the product roadmap.

---

## Features

Unticked items are on the [roadmap](#roadmap).

- [x] **Auth:** email and password (bcrypt) with email verification, Google OAuth sign-in, cookie sessions
- [x] **Workspaces & RBAC:** Owner / Admin / Member roles with permission checks, invite links and email invites, membership cache
- [x] **Projects & tasks:** CRUD, subtasks, completion dates, filtering, sorting, search (regex-safe), pagination, per-project analytics
- [x] **Dashboard API:** KPIs, 14-day completion trend (time-zone aware), status and priority breakdown, team workload
- [x] **Chat:** workspace, project and direct channels; presence, typing, read state, replies, reactions, edits and deletes; message search
- [x] **Uploads:** images and files with type and size limits, served only to signed-in users
- [x] **Notes:** Notion-style pages (block JSON), nested sub-pages, private or shared visibility, cycle-safe moves, size limits
- [x] **Calendar:** events API, two-way Google Calendar sync over OAuth (encrypted tokens, automatic refresh, revoke on disconnect)
- [x] **Reminders:** background job claims due reminders atomically and sends a live socket event plus a notification; snooze
- [x] **Notifications:** persisted per workspace, delivered live over Socket.IO
- [x] **Account:** profile, set / change password, signed-in devices with remote log out, account deletion (soft delete with data clean-up)
- [x] **Preferences:** per-user appearance settings synced across devices
- [x] **Reliability:** graceful shutdown (sockets, HTTP, jobs, database), parallel queries for a remote database, Zod validation on every input

## Roadmap

Backend items from the [main roadmap](https://github.com/Ernie1234/team-task_frontend#roadmap).

- [ ] Deploy with a seeded demo account
- [ ] Redis-backed sessions
- [ ] Socket.IO Redis adapter for several instances
- [ ] File storage on S3 / Cloudflare R2 with signed URLs
- [ ] CI with GitHub Actions; unit and integration tests in the repo
- [ ] Observability: Sentry, structured logs, `/health`, metrics
- [ ] Security: rate limiting, CSRF protection, passkeys and two-factor sign-in
- [ ] Background-jobs service in **Go** (reminders, calendar sync, email) on a Redis / NATS queue
- [ ] Analytics service in **Python (FastAPI)**
- [ ] "Ask your workspace" (RAG with LangChain and a vector store) and an AI notes assistant
- [ ] Real-time co-editing backend for Notes (Yjs)
- [ ] Email notifications and a daily digest
- [ ] Audit log, recurring tasks, task dependencies, time tracking
- [ ] Public REST API with API keys and webhooks

---

## API overview

All routes are under `/api/v1`. Everything except `/auth` needs a signed-in session cookie.

| Area | Base path | Highlights |
| --- | --- | --- |
| Auth | `/auth` | `register`, `login`, `logout`, `verify-email`, `google`, `google/callback` |
| User & account | `/user` | `current`, `profile`, `password`, `sessions`, `appearance`, `account`, `DELETE /` |
| Workspaces | `/workspace` | create, update, delete, members, change role, invite by email, analytics, `dashboard/:id` |
| Members | `/members` | join a workspace with an invite code |
| Projects | `/projects` | CRUD and analytics per workspace |
| Tasks | `/tasks` | CRUD, filters, sorting, subtasks (`parentTask`) |
| Chat | `/chat` | messages per channel / DM, uploads, conversations, search, attachments |
| Notes | `/notes` | page tree, read, create, update, delete (with sub-pages) |
| Calendar | `/calendar` | `connection`, `google/connect`, `google/callback`, `google/sync`, `events`, snooze |
| Notifications | `/notifications` | list per workspace, mark as read |
| Activities | `/activities` | workspace activity feed |

**WebSocket events** (Socket.IO, same session cookie): `message:*`, `typing:*`, `presence:*`, `task:changed`, `note:changed`, `calendar:changed`, `event:reminder`, `notification:new`.

## Getting started

**Prerequisites:** [Bun](https://bun.sh) 1.x, a MongoDB database (MongoDB Atlas works), and a Google OAuth client.

```bash
bun install
cp .env.example .env
bun run seed      # create the default roles
bun run dev       # http://localhost:3000
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT`, `NODE_ENV` | Server port and mode |
| `MONGO_URI` | MongoDB connection string |
| `SESSION_SECRET`, `SESSION_EXPIRES_IN` | Cookie session signing and lifetime |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client (sign-in and Calendar) |
| `GOOGLE_CALLBACK_URL` | Sign-in callback, e.g. `http://localhost:3000/api/v1/auth/google/callback` |
| `FRONTEND_ORIGIN`, `FRONTEND_GOOGLE_CALLBACK_URL` | Web app origin and its Google callback page |
| `MAILTRAP_TOKEN`, `MAILTRAP_ENDPOINT`, `MAILTRAP_TEMPLATE_UUID` | Transactional email |
| `GOOGLE_CALENDAR_CALLBACK_URL` _(optional)_ | Calendar OAuth callback; defaults to `<API origin>/api/v1/calendar/google/callback` |
| `CALENDAR_TOKEN_KEY` _(optional)_ | Key for encrypting calendar tokens; defaults to one derived from `SESSION_SECRET` |

### Google Calendar setup

In the Google Cloud console, on the same OAuth client used for sign-in:

1. Enable the **Google Calendar API**.
2. Under Data Access, add the scope `https://www.googleapis.com/auth/calendar.events`.
3. Add the redirect URI `http://localhost:3000/api/v1/calendar/google/callback`.
4. While the app is in Testing mode, add each user under Audience → Test users.

## Project structure

```
src/
  config/        app config, database, sessions, Socket.IO, passport, uploads
  controllers/   HTTP handlers (parse + validate input, call services)
  handlers/      Socket.IO event handlers
  services/      business logic, background jobs (calendar-jobs.ts)
  models/        Mongoose schemas
  validation/    Zod schemas
  routes/        Express routers
  middlewares/   auth, error handling, session tracking
  utils/         Google Calendar client, token encryption, time zones, caches
```

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Start with file watching |
| `bun run build` / `bun run start` | Build and run for production |
| `bun run lint` | Run ESLint |
| `bun run seed` | Seed roles and permissions |
