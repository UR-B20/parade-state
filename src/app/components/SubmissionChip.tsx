import { formatSgTime } from '@shared/dates';
import type { SubmissionState } from '@shared/types';
import { StatusPill } from './StatusPill';

/** Reporting state as a pill. Neutral pending, green submitted, amber resubmission, red late. */
export function SubmissionChip({ state, compact }: { state: SubmissionState; compact?: boolean }) {
  switch (state.kind) {
    case 'NOT_MARKED':
      return <StatusPill tone="neutral">Not marked</StatusPill>;
    case 'PENDING':
      return <StatusPill tone="pending" dot>{compact ? 'Pending' : `Pending · Updated ${formatSgTime(state.lastChangedAt)}`}</StatusPill>;
    case 'LATE':
      return <StatusPill tone="danger" dot>Late</StatusPill>;
    case 'SUBMITTED':
      return <StatusPill tone="ok" dot>{compact ? 'Submitted' : `Submitted ${formatSgTime(state.submittedAt)}`}</StatusPill>;
    case 'RESUBMITTED':
      return <StatusPill tone="warn" dot>{compact ? `Resubmitted v${state.version}` : `Resubmitted v${state.version} · ${formatSgTime(state.submittedAt)}`}</StatusPill>;
  }
}

export function submissionNote(state: SubmissionState): string | null {
  switch (state.kind) {
    case 'NOT_MARKED': return 'Nothing marked yet';
    case 'LATE': return state.hasActivity ? 'Marked, not submitted' : 'Nothing marked';
    case 'SUBMITTED':
    case 'RESUBMITTED':
      return state.hasChanges ? 'Changes since submission' : state.wasLate ? 'Submitted after cut-off' : null;
    default: return null;
  }
}
