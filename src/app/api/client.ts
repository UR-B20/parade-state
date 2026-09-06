import type {
  ApiErrorBody,
  BootstrapBody,
  ChangePasswordBody,
  ConfigDto,
  CreateUserBody,
  EventsDto,
  MarkBody,
  MarkResultDto,
  MeDto,
  ResetPasswordBody,
  RollDto,
  SubmissionsDto,
  SubmitBody,
  SubmitResultDto,
  UnitAttendanceDto,
  UnitsDto,
  UserDto,
  UsersDto,
} from '@shared/types';

/** The server answered with an error body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorBody['error']['code'],
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request never reached the server (offline, DNS, aborted). */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('No connection', { cause });
    this.name = 'NetworkError';
  }
}

export const isNetworkError = (err: unknown): err is NetworkError => err instanceof NetworkError;

export type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
export type TokenSource = () => Promise<string | null>;

export interface Api {
  config(): Promise<ConfigDto>;
  bootstrap(body: BootstrapBody): Promise<{ user: UserDto }>;
  me(): Promise<MeDto>;
  changePassword(body: ChangePasswordBody): Promise<{ user: UserDto }>;
  units(): Promise<UnitsDto>;
  roll(unitId: string, date?: string): Promise<RollDto>;
  events(date?: string): Promise<EventsDto>;
  attendance(unitId: string, eventId: string): Promise<UnitAttendanceDto>;
  mark(unitId: string, eventId: string, personId: string, body: MarkBody): Promise<MarkResultDto>;
  submit(unitId: string, eventId: string, body: SubmitBody): Promise<SubmitResultDto>;
  submissions(unitId: string, eventId: string): Promise<SubmissionsDto>;
  admin: {
    users(): Promise<UsersDto>;
    createUser(body: CreateUserBody): Promise<{ user: UserDto }>;
    deactivate(id: string): Promise<{ user: UserDto }>;
    activate(id: string): Promise<{ user: UserDto }>;
    resetPassword(id: string, body: ResetPasswordBody): Promise<{ user: UserDto }>;
  };
}

export function createApi(fetcher: Fetcher, getToken: TokenSource): Api {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await fetcher(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (err) {
      throw new NetworkError(err);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const error = (json as ApiErrorBody | null)?.error;
      throw new ApiError(res.status, error?.code ?? 'INTERNAL', error?.message ?? `Request failed (${res.status})`, error?.details);
    }
    return json as T;
  }

  const q = (path: string, params: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
    const s = search.toString();
    return s ? `${path}?${s}` : path;
  };

  return {
    config: () => request('GET', '/config'),
    bootstrap: (body) => request('POST', '/bootstrap', body),
    me: () => request('GET', '/me'),
    changePassword: (body) => request('POST', '/auth/change-password', body),
    units: () => request('GET', '/units'),
    roll: (unitId, date) => request('GET', q(`/units/${unitId}/roll`, { date })),
    events: (date) => request('GET', q('/events', { date })),
    attendance: (unitId, eventId) => request('GET', `/units/${unitId}/events/${eventId}/attendance`),
    mark: (unitId, eventId, personId, body) => request('POST', `/units/${unitId}/events/${eventId}/persons/${personId}/mark`, body),
    submit: (unitId, eventId, body) => request('POST', `/units/${unitId}/events/${eventId}/submit`, body),
    submissions: (unitId, eventId) => request('GET', `/units/${unitId}/events/${eventId}/submissions`),
    admin: {
      users: () => request('GET', '/admin/users'),
      createUser: (body) => request('POST', '/admin/users', body),
      deactivate: (id) => request('POST', `/admin/users/${id}/deactivate`),
      activate: (id) => request('POST', `/admin/users/${id}/activate`),
      resetPassword: (id, body) => request('POST', `/admin/users/${id}/reset-password`, body),
    },
  };
}
