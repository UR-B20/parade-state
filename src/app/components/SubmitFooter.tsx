import { useState } from 'react';
import { formatSgTime } from '@shared/dates';
import { STATUS_LABEL, UNMARKED_LABEL } from '@shared/statuses';
import type { ChangeDiff, StatusTuple, SubmissionState, UnitCounts } from '@shared/types';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { StatusLegend } from './StrengthSummary';
import type { SaveStatus } from '../state/connection';
import './SubmitFooter.css';

interface SubmitFooterProps {
  submission: SubmissionState;
  counts: UnitCounts;
  changes: ChangeDiff[];
  updatedAt: string | null;
  save: { status: SaveStatus; pendingCount: number };
  locked: boolean;
  busy?: boolean;
  bulkBusy?: boolean;
  onSubmit: () => Promise<unknown>;
  /** Marks everyone still unmarked as Present. */
  onMarkRemainingPresent: () => Promise<unknown>;
}

function tupleLabel(t: StatusTuple | null): string {
  if (!t) return 'Not on roll';
  return t.status === 'UNMARKED' ? UNMARKED_LABEL : STATUS_LABEL[t.status];
}

export function SubmitFooter({ submission, counts, changes, updatedAt, save, locked, busy, bulkBusy, onSubmit, onMarkRemainingPresent }: SubmitFooterProps) {
  const [confirming, setConfirming] = useState(false);
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  const [showChanges, setShowChanges] = useState(false);

  const submitted = submission.kind === 'SUBMITTED' || submission.kind === 'RESUBMITTED';
  const hasChanges = submitted && submission.hasChanges;
  const unmarked = counts.unmarked;
  const canSubmit = save.status === 'saved' && !locked && unmarked === 0 && (!submitted || hasChanges);

  let statusLine: { text: string; tone?: 'warn' | 'danger' } = { text: '' };
  if (save.status === 'offline') statusLine = { text: `Connection lost · ${save.pendingCount} change${save.pendingCount === 1 ? '' : 's'} waiting`, tone: 'danger' };
  else if (save.status === 'saving') statusLine = { text: 'Saving…' };
  else if (unmarked > 0) statusLine = { text: `Mark everyone before submitting · ${unmarked} left`, tone: 'warn' };
  else if (updatedAt) statusLine = { text: `All changes saved · Updated ${formatSgTime(updatedAt)}` };
  else statusLine = { text: 'Everyone marked · Ready to submit' };

  const confirmBulk = async () => {
    try {
      await onMarkRemainingPresent();
      setConfirmingBulk(false);
    } catch {
      // Toast shown by the page; keep the dialog open.
    }
  };

  const confirm = async () => {
    try {
      await onSubmit();
      setConfirming(false);
      setShowChanges(false);
    } catch {
      // The page shows the error toast; keep the dialog open so the user can retry.
    }
  };

  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className={`footer__status${statusLine.tone ? ` footer__status--${statusLine.tone}` : ''}`} role="status" aria-live="polite">
          <span className="num truncate">{statusLine.text}</span>
        </div>
        {hasChanges && (
          <button type="button" className="footer__changes" onClick={() => setShowChanges((v) => !v)} aria-expanded={showChanges}>
            <span>
              <Icon name="alert" size={16} /> {changes.length} change{changes.length === 1 ? '' : 's'} since submission
            </span>
            <Icon name={showChanges ? 'chevronDown' : 'chevronUp'} size={16} />
          </button>
        )}

        {showChanges && hasChanges && (
          <ul className="changes-list" aria-label="Changes since submission">
            {changes.map((c) => (
              <li key={c.personId} className="changes-list__item">
                <span className="changes-list__who">{c.rank} {c.name}</span>
                <span className="changes-list__delta">
                  <span>{tupleLabel(c.before)}</span>
                  <Icon name="chevronRight" size={14} />
                  <span className="changes-list__who">{tupleLabel(c.after)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {unmarked > 0 && !locked && (
          <Button variant="secondary" block disabled={save.status === 'offline'} busy={bulkBusy} onClick={() => setConfirmingBulk(true)}>
            <Icon name="check" size={18} />
            Mark remaining {unmarked} Present
          </Button>
        )}

        {submitted && !hasChanges ? (
          <div className="footer__submitted num" role="status">
            <Icon name="check" size={20} />
            {submission.kind === 'RESUBMITTED' ? `Resubmitted v${submission.version} ${formatSgTime(submission.submittedAt)}` : `Submitted ${formatSgTime(submission.submittedAt)}`}
          </div>
        ) : (
          <Button variant="primary" block disabled={!canSubmit} busy={busy} onClick={() => setConfirming(true)}>
            {submitted ? 'Resubmit to S1 Branch' : 'Submit to S1 Branch'}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmingBulk}
        title={`Mark ${unmarked} ${unmarked === 1 ? 'person' : 'people'} Present?`}
        confirmLabel={`Mark ${unmarked} Present`}
        busy={bulkBusy}
        onConfirm={confirmBulk}
        onCancel={() => setConfirmingBulk(false)}
      >
        <p className="dialog__text">Everyone not yet marked will be recorded as Present for this event.</p>
        <p className="dialog__muted">Mark anyone who is absent first, so they are not swept in. You can still change a person afterwards.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirming}
        title={submitted ? 'Resubmit to S1 Branch?' : 'Submit to S1 Branch?'}
        confirmLabel={submitted ? `Resubmit v${submission.kind === 'SUBMITTED' || submission.kind === 'RESUBMITTED' ? submission.version + 1 : 2}` : 'Submit'}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      >
        <p className="dialog__text">Confirm the present strength before sending it to S1 Branch.</p>
        <div className="confirm-figure num">
          <span className="confirm-figure__n">{counts.present}</span>
          <span className="confirm-figure__d">/ {counts.strength} present</span>
        </div>
        <StatusLegend counts={counts} />
        {hasChanges && (
          <p className="dialog__muted">
            {changes.length} change{changes.length === 1 ? '' : 's'} since v{submission.kind === 'SUBMITTED' || submission.kind === 'RESUBMITTED' ? submission.version : 1} will be sent.
          </p>
        )}
      </ConfirmDialog>
    </footer>
  );
}
