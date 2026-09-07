import type { AbsenceStatus, EffectiveKind, HalfDay, OthersSubType } from './statuses';
import type { IsoDate, IsoTimestamp } from './dates';

export type UnitId = 'CO' | 'S1' | 'S2' | 'S3' | 'S4' | 'SSP' | 'COY1' | 'COY2' | 'ISR';
export type Role = 'ADMIN' | 'COMMANDER';
/** AM and PM parades have cut-offs; the daily Roll Call and ad hoc events are also per date. */
export type EventType = 'AM' | 'PM' | 'ROLLCALL' | 'ADHOC';

export interface PlatoonDto {
  id: string;
  unitId: UnitId;
  name: string;
  sortOrder: number;
}

export interface UnitDto {
  id: UnitId;
  name: string;
  sortOrder: number;
  /** Sub-units, in display order. Empty for staff units. */
  platoons: PlatoonDto[];
}

export interface UserDto {
  id: string;
  username: string;
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

export interface EventDto {
  id: string;
  date: IsoDate;
  type: EventType;
  /** Ad hoc event name; null for the standard events. */
  name: string | null;
  /** Submission cut-off; null for the Roll Call, which has none and is never Late. */
  cutoffAt: IsoTimestamp | null;
  /** 'AM parade', 'PM parade', 'Roll call' or the ad hoc name. */
  label: string;
}

export interface PersonDto {
  id: string;
  unitId: UnitId;
  platoonId: string | null;
  rank: string;
  name: string;
  serviceNo: string | null;
  postedInDate: IsoDate;
  postedOutDate: IsoDate | null;
}

/**
 * A person's status for one event, as derived by the server. Present is always an explicit
 * mark; a person with no mark and no covering absence is UNMARKED and counts in neither
 * present nor absent.
 */
export interface EffectiveStatus {
  personId: string;
  rank: string;
  name: string;
  platoonId: string | null;
  status: EffectiveKind;
  subType: OthersSubType | null;
  /** Half-day LL or OFF: 'AM' (0800–1200) or 'PM' (1200–1800); null for a full day. */
  halfDay: HalfDay | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  remark: string | null;
  /** Active span backing this status, when there is one. */
  spanId: string | null;
}

export interface UnitCounts {
  strength: number;
  /** Explicitly marked Present. */
  present: number;
  /** Neither marked Present nor covered by an absence. */
  unmarked: number;
  ll: number;
  off: number;
  rsi: number;
  rso: number;
  mc: number;
  ma: number;
  hl: number;
  ol: number;
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
  status: EffectiveKind;
  subType: OthersSubType | null;
  /** Absent from snapshots taken before half days existed; read as null. */
  halfDay?: HalfDay | null;
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

/** Counts for one platoon; `platoon` is null for personnel without a platoon in a unit that has them. */
export interface PlatoonCounts {
  platoon: PlatoonDto | null;
  counts: UnitCounts;
}

export interface UnitAttendanceDto {
  unit: UnitDto;
  event: EventDto;
  persons: EffectiveStatus[];
  counts: UnitCounts;
  /** Per-platoon breakdown; empty for units without platoons. */
  platoons: PlatoonCounts[];
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
      /** LL or OFF for half a day; forces a single-day span on the event date. */
      halfDay?: HalfDay | null;
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
  platoons: PlatoonCounts[];
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
  halfDay: HalfDay | null;
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
      | 'INTERNAL';
    message: string;
    details?: unknown;
  };
}

/** One day in the battalion trend. Past days come from submissions; the event day is live. */
export interface TrendDay {
  date: IsoDate;
  eventId: string | null;
  live: boolean;
  /** Counts over the strength covered: the whole battalion today, submitted units on past days. */
  counts: UnitCounts;
  unitsSubmitted: number;
  unitsTotal: number;
  onTime: number;
  late: number;
}

export interface UnitTimeliness {
  unitId: string;
  unitName: string;
  onTime: number;
  late: number;
  missed: number;
  /** Today only: not submitted yet. */
  pending: number;
}

export interface TrendsDto {
  event: EventDto;
  days: TrendDay[];
  units: UnitTimeliness[];
  /** Today's Others absentees by sub-type. */
  othersSubTypes: Record<OthersSubType, number>;
  serverNow: IsoTimestamp;
}
