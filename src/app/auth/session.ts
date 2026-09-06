/**
 * Who is signed in on this phone. Production talks to Supabase Auth; the demo backend keeps
 * accounts in memory. The API client only ever asks for the current access token.
 */
import { createClient } from '@supabase/supabase-js';

export interface DemoAccount {
  email: string;
  label: string;
  password: string;
}

export interface AuthSession {
  /** A valid access token, refreshed if needed, or null when signed out. */
  getAccessToken(): Promise<string | null>;
  isSignedIn(): Promise<boolean>;
  /** Throws an Error with a message fit for the sign-in form. */
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Called whenever the signed-in state may have changed. */
  subscribe(listener: () => void): () => void;
  /** One-tap accounts shown on the sign-in screen of demo builds. */
  demoAccounts?: DemoAccount[];
}

export function supabaseSession(url: string, anonKey: string): AuthSession {
  const client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return {
    async getAccessToken() {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },
    async isSignedIn() {
      return (await this.getAccessToken()) !== null;
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.code === 'invalid_credentials') throw new Error('Email or password is wrong');
        if (error.code === 'over_request_rate_limit') throw new Error('Too many attempts. Wait a minute and try again.');
        if (error.message.toLowerCase().includes('fetch')) throw new Error('No connection. Sign in needs the network.');
        throw new Error(error.message);
      }
    },
    async signOut() {
      await client.auth.signOut();
    },
    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange(() => listener());
      return () => data.subscription.unsubscribe();
    },
  };
}
