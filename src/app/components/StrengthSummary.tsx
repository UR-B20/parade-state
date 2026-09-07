import type { ReactNode } from 'react';
import { STATUS_LABEL, STATUSES, UNMARKED_LABEL, type EffectiveKind } from '@shared/statuses';
import { countFor } from '@shared/domain';
import type { UnitCounts } from '@shared/types';
import './StrengthSummary.css';

interface StrengthSummaryProps {
  counts: UnitCounts;
  /** Heading above the figure. */
  label?: string;
  /** Reporting label (submission pill) shown top-right. */
  report?: ReactNode;
  /** Extra block under the legend, e.g. a platoon breakdown. */
  extra?: ReactNode;
  /** 'Cut-off 10:00' or 'Cut-off 10:00 passed'. */
  cutoff?: { time: string; passed: boolean };
  /** Optional caption under the legend. */
  note?: ReactNode;
}

const KINDS: EffectiveKind[] = [...STATUSES, 'UNMARKED'];
const labelFor = (k: EffectiveKind) => (k === 'UNMARKED' ? UNMARKED_LABEL : STATUS_LABEL[k]);

export function StatusBand({ counts, label }: { counts: UnitCounts; label: string }) {
  const parts = KINDS.map((s) => ({ status: s, n: countFor(counts, s) })).filter((p) => p.n > 0);
  const text = parts.map((p) => `${labelFor(p.status)} ${p.n}`).join(', ');
  return (
    <div className="band" role="img" aria-label={`${label}: ${text}`}>
      {parts.map((p) => (
        <span key={p.status} className={`band__seg band__seg--${p.status}`} style={{ ['--n' as string]: p.n }} />
      ))}
    </div>
  );
}

export function StatusLegend({ counts, showZero = false }: { counts: UnitCounts; showZero?: boolean }) {
  return (
    <ul className="legend" aria-label="Attendance by status">
      {KINDS.map((s) => {
        const n = countFor(counts, s);
        if (n === 0 && !showZero) return null;
        return (
          <li key={s} className={`legend__item band__seg--${s}`}>
            <span className="legend__swatch" aria-hidden="true" />
            <span>{labelFor(s)}</span>
            <span className="legend__count num">{n}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function StrengthSummary({ counts, label = 'Present strength', report, cutoff, note, extra }: StrengthSummaryProps) {
  return (
    <section className="strength" aria-labelledby="strength-label">
      <div className="strength__row">
        <div id="strength-label" className="strength__label">{label}</div>
        {report}
      </div>
      <div className="strength__row strength__row--figure">
        <div className="strength__figure num">
          <span className="strength__present">{counts.present}</span>
          <span className="strength__total">/ {counts.strength}</span>
        </div>
        {cutoff && (
          <span className={`strength__cutoff num${cutoff.passed ? ' strength__cutoff--passed' : ''}`}>
            Cut-off {cutoff.time}{cutoff.passed ? ' passed' : ''}
          </span>
        )}
      </div>
      <StatusBand counts={counts} label="Attendance" />
      <StatusLegend counts={counts} />
      {note && <p className="strength__note">{note}</p>}
      {extra}
    </section>
  );
}
