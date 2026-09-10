# SoldierTrack

Mobile-first parade state reporting for 15C4I Battalion. Because every soldier counts.
Branch/Coy commanders mark and submit; S1 Branch sees the battalion. Accounts sign in with a
username; light and dark appearance. Unit commanders mark their personnel for the
AM parade, PM parade, the optional daily Roll Call or an ad hoc event and submit to S1. S1 watches present strength and unit
submissions across the battalion, sees who is absent and why, and exports to Excel or CSV.

- **Frontend and API** run on one Cloudflare Worker (React + Vite, Hono).
- **Data, sign-in and live updates** run on Supabase (Postgres, Auth, Realtime).
- Both fit comfortably in the free tiers at battalion scale.

## How attendance works

- Every person is marked explicitly with **Present** or **Not present**. Choosing Not present
  opens the reason panel: LL (local leave), OFF, RSI (report sick inside), RSO (report sick
  outside), MC, MA, HL (hospitalisation leave), OL (overseas leave) or Others with a sub-type
  (VOC, SOC, ATP / CS, Meeting, On course, Duty, Stay out), plus dates and a remark. People
  not yet marked count in neither present nor absent and are listed as "Not yet marked".
- **LL and OFF can be half a day**: AM is 0800–1200, PM is 1200–1800. A half-day absence only
  applies to the parade in that half; the person stays "Not yet marked" at the other parade
  until marked. At the Roll Call (which has no time) the half-day reason is shown.
- **Submit to S1** is only possible once everyone is marked. **Mark remaining Present** marks
  everyone still unmarked in one confirmed step; with a platoon selected it covers that
  platoon only.
- **LL, OFF, MC, MA, HL, OL and Others** can span several days and keep applying on later
  parades with nothing to re-enter. **RSI and RSO** apply to the selected day only.
- Choosing **Present** for someone with an ongoing absence marks this event only; the absence
  keeps running. **Back to Present** ends the absence from today.
- Saving is automatic. Submitting snapshots the unit's attendance as a version; further changes
  show as "changes since submission" until the unit **resubmits**.
- S1 exports one event (Excel summary plus absentees, or CSV) or a **whole month** as one
  workbook: the battalion by day, each Branch/Coy by day and every absentee, as submitted.
- **Ad hoc events** created by S1 are pre-filled from each unit's last submitted parade state
  on or before that date. AM and PM parades start unmarked. Once an ad hoc event is over, S1
  can **archive** it from the dashboard: it disappears from every event picker but keeps its
  submissions, and can be restored under Cut-offs and unlocks.
- The **Roll Call** exists for every date without anyone creating it. It has no cut-off, is
  never Late and is optional. The first time a unit opens it, it is pre-filled from that
  unit's last submitted parade (the PM parade if submitted, else the AM parade, else the last
  parade before that day). Submitting it notifies S1 like any other submission.
- Units become **Late** after the cut-off (AM 10:00, PM 14:00 by default, editable by S1).
- The S1 **Overview** reads like a briefing: a headline sentence, auto-generated insights, KPI
  tiles with 7-day deltas, the strength composition, present share by unit (with platoon
  drill-down), the 14-day present-rate trend against a 90% norm, absence by reason against its
  run rate, and each unit's reporting discipline. Past days come from what units submitted;
  today is live. Commanders see the same 14-day trend for their unit as a sparkline. Every
  chart has a table view.
- Commanders can mark **today and future dates**. S1 can unlock a past date for 24 hours.

## Local development

```bash
pnpm install
pnpm dev:mock          # UI on the fictional battalion, no server or Supabase needed
pnpm test              # domain tests + API tests on an in-process Postgres (PGlite)
pnpm typecheck
```

`pnpm dev:mock` opens http://localhost:5173 with one-tap demo sign-in for the Coy 1 commander
and the S1 admin. Data lives in memory and resets on reload.

To run the real stack locally, copy `.dev.vars.example` to `.dev.vars`, fill in your Supabase
values (below), then:

```bash
pnpm db:migrate        # apply migrations to your Supabase project
pnpm dev               # Worker + client on http://localhost:5173
pnpm seed:demo         # optional: load the fictional battalion (password demo1234)
```

## Deploying

### 1. Supabase project

1. Create a project at https://supabase.com (region **Southeast Asia (Singapore)**).
2. From **Project Settings → API** copy the **Project URL**, the **anon** key and the
   **service_role** key. The service_role key and the database password are secrets: move
   them only through environment variables or the Cloudflare secrets UI. If either is ever
   pasted into a chat, ticket or email, rotate it (service_role: **Reset** on the same page;
   database password: **Project Settings → Database**).
3. From **Connect** copy both pooler connection strings:
   - **Transaction** mode (port 6543) → `SUPABASE_DB_URL` (runtime)
   - **Session** mode (port 5432) → `SUPABASE_DB_URL_MIGRATIONS` (migrations and seeding)
