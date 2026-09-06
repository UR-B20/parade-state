# Parade State: go-live plan

Status as of 6 Sep 2026 (M1 closed the same day). This document is the working plan for taking Parade State from the
current scaffold to a production deployment used by a battalion every parade day. Update it as
milestones close.

## 1. Where we are

Verified against the `main` branch (one commit, "Scaffold Parade State"):

| Area | State | Evidence |
| --- | --- | --- |
| Toolchain | Works | `pnpm install`, `pnpm typecheck` and `pnpm build` all pass; the Worker and client bundles build cleanly. |
| Shared domain | Done | Effective status precedence, counts, canonical hash, submission state, diff, date lock and Singapore date helpers in `src/shared`. |
| Demo dataset | Done | Deterministic battalion of 312 personnel in 8 units; `scripts/check-demo.ts` reconciles counts (287 present, 25 absent) and unique names. |
| Worker API | Stub | Only `GET /api/health` and `GET /api/config`. Config always reports `needsBootstrap: false`. Scheduled handler is empty. |
| Database | Done (M1) | Drizzle schema, two migrations (generated schema plus hand-written security), `pnpm db:migrate`, `pnpm seed:demo`, Worker client with `prepare: false`, RLS and policies on all 11 tables. |
| Auth | Missing | No JWT verification, no `/api/me`, no bootstrap flow, no role or unit enforcement. |
| Client UI | Placeholder | `main.tsx` renders the text "Parade State". No router, no query client, no offline persistence wired. |
| PWA assets | Missing | `index.html` links `manifest.webmanifest`, `favicon.svg` and `apple-touch-icon.png`; there is no `public/` directory, so all three 404. |
| Tests | Started | Integration suite runs the real migrations and seed on PGlite and checks the brief's counts (19 tests). Domain unit tests and e2e are still M6. |
| CI/CD | None | No `.github/workflows`. Deploys would be manual `wrangler deploy`. |
| Environments | None | No Cloudflare Worker or Supabase project provisioned; no secrets set. |

Architecture already decided by the scaffold and kept by this plan: one Cloudflare Worker serves
the static client and the Hono API; Supabase provides Postgres, Auth and Realtime; the Worker
reaches Postgres through the transaction-mode pooler (or Hyperdrive); two cron triggers run at
10:05 and 14:05 Singapore time.

## 2. Definition of "live"

Go-live means all of the following are true on the production Worker:

1. Every unit commander can sign in on their phone, mark their unit for the AM and PM parade, and submit before cutoff.
2. S1 can see battalion totals, per-unit submission state, absentees, and notifications in real time.
3. Units that miss cutoff are marked Late automatically and S1 is notified.
4. Past dates are locked for commanders unless S1 unlocks them.
5. The app survives a dropped connection during marking (queued writes replay on reconnect).
6. Production has no demo controls, no demo accounts, and no service-role key exposed to the client.
7. Backups, monitoring, a rollback path and an on-call owner exist for the first two weeks.

## 3. Milestones

Milestones are ordered by dependency. Effort assumes one developer working full time and is a
rough size, not a commitment. Each milestone has an exit check that must pass before the next
one starts.

### M1. Data layer (about 1 week) - done

- Write `src/worker/db/schema.ts` with Drizzle tables: `units`, `profiles` (mirrors `auth.users`, holds role, unit, must-change-password, active flag), `personnel`, `absence_spans` (append-only; superseded spans keep history), `present_marks`, `events`, `unit_event_state`, `submissions` (with counts and snapshot JSON), `notifications`, `settings`, `date_unlocks`.
- Generate the first migration with `pnpm db:generate`; write `scripts/migrate.ts` so `pnpm db:migrate` applies migrations over the session-mode pooler (port 5432).
- Write `seed/seed-demo.ts` that loads `buildDemoDataset()` into Supabase, creating the demo auth users through the Admin API with `DEMO_PASSWORD`.
- Configure `postgres` with `prepare: false` (the transaction-mode pooler does not support prepared statements) and a small connection cap per Worker isolate.
- Enable row level security on every table. The Worker uses the service role, so policies only need to cover what the client reads directly over Realtime (see M5).

