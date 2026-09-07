import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { buildBriefing, pct, rateOf, shortDate } from '@shared/domain';
import type { TrendsDto } from '@shared/types';
import { STATUS_COLOR, surface, withAlpha } from '../charts/theme';
import { useTheme } from '../state/theme';

/** The commander's view of the same 14-day trend S1 sees: a sparkline and three figures. */
export function UnitTrendCard({ trends }: { trends: TrendsDto }) {
  const { resolved: theme } = useTheme();
  const days = trends.days;
  const rates = useMemo(() => days.map((d) => (d.unitsSubmitted > 0 || d.live ? rateOf(d.counts) : null)), [days]);
  const briefing = useMemo(() => buildBriefing(trends), [trends]);
  const present = STATUS_COLOR['PRESENT']!();
  void theme; // re-read colours when the palette changes
  const unit = trends.units[0];
  const data = useMemo<ChartData<'line'>>(() => ({
    labels: days.map((d) => shortDate(d.date)),
    datasets: [{
      label: 'Present rate',
      data: rates.map((r) => (r === null ? null : r * 100)),
      borderColor: present,
      backgroundColor: withAlpha(present, 0.1),
      fill: true,
      borderWidth: 2,
      tension: 0.3,
      pointRadius: days.map((d) => (d.live ? 4 : 0)),
      pointHoverRadius: 5,
      pointBackgroundColor: surface(),
      pointBorderColor: present,
      pointBorderWidth: 2,
      spanGaps: false,
    }],
  }), [days, rates, present]);
  const options = useMemo<ChartOptions<'line'>>(() => ({
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 6, bottom: 2, left: 2, right: 6 } },
    scales: {
      x: { display: false },
      y: { display: false, min: Math.max(0, Math.min(...rates.filter((r): r is number => r !== null).map((r) => r * 100), 90) - 5), max: 100 },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx) => (ctx.parsed.y === null ? '' : ` ${ctx.parsed.y.toFixed(1)}% present`),
          footer: (items) => { const d = days[items[0]?.dataIndex ?? 0]; return d ? `${d.counts.present} of ${d.counts.strength}${d.live ? ` · ${d.counts.unmarked} not yet marked` : ''}` : ''; },
        },
      },
    },
  }), [days, rates]);
  const slips = unit ? unit.late + unit.missed : 0;
  return (
    <section key={theme} className="flex flex-col gap-2 rounded-card border border-line bg-surface px-5 py-4" aria-label="Unit trend, last 14 parades">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-medium text-ink-2">Last 14 parades</h2>
        <span className="num text-xs text-ink-2">7-day avg <b className="font-semibold text-ink">{pct(briefing.avg7)}</b></span>
      </div>
      <div className="h-[64px] w-full">
        <Line data={data} options={options} aria-label={`Present rate over the last 14 parades, 7-day average ${pct(briefing.avg7)}`} role="img" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-0.5 w-4 rounded-full" style={{ background: present }} />Present rate</span>
        <span className="num">Today <b className="font-semibold text-ink">{pct(briefing.presentRate)}</b></span>
        <span className="num" style={{ color: slips > 0 ? 'var(--warn)' : undefined }}>
          {unit ? (slips === 0 ? `${unit.onTime} submitted on time` : `${unit.late} late · ${unit.missed} missed`) : ''}
        </span>
      </div>
    </section>
  );
}
