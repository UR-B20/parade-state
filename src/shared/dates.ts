/**
 * All dates in SoldierTrack are civil dates in Asia/Singapore (UTC+08:00, no DST),
 * written as 'YYYY-MM-DD'. All timestamps are ISO-8601 UTC strings.
 * These helpers do fixed-offset arithmetic so they behave identically in the
 * Worker, the browser and Node tests.
 */
export const SG_OFFSET_MINUTES = 8 * 60;
const SG_OFFSET_MS = SG_OFFSET_MINUTES * 60_000;

export type IsoDate = string; // 'YYYY-MM-DD'
export type IsoTimestamp = string; // '2026-09-06T01:24:00.000Z'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isIsoDate(value: string): value is IsoDate {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isClockTime(value: string): boolean {
  return TIME_RE.test(value);
}

/** Singapore civil date for an instant. */
export function sgDateOf(instant: Date | IsoTimestamp): IsoDate {
  const ms = typeof instant === 'string' ? Date.parse(instant) : instant.getTime();
  return new Date(ms + SG_OFFSET_MS).toISOString().slice(0, 10);
}

/** Instant for a Singapore local date + 'HH:MM'. */
export function sgLocalToInstant(date: IsoDate, time: string): Date {
  return new Date(`${date}T${time}:00+08:00`);
}

export function sgLocalToIso(date: IsoDate, time: string): IsoTimestamp {
  return sgLocalToInstant(date, time).toISOString();
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 'HH:MM' in Singapore time, 24-hour. */
export function formatSgTime(instant: Date | IsoTimestamp): string {
  const ms = typeof instant === 'string' ? Date.parse(instant) : instant.getTime();
  const local = new Date(ms + SG_OFFSET_MS);
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Sun, 6 Sep 2026' */
export function formatSgDateLong(date: IsoDate): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** '6 Sep' or '6 Sep 2026' when the year differs from `relativeTo`. */
export function formatSgDateShort(date: IsoDate, relativeTo?: IsoDate): string {
  const d = new Date(`${date}T00:00:00Z`);
  const base = `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
  if (relativeTo && relativeTo.slice(0, 4) !== date.slice(0, 4)) {
    return `${base} ${d.getUTCFullYear()}`;
  }
  return base;
}

/** '6 Sep 2026' */
export function formatSgDateMedium(date: IsoDate): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
