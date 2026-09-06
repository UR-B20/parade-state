import type { AbsenceStatus, OthersSubType, Status } from './statuses';
import type { IsoDate, IsoTimestamp } from './dates';

export type UnitId = 'S1' | 'S2' | 'S3' | 'S4' | 'SSP' | 'COY1' | 'COY2' | 'ISR';
export type Role = 'ADMIN' | 'COMMANDER';
export type EventType = 'AM' | 'PM' | 'ADHOC';

export interface UnitDto {
  id: UnitId;
  name: string;
  sortOrder: number;
}

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  unitId: UnitId | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: IsoTimestamp;
}

export interface DemoInfo {
  enabled: boolean;
  /** Demo clock override, if set. */
  now: IsoTimestamp | null;
}

export interface MeDto {
  user: UserDto;
  serverNow: IsoTimestamp;
  sgToday: IsoDate;
  demo: DemoInfo;
}

export interface ConfigDto {
  supabaseUrl: string;
  anonKey: string;
  demoControls: boolean;
  /** True when no accounts exist yet and the bootstrap flow should be shown. */
  needsBootstrap: boolean;
}

/** Creates the first S1 admin on an empty database. */
export interface BootstrapBody {
  email: string;
  displayName: string;
  /** Must equal the Worker's BOOTSTRAP_ADMIN_PASSWORD secret; becomes the admin's first password. */
  bootstrapPassword: string;
}

export interface ChangePasswordBody {
  newPassword: string;
}

export interface CreateUserBody {
  email: string;
  displayName: string;
  role: Role;
  /** Required for commanders, must be omitted for admins. */
  unitId?: UnitId | null;
  /** The user signs in with this once and is then made to change it. */
  temporaryPassword: string;
}

export interface ResetPasswordBody {
  temporaryPassword: string;
}

export interface UsersDto {
  users: UserDto[];
}

export interface UnitsDto {
  units: UnitDto[];
}

export interface RollDto {
  unit: UnitDto;
  date: IsoDate;
  persons: PersonDto[];
}

export interface EventDto {
  id: string;
  date: IsoDate;
  type: EventType;
  /** Ad hoc event name; null for AM/PM parades. */
  name: string | null;
  cutoffAt: IsoTimestamp;
  /** 'AM parade', 'PM parade' or the ad hoc name. */
  label: string;
}

export interface PersonDto {
  id: string;
  unitId: UnitId;
  rank: string;
  name: string;
  serviceNo: string | null;
  postedInDate: IsoDate;
  postedOutDate: IsoDate | null;
}

/** A person's status for one event, as derived by the server. */
export interface EffectiveStatus {
  personId: string;
  rank: string;
  name: string;
  status: Status;
  /**
   * False only for the default Present of an unmarked person. The UI must show
   * this as default attendance, not as a confirmed mark.
   */
  confirmed: boolean;
  subType: OthersSubType | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  remark: string | null;
  /** Active span backing this status, when there is one. */
  spanId: string | null;
}

export interface UnitCounts {
  strength: number;
  present: number;
  presentConfirmed: number;
  presentDefault: number;
  mc: number;
  ll: number;
  ma: number;
  rsi: number;
  others: number;
  absent: number;
}

export type SubmissionState =
  | { kind: 'NOT_MARKED' }
  | { kind: 'PENDING'; lastChangedAt: IsoTimestamp }
  | { kind: 'LATE'; hasActivity: boolean; lastChangedAt: IsoTimestamp | null }
  | {
      kind: 'SUBMITTED' | 'RESUBMITTED';
      version: number;
      submittedAt: IsoTimestamp;
      submittedBy: string;
      wasLate: boolean;
      hasChanges: boolean;
    };

export type SubmissionKind = SubmissionState['kind'];

export interface StatusTuple {
  status: Status;
  subType: OthersSubType | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  remark: string | null;
}

export interface ChangeDiff {
  personId: string;
  rank: string;
  name: string;
  /** null when the person was added to the roll since the last submission. */
  before: StatusTuple | null;
  /** null when the person was removed from the roll since the last submission. */
  after: StatusTuple | null;
}

export interface UnitAttendanceDto {
  unit: UnitDto;
  event: EventDto;
  persons: EffectiveStatus[];
  counts: UnitCounts;
  submission: SubmissionState;
  changes: ChangeDiff[];
  /** Last change to this unit's attendance for this event. */
  updatedAt: IsoTimestamp | null;
  /** True when the event date is in the past and not unlocked by S1 (commanders read-only). */
  locked: boolean;
  contentHash: string;
}

export interface MarkResultDto {
  person: EffectiveStatus;
  counts: UnitCounts;
  submission: SubmissionState;
  changes: ChangeDiff[];
  updatedAt: IsoTimestamp;
  contentHash: string;
}

export type MarkBody =
  | { action: 'PRESENT' }
  | { action: 'BACK_TO_PRESENT' }
  | {
      action: 'SET';
      status: AbsenceStatus;
      subType?: OthersSubType | null;
      startDate: IsoDate;
      endDate: IsoDate | null;
      remark?: string | null;
    };

export interface SubmissionDto {
  id: string;
  unitId: UnitId;
  eventId: string;
  version: number;
  submittedAt: IsoTimestamp;
  submittedBy: string;
  submittedByName: string;
  counts: UnitCounts;
  contentHash: string;
}

export interface UnitSummaryRow {
  unit: UnitDto;
  counts: UnitCounts;
  submission: SubmissionState;
}

export interface BattalionSummaryDto {
  event: EventDto;
  totals: UnitCounts;
  unitsSubmitted: number;
  unitsTotal: number;
  units: UnitSummaryRow[];
  serverNow: IsoTimestamp;
}

export interface AbsenteeDto {
  personId: string;
  rank: string;
  name: string;
  unitId: UnitId;
  unitName: string;
  status: AbsenceStatus;
  subType: OthersSubType | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  remark: string | null;
}

export interface AbsenteeGroup {
  status: AbsenceStatus;
  items: AbsenteeDto[];
}

export interface AbsenteesDto {
  event: EventDto;
  total: number;
  groups: AbsenteeGroup[];
}

export type NotificationType = 'SUBMITTED' | 'RESUBMITTED' | 'LATE';

export interface NotificationDto {
  id: string;
  type: NotificationType;
  unitId: UnitId;
  unitName: string;
  eventId: string;
  message: string;
  createdAt: IsoTimestamp;
  readAt: IsoTimestamp | null;
}

export interface NotificationsDto {
  items: NotificationDto[];
  unreadCount: number;
}

export interface SettingsDto {
  cutoffAm: string; // 'HH:MM'
  cutoffPm: string; // 'HH:MM'
  dateUnlocks: { date: IsoDate; unlockedBy: string; expiresAt: IsoTimestamp }[];
}

export interface ApiErrorBody {
  error: {
    code:
      | 'VALIDATION'
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'DATE_LOCKED'
      | 'PASSWORD_CHANGE_REQUIRED'
      | 'INTERNAL';
    message: string;
    details?: unknown;
  };
}
