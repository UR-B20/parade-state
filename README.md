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

Deployment steps are added in a later milestone.
