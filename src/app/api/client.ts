import type {
  AbsenteesDto, BattalionSummaryDto, EventDto, MarkBody, MarkResultDto, MeDto, NotificationsDto,
  PersonDto, SettingsDto, SubmissionDto, UnitAttendanceDto, UnitDto, UserDto,
} from '@shared/types';
import type { IsoDate, IsoTimestamp } from '@shared/dates';

export interface CreatePersonBody { rank: string; name: string; serviceNo?: string | null; postedInDate?: IsoDate }
export interface UpdatePersonBody { rank?: string; name?: string; serviceNo?: string | null; postedOutDate?: IsoDate | null }
export interface CreateUserBody { email: string; displayName: string; role: 'ADMIN' | 'COMMANDER'; unitId: string | null; password: string }
export interface UpdateUserBody { displayName?: string; unitId?: string | null; isActive?: boolean }
export interface CreateAdhocBody { date: IsoDate; name: string; cutoffTime: string }

export interface DemoAccount { email: string; label: string; role: 'ADMIN' | 'COMMANDER' }
export interface BootstrapBody { email: string; displayName: string; password: string; setupKey: string }

/** Everything the UI needs from the server. Implemented by the HTTP client and the demo mock. */
export interface ApiClient {
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** One-tap demo accounts; empty unless demo controls are enabled. */
  demoAccounts(): Promise<DemoAccount[]>;
  /** Creates the first S1 admin while no accounts exist. */
  bootstrap(body: BootstrapBody): Promise<UserDto>;
  changePassword(newPassword: string): Promise<void>;
  me(): Promise<MeDto>;
  /** Live refresh hook for the S1 dashboard. Returns an unsubscribe function. */
  subscribeAdminChanges(onChange: () => void): () => void;
  units(): Promise<UnitDto[]>;
  events(date: IsoDate): Promise<EventDto[]>;
  createAdhocEvent(body: CreateAdhocBody): Promise<EventDto>;

  personnel(unitId: string, includeInactive?: boolean): Promise<PersonDto[]>;
  createPerson(unitId: string, body: CreatePersonBody): Promise<PersonDto>;
  updatePerson(unitId: string, personId: string, body: UpdatePersonBody): Promise<PersonDto>;

  unitAttendance(unitId: string, eventId: string): Promise<UnitAttendanceDto>;
  mark(unitId: string, eventId: string, personId: string, body: MarkBody): Promise<MarkResultDto>;
  /** Marks everyone still unmarked as Present. */
  markRemainingPresent(unitId: string, eventId: string): Promise<UnitAttendanceDto>;
  submit(unitId: string, eventId: string): Promise<SubmissionDto>;
  submissions(unitId: string, eventId: string): Promise<SubmissionDto[]>;

  summary(eventId: string): Promise<BattalionSummaryDto>;
  absentees(eventId: string): Promise<AbsenteesDto>;
  exportUrl(eventId: string, format: 'xlsx' | 'csv'): string;
  download(eventId: string, format: 'xlsx' | 'csv'): Promise<Blob>;

  notifications(): Promise<NotificationsDto>;
  markNotificationsRead(ids: string[] | 'all'): Promise<void>;

  users(): Promise<UserDto[]>;
  createUser(body: CreateUserBody): Promise<UserDto>;
  updateUser(id: string, body: UpdateUserBody): Promise<UserDto>;
  resetPassword(id: string, newPassword: string): Promise<void>;

  settings(): Promise<SettingsDto>;
  updateSettings(body: { cutoffAm?: string; cutoffPm?: string }): Promise<SettingsDto>;
  unlockDate(date: IsoDate): Promise<SettingsDto>;
  relockDate(date: IsoDate): Promise<SettingsDto>;

  demoClock(): Promise<IsoTimestamp | null>;
  setDemoClock(now: IsoTimestamp | null): Promise<void>;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && err.name === 'NetworkError');
}

export const useMockApi = import.meta.env.VITE_MOCK_API === '1';
