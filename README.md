# Parade State

Mobile-first attendance reporting for a battalion. Unit commanders mark personnel and submit
to S1; S1 monitors strength and submissions across units.

Frontend and API run on one Cloudflare Worker. Data, sign-in and live updates run on Supabase.

## Database

The schema lives in `src/worker/db/schema.ts` (Drizzle). SQL migrations are committed under
`migrations/`; `0001_security.sql` is hand-written (Supabase Auth link, row level security,
policies, triggers).

```sh
cp .dev.vars.example .dev.vars      # fill in the Supabase project values
pnpm db:migrate                     # apply pending migrations (session-mode pooler, port 5432)
pnpm seed:demo                      # load the demo battalion; refuses unless DEMO_CONTROLS=true
pnpm db:generate --name <change>    # after editing the schema: write a new migration
pnpm test                           # runs the migrations and seed on an in-memory Postgres
```

The Worker connects through Hyperdrive when the `HYPERDRIVE` binding exists, otherwise through
`SUPABASE_DB_URL` (transaction-mode pooler, port 6543), always with prepared statements off.
`GET /api/health` reports `db: ok | error | unconfigured`.

## API

All routes live under `/api` on the Worker and answer JSON. Signed-in routes take the Supabase
access token as `Authorization: Bearer <token>`; the Worker verifies it against the project's
JWKS (or `SUPABASE_JWT_SECRET` for legacy HS256 projects) and loads the caller's profile.

| Route | Who | Purpose |
| --- | --- | --- |
| `GET /health` | anyone | Liveness plus database round trip |
| `GET /config` | anyone | Supabase URL and anon key for the client, demo flag, `needsBootstrap` |
| `POST /bootstrap` | anyone, once | Creates the first S1 admin. Needs the `BOOTSTRAP_ADMIN_PASSWORD` secret, refused once any account exists |
| `GET /me` | signed in | Profile, server time, Singapore date, demo clock |
| `POST /auth/change-password` | signed in | Sets a new password and clears the must-change flag |
| `GET /units` | signed in | Unit list |
| `GET /units/:unitId/roll?date=` | own unit or S1 | Personnel active on the date |
| `GET /admin/users` | S1 | List accounts |
| `POST /admin/users` | S1 | Create an admin or a commander with a temporary password |
| `POST /admin/users/:id/deactivate`, `.../activate` | S1 | Lock an account out immediately, or restore it |
| `POST /admin/users/:id/reset-password` | S1 | Set a temporary password; the user must change it next sign-in |

A user whose password must be changed can only reach `/me` and `/auth/change-password`; everything
else answers 403 with code `PASSWORD_CHANGE_REQUIRED`. Commanders asking for another unit get 403 `FORBIDDEN`.

### First admin

1. Set the `BOOTSTRAP_ADMIN_PASSWORD` secret on the Worker.
2. `POST /api/bootstrap` with `{ email, displayName, bootstrapPassword }` (the client shows this form while `needsBootstrap` is true).
3. Sign in with that email and the bootstrap password, change it when prompted.
4. Delete the `BOOTSTRAP_ADMIN_PASSWORD` secret from the Worker.

## Client

React 19 with React Router, TanStack Query persisted to IndexedDB, and Supabase Auth for sign-in.
Every mark and submission goes through an offline queue (`src/app/offline/queue.ts`): it is written
to IndexedDB first, applied to the screen at once, and replayed in order when the server answers.
A service worker (`public/sw.js`) keeps the app shell available without signal; it never caches `/api`.

```sh
pnpm dev          # Worker + client on http://localhost:5173, needs .dev.vars and a Supabase project
pnpm dev:mock     # the same app on the in-browser demo backend, no Supabase needed
pnpm test:e2e     # Playwright on a phone-sized Chromium against the demo build
```

### Demo backend

`VITE_MOCK_API=1` swaps the network for the real Hono API running in the browser on PGlite,
migrated and seeded with the fictional battalion. Sign in with one tap on the sign-in screen (every
demo account uses the password `demo1234`), simulate losing signal from the demo bar, and reset the
data at any time. The demo clock is frozen at Sun 6 Sep 2026, 09:24. Production builds do not
contain any of this.

Deployment steps are added in a later milestone.
