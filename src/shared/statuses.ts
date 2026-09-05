/** Attendance statuses in the order used for bands, legends and dropdowns. */
export const STATUSES = ['PRESENT', 'MC', 'LL', 'MA', 'RSI', 'OTHERS'] as const;
export type Status = (typeof STATUSES)[number];

export const ABSENCE_STATUSES = ['MC', 'LL', 'MA', 'RSI', 'OTHERS'] as const;
export type AbsenceStatus = (typeof ABSENCE_STATUSES)[number];

export const OTHERS_SUB_TYPES = ['ATTACHED_OUT', 'COURSE', 'OUTFIELD', 'DUTY'] as const;
export type OthersSubType = (typeof OTHERS_SUB_TYPES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  PRESENT: 'Present',
  MC: 'MC',
  LL: 'LL',
  MA: 'MA',
  RSI: 'RSI',
  OTHERS: 'Others',
};

/** Long-form names for tooltips, sheets and exports. */
export const STATUS_LONG_LABEL: Record<Status, string> = {
  PRESENT: 'Present',
  MC: 'Medical certificate',
  LL: 'Light duty',
  MA: 'Medical appointment',
  RSI: 'Report sick',
  OTHERS: 'Others',
};

export const SUB_TYPE_LABEL: Record<OthersSubType, string> = {
  ATTACHED_OUT: 'Attached out',
  COURSE: 'Course',
  OUTFIELD: 'Outfield',
  DUTY: 'Duty',
};

/** MC, LL, MA and Others can span several days. RSI applies to the selected day only. */
export function isMultiDay(status: AbsenceStatus): boolean {
  return status !== 'RSI';
}

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

export function isAbsenceStatus(value: string): value is AbsenceStatus {
  return (ABSENCE_STATUSES as readonly string[]).includes(value);
}

export function isOthersSubType(value: string): value is OthersSubType {
  return (OTHERS_SUB_TYPES as readonly string[]).includes(value);
}
