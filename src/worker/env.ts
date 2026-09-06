/**
 * Worker bindings: the vars and bindings in wrangler.jsonc plus the secrets set on the Worker.
 * Written out by hand (rather than extending the generated `Env`) so the app can be type-checked
 * for the browser demo without the Cloudflare runtime types.
 */
export interface Bindings {
  /** Static assets binding (unused by the API; Wrangler serves assets before the Worker). */
  ASSETS?: { fetch(request: Request): Promise<Response> };
  /** 'true' only on demo and staging deployments. */
  DEMO_CONTROLS?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_DB_URL?: string;
  SUPABASE_JWT_SECRET?: string;
  BOOTSTRAP_ADMIN_PASSWORD?: string;
  HYPERDRIVE?: { connectionString: string };
}

export function demoControlsEnabled(env: Pick<Bindings, 'DEMO_CONTROLS'>): boolean {
  return String(env.DEMO_CONTROLS) === 'true';
}

/** Hyperdrive when bound, otherwise the transaction-mode pooler URL. */
export function databaseConnectionString(env: Pick<Bindings, 'HYPERDRIVE' | 'SUPABASE_DB_URL'>): string | undefined {
  return env.HYPERDRIVE?.connectionString ?? env.SUPABASE_DB_URL;
}

export function isDatabaseConfigured(env: Pick<Bindings, 'HYPERDRIVE' | 'SUPABASE_DB_URL'>): boolean {
  return Boolean(databaseConnectionString(env));
}
