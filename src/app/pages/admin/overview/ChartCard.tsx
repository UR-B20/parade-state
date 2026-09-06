import { useId, useState, type ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: ReactNode;
  /** Optional control rendered beside the title (a select, a back button). */
  action?: ReactNode;
  /** Table view of the same data, reachable without hovering the chart. */
  table?: ReactNode;
  /** Legend or footnote under the plot. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChartCard({ title, subtitle, action, table, footer, children, className = '' }: ChartCardProps) {
  const id = useId();
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface p-4 ${className}`} aria-labelledby={id}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={id} className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
        </div>
        <div className="flex flex-none items-center gap-1">
          {action}
          {table && (
            <button
              type="button"
              className="min-h-9 rounded-ctl px-2 text-xs font-semibold text-primary hover:bg-primary-tint"
              aria-pressed={showTable}
              onClick={() => setShowTable((v) => !v)}
            >
              {showTable ? 'Chart' : 'Table'}
            </button>
          )}
        </div>
      </header>
      {showTable && table ? <div className="overflow-x-auto">{table}</div> : children}
      {footer && !showTable && <div>{footer}</div>}
    </section>
  );
}

/** Small data table used by the table views. */
export function DataTable({ head, rows, caption }: { head: string[]; rows: (string | number)[][]; caption: string }) {
  return (
    <table className="ctable num w-full text-[13px]" aria-label={caption}>
      <thead>
        <tr>{head.map((h, i) => <th key={h} scope="col" className={i === 0 ? 'ctable__text' : undefined}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} className={j === 0 ? 'ctable__text' : undefined}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

/** Legend row: a swatch (rect for fills, line for lines) plus a text label. */
export function LegendRow({ items }: { items: { label: string; color: string; kind?: 'rect' | 'line'; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2" aria-label="Legend">
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={it.kind === 'line' ? 'inline-block h-0.5 w-4 rounded-full' : 'inline-block h-2 w-2 rounded-sm'} style={{ background: it.color }} />
          <span>{it.label}</span>
          {it.value !== undefined && <span className="num font-semibold text-ink">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}
