import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load `.dev.vars` (the Wrangler local secrets file) into process.env for scripts.
 * Variables already present in the environment win, so CI can override the file.
 */
export function loadDevVars(): void {
  const path = resolve(process.cwd(), '.dev.vars');
  if (existsSync(path)) process.loadEnvFile(path);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .dev.vars.example to .dev.vars and fill it in.`);
  }
  return value;
}

/** Session-mode pooler URL for migrations and seeding, falling back to the runtime URL. */
export function migrationsDatabaseUrl(): string {
  return process.env.SUPABASE_DB_URL_MIGRATIONS ?? requireEnv('SUPABASE_DB_URL');
}
