import type { IsoTimestamp } from '../dates';
import type { SubmissionState } from '../types';

export interface LatestSubmission {
  version: number;
  submittedAt: IsoTimestamp;
  submittedBy: string;
  contentHash: string;
}

export interface UnitActivity {
  lastChangedAt: IsoTimestamp;
}

export interface DeriveSubmissionInput {
  latest: LatestSubmission | null;
  activity: UnitActivity | null;
  cutoffAt: IsoTimestamp;
  now: Date;
  currentHash: string;
}

export function deriveSubmissionState(input: DeriveSubmissionInput): SubmissionState {
  const { latest, activity, cutoffAt, now, currentHash } = input;
  const pastCutoff = now.getTime() >= Date.parse(cutoffAt);
  if (!latest) {
    if (pastCutoff) return { kind: 'LATE', hasActivity: activity !== null, lastChangedAt: activity?.lastChangedAt ?? null };
    if (activity) return { kind: 'PENDING', lastChangedAt: activity.lastChangedAt };
    return { kind: 'NOT_MARKED' };
  }
  return {
    kind: latest.version === 1 ? 'SUBMITTED' : 'RESUBMITTED',
    version: latest.version,
    submittedAt: latest.submittedAt,
    submittedBy: latest.submittedBy,
    wasLate: Date.parse(latest.submittedAt) >= Date.parse(cutoffAt),
    hasChanges: currentHash !== latest.contentHash,
  };
}

export function isSubmitted(state: SubmissionState): boolean {
  return state.kind === 'SUBMITTED' || state.kind === 'RESUBMITTED';
}

/** Units that still need to act sort first: Late, then Pending, then Not marked. */
export function awaitingRank(state: SubmissionState): number {
  switch (state.kind) {
    case 'LATE': return 0;
    case 'PENDING': return 1;
    case 'NOT_MARKED': return 2;
    default: return 3;
  }
}
