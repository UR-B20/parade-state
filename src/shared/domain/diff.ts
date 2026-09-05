import type { ChangeDiff, EffectiveStatus, StatusTuple } from '../types';
import { toStatusTuple, type SnapshotEntry } from './canonical';

function sameTuple(a: StatusTuple, b: StatusTuple): boolean {
  return (
    a.status === b.status &&
    (a.subType ?? null) === (b.subType ?? null) &&
    (a.startDate ?? null) === (b.startDate ?? null) &&
    (a.endDate ?? null) === (b.endDate ?? null) &&
    (a.remark ?? null) === (b.remark ?? null)
  );
}

/** Per-person differences between the last submission's snapshot and the current state. */
export function diffAgainstSnapshot(
  snapshot: readonly SnapshotEntry[],
  current: readonly EffectiveStatus[],
): ChangeDiff[] {
  const before = new Map(snapshot.map((s) => [s.personId, s]));
  const after = new Map(current.map((s) => [s.personId, s]));
  const changes: ChangeDiff[] = [];

  for (const cur of current) {
    const prev = before.get(cur.personId);
    const curTuple = toStatusTuple(cur);
    if (!prev) {
      changes.push({ personId: cur.personId, rank: cur.rank, name: cur.name, before: null, after: curTuple });
    } else if (!sameTuple(prev, curTuple)) {
      const { personId, rank, name, ...prevTuple } = prev;
      changes.push({ personId, rank, name, before: prevTuple, after: curTuple });
    }
  }
  for (const prev of snapshot) {
    if (!after.has(prev.personId)) {
      const { personId, rank, name, ...prevTuple } = prev;
      changes.push({ personId, rank, name, before: prevTuple, after: null });
    }
  }
  return changes;
}
