# Go-live plan: real Supabase project, real roll

Status: approved by the owner on 6 Sep 2026. Waiting for the environment variables.

## Context

The app is complete on the work branch (PR #1). The Supabase project `acswiwglopwecafpkayt`
(Singapore, pooler host `aws-0-ap-southeast-1.pooler.supabase.com`) exists. The first deployment
is a real roll: empty personnel, no demo battalion, `DEMO_CONTROLS` off.

Secrets only ever enter a session as environment variables. The legacy service_role key was
exposed in chat once; the user is switching to new-style keys (publishable + secret) and will
disable the legacy keys once the app is verified against the new ones.

## Step 0 — the owner, before anything runs

1. Supabase → Project Settings → API Keys → tab "Publishable and secret API keys": copy the
   publishable key (`sb_publishable_…`) and create a secret key (`sb_secret_…`).
2. Database password: Project Settings → Database (reset it if unknown). In connection strings,
   URL-encode special characters (`@` → `%40`, `#` → `%23`, `%` → `%25`, `/` → `%2F`, `:` → `%3A`,
   `?` → `%3F`, `&` → `%26`, `=` → `%3D`, `+` → `%2B`, space → `%20`).
3. Connect button → Connection String: Transaction pooler (port 6543) and Session pooler
   (port 5432), password filled in.
4. Authentication → Sign In / Providers → Email → Confirm email off.
5. Add to the repository's Claude Code environment, then start a new session on the branch:
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable key), `SUPABASE_SERVICE_ROLE_KEY` (secret
   key), `SUPABASE_DB_URL` (6543), `SUPABASE_DB_URL_MIGRATIONS` (5432),
   `BOOTSTRAP_ADMIN_PASSWORD` (setup key of their choosing), `DEMO_CONTROLS=false`.

## Step 1 — apply the schema

- Confirm presence: `env | grep -E '^SUPABASE_|^BOOTSTRAP' | sed 's/=.*/=<set>/'`.
- `pnpm db:migrate` (session pooler). Migrations 0000–0004: schema, Supabase grants/RLS, the
  eight units, platoons table, company platoons.
- Verify read-only through `postgres`: tables present, `units` 8 rows, `platoons` 11 rows,
  `profiles` and `personnel` empty, no `demo_now` in `app_settings`.

## Step 2 — live smoke test with throwaway accounts, then clean up

1. Write `.dev.vars` from the environment (gitignored; never print it).
2. `pnpm dev`; `GET /api/config` must say `needsBootstrap: true`.
3. Playwright script in the scratchpad (not committed): Set up SoldierTrack with a throwaway
   admin + setup key → empty Overview ("No personnel on the roll yet."); create a throwaway
   Coy 1 commander → sign in → forced password change; add two people (one in Platoon 1); mark
   one Present, one MC; Submit to S1; as S1 check Units (1/2 submitted), Absentees, the
   notification (Realtime), Excel export. This also proves the new-style keys work.
4. Cleanup with the secret key: delete the throwaway auth users and `profiles`, the two
   `personnel` rows and their `status_spans` / `event_marks` / `submissions` /
   `notifications` / `unit_event_state`, and the day's `events`. Re-verify `profiles` and
   `personnel` are empty and `needsBootstrap` is true again.
5. Stop the dev server; delete `.dev.vars`. Tell the owner to click "Disable JWT-based API
   keys" in Supabase.

Fix code, never data, if a step fails; rerun; commit.

## Step 3 — Cloudflare (owner, after PR #1 merges)

1. Workers & Pages → Create → Import a repository → `UR-B20/parade-state`, branch `main`.
2. Build command `pnpm db:migrate && pnpm build`; deploy command `npx wrangler deploy`.
3. Build variable `SUPABASE_DB_URL_MIGRATIONS`; runtime variables/secrets `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`,
   `BOOTSTRAP_ADMIN_PASSWORD`, `DEMO_CONTROLS=false`.
4. Open the Worker URL → Set up SoldierTrack with the real S1 details and the setup key →
   Manage accounts → commanders → rolls.
5. Optional: Hyperdrive from the transaction pooler string, id into `wrangler.jsonc`.

## Verification

- Migrations exit 0; Step 1 checks pass.
- Step 2 passes end-to-end and cleanup leaves the project empty.
- `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build` stay green.
- No secret value appears in any commit, log, screenshot or chat message.
