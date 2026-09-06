import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartData, ChartOptions, Plugin } from 'chart.js';
import { NORM_PRESENT_RATE, pct, rateOf, shortDate, type Briefing } from '@shared/domain';
import type { TrendsDto } from '@shared/types';
import { ink, ink2, ink3, STATUS_COLOR, surface, withAlpha } from '../../../charts/theme';
import { ChartCard, DataTable, LegendRow } from './ChartCard';

/** Hairline at the norm, labelled in muted ink; the last point gets its value. */
const normLine: Plugin<'line'> = {
  id: 'normLine',
  afterDraw(chart) {
    const y = chart.scales['y'];
    if (!y) return;
    const { ctx, chartArea } = chart;
    const py = y.getPixelForValue(NORM_PRESENT_RATE * 100);
    if (py < chartArea.top || py > chartArea.bottom) return;
    ctx.save();
    ctx.strokeStyle = ink3();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartArea.left, py);
    ctx.lineTo(chartArea.right, py);
    ctx.stroke();
    ctx.fillStyle = ink2();
    ctx.font = `500 11px ${chart.options.font?.family ?? 'Inter, sans-serif'}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`norm ${Math.round(NORM_PRESENT_RATE * 100)}%`, chartArea.left + 4, py - 3);
    // Value on the final point of the first series.
    const meta = chart.getDatasetMeta(0);
    const last = meta.data[meta.data.length - 1];
    const value = chart.data.datasets[0]?.data[meta.data.length - 1];
    if (last && typeof value === 'number') {
      ctx.fillStyle = ink();
      ctx.font = `600 12px ${chart.options.font?.family ?? 'Inter, sans-serif'}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(value)}%`, Math.min(last.x, chartArea.right - 4), last.y - 10);
    }
    ctx.restore();
  },
};

export function TrendLine({ trends, briefing }: { trends: TrendsDto; briefing: Briefing }) {
  const days = trends.days;
  const rates = useMemo(() => days.map((d) => (d.unitsSubmitted > 0 || d.live ? rateOf(d.counts) : null)), [days]);
  const avg = useMemo(() => rates.map((_, i) => {
    const win = rates.slice(Math.max(0, i - 6), i + 1).filter((r): r is number => r !== null);
    return win.length >= 3 ? win.reduce((a, b) => a + b, 0) / win.length : null;
  }), [rates]);
  const present = STATUS_COLOR['PRESENT']!();
  const data = useMemo<ChartData<'line'>>(() => ({
    labels: days.map((d) => shortDate(d.date).replace(',', '')),
    datasets: [
      {
        label: 'Present rate',
        data: rates.map((r) => (r === null ? null : r * 100)),
        borderColor: present,
        backgroundColor: withAlpha(present, 0.1),
        fill: true,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: days.map((d) => (d.live ? 5 : 4)),
        pointHoverRadius: 6,
        pointBackgroundColor: days.map((d) => (d.live ? surface() : present)),
        pointBorderColor: days.map((d) => (d.live ? present : surface())),
        pointBorderWidth: 2,
        spanGaps: false,
      },
      {
        label: '7-day average',
        data: avg.map((r) => (r === null ? null : r * 100)),
        borderColor: ink3(),
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        spanGaps: true,
      },
    ],
  }), [days, rates, avg, present]);
  const minRate = Math.min(...rates.filter((r): r is number => r !== null).map((r) => r * 100), 90);
  const options = useMemo<ChartOptions<'line'>>(() => ({
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 18, right: 22 } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
      y: { min: Math.max(0, Math.floor(minRate / 5) * 5 - 5), max: 100, ticks: { callback: (v) => `${v}%`, stepSize: 5 }, grid: { color: ink3() + '33', drawTicks: false }, border: { display: false } },
    },
    plugins: {
      tooltip: {
        callbacks: {
          title: (items) => { const d = days[items[0]?.dataIndex ?? 0]; return d ? shortDate(d.date) : ''; },
          label: (ctx) => (ctx.parsed.y === null ? '' : ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`),
          footer: (items) => {
            const d = days[items[0]?.dataIndex ?? 0];
            if (!d) return '';
            return d.live ? `${d.counts.present} of ${d.counts.strength} · ${d.counts.unmarked} not yet marked` : `${d.counts.present} of ${d.counts.strength} · ${d.unitsSubmitted} of ${d.unitsTotal} units`;
          },
        },
      },
    },
  }), [days, minRate]);
  const today = days[days.length - 1]!;
  return (
    <ChartCard
      title="Present rate, last 14 parades"
      subtitle={`AM parades as submitted · today live at ${pct(briefing.presentRate, 1)} with ${today.counts.unmarked} not yet marked`}
      table={<DataTable caption="Present rate by day" head={['Day', 'Present', 'Strength', 'Rate', '7-day avg', 'Units']} rows={days.map((d, i) => [shortDate(d.date), d.counts.present, d.counts.strength, rates[i] === null ? '—' : `${(rates[i]! * 100).toFixed(1)}%`, avg[i] === null ? '—' : `${(avg[i]! * 100).toFixed(1)}%`, `${d.unitsSubmitted}/${d.unitsTotal}`])} />}
      footer={<LegendRow items={[{ label: 'Present rate', color: present, kind: 'line' }, { label: '7-day average', color: ink3(), kind: 'line' }, { label: `Norm ${Math.round(NORM_PRESENT_RATE * 100)}%`, color: ink3(), kind: 'line' }]} />}
    >
      <div className="h-[240px] w-full">
        <Line data={data} options={options} plugins={[normLine]} aria-label="Present rate over the last 14 parades" role="img" />
      </div>
    </ChartCard>
  );
}
