/** Attendance statuses in the order used for bands, legends and dropdowns. */
export const STATUSES = ['PRESENT', 'LL', 'OFF', 'RSI', 'RSO', 'MC', 'MA', 'HL', 'OL', 'OTHERS'] as const;
export type Status = (typeof STATUSES)[number];

export const ABSENCE_STATUSES = ['LL', 'OFF', 'RSI', 'RSO', 'MC', 'MA', 'HL', 'OL', 'OTHERS'] as const;
export type AbsenceStatus = (typeof ABSENCE_STATUSES)[number];

/** Others sub-types offered in the picker. */
export const OTHERS_SUB_TYPES = ['VOC', 'SOC', 'ATP_CS', 'MEETING', 'COURSE', 'DUTY', 'STAY_OUT'] as const;
/** Sub-types recorded before the list changed; still readable, no longer offered. */
export const LEGACY_SUB_TYPES = ['ATTACHED_OUT', 'OUTFIELD'] as const;
export const ALL_SUB_TYPES = [...OTHERS_SUB_TYPES, ...LEGACY_SUB_TYPES] as const;
export type OthersSubType = (typeof ALL_SUB_TYPES)[number];

/** LL and OFF can be taken for half a day: AM is 0800–1200, PM is 1200–1800. */
export const HALF_DAYS = ['AM', 'PM'] as const;
export type HalfDay = (typeof HALF_DAYS)[number];
export const HALF_DAY_HOURS: Record<HalfDay, string> = { AM: '0800–1200', PM: '1200–1800' };

export const STATUS_LABEL: Record<Status, string> = {
  PRESENT: 'Present',
  LL: 'LL',
  OFF: 'OFF',
  RSI: 'RSI',
  RSO: 'RSO',
  MC: 'MC',
  MA: 'MA',
  HL: 'HL',
  OL: 'OL',
  OTHERS: 'Others',
};

/** Long-form names for tooltips, sheets and exports. */
export const STATUS_LONG_LABEL: Record<Status, string> = {
  PRESENT: 'Present',
  LL: 'Local leave',
  OFF: 'Off',
  RSI: 'Report sick inside',
  RSO: 'Report sick outside',
  MC: 'Medical certificate',
  MA: 'Medical appointment',
  HL: 'Hospitalisation leave',
  OL: 'Overseas leave',
  OTHERS: 'Others',
};

export const SUB_TYPE_LABEL: Record<OthersSubType, string> = {
  VOC: 'VOC',
  SOC: 'SOC',
  ATP_CS: 'ATP / CS',
  MEETING: 'Meeting',
  COURSE: 'On course',
  DUTY: 'Duty',
  STAY_OUT: 'Stay out',
  ATTACHED_OUT: 'Attached out',
  OUTFIELD: 'Outfield',
};

/** 'LL' or 'LL (PM)': the short label with the half-day marker when there is one. */
export function statusLabel(status: Status, halfDay: HalfDay | null | undefined): string {
  return halfDay ? `${STATUS_LABEL[status]} (${halfDay})` : STATUS_LABEL[status];
}

/** A person's effective state for one event: marked Present, an absence, or not yet marked. */
export type EffectiveKind = Status | 'UNMARKED';
export const UNMARKED_LABEL = 'Not yet marked';

/** RSI and RSO apply to the selected day only; every other absence can span several days. */
export function isMultiDay(status: AbsenceStatus): boolean {
  return status !== 'RSI' && status !== 'RSO';
}

export function isSingleDay(status: AbsenceStatus): boolean {
  return !isMultiDay(status);
}

/** Only LL and OFF can be taken as a half day. */
export function supportsHalfDay(status: AbsenceStatus): boolean {
  return status === 'LL' || status === 'OFF';
}

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

export function isAbsenceStatus(value: string): value is AbsenceStatus {
  return (ABSENCE_STATUSES as readonly string[]).includes(value);
}

export function isOthersSubType(value: string): value is OthersSubType {
  return (ALL_SUB_TYPES as readonly string[]).includes(value);
}
