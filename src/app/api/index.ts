import type { ApiClient } from './client';
import { useMockApi } from './client';
import { createHttpApi } from './http';
import { MockApi } from './mock';

export function createApiClient(): ApiClient {
  return useMockApi ? new MockApi() : createHttpApi();
}
