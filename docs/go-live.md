# Go-live plan: real Supabase project, real roll

Status: approved by the owner on 6 Sep 2026. Variables present and verified over HTTPS; schema not yet applied.

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
   Done 6 Sep. The two connection strings were saved without the `postgresql:` prefix; they
   still need it in Cloudflare (`postgresql://postgres.<ref>:<password>@aws-0-…`).

## Step 1 — reconcile `main` (owner decision, then this session)

Done 6 Sep: the owner chose the SoldierTrack branch; `main` was reset to it (the parallel
work is parked at `archive/parallel-main-2026-09-06`) and the other session archived.
Cloudflare builds from `main`.

## Step 2 — schema and smoke test (via Cloudflare, because this environment has no Postgres access)

The remote environment only allows HTTPS out, so the schema is applied by the first Cloudflare
build (`pnpm db:migrate && pnpm build`), which reaches the session pooler directly.

1. After the first deploy, `GET <worker-url>/api/config` must say `needsBootstrap: true`.
2. Read-only checks over HTTPS with the secret key: PostgREST root lists the tables; `units`
   has 8 rows and `platoons` 11; `profiles` and `personnel` are empty.
3. Live checks are API-level, because the remote environment's headless browser cannot reach
   external sites through the proxy. A Node script (scratchpad, not committed; run with
   `NODE_USE_ENV_PROXY=1`, `connection: close` headers, retries with a 30 s abort) does: Set up
   SoldierTrack with a throwaway admin + setup key → empty Overview; create a throwaway Coy 1
   commander → sign in → forced password change; add two people (one in Platoon 1); mark one
   Present, one MC; Submit to S1; as S1 check Units, Absentees, the notification (Realtime),
   Excel export.
4. Cleanup with the secret key over HTTPS: auth admin deletes the throwaway users; PostgREST
   deletes their `profiles`, the `personnel` rows and dependent `status_spans` /
   `event_marks` / `submissions` / `notifications` / `unit_event_state`, and the day's
   `events`. Re-verify `needsBootstrap` is true again.
5. Tell the owner to click "Disable JWT-based API keys" in Supabase (new keys verified).

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
