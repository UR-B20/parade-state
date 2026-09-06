import { formatSgDateShort, formatSgTime, sgDateOf, type IsoDate, type IsoTimestamp } from '@shared/dates';
import { STATUS_LABEL, SUB_TYPE_LABEL, type OthersSubType, type Status } from '@shared/statuses';
import type { StatusTuple, SubmissionState } from '@shared/types';

/** '6 Sep, 08:22' or just '08:22' when it is today. */
export function formatWhen(iso: IsoTimestamp, today: IsoDate): string {
  const date = sgDateOf(iso);
  const time = formatSgTime(iso);
  return date === today ? time : `${formatSgDateShort(date, today)}, ${time}`;
}

/** '6 to 8 Sep', '6 Sep onward', '6 Sep'. */
export function formatSpan(startDate: IsoDate | null, endDate: IsoDate | null, today: IsoDate): string {
  if (!startDate) return '';
  if (endDate === null) return `${formatSgDateShort(startDate, today)} onward`;
  if (endDate === startDate) return formatSgDateShort(startDate, today);
  return `${formatSgDateShort(startDate, today)} to ${formatSgDateShort(endDate, today)}`;
}

export function statusLabel(status: Status, subType: OthersSubType | null): string {
  return status === 'OTHERS' && subType ? SUB_TYPE_LABEL[subType] : STATUS_LABEL[status];
}

export function tupleLabel(t: StatusTuple | null, today: IsoDate): string {
  if (!t) return 'Not on roll';
  if (t.status === 'PRESENT') return 'Present';
  const span = formatSpan(t.startDate, t.endDate, today);
  return `${statusLabel(t.status, t.subType)}${span ? ` · ${span}` : ''}`;
}

export function submissionSummary(s: SubmissionState, today: IsoDate): { title: string; detail: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'plain' } {
  switch (s.kind) {
    case 'NOT_MARKED':
      return { title: 'Not marked', detail: 'Nothing recorded for this parade yet.', tone: 'plain' };
    case 'PENDING':
      return { title: 'Not submitted', detail: `Last change ${formatWhen(s.lastChangedAt, today)}. Review and submit before cutoff.`, tone: 'warn' };
    case 'LATE':
      return {
        title: 'Late',
        detail: s.hasActivity && s.lastChangedAt ? `Cutoff passed. Last change ${formatWhen(s.lastChangedAt, today)}. Submit as soon as you can.` : 'Cutoff passed with nothing submitted.',
        tone: 'danger',
      };
    case 'SUBMITTED':
    case 'RESUBMITTED': {
      const title = `${s.kind === 'SUBMITTED' ? 'Submitted' : `Resubmitted (v${s.version})`}${s.wasLate ? ', late' : ''}`;
      if (s.hasChanges) return { title, detail: `Changes since ${formatWhen(s.submittedAt, today)} are not submitted yet.`, tone: 'warn' };
      return { title, detail: `At ${formatWhen(s.submittedAt, today)}. S1 has this version.`, tone: 'ok' };
    }
  }
}
