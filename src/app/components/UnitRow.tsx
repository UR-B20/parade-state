import { useState } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_LABEL, STATUSES, type Status } from '@shared/statuses';
import type { UnitCounts, UnitSummaryRow } from '@shared/types';
import { Icon } from './Icon';
import { SubmissionChip, submissionNote } from './SubmissionChip';
import './Admin.css';

function countFor(counts: UnitCounts, status: Status): number {
  switch (status) {
    case 'PRESENT': return counts.present;
    case 'MC': return counts.mc;
    case 'LL': return counts.ll;
    case 'MA': return counts.ma;
    case 'RSI': return counts.rsi;
    case 'OTHERS': return counts.others;
  }
}

export function CountGrid({ counts }: { counts: UnitCounts }) {
  return (
    <ul className="count-grid" aria-label="Counts by status">
      {STATUSES.map((s) => {
        const n = countFor(counts, s);
        return (
          <li key={s} className={`count-tile count-tile--${s}${n === 0 ? ' count-tile--zero' : ''}`}>
            <span className="count-tile__n num">{n}</span>
            <span className="count-tile__label">{STATUS_LABEL[s]}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function UnitRow({ row, eventId, date }: { row: UnitSummaryRow; eventId: string; date: string }) {
  const [open, setOpen] = useState(false);
  const note = submissionNote(row.submission);
  const detailId = `unit-${row.unit.id}-detail`;
  return (
    <li className="unit">
      <button type="button" className="unit__row" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen((v) => !v)}>
        <span className="unit__name">{row.unit.name}</span>
        <span className="unit__figure num">
          <span className="unit__present">{row.counts.present}</span>
          <span className="unit__total">/ {row.counts.strength}</span>
        </span>
        <span className="unit__state">
          <SubmissionChip state={row.submission} />
          {note && <span className="truncate">{note}</span>}
        </span>
        <Icon name="chevronDown" className="unit__caret" />
      </button>
      {open && (
        <div id={detailId} className="unit__detail">
          <CountGrid counts={row.counts} />
          <div className="unit__links">
            <span className="num">
              {row.counts.presentDefault > 0 ? `${row.counts.presentDefault} not yet marked, counted as Present by default` : 'All personnel marked'}
            </span>
            <Link to={`/admin/units/${row.unit.id}?date=${date}&event=${eventId}`} className="btn btn--ghost btn--small" style={{ textDecoration: 'none' }}>
              View roll <Icon name="chevronRight" size={16} />
            </Link>
          </div>
        </div>
      )}
    </li>
  );
}
