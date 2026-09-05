import { createClient } from '@supabase/supabase-js';
import type { Bindings } from '../env';
import { ConfigError } from '../errors';

/** The slice of Supabase Auth's admin API the Worker needs. Faked in tests. */
export interface AuthAdmin {
  createUser(input: { email: string; password: string; displayName: string }): Promise<{ id: string }>;
  updatePassword(userId: string, password: string): Promise<void>;
  setBanned(userId: string, banned: boolean): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

export function createSupabaseAuthAdmin(env: Pick<Bindings, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>): AuthAdmin {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new ConfigError('set the SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY secrets');
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const admin = client.auth.admin;
  return {
    async createUser({ email, password, displayName }) {
      const { data, error } = await admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName } });
      if (error || !data.user) throw new Error(error?.message ?? 'Could not create the account');
      return { id: data.user.id };
    },
    async updatePassword(userId, password) {
      const { error } = await admin.updateUserById(userId, { password });
      if (error) throw new Error(error.message);
    },
    async setBanned(userId, banned) {
      const { error } = await admin.updateUserById(userId, { ban_duration: banned ? '876000h' : 'none' });
      if (error) throw new Error(error.message);
    },
    async deleteUser(userId) {
      const { error } = await admin.deleteUser(userId);
      if (error) throw new Error(error.message);
    },
  };
}
