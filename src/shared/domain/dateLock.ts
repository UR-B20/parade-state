import type { IsoDate, IsoTimestamp } from '../dates';

export interface DateUnlock {
  date: IsoDate;
  expiresAt: IsoTimestamp;
}

/**
 * Commanders may mark today and future dates. A past date is locked unless S1 has
 * unlocked it and the unlock has not expired. Admins are never locked.
 */
export function isDateLocked(
  eventDate: IsoDate,
  sgToday: IsoDate,
  unlocks: readonly DateUnlock[],
  now: Date,
): boolean {
  if (eventDate >= sgToday) return false;
  return !unlocks.some((u) => u.date === eventDate && Date.parse(u.expiresAt) > now.getTime());
}
