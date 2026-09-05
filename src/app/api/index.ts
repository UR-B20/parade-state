import type { ConfigDto } from '@shared/types';
import type { ApiClient } from './client';
import { useMockApi } from './client';
import { fetchConfig, HttpApi } from './http';
import { MockApi } from './mock';
import { createSupabase } from '../lib/supabase';

export interface Bootstrapped {
  api: ApiClient;
  config: ConfigDto;
}

/** Mock mode needs no server; otherwise load the public config and connect to Supabase. */
export async function bootstrapApi(): Promise<Bootstrapped> {
  if (useMockApi) {
    return { api: new MockApi(), config: { supabaseUrl: '', anonKey: '', demoControls: true, needsBootstrap: false } };
  }
  const config = await fetchConfig();
  const supabase = createSupabase(config);
  return { api: new HttpApi(supabase, config), config };
}