4. **Authentication → Providers → Email**: turn **Confirm email** off. S1 creates commanders
   with a temporary password that they change on first sign-in; a confirmation email would
   only block them.
5. Only if the project still uses a shared JWT secret (older projects): copy it as
   `SUPABASE_JWT_SECRET`. New projects publish signing keys and need nothing extra.

The repository carries a project-scoped `.mcp.json` pointing Claude Code at the Supabase MCP
server for this project. It holds no secrets and signs in through the browser, so it works
on a developer's machine, not in a remote session.

### 2. Cloudflare Worker (Workers Builds)

1. Push this repository to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Import a repository**.
3. Settings:
   - **Build command:** `pnpm db:migrate && pnpm build`
   - **Deploy command:** `npx wrangler deploy`
   - **Build variables:** `SUPABASE_DB_URL_MIGRATIONS`
   - **Variables and secrets (Worker runtime):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` (secret), `SUPABASE_DB_URL` (secret),
     `BOOTSTRAP_ADMIN_PASSWORD` (secret, a one-time setup key you choose),
     `SUPABASE_JWT_SECRET` (secret, legacy projects only).
4. Recommended: **Hyperdrive**. Create a Hyperdrive config from the transaction-mode connection
   string, then add its id to `wrangler.jsonc` under `hyperdrive` and redeploy. It pools
   connections and removes a TLS handshake per request. Without it the Worker connects directly.
5. Every push to `main` now migrates the database and deploys.

### 3. First sign-in

Open the Worker URL. With no accounts yet, the app shows **Set up SoldierTrack**: enter your
name, email, a password and the setup key (`BOOTSTRAP_ADMIN_PASSWORD`). That creates the S1
admin. From the account menu, **Manage accounts** creates unit commanders with a temporary
password they must change on first sign-in.

### Go-live checklist (real roll)

- [ ] Any key or password that was ever shared outside the secrets store has been rotated.
- [ ] Supabase email confirmation is off.
- [ ] Migrations applied (`pnpm db:migrate`, or the Workers Builds build command).
- [ ] Worker variables set: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
      `SUPABASE_DB_URL`, `BOOTSTRAP_ADMIN_PASSWORD`; `DEMO_CONTROLS` is `"false"`.
- [ ] `pnpm seed:demo` was **not** run against this project.
- [ ] S1 completed **Set up SoldierTrack** on the Worker URL and created the commanders.
- [ ] Each commander signed in, changed their password and built their roll (platoons for
      the companies under **Manage roll**).

### Demo deployment

Set the Worker variable `DEMO_CONTROLS` to `"true"` and run `pnpm seed:demo` with the project's
secrets exported. This loads the fictional battalion (312 personnel, Sun 6 Sep 2026) with demo
accounts (`cdr.coy1@parade-state.demo`, `s1admin@parade-state.demo`, password `demo1234`) and
enables the prototype controls (demo clock, simulated connection loss) in the account menu.
In the demo, Coy 1 still has ten people to mark, S2 has not started, and six units have submitted.
Thirteen prior days of AM parades are included so the Overview's trends and reporting
discipline have history (a report-sick spike on Tue 1 Sep, Coy 2 late three times, S2 missing
twice).
Never enable it on the production deployment.

## Operations notes

- The Worker's cron (10:05 and 14:05 Singapore time) records **Late** notifications for
  unsubmitted units and keeps a free Supabase project from pausing.
- Free Supabase projects have no automated backups. The Excel export is the practical backup
  until the project moves to a paid plan.
- Hosting personnel attendance on a public cloud may need clearance under your unit's
  information-security policy.

## Project layout

```
src/shared     types, statuses, ranks, Singapore dates, validation schemas, pure domain logic, demo dataset
src/worker     Hono API: auth, events, roll, attendance, submissions, notifications, summary, export, cron
src/app        React client: pages, components, Chart.js overview, API client (HTTP + in-memory mock), offline persistence
migrations     Drizzle SQL migrations (0001 is Supabase-only and guarded)
seed           Demo battalion loader for Supabase
scripts        migrate, icons, screenshot capture, demo checks
src/test       domain unit tests, PGlite integration tests, Playwright smoke test
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm dev:mock` | Local development against Supabase / against the in-memory demo |
| `pnpm build` | Production build of client and Worker |
| `pnpm build:standalone` | Single-file build of the demo client for design review |
| `pnpm test` / `pnpm test:e2e` | Unit and integration tests / Playwright smoke test at phone size |
| `pnpm db:generate` / `pnpm db:migrate` | Generate a migration from the schema / apply migrations |
| `pnpm seed:demo` | Load the fictional battalion into Supabase (`--reset` wipes demo rows first) |
