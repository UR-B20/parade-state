import type { SupabaseClient } from '@supabase/supabase-js';
import type { IsoDate, IsoTimestamp } from '@shared/dates';
import type {
  AbsenteesDto, ApiErrorBody, BattalionSummaryDto, ConfigDto, EventDto, MarkBody, MarkResultDto, MeDto, NotificationsDto, PersonDto, PlatoonDto,
  SettingsDto, SubmissionDto, UnitAttendanceDto, UnitDto, UserDto,
} from '@shared/types';
import { ApiError, type ApiClient, type BootstrapBody, type CreateAdhocBody, type CreatePersonBody, type CreateUserBody, type DemoAccount, type UpdatePersonBody, type UpdateUserBody } from './client';

export async function fetchConfig(): Promise<ConfigDto> {
  const res = await fetch('/api/config', { headers: { accept: 'application/json' } });
  if (!res.ok) throw new ApiError('INTERNAL', 'The server is not reachable right now.', res.status);
  return (await res.json()) as ConfigDto;
}

/** Worker API over fetch, authenticated with the Supabase session's access token. */
export class HttpApi implements ApiClient {
  constructor(private readonly supabase: SupabaseClient, private readonly config: ConfigDto) {}

  private async token(): Promise<string | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  private async call<T>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    const token = await this.token();
    if (token) headers.set('authorization', `Bearer ${token}`);
    let body = init.body;
    if (init.json !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(init.json);
    }
    const res = await fetch(`/api${path}`, { ...init, headers, body });
    if (res.status === 401 && retry && token) {
      // Try one refresh, then repeat the call.
      const { data } = await this.supabase.auth.refreshSession();
      if (data.session) return this.call<T>(path, init, false);
    }
    if (!res.ok) {
      let parsed: ApiErrorBody | null = null;
      try {
        parsed = (await res.json()) as ApiErrorBody;
      } catch {
        parsed = null;
      }
      throw new ApiError(parsed?.error.code ?? 'INTERNAL', parsed?.error.message ?? `Request failed (${res.status})`, res.status, parsed?.error.details);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw new ApiError('UNAUTHORIZED', error.status === 400 ? 'Email or password is incorrect.' : error.message, error.status ?? 401);
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }

  demoAccounts(): Promise<DemoAccount[]> {
    if (!this.config.demoControls) return Promise.resolve([]);
    return this.call<DemoAccount[]>('/auth/demo-accounts').catch(() => []);
  }

  async bootstrap(body: BootstrapBody): Promise<UserDto> {
    const user = await this.call<UserDto>('/auth/bootstrap', { method: 'POST', json: body });
    await this.signIn(body.email, body.password);
    return user;
  }

  async changePassword(newPassword: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) throw new ApiError('VALIDATION', error.message, 400);
    await this.call('/auth/password-changed', { method: 'POST' });
  }

  me() { return this.call<MeDto>('/auth/me'); }

  subscribeAdminChanges(onChange: () => void): () => void {
    const channel = this.supabase
      .channel('admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'unit_event_state' }, onChange)
      .subscribe();
    return () => {
      void this.supabase.removeChannel(channel);
    };
  }

  units() { return this.call<UnitDto[]>('/units'); }
  events(date: IsoDate) { return this.call<EventDto[]>(`/events?date=${date}`); }
  createAdhocEvent(body: CreateAdhocBody) { return this.call<EventDto>('/events', { method: 'POST', json: body }); }

  personnel(unitId: string, includeInactive = false) { return this.call<PersonDto[]>(`/units/${unitId}/personnel${includeInactive ? '?includeInactive=1' : ''}`); }
  createPerson(unitId: string, body: CreatePersonBody) { return this.call<PersonDto>(`/units/${unitId}/personnel`, { method: 'POST', json: body }); }
  updatePerson(unitId: string, personId: string, body: UpdatePersonBody) { return this.call<PersonDto>(`/units/${unitId}/personnel/${personId}`, { method: 'PATCH', json: body }); }

  unitAttendance(unitId: string, eventId: string) { return this.call<UnitAttendanceDto>(`/units/${unitId}/attendance/${eventId}`); }
  mark(unitId: string, eventId: string, personId: string, body: MarkBody) { return this.call<MarkResultDto>(`/units/${unitId}/attendance/${eventId}/persons/${personId}`, { method: 'PUT', json: body }); }
  markRemainingPresent(unitId: string, eventId: string) { return this.call<UnitAttendanceDto>(`/units/${unitId}/attendance/${eventId}/mark-remaining-present`, { method: 'POST' }); }
  submit(unitId: string, eventId: string) { return this.call<SubmissionDto>(`/units/${unitId}/submissions/${eventId}`, { method: 'POST' }); }
  submissions(unitId: string, eventId: string) { return this.call<SubmissionDto[]>(`/units/${unitId}/submissions/${eventId}`); }

  summary(eventId: string) { return this.call<BattalionSummaryDto>(`/admin/summary/${eventId}`); }
  absentees(eventId: string) { return this.call<AbsenteesDto>(`/admin/absentees/${eventId}`); }
  exportUrl(eventId: string, format: 'xlsx' | 'csv') { return `/api/admin/export/${eventId}.${format}`; }
  async download(eventId: string, format: 'xlsx' | 'csv'): Promise<Blob> {
    const token = await this.token();
    const res = await fetch(this.exportUrl(eventId, format), { headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError('INTERNAL', 'Export failed', res.status);
    return res.blob();
  }

  notifications() { return this.call<NotificationsDto>('/notifications'); }
  markNotificationsRead(ids: string[] | 'all') { return this.call<void>('/notifications/read', { method: 'POST', json: ids === 'all' ? { all: true } : { ids } }); }

  users() { return this.call<UserDto[]>('/admin/users'); }
  createUser(body: CreateUserBody) { return this.call<UserDto>('/admin/users', { method: 'POST', json: body }); }
  updateUser(id: string, body: UpdateUserBody) { return this.call<UserDto>(`/admin/users/${id}`, { method: 'PATCH', json: body }); }
  resetPassword(id: string, newPassword: string) { return this.call<void>(`/admin/users/${id}/reset-password`, { method: 'POST', json: { newPassword } }); }

  createPlatoon(unitId: string, name: string) { return this.call<PlatoonDto>(`/admin/units/${unitId}/platoons`, { method: 'POST', json: { name } }); }
  renamePlatoon(id: string, name: string) { return this.call<PlatoonDto>(`/admin/platoons/${id}`, { method: 'PATCH', json: { name } }); }
  deletePlatoon(id: string) { return this.call<void>(`/admin/platoons/${id}`, { method: 'DELETE' }); }

  settings() { return this.call<SettingsDto>('/admin/settings'); }
  updateSettings(body: { cutoffAm?: string; cutoffPm?: string }) { return this.call<SettingsDto>('/admin/settings', { method: 'PUT', json: body }); }
  unlockDate(date: IsoDate) { return this.call<SettingsDto>(`/admin/date-unlocks/${date}`, { method: 'POST' }); }
  relockDate(date: IsoDate) { return this.call<SettingsDto>(`/admin/date-unlocks/${date}`, { method: 'DELETE' }); }

  async demoClock(): Promise<IsoTimestamp | null> { return (await this.call<{ now: IsoTimestamp | null }>('/admin/demo-clock')).now; }
  setDemoClock(now: IsoTimestamp | null) { return this.call<void>('/admin/demo-clock', { method: 'PUT', json: { now } }); }
}
