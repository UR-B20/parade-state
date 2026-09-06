/**
 * Load the fictional demo battalion into a Supabase project.
 *
 *   pnpm seed:demo
 *
 * Refuses to run unless DEMO_CONTROLS=true, so it cannot be pointed at production by accident.
 * Replaces all application data: existing demo auth users (any address at the demo domain)
 * are deleted and recreated with the demo password.
 */
import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { buildDemoDataset, DEMO_EMAIL_DOMAIN, DEMO_PASSWORD } from '../src/shared/demo/dataset';
import { demoControlsEnabled } from '../src/worker/env';
import * as schema from '../src/worker/db/schema';
import { loadDevVars, migrationsDatabaseUrl, requireEnv } from '../scripts/lib/env';
import { loadDemoDataset, resetAppData } from './load';

loadDevVars();

if (!demoControlsEnabled(process.env)) {
  console.error('Refusing to seed: DEMO_CONTROLS is not "true". The demo seed is for local and staging databases only.');
  process.exit(1);
}

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sql = postgres(migrationsDatabaseUrl(), { max: 1, prepare: false, onnotice: () => {} });
const db = drizzle(sql, { schema });

try {
  const dataset = await buildDemoDataset();
  console.log(`Demo battalion: ${dataset.units.length} units, ${dataset.personnel.length} personnel, ${dataset.users.length} users`);

  console.log('Clearing application data');
  await resetAppData(db);

  console.log('Recreating demo auth users');
  const existing = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (existing.error) throw existing.error;
  for (const user of existing.data.users) {
    if (user.email?.endsWith(`@${DEMO_EMAIL_DOMAIN}`)) {
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) throw error;
    }
  }

  const userIds = new Map<string, string>();
  for (const user of dataset.users) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: user.displayName },
    });
    if (error) throw error;
    userIds.set(user.id, data.user.id);
  }

  console.log('Inserting rows');
  await loadDemoDataset(db, dataset, { userIds });

  console.log(`Done. Sign in as any demo user with password "${DEMO_PASSWORD}":`);
  for (const user of dataset.users) console.log(`  ${user.email.padEnd(32)} ${user.role}${user.unitId ? ` ${user.unitId}` : ''}`);
} finally {
  await sql.end();
}