Exit check: a fresh Supabase project can be migrated and seeded from a clean checkout in one command each, and `scripts/check-demo.ts` counts match a query against the seeded database.

Result: verified on a local Postgres 16 with the Supabase roles and auth schema stubbed (migrate twice, seed through postgres-js, reset and reload) and in `src/test/integration/schema.test.ts` on PGlite. Not yet run against a real Supabase project; that happens when staging is provisioned in M7.

### M2. Auth and bootstrap (about 1 week)

- Verify Supabase access tokens in the Worker with `jose` against the project's JWKS endpoint (fall back to `SUPABASE_JWT_SECRET` HS256 only for legacy projects). Cache the JWKS.
- Implement `GET /api/me` returning `MeDto` (user, server time, Singapore date, demo info).
- Implement bootstrap: `GET /api/config` reports `needsBootstrap: true` when `profiles` is empty; `POST /api/bootstrap` creates the first S1 admin using `BOOTSTRAP_ADMIN_PASSWORD`, then the secret is deleted from the Worker.
- Enforce must-change-password on first sign-in and on admin-issued resets.
- Middleware that resolves the caller's role and unit and rejects cross-unit access with `FORBIDDEN`.
- Admin endpoints to create, deactivate and reset commander accounts.

Exit check: an S1 admin can be bootstrapped on an empty database, create a commander, and the commander is refused access to any other unit's data.

### M3. Commander flow (about 2 weeks)

- API: `GET /api/units/:unitId/events/:eventId/attendance`, `POST .../persons/:personId/mark` (`MarkBody`), `POST .../submit`, `GET /api/events?date=`. Every write recomputes counts, hash, submission state and diff and returns `MarkResultDto`.
- Date lock enforced server side with `DATE_LOCKED`; ad hoc events and AM/PM events created per date on first access using the cutoffs in `settings`.
- Client: React Router shell, TanStack Query with IndexedDB persistence, mock adapter behind `VITE_MOCK_API` driven by the demo dataset.
- Screens: sign in, change password, unit roll with status bands and counts, mark sheet (status, sub-type, dates, remark), review-and-submit with the change diff, submission history.
- Offline: queue marks locally, replay in order on reconnect, surface conflicts by refetching and showing the server's state.
- Add `public/` with `manifest.webmanifest`, `favicon.svg`, `apple-touch-icon.png` and a service worker that precaches the shell (network-first for `/api/*`).

Exit check: a commander can mark and submit Coy 1 on a phone in airplane mode, reconnect, and see the submission recorded with a version number.

### M4. S1 flow (about 1.5 weeks)

- API: `GET /api/summary?eventId=`, `GET /api/absentees?eventId=`, notifications list and mark-read, settings read and update (cutoffs, unlocks), personnel CRUD with posting in and out dates, unit event unlock.
- Screens: battalion summary (units sorted by `awaitingRank`), unit drill-down, absentees grouped by status, notifications, settings, personnel management.
- Export: parade state as CSV or XLSX (`fflate` is already a dependency) for the S1 daily report.

Exit check: with the demo seed loaded, the summary screen matches the brief's numbers for 6 Sep 2026 at 09:24 (6 units submitted, Coy 1 pending, S2 not marked).

### M5. Live updates and scheduled work (about 0.5 week)

- Implement the `scheduled` handler: for each event whose cutoff passed since the last run, mark unsubmitted units Late, write LATE notifications for admins, and run a trivial query to keep the Supabase project awake.
- Realtime: subscribe the S1 client to `submissions` and `unit_event_state` changes with the anon key; RLS policies allow admins to read those tables and commanders to read only their unit. Client invalidates queries on change instead of trusting the payload.
- Verify cron times: `5 2 * * *` and `5 6 * * *` in UTC are 10:05 and 14:05 Singapore time.

Exit check: submitting from one phone updates the S1 dashboard on another within five seconds; a unit that has not submitted by 10:05 shows Late without a refresh.

