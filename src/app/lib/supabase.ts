import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ConfigDto } from '@shared/types';

export function createSupabase(config: ConfigDto): SupabaseClient {
  return createClient(config.supabaseUrl, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'parade-state-auth' },
    realtime: { params: { eventsPerSecond: 2 } },
  });
}
