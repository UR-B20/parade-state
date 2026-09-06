# SoldierTrack — project memory for Claude sessions

Read this first. It is the hand-off between sessions: what the product is, the design rules
that must not drift, the domain rules that are already decided, how to work in this repo, and
where the project stands. The README covers usage and deployment; this file covers intent.

## What this is

SoldierTrack (working name in the original brief: "Parade State") is a mobile-first attendance
app for a Singapore Army battalion. Unit commanders mark their personnel for the AM parade
(cut-off 10:00), PM parade (14:00) or an ad hoc event and submit to S1. S1 (battalion admin)
watches present strength across the battalion, sees who is absent and why, exports Excel/CSV,
manages accounts, cut-offs, platoons and past-date unlocks, and reads an executive overview.

- Owner: Ranee (GitHub `UR-B20`). Repo `UR-B20/parade-state`. Work branch
  `claude/parade-state-attendance-design-d9sliy`, draft PR #1 against `main` (`main` holds
  only the scaffold commit). Push to that branch only.
- Review build (single-file mock build) published as a Claude artifact:
  https://claude.ai/code/artifact/66d1822c-2a40-4c78-8a77-13e911429c96 — republish with
  `pnpm build:standalone` and the Artifact tool using that URL.

## Stack (do not swap pieces without asking)

One Cloudflare Worker serves the React client and the Hono API. Supabase provides Postgres
(Drizzle ORM), Auth (JWT verified in the Worker with jose) and Realtime (live dashboard
refresh). pnpm 10, Node 22, Vite 7, React 19, TanStack Query (persisted to IndexedDB for
offline), react-router 7, valibot, Chart.js 4 + react-chartjs-2, Tailwind v4 utilities-only
layer (`src/app/styles/tailwind.css`, tokens mirror `tokens.css`; no preflight), PGlite for
integration tests, Playwright for e2e. Deploy via Cloudflare Workers Builds
(`pnpm db:migrate && pnpm build`, `npx wrangler deploy`).

## Design system: "Modern Operations" (fixed by the brief)

- Colours: white surfaces `#FFFFFF`, page `#F3F5F8`, text `#172B43`, secondary `#627085`,
  dividers `#E3E8EF`, cobalt primary `#2856CF`. Status colours are reserved and used
  everywhere the status appears: Present `#087969`, MC `#B63B4A`, LL `#8A5C12`, MA `#2B67A9`,
  RSI `#AC4A32`, Others `#637181`; Not yet marked is light grey `#CBD3DE`. Tokens live in
  `src/app/styles/tokens.css`; Tailwind names in `src/app/styles/tailwind.css`.
- Typography: Inter (self-hosted in `public/fonts`), tabular numerals via `.num` for every
  figure. Touch targets 48px. Light mode only.
- No brass, no Courier, no gradients (a scrim over a photo is the one exception), no phone
  bezel. Restrained glass (backdrop blur) only on the sticky header, sticky footer and sheets.
- Responsive: one column on phones (design reference 390×844), wide layouts from 900px
  (`wide:` Tailwind breakpoint; `useIsWide` hooks in pages).
- Brand: SoldierTrack. Assets in `src/app/brand/`. The olive roundel badge works on white and
  is the header mark, favicon and PWA icons (regenerate with `npx tsx scripts/icons.ts`). The
  horizontal lockups have white type and are only ever placed on the dark hero
  (`BrandHero.tsx`, login page). Wordmark "Soldier" in ink + "Track" in `--brand-orange-ink`.
- Charts (`src/app/charts/theme.ts`): Inter, hairline gridlines, white tooltips with a 1px
  line border, thin marks, 2px surface gaps between stacked segments, direct labels drawn in
  ink (never in the series colour), legend on every multi-series chart, a table view on every
  chart card, no dual axes, animation off under reduced motion. Status colours in charts are
  the same reserved tokens; Others sub-types shown as text.

## Domain rules (decided; do not reopen)

- Explicit marking: every person is marked Present or Not present. Unmarked people are a
  separate bucket ("Not yet marked"), counted in neither present nor absent. Submit to S1 is
  blocked while anyone is unmarked; "Mark remaining Present" bulk-marks after a confirmation.
- Absences are immutable `status_spans` with start/end dates that keep applying on later
  parades with nothing to re-enter. RSI is single-day. MC/LL/MA/Others may span days; Others
  needs a sub-type (Course, Outfield, Attached out, Duty). Present for one event is an
  `event_marks` row; precedence is mark > covering span > UNMARKED.
- Only ad hoc events are pre-filled, from each unit's last submitted parade state on or before
  the event date (Present marks copied; absences come from spans). AM/PM start unmarked.
- Submissions are versioned with a content hash (UNMARKED lines included); later changes show
  as "changes since submission" until the unit resubmits. States: NOT_MARKED, PENDING, LATE,
  SUBMITTED, RESUBMITTED. Late = not submitted at cut-off (cron 10:05 and 14:05 SGT).
- Units: S1, S2, S3, S4, SSP (flat) and Coy 1, Coy 2, ISR Coy (companies with Coy HQ plus
  platoons). Platoon scope picker on the unit home; per-platoon strength; S1 manages platoons.
- Dates are civil dates in Asia/Singapore (fixed +08:00). Commanders edit today and future;
  S1 can unlock a past date for 24 hours.