### M6. Quality gates and CI (about 1 week, overlaps M3 to M5)

- Unit tests in `src/test/domain` for every module in `src/shared/domain` (precedence, multi-day spans, RSI same-day rule, date lock expiry, diff add/remove, hash stability).
- Integration tests in `src/test/integration` against PGlite running the real migrations: mark, submit, resubmit, late derivation, cross-unit forbidden, date locked.
- Playwright e2e on the iPhone 14 profile: commander sign-in, mark, submit; S1 summary; offline replay.
- GitHub Actions: on pull request run typecheck, unit and integration tests, build, e2e; on push to `main` deploy to staging; on a `v*` tag deploy to production. Store `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets.
- Branch protection on `main` requiring the checks.

Exit check: `pnpm test` passes with real test files, `pnpm test:e2e` passes locally and in CI, and a pull request cannot merge red.

### M7. Environments (about 0.5 week, can start during M1)

Two Supabase projects and two Workers, both in Singapore (`ap-southeast-1` / Cloudflare automatically routes).

| Item | Staging | Production |
| --- | --- | --- |
| Worker name | `parade-state-staging` | `parade-state` |
| `DEMO_CONTROLS` | `true` | `false` |
| Data | Demo seed, reset weekly | Real nominal roll, never seeded |
| Supabase plan | Free is acceptable | Pro (no auto-pause, PITR, larger connection pool) |
| Hyperdrive | Optional | Required; bind as `HYPERDRIVE` |
| Domain | `*.workers.dev` | Custom domain with Cloudflare Access or allow-list in front if the unit requires it |

- Add a `wrangler.jsonc` `env.staging` block so both deploy from one config.
- Set secrets per environment with `wrangler secret put --env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `BOOTSTRAP_ADMIN_PASSWORD`.
- Supabase Auth: disable public sign-ups; email confirmations off (accounts are provisioned by S1); set site URL to the production domain.
- Write `docs/deployment.md` with the exact commands (this replaces the "added in a later milestone" line in the README).

Exit check: staging runs the demo end to end from a CI deploy; production Worker responds on `/api/health` with `needsBootstrap: true` and nothing else.

### M8. Pre-launch (about 1 week)

- Security review: service-role key only in Worker secrets; JWT verified on every non-public route; rate limit sign-in and bootstrap (Cloudflare rate limiting rule); security headers (CSP allowing only self, Supabase and Google Fonts; `frame-ancestors 'none'`); no personnel data in logs; run `pnpm audit`.
- Data protection: agree with S1 what personal data is stored (rank, name, optional service number, medical status remarks) and set a retention rule; remarks like "Fever, Bedok Polyclinic" are health data, so restrict the absentees export to admins and log exports.
- Nominal roll import: a CSV importer (unit, rank, name, service number, posted-in date) run by S1 on the personnel screen, with a dry-run preview.
- Account provisioning: S1 creates 8 commander accounts plus at least one backup commander per unit; temporary passwords delivered out of band; must-change-password on first login.
- UAT on staging with at least two real commanders and one S1 clerk for three parade cycles (AM and PM). Track issues in GitHub; fix blockers only.
- Runbook: how to unlock a date, reset a password, re-run a failed cron, restore from backup, roll back a deploy (`wrangler rollback`), and who to call.
- Backups: Supabase daily backups enabled (PITR on Pro); test a restore into staging once.
- Monitoring: Workers observability on (already configured); Cloudflare notification for Worker error rate; a daily check that the two cron runs succeeded (log line plus a `settings.last_cron_at` value shown on the S1 settings page).

Exit check: go/no-go review passes (section 4) and S1 signs off the UAT.

### M9. Go-live day

Choose a weekday with a normal parade. Sequence, Singapore time:

