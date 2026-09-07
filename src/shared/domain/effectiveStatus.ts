import { formatSgTime, type IsoDate, type IsoTimestamp } from '../dates';
import { compareByRankThenName } from '../ranks';
import type { AbsenceStatus, HalfDay, OthersSubType } from '../statuses';
import type { EffectiveStatus, EventType } from '../types';

/** Minimal person shape needed for derivation. */
export interface RollPerson {
  id: string;
  rank: string;
  name: string;
  postedInDate: IsoDate;
  postedOutDate: IsoDate | null;
  platoonId?: string | null;
}

/** An absence span as stored; only active (non-superseded) spans should be passed in. */
export interface SpanRow {
  id: string;
  personId: string;
  status: AbsenceStatus;
  subType: OthersSubType | null;
  /** Half-day LL or OFF; absent (undefined) on rows written before half days existed. */
  halfDay?: HalfDay | null;
  startDate: IsoDate;
  endDate: IsoDate | null;
  remark: string | null;
  createdAt: IsoTimestamp;
}

/**
 * Which half of the day an event falls in, for half-day absences. AM and PM parades sit in
 * their own halves, an ad hoc event follows its cut-off time, and the Roll Call has no time
 * (null), so a half-day absence still shows there.
 */
export function eventHalf(event: { type: EventType; cutoffAt: IsoTimestamp | Date | null }): HalfDay | null {
  switch (event.type) {
    case 'AM': return 'AM';
    case 'PM': return 'PM';
    case 'ROLLCALL': return null;
    case 'ADHOC': return event.cutoffAt && Number(formatSgTime(event.cutoffAt).slice(0, 2)) < 12 ? 'AM' : 'PM';
  }
}

export function isActiveOn(person: RollPerson, date: IsoDate): boolean {
  return person.postedInDate <= date && (person.postedOutDate === null || person.postedOutDate > date);
}

/** Date coverage only; a half-day span covers its date whatever the time. */
export function spanCovers(span: SpanRow, date: IsoDate): boolean {
  return span.startDate <= date && (span.endDate === null || span.endDate >= date);
}

/**
 * Coverage for one event: the date must be covered and, for a half-day span, the event must
 * fall in that half. An event without a half (the Roll Call) is covered by either half.
 */
export function spanCoversEvent(span: SpanRow, date: IsoDate, half: HalfDay | null): boolean {
  if (!spanCovers(span, date)) return false;
  const spanHalf = span.halfDay ?? null;
  return spanHalf === null || half === null || spanHalf === half;
}

/**
 * Derive each person's status for one event.
 * Precedence: Present mark for this event > newest covering span > UNMARKED.
 * Persons not active on the event date are excluded. `half` is the event's half of the day
 * (see `eventHalf`); when omitted, half-day spans count as covering the date.
 */
export function effectiveStatuses(
  persons: readonly RollPerson[],
  spans: readonly SpanRow[],
  presentMarks: ReadonlySet<string>,
  eventDate: IsoDate,
  half: HalfDay | null = null,
): EffectiveStatus[] {
  const coveringByPerson = new Map<string, SpanRow>();
  for (const span of spans) {
    if (!spanCoversEvent(span, eventDate, half)) continue;
    const existing = coveringByPerson.get(span.personId);
    if (!existing || span.createdAt > existing.createdAt) coveringByPerson.set(span.personId, span);
  }

  const result: EffectiveStatus[] = [];
  for (const person of persons) {
    if (!isActiveOn(person, eventDate)) continue;
    const base = { personId: person.id, rank: person.rank, name: person.name, platoonId: person.platoonId ?? null };
    if (presentMarks.has(person.id)) {
      result.push({ ...base, status: 'PRESENT', subType: null, halfDay: null, startDate: null, endDate: null, remark: null, spanId: null });
      continue;
    }
    const span = coveringByPerson.get(person.id);
    if (span) {
      result.push({
        ...base,
        status: span.status,
        subType: span.subType,
        halfDay: span.halfDay ?? null,
        startDate: span.startDate,
        endDate: span.endDate,
        remark: span.remark,
        spanId: span.id,
      });
      continue;
    }
    result.push({ ...base, status: 'UNMARKED', subType: null, halfDay: null, startDate: null, endDate: null, remark: null, spanId: null });
  }
  result.sort(compareByRankThenName);
  return result;
}
