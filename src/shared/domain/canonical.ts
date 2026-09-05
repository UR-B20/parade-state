import type { EffectiveStatus, StatusTuple } from '../types';

/**
 * Canonical text of a unit's attendance for one event, used for the content hash.
 * One line per active person, sorted by person id. The `confirmed` flag is deliberately
 * excluded: confirming a default Present is not a change S1 needs to review.
 */
export function canonicalizeUnitState(statuses: readonly EffectiveStatus[]): string {
  return [...statuses]
    .sort((a, b) => (a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0))
    .map((s) => `${s.personId}|${s.status}|${s.subType ?? ''}|${s.startDate ?? ''}|${s.endDate ?? ''}|${s.remark ?? ''}`)
    .join('\n');
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function contentHash(statuses: readonly EffectiveStatus[]): Promise<string> {
  return sha256Hex(canonicalizeUnitState(statuses));
}

export function toStatusTuple(s: EffectiveStatus): StatusTuple {
  return { status: s.status, subType: s.subType, startDate: s.startDate, endDate: s.endDate, remark: s.remark };
}

/** Snapshot entry stored with a submission. */
export interface SnapshotEntry extends StatusTuple {
  personId: string;
  rank: string;
  name: string;
}

export function toSnapshot(statuses: readonly EffectiveStatus[]): SnapshotEntry[] {
  return statuses.map((s) => ({ personId: s.personId, rank: s.rank, name: s.name, ...toStatusTuple(s) }));
}