1. Day before, 16:00: tag the release, deploy to production, run migrations, confirm `/api/health`.
2. Day before, 16:30: bootstrap the S1 admin, delete `BOOTSTRAP_ADMIN_PASSWORD`, import the nominal roll, create commander accounts, verify counts per unit against the current paper or spreadsheet state.
3. Day before, 17:00: each commander signs in once, changes their password, and adds the app to their home screen. Confirm all 8 units show Not marked for tomorrow's AM parade.
4. Go-live day, 07:00: on-call developer online. S1 opens the summary screen.
5. 07:30 to 10:00: commanders mark and submit as normal. Existing paper or chat process runs in parallel as the fallback.
6. 10:05: confirm the cron ran, Late units are flagged, and S1 notifications arrived.
7. 10:15: S1 compares app totals to the parallel process. Any mismatch is investigated before PM parade.
8. 14:00 to 14:15: repeat for PM parade.
9. 16:00: go-live retrospective. Decide whether to keep the parallel process for another day.

Rollback: if marking or submission is broken for more than one unit and cannot be fixed within 30 minutes, announce that the day's parade state is taken by the old process, keep the Worker up read-only (do not delete data), and fix forward for the next parade.

### M10. Hypercare (two weeks after go-live)

- On-call developer reachable 07:00 to 15:00 on parade days.
- Daily: check cron runs, error rate, submission counts against expected 16 per day.
- Collect commander feedback at end of week one; ship only fixes and small usability changes.
- End of week two: retire the parallel process, hand over the runbook to S1, move to normal release cadence.

## 4. Go/no-go checklist

All items must be yes before M9.

- [ ] Production Worker deployed from a tagged release built by CI.
- [ ] All migrations applied to production; schema matches `main`.
- [ ] `DEMO_CONTROLS` is `false` in production and no demo users exist.
- [ ] Bootstrap secret removed after first admin created.
- [ ] Hyperdrive bound and `SUPABASE_DB_URL` fallback also set.
- [ ] Cron triggers visible in the Cloudflare dashboard and one run observed on staging.
- [ ] Supabase backups enabled; one restore tested.
- [ ] Nominal roll imported and per-unit strength confirmed by each commander.
- [ ] All commander and S1 accounts created and first login completed.
- [ ] UAT signed off by S1 after three parade cycles on staging.
- [ ] Runbook written and shared with S1.
- [ ] On-call owner and fallback process agreed for go-live day.
- [ ] Security review closed with no open high findings.

## 5. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Supabase free-tier project pauses after inactivity | App down on parade morning | Pro plan for production; keep-alive query in both cron runs. |
| Transaction-mode pooler rejects prepared statements | Every query fails | `prepare: false` in the postgres client; integration tests run against the pooler URL once on staging. |
| Cron fires in UTC and cutoffs are Singapore time | Late marking at wrong hour | Cron expressions already offset; add a test asserting `sgLocalToIso(date,'10:00')` precedes the cron instant. |
| Poor mobile signal in camp | Commanders cannot submit | Offline queue and replay; service worker precaches shell; parallel process on day one. |
| Wrong nominal roll on day one | Counts distrusted | Commander confirms strength before go-live; posting in/out dates editable by S1. |
| Health remarks are personal data | Compliance exposure | Admin-only export, retention rule, no remarks in logs or notifications. |
| Single developer | Bus factor | Runbook, CI deploys, and docs kept current so S1 or a second developer can operate. |

## 6. Suggested sequence

Roughly 9 to 10 working weeks from today for one developer, or 6 to 7 with two. Milestones M6
and M7 overlap the feature work. Earliest realistic go-live is the second half of November 2026,
with UAT through the first half of the month.

| Weeks | Work |
| --- | --- |
| 1 | M1 data layer; provision staging (M7 start) |
| 2 | M2 auth and bootstrap |
| 3 to 4 | M3 commander flow; unit tests as modules land (M6) |
| 5 to 6 | M4 S1 flow; integration tests |
| 7 | M5 live updates and cron; CI pipeline complete |
| 8 | M8 pre-launch: security review, import, runbook, provision production |
| 9 to 10 | UAT on staging, fixes, go/no-go, M9 go-live |
| 11 to 12 | M10 hypercare |
