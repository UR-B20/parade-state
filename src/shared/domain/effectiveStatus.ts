import type { IsoDate, IsoTimestamp } from '../dates';
import { compareByRankThenName } from '../ranks';
import type { AbsenceStatus, OthersSubType } from '../statuses';
import type { EffectiveStatus } from '../types';

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
  startDate: IsoDate;
  endDate: IsoDate | null;
  remark: string | null;
  createdAt: IsoTimestamp;
}

export function isActiveOn(person: RollPerson, date: IsoDate): boolean {
  return person.postedInDate <= date && (person.postedOutDate === null || person.postedOutDate > date);
}

export function spanCovers(span: SpanRow, date: IsoDate): boolean {
  return span.startDate <= date && (span.endDate === null || span.endDate >= date);
}

/**
 * Derive each person's status for one event.
 * Precedence: Present mark for this event > newest covering span > UNMARKED.
 * Persons not active on the event date are excluded.
 */
export function effectiveStatuses(
  persons: readonly RollPerson[],
  spans: readonly SpanRow[],
  presentMarks: ReadonlySet<string>,
  eventDate: IsoDate,
): EffectiveStatus[] {
  const coveringByPerson = new Map<string, SpanRow>();
  for (const span of spans) {
    if (!spanCovers(span, eventDate)) continue;
    const existing = coveringByPerson.get(span.personId);
    if (!existing || span.createdAt > existing.createdAt) coveringByPerson.set(span.personId, span);
  }

  const result: EffectiveStatus[] = [];
  for (const person of persons) {
    if (!isActiveOn(person, eventDate)) continue;
    const base = { personId: person.id, rank: person.rank, name: person.name, platoonId: person.platoonId ?? null };
    if (presentMarks.has(person.id)) {
      result.push({ ...base, status: 'PRESENT', subType: null, startDate: null, endDate: null, remark: null, spanId: null });
      continue;
    }
    const span = coveringByPerson.get(person.id);
    if (span) {
      result.push({
        ...base,
        status: span.status,
        subType: span.subType,
        startDate: span.startDate,
        endDate: span.endDate,
        remark: span.remark,
        spanId: span.id,
      });
      continue;
    }
    result.push({ ...base, status: 'UNMARKED', subType: null, startDate: null, endDate: null, remark: null, spanId: null });
  }
  result.sort(compareByRankThenName);
  return result;
}
