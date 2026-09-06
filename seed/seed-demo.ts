/**
 * Loads the fictional battalion into a Supabase project for review or a demo deployment.
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_DB_URL_MIGRATIONS (session pooler)
 * or SUPABASE_DB_URL. Creates the demo auth users (password demo1234) if they do not exist,
 * then inserts personnel, absences, marks, submissions and notifications for Sun 6 Sep 2026
 * and sets the demo clock to 09:24. Idempotent: existing rows are left alone.
 *
 * Run: pnpm seed:demo            (or: npx tsx seed/seed-demo.ts --reset to wipe demo rows first)
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { inArray, sql } from 'drizzle-orm';
import { buildDemoDataset, DEMO_PASSWORD } from '../src/shared/demo/dataset';
import { createSupabaseAuthAdmin } from '../src/worker/auth/supabaseAdmin';
import { insertDemoData } from '../src/worker/db/seedDemo';
import * as schema from '../src/worker/db/schema';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_DB_URL_MIGRATIONS ?? process.env.SUPABASE_DB_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !supabaseUrl || !serviceKey) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL_MIGRATIONS (or SUPABASE_DB_URL).');
  process.exit(1);
}
const reset = process.argv.includes('--reset');

const sqlClient = postgres(url, { max: 1, prepare: false });
const db = drizzle(sqlClient, { schema });
const authAdmin = createSupabaseAuthAdmin({ SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceKey });
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findAuthUserId(email: string): Promise<string | null> {
  // Paginate through auth users (small demo set) to find an existing account by email.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

try {
  const data = await buildDemoDataset();
  if (reset) {
    console.log('Removing existing demo rows…');
    const personIds = data.personnel.map((p) => p.id);
    await db.delete(schema.notifications).where(inArray(schema.notifications.eventId, data.events.map((e) => e.id)));
    await db.delete(schema.submissions).where(inArray(schema.submissions.eventId, data.events.map((e) => e.id)));
    await db.delete(schema.unitEventState).where(inArray(schema.unitEventState.eventId, data.events.map((e) => e.id)));
    await db.delete(schema.eventMarks).where(inArray(schema.eventMarks.personId, personIds));
    await db.delete(schema.statusSpans).where(inArray(schema.statusSpans.personId, personIds));
    await db.delete(schema.personnel).where(inArray(schema.personnel.id, personIds));
  }

  const userIds = new Map<string, string>();
  for (const u of data.users) {
    let id = await findAuthUserId(u.email);
    if (!id) {
      ({ id } = await authAdmin.createUser({ email: u.email, password: DEMO_PASSWORD, displayName: u.displayName }));
      console.log('created auth user', u.email);
    }
    userIds.set(u.id, id);
  }

  await insertDemoData(db, data, userIds);
  const countRows = await db.execute<{ n: number }>(sql`select count(*)::int as n from personnel`);
  console.log(`Demo battalion loaded. Personnel rows: ${countRows[0]?.n ?? '?'}. Demo clock set to ${data.now} (09:24 SGT, 6 Sep 2026).`);
  console.log(`Sign in with any demo account and the password "${DEMO_PASSWORD}", e.g. cdr.coy1@parade-state.demo or s1admin@parade-state.demo.`);
} finally {
  await sqlClient.end({ timeout: 5 });
}