- Roles: ADMIN (S1) and COMMANDER (one unit). First admin is created on the Set up
  SoldierTrack screen with the `BOOTSTRAP_ADMIN_PASSWORD` setup key. Commanders get a
  temporary password from S1 and must change it on first sign-in.
- Executive overview (S1, first tab): headline sentence + auto insights
  (`src/shared/domain/insights.ts`), KPI tiles with 7-day deltas, composition donut, present
  share by unit with platoon drill-down, 14-day present-rate trend with 7-day average and a 90%
  norm, absence by reason vs run rate, reporting discipline per unit. Past days come from
  submissions (`src/shared/domain/trends.ts`); today is live. Commanders see their unit's
  14-day sparkline.
- Demo battalion (`src/shared/demo/dataset.ts`, seeded PRNG): 312 personnel, Sun 6 Sep 2026
  09:24, totals 263 present / 24 not yet marked / 25 absent, 6 of 8 submitted, 3 unread
  notifications, 13 prior days of history. Tests assert these numbers; keep the generation
  order (history is generated last).

## Working in this repo

- `pnpm dev:mock` (UI on the demo battalion, no server), `pnpm dev` (real Worker, needs
  `.dev.vars`), `pnpm typecheck`, `pnpm test` (vitest, domain + PGlite integration),
  `pnpm test:e2e` (Playwright on a mock server at :4173), `pnpm build`, `pnpm build:standalone`,
  `pnpm db:generate`, `pnpm db:migrate`, `pnpm seed:demo` (demo deployments only).
- Screenshots for review: run `pnpm dev:mock --port 5173`, then
  `npx tsx scripts/shots.ts <outDir>`; view them before calling UI work done.
- Kill dev servers with `pkill -f "[v]ite --port 5173"; pkill -f "[w]orkerd"` (the bracket
  trick stops pkill matching its own shell).
- Never print secret values. Check presence with
  `env | grep -E '^SUPABASE_|^BOOTSTRAP' | sed 's/=.*/=<set>/'`.
- Commit messages carry the session's attribution trailers; no model identifiers in commits,
  PR text or code. Keep the PR #1 description current when features land.
- The user prefers plans first for large changes and to be asked before scope changes; they
  are not a developer, so explain setup steps concretely (menus, buttons, which value goes
  where) and keep secrets out of chat.

## Status and what is next

- Done: full product as described above; 99 unit/integration tests, 3 e2e, builds green.
- Supabase project exists (`acswiwglopwecafpkayt`, Singapore). First deployment is a **real
  roll**: empty personnel, `DEMO_CONTROLS=false`, never run `pnpm seed:demo` against it.
- The legacy service_role key was pasted into chat once and is compromised: the user is
  moving to the new-style keys (publishable key as `SUPABASE_ANON_KEY`, a new secret key as
  `SUPABASE_SERVICE_ROLE_KEY`). Verify the app works with those key types during the live
  smoke test, then tell the user to click "Disable JWT-based API keys" in Supabase.
- Environment variables arrived on 6 Sep (evening SGT). Verified over HTTPS: the secret key
  works for the auth admin API, the publishable key works, confirm-email is off, the
  database is empty. The connection strings were added without the `postgresql:` prefix;
  prepend it when building `.dev.vars`.
- The remote Claude environment blocks direct Postgres (ports 5432/6543); only HTTPS goes
  out. So `pnpm db:migrate` and `pnpm dev` against the live project cannot run here. The
  schema is applied by Cloudflare Workers Builds (`pnpm db:migrate && pnpm build`) on the
  first deploy, and the live smoke test runs against the deployed Worker URL over HTTPS.
  Cleanup of throwaway data goes through PostgREST and the auth admin API with the secret key.
- A second Claude session ("Go live plan", started 6 Sep 14:55Z from the desktop app on
  `main`) built a parallel, incompatible implementation on `main` (different table names:
  absence_spans, present_marks, settings). On 6 Sep the owner chose this branch: `main` was
  reset to it (the parallel work is kept at `archive/parallel-main-2026-09-06`, never merge
  it) and the other session was archived. `main` now tracks this branch; fast-forward it from
  the branch when the owner wants a deploy, never the other way round.
- Live findings (6 Sep, evening): (1) postgres.js with `max: 1` pipelines concurrent
  queries and Supabase's transaction pooler never answers them, so any request with a
  `Promise.all` of queries hung; `max` is now 6 (`src/worker/db/client.ts`). Keep it above
  the largest concurrent batch. (2) The Worker sits one round trip from Postgres per query;
  the battalion summary/absentees/trends load everything in five queries (`unitRows` in
  `src/worker/services/summary.ts`); keep new admin endpoints batched the same way. (3) Smart
  Placement is on in `wrangler.jsonc`. (4) In this remote environment a headless browser cannot
  reach any external site through the proxy, so live checks are API-level: `scripts/live-check.mjs`
  (Node fetch with `NODE_USE_ENV_PROXY=1`, `connection: close`, retries; `--cleanup` removes
  the throwaway data).
- Next: follow `docs/go-live.md`.
- A Supabase MCP server entry exists in `.mcp.json` for local use; it needs a browser sign-in
  and does not work in remote sessions.
