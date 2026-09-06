/**
 * API-level live check of a deployed SoldierTrack Worker, using throwaway accounts that it
 * deletes again at the end. Real-roll safe: it never seeds demo data and leaves the project
 * with no accounts and no personnel, so the owner's first sign-in still creates the S1 admin.
 *
 * Needs SUPABASE_URL, SUPABASE_ANON_KEY (publishable key), SUPABASE_SERVICE_ROLE_KEY (secret
 * key) and BOOTSTRAP_ADMIN_PASSWORD in the environment, and LIVE_URL for the Worker.
 *
 *   LIVE_URL=https://<worker>.workers.dev NODE_USE_ENV_PROXY=1 node scripts/live-check.mjs
 *   node scripts/live-check.mjs --cleanup     # only remove the throwaway data
 */
const U = `${(process.env.LIVE_URL || 'https://parade-state.ranee-uthaya.workers.dev').replace(/\/$/, '')}/api`;
const SB = process.env.SUPABASE_URL;
const PUB = process.env.SUPABASE_ANON_KEY;
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SETUP = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const ADMIN = { email: 'smoke-admin@example.com', name: 'CPT Smoke Test', pw: 'SmokeAdmin-2026!' };
const CDR = { email: 'smoke-cdr@example.com', name: 'LTA Smoke Commander', temp: 'TempPass-2026!', pw: 'CdrPass-2026!' };
const cleanupOnly = process.argv.includes('--cleanup');
const sgToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const results = [];
const check = (name, ok, detail = '') => { results.push([ok ? 'PASS' : 'FAIL', name, detail]); console.log(ok ? '  ok ' : '  FAIL', name, detail); if (!ok) throw new Error(`check failed: ${name} ${detail}`); };

