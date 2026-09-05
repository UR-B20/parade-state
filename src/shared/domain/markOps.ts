import { addDays, type IsoDate } from '../dates';
import type { MarkBody } from '../types';
import type { AbsenceStatus, OthersSubType } from '../statuses';
import { spanCovers, type SpanRow } from './effectiveStatus';

export interface NewSpan {
  personId: string;
  status: AbsenceStatus;
  subType: OthersSubType | null;
  startDate: IsoDate;
  endDate: IsoDate | null;
  remark: string | null;
  /** Span this one replaces (head or tail of a truncated span), for the audit chain. */
  replacesId: string | null;
}

export interface MarkPlan {
  /** Active spans of this person that become superseded. */
  supersedeSpanIds: string[];
  insertSpans: NewSpan[];
  /** Confirmed-Present marks of this person to delete on events whose date is in this range. */
  deleteMarksInRange: { start: IsoDate; end: IsoDate | null } | null;
  /** Insert (or keep) a confirmed-Present mark for the current event. */
  upsertPresentMark: boolean;
}

export class MarkValidationError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'MarkValidationError';
  }
}

/**
 * Turn a mark request into the row changes it implies. Pure; the caller applies the
 * plan inside a transaction (server) or to in-memory arrays (mock).
 *
 * - PRESENT confirms this event only; an ongoing absence keeps running.
 * - BACK_TO_PRESENT ends any absence covering the event date (truncated to the day
 *   before) and removes future-dated absences, then confirms Present for this event.
 * - SET replaces overlapping absences from the new start date onward. The part of an
 *   existing span before the new start is kept as a truncated copy.
 */
export function planMark(
  action: MarkBody,
  personId: string,
  activeSpans: readonly SpanRow[],
  eventDate: IsoDate,
): MarkPlan {
  const mine = activeSpans.filter((s) => s.personId === personId);
  const plan: MarkPlan = { supersedeSpanIds: [], insertSpans: [], deleteMarksInRange: null, upsertPresentMark: false };

  if (action.action === 'PRESENT') {
    plan.upsertPresentMark = true;
    return plan;
  }

  if (action.action === 'BACK_TO_PRESENT') {
    for (const span of mine) {
      if (spanCovers(span, eventDate)) {
        plan.supersedeSpanIds.push(span.id);
        if (span.startDate < eventDate) {
          plan.insertSpans.push({ personId, status: span.status, subType: span.subType, startDate: span.startDate, endDate: addDays(eventDate, -1), remark: span.remark, replacesId: span.id });
        }
      } else if (span.startDate > eventDate) {
        plan.supersedeSpanIds.push(span.id);
      }
    }
    plan.upsertPresentMark = true;
    return plan;
  }

  // SET
  const status = action.status;
  let start = action.startDate;
  let end = action.endDate;
  if (status === 'RSI') {
    start = eventDate;
    end = eventDate;
  }
  if (end !== null && end < start) throw new MarkValidationError('End date must be on or after the start date', 'endDate');
  if (start > eventDate) throw new MarkValidationError('Start date cannot be after the parade date', 'startDate');
  if (end !== null && end < eventDate) throw new MarkValidationError('End date cannot be before the parade date', 'endDate');
  const subType = status === 'OTHERS' ? action.subType ?? null : null;
  if (status === 'OTHERS' && !subType) throw new MarkValidationError('Choose a type for Others', 'subType');
  const remark = action.remark?.trim() ? action.remark.trim() : null;

  for (const span of mine) {
    const overlaps = span.startDate <= (end ?? '9999-12-31') && (span.endDate === null || span.endDate >= start);
    if (!overlaps) continue;
    plan.supersedeSpanIds.push(span.id);
    if (span.startDate < start) {
      plan.insertSpans.push({ personId, status: span.status, subType: span.subType, startDate: span.startDate, endDate: addDays(start, -1), remark: span.remark, replacesId: span.id });
    }
  }
  plan.insertSpans.push({ personId, status, subType, startDate: start, endDate: end, remark, replacesId: null });
  plan.deleteMarksInRange = { start, end };
  return plan;
}
