import type { ApiClient } from './client';

/** HTTP client against the Worker API. Implemented when the frontend is wired to the real API. */
export function createHttpApi(): ApiClient {
  const notReady = () => {
    throw new Error('The HTTP API client is not wired yet. Run `pnpm dev:mock` for the demo dataset.');
  };
  return new Proxy({} as ApiClient, { get: () => notReady });
}