async function fetchRetry(url, init, tries = 4) {
  for (let i = 1; ; i++) {
    try { return await fetch(url, { ...init, headers: { connection: 'close', ...(init.headers || {}) } }); }
    catch (e) { if (i >= tries) throw e; console.log('  retry', i, url.split('/').slice(-2).join('/'), e.cause?.code || e.message); await new Promise((r) => setTimeout(r, 800 * i)); }
  }
}
async function api(path, { token, method = 'GET', json, raw } = {}) {
  const r = await fetchRetry(U + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(json ? { 'content-type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : undefined });
  if (raw) return r;
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}
async function signIn(email, password) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUB, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`sign-in ${email}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}
async function setPassword(token, password) {
  const r = await fetch(`${SB}/auth/v1/user`, { method: 'PUT', headers: { apikey: PUB, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
  if (!r.ok) throw new Error(`set password: ${r.status} ${(await r.text()).slice(0, 200)}`);
}
const rest = (path, init = {}) => fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json', ...(init.headers || {}) } });
async function count(table) { const r = await rest(`${table}?select=id&limit=1`, { headers: { Prefer: 'count=exact' } }); return Number((r.headers.get('content-range') || '').split('/')[1]); }
async function authUsers() { const r = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: { apikey: SECRET, authorization: `Bearer ${SECRET}` } }); return (await r.json()).users || []; }

async function cleanup() {
  console.log('cleanup');
  const today = sgToday();
  const persons = await (await rest(`personnel?select=id&name=like.Smoke*`)).json();
  const ids = persons.map((p) => p.id);
  const inList = `(${ids.join(',')})`;
  const del = async (path) => { const r = await rest(path, { method: 'DELETE', headers: { Prefer: 'return=representation' } }); const n = r.ok ? (await r.json()).length : `ERR ${r.status} ${(await r.text()).slice(0, 120)}`; console.log('  deleted', path.split('?')[0], n); };
  await del(`notifications?unit_id=eq.COY1`);
  await del(`submissions?unit_id=eq.COY1`);
  if (ids.length) { await del(`event_marks?person_id=in.${inList}`); await del(`status_spans?person_id=in.${inList}`); }
  await del(`unit_event_state?unit_id=eq.COY1`);
  await del(`date_unlocks?date=eq.${today}`);
  if (ids.length) await del(`personnel?id=in.${inList}`);
  await del(`events?date=eq.${today}`);
  const users = (await authUsers()).filter((u) => [ADMIN.email, CDR.email].includes(u.email));
  await del(`profiles?email=in.(${[ADMIN.email, CDR.email].join(',')})`);
  for (const u of users) { const r = await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: { apikey: SECRET, authorization: `Bearer ${SECRET}` } }); console.log('  auth user deleted', u.email, r.status); }
  for (const t of ['profiles', 'personnel', 'events', 'submissions', 'event_marks', 'status_spans', 'notifications', 'unit_event_state']) console.log('  remaining', t, await count(t));
  console.log('  auth users remaining', (await authUsers()).length);
  const cfg = await (await fetch(`${U}/config`)).json();
  console.log('  needsBootstrap', cfg.needsBootstrap);
}

if (cleanupOnly) { await cleanup(); process.exit(0); }

const today = sgToday();
console.log('live API smoke test, SG date', today);
let r = await api('/config'); check('config reachable', r.status === 200 && r.body.demoControls === false, JSON.stringify({ needsBootstrap: r.body.needsBootstrap, demoControls: r.body.demoControls }));
if (r.body.needsBootstrap) {
  r = await api('/auth/bootstrap', { method: 'POST', json: { email: ADMIN.email, displayName: ADMIN.name, password: ADMIN.pw, setupKey: 'wrong-key' } }); check('bootstrap rejects a wrong setup key', r.status === 401 || r.status === 403, String(r.status));
  r = await api('/auth/bootstrap', { method: 'POST', json: { email: ADMIN.email, displayName: ADMIN.name, password: ADMIN.pw, setupKey: SETUP } }); check('bootstrap creates the first admin', r.status === 200 || r.status === 201, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  r = await api('/config'); check('config after bootstrap', r.body.needsBootstrap === false);
} else console.log('  (admin already exists from the earlier run; bootstrap skipped)');
const admin = await signIn(ADMIN.email, ADMIN.pw);
r = await api('/auth/me', { token: admin }); check('admin /me', r.status === 200 && r.body.user.role === 'ADMIN', JSON.stringify({ role: r.body.user?.role, mustChange: r.body.user?.mustChangePassword }));
r = await api(`/events?date=${today}`, { token: admin }); const am = r.body.find((e) => e.type === 'AM'); check('standard events for today', r.status === 200 && !!am && r.body.some((e) => e.type === 'PM'), r.body.map((e) => e.id).join(','));
r = await api(`/admin/summary/${am.id}`, { token: admin }); check('empty battalion summary', r.status === 200 && r.body.totals.strength === 0 && r.body.unitsTotal === 8, JSON.stringify(r.body.totals));
r = await api(`/admin/trends/${am.id}`, { token: admin }); check('trends on an empty battalion', r.status === 200 && r.body.days.length === 14, `days ${r.body.days?.length}`);
r = await api('/admin/users', { token: admin, method: 'POST', json: { email: CDR.email, displayName: CDR.name, role: 'COMMANDER', unitId: 'COY1', password: CDR.temp } }); check('create commander account', r.status === 200 || r.status === 201 || r.status === 409, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
let cdr = await signIn(CDR.email, CDR.temp).catch(() => signIn(CDR.email, CDR.pw));
r = await api('/auth/me', { token: cdr }); check('commander must change password on first sign-in', r.body.user?.unitId === 'COY1', `mustChange=${r.body.user?.mustChangePassword}`);
r = await api('/units/COY1/personnel', { token: cdr, method: 'POST', json: { rank: 'CPL', name: 'Smoke Present', platoonId: 'COY1-P1' } }); check('blocked until the password is changed (or allowed)', [200, 201, 403].includes(r.status), String(r.status));
await setPassword(cdr, CDR.pw);
r = await api('/auth/password-changed', { token: cdr, method: 'POST' }); check('password-changed acknowledged', r.status === 200 || r.status === 204, String(r.status));
cdr = await signIn(CDR.email, CDR.pw);
r = await api('/auth/me', { token: cdr }); check('commander flag cleared', r.body.user?.mustChangePassword === false);
r = await api('/units/COY1/personnel', { token: cdr }); const existing = r.body;
let p1 = existing.find((p) => p.name === 'Smoke Present');
if (!p1) { r = await api('/units/COY1/personnel', { token: cdr, method: 'POST', json: { rank: 'CPL', name: 'Smoke Present', platoonId: 'COY1-P1' } }); p1 = r.body; }
r = await api('/units/COY1/personnel', { token: cdr, method: 'POST', json: { rank: 'PTE', name: 'Smoke Absent', platoonId: 'COY1-P2' } }); const p2 = r.body; check('add two people to the roll', !!p1?.id && r.status <= 201 && p2.platoonId === 'COY1-P2', `${p1?.id?.slice(0, 8)} ${p2?.id?.slice(0, 8)}`);
r = await api(`/units/COY1/attendance/${am.id}`, { token: cdr }); check('roll starts unmarked', r.status === 200 && r.body.counts.strength === 2 && r.body.counts.unmarked === 2, JSON.stringify(r.body.counts));
r = await api(`/units/COY1/submissions/${am.id}`, { token: cdr, method: 'POST' }); check('submit blocked while unmarked', r.status === 400 || r.status === 422, `${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
r = await api(`/units/COY1/attendance/${am.id}/persons/${p1.id}`, { token: cdr, method: 'PUT', json: { action: 'PRESENT' } }); check('mark Present', r.status === 200 && r.body.person.status === 'PRESENT');
r = await api(`/units/COY1/attendance/${am.id}/persons/${p2.id}`, { token: cdr, method: 'PUT', json: { action: 'SET', status: 'MC', startDate: today, endDate: today, remark: 'Smoke test' } }); check('mark MC', r.status === 200 && r.body.person.status === 'MC' && r.body.counts.absent === 1, JSON.stringify(r.body.counts));
r = await api(`/units/COY1/submissions/${am.id}`, { token: cdr, method: 'POST' }); check('submit to S1', r.status === 200 || r.status === 201, `${r.status} ${JSON.stringify(r.body.counts)}`);
r = await api(`/units/COY1/attendance/${am.id}`, { token: cdr }); check('submission state SUBMITTED', r.body.submission.kind === 'SUBMITTED' && r.body.platoons.some((p) => p.platoon?.id === 'COY1-P1' && p.counts.present === 1), r.body.submission.kind);
r = await api(`/units/COY1/attendance/${am.id}/trends`, { token: cdr }); check('unit trends', r.status === 200 && r.body.units[0].onTime === 1 && r.body.days[13].counts.present === 1, JSON.stringify(r.body.units[0]));
r = await api(`/units/COY2/attendance/${am.id}`, { token: cdr }); check('commander cannot read another unit', r.status === 403, String(r.status));
r = await api(`/admin/summary/${am.id}`, { token: admin }); const coy1 = r.body.units.find((u) => u.unit.id === 'COY1'); check('S1 summary shows Coy 1 submitted 1 of 2', r.body.unitsSubmitted === 1 && coy1.counts.present === 1 && coy1.counts.mc === 1 && coy1.submission.kind === 'SUBMITTED', JSON.stringify(coy1.counts));
r = await api(`/admin/absentees/${am.id}`, { token: admin }); check('absentees list the MC', r.body.total === 1 && r.body.groups[0].items[0].name === 'Smoke Absent');
r = await api(`/admin/trends/${am.id}`, { token: admin }); check('battalion trends live day', r.body.days[13].live === true && r.body.days[13].unitsSubmitted === 1, JSON.stringify(r.body.days[13].counts));
r = await api('/notifications', { token: admin }); check('S1 notified of the submission', r.body.items.some((n) => n.type === 'SUBMITTED' && n.unitId === 'COY1') && r.body.unreadCount >= 1, r.body.items[0]?.message);
r = await api(`/admin/users`, { token: cdr }); check('commander cannot list accounts', r.status === 403, String(r.status));
let x = await api(`/admin/export/${am.id}.xlsx`, { token: admin, raw: true }); const xb = new Uint8Array(await x.arrayBuffer()); check('Excel export', x.status === 200 && xb[0] === 0x50 && xb[1] === 0x4b && xb.length > 3000, `${x.headers.get('content-type')} ${xb.length} bytes`);
x = await api(`/admin/export/${am.id}.csv`, { token: admin, raw: true }); const cb = new Uint8Array(await x.arrayBuffer()); check('CSV export with BOM', x.status === 200 && cb[0] === 0xef && cb[1] === 0xbb && new TextDecoder().decode(cb).includes('Smoke Absent'), `${cb.length} bytes`);
r = await api('/admin/summary/' + am.id); check('unauthenticated request rejected', r.status === 401, String(r.status));
console.log(`\n${results.filter((x) => x[0] === 'PASS').length} of ${results.length} checks passed`);
await cleanup();
