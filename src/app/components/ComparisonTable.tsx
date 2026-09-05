import { Link } from 'react-router-dom';
import { formatSgTime } from '@shared/dates';
import { STATUS_LABEL, STATUSES } from '@shared/statuses';
import type { BattalionSummaryDto, SubmissionState, UnitCounts } from '@shared/types';
import { SubmissionChip } from './SubmissionChip';
import './Admin.css';

const COLS = STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s] }));

function cell(counts: UnitCounts, key: (typeof STATUSES)[number]): number {
  switch (key) {
    case 'PRESENT': return counts.present;
    case 'MC': return counts.mc;
    case 'LL': return counts.ll;
    case 'MA': return counts.ma;
    case 'RSI': return counts.rsi;
    case 'OTHERS': return counts.others;
  }
}

function submittedAt(state: SubmissionState): string {
  return state.kind === 'SUBMITTED' || state.kind === 'RESUBMITTED' ? formatSgTime(state.submittedAt) : '—';
}

export function ComparisonTable({ summary, date }: { summary: BattalionSummaryDto; date: string }) {
  const rows = [...summary.units].sort((a, b) => a.unit.sortOrder - b.unit.sortOrder);
  return (
    <div className="table-wrap">
      <table className="ctable num" aria-label="Units comparison">
        <thead>
          <tr>
            <th scope="col" className="ctable__text">Unit</th>
            <th scope="col">Total</th>
            {COLS.map((c) => (
              <th key={c.key} scope="col">{c.label}</th>
            ))}
            <th scope="col" className="ctable__text">Status</th>
            <th scope="col">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.unit.id}>
              <td className="ctable__text">
                <Link to={`/admin/units/${r.unit.id}?date=${date}&event=${summary.event.id}`} style={{ color: 'inherit', fontWeight: 600, textDecoration: 'none' }}>
                  {r.unit.name}
                </Link>
              </td>
              <td>{r.counts.strength}</td>
              {COLS.map((c) => {
                const n = cell(r.counts, c.key);
                return (
                  <td key={c.key} className={n === 0 ? 'zero' : `col-${c.key}`}>{n}</td>
                );
              })}
              <td className="ctable__text"><SubmissionChip state={r.submission} compact /></td>
              <td>{submittedAt(r.submission)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="ctable__text">Battalion</td>
            <td>{summary.totals.strength}</td>
            {COLS.map((c) => (
              <td key={c.key}>{cell(summary.totals, c.key)}</td>
            ))}
            <td className="ctable__text">{summary.unitsSubmitted} of {summary.unitsTotal} submitted</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
