import { compareByRankThenName } from '../ranks';
import type { EffectiveStatus, EventType } from '../types';
import type { SnapshotEntry } from './canonical';

/**
 * What S1 sees for one unit on one event. Parades and the Roll Call are live: S1 watches
 * marking as it happens. An ad hoc event shows only what the unit submitted: before the first
 * submission everyone counts as Not yet marked, and afterwards the figures are the latest
 * submission's snapshot even if the commander has changed marks since (that shows as
 * "changes since submission"). The live list decides who is on strength; the snapshot
 * supplies each person's status.
 */
export function reportedStatuses(event: { type: EventType }, live: readonly EffectiveStatus[], snapshot: readonly SnapshotEntry[] | null): EffectiveStatus[] {
  if (event.type !== 'ADHOC') return [...live];
  const submitted = new Map((snapshot ?? []).map((s) => [s.personId, s]));
  const out = live.map((p): EffectiveStatus => {
    const s = submitted.get(p.personId);
    if (!s) return { ...p, status: 'UNMARKED', subType: null, halfDay: null, startDate: null, endDate: null, remark: null, spanId: null };
    return { ...p, status: s.status, subType: s.subType, halfDay: s.halfDay ?? null, startDate: s.startDate, endDate: s.endDate, remark: s.remark, spanId: null };
  });
  out.sort(compareByRankThenName);
  return out;
}
