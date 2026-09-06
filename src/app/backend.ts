/**
 * Everything the screens need to talk to the outside world, chosen once at start-up:
 * the real Worker plus Supabase Auth, or the in-browser demo backend.
 */
import type { ConfigDto } from '@shared/types';
import { createApi, type Api, type Fetcher } from './api/client';
import type { DemoControls } from './api/mock';
import { supabaseSession, type AuthSession } from './auth/session';

export interface Backend {
  api: Api;
  session: AuthSession;
  config: ConfigDto;
  /** Present on demo builds only. */
  demo: DemoControls | null;
}

const browserFetch: Fetcher = (input, init) => fetch(input, init);

export async function createBackend(): Promise<Backend> {
  if (import.meta.env.VITE_MOCK_API) {
    const { createMockBackend } = await import('./api/mock');
    const mock = await createMockBackend();
    const api = createApi(mock.fetcher, () => mock.session.getAccessToken());
    return { api, session: mock.session, config: await api.config(), demo: mock.demo };
  }
  const anonymous = createApi(browserFetch, async () => null);
  const config = await anonymous.config();
  const session = supabaseSession(config.supabaseUrl, config.anonKey);
  const api = createApi(browserFetch, () => session.getAccessToken());
  return { api, session, config, demo: null };
}
