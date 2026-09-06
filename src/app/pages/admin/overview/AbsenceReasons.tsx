import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { ABSENCE_STATUSES, STATUS_LABEL, STATUS_LONG_LABEL, SUB_TYPE_LABEL, OTHERS_SUB_TYPES, type AbsenceStatus } from '@shared/statuses';
import type { TrendsDto, UnitCounts } from '@shared/types';
import { ink, ink3, lineStrong, STATUS_COLOR } from '../../../charts/theme';
import { ChartCard, DataTable, LegendRow } from './ChartCard';

const KEY: Record<AbsenceStatus, keyof UnitCounts> = { MC: 'mc', LL: 'll', MA: 'ma', RSI: 'rsi', OTHERS: 'others' };

export function AbsenceReasons({ trends }: { trends: TrendsDto }) {
  const today = trends.days[trends.days.length - 1]!;
  const past7 = trends.days.filter((d) => !d.live && d.unitsSubmitted > 0).slice(-7);
  const avg = (s: AbsenceStatus) => (past7.length ? past7.reduce((n, d) => n + (d.counts[KEY[s]] as number), 0) / past7.length : null);
  const rows = ABSENCE_STATUSES.map((s) => ({ status: s, today: today.counts[KEY[s]] as number, avg: avg(s) }));

  const data = useMemo<ChartData<'bar'>>(() => ({
    labels: rows.map((r) => STATUS_LABEL[r.status]),
    datasets: [
      { label: 'Today', data: rows.map((r) => r.today), backgroundColor: rows.map((r) => STATUS_COLOR[r.status]!()), hoverBackgroundColor: rows.map((r) => STATUS_COLOR[r.status]!()), borderRadius: 4, borderSkipped: 'start', barThickness: 16 },
      { label: '7-day average', data: rows.map((r) => r.avg ?? 0), backgroundColor: lineStrong(), hoverBackgroundColor: lineStrong(), borderRadius: 4, borderSkipped: 'start', barThickness: 16 },
    ],
  }), [rows]);
  const options = useMemo<ChartOptions<'bar'>>(() => ({
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: ink(), font: { weight: 600 } } },
      y: { beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 5 }, grid: { color: ink3() + '33', drawTicks: false }, border: { display: false } },
    },
    plugins: {
      tooltip: {
        callbacks: {
          title: (items) => STATUS_LONG_LABEL[rows[items[0]?.dataIndex ?? 0]!.status],
          label: (ctx) => ` ${ctx.dataset.label}: ${ctx.datasetIndex === 1 ? (ctx.parsed.y ?? 0).toFixed(1) : ctx.parsed.y ?? 0}`,
        },
      },
    },
  }), [rows]);
  const subTypes = OTHERS_SUB_TYPES.map((t) => ({ t, n: trends.othersSubTypes[t] })).filter((x) => x.n > 0);
  return (
    <ChartCard
      title="Absence by reason"
      subtitle={`${today.counts.absent} absent today against the 7-day run rate`}
      table={<DataTable caption="Absence by reason" head={['Reason', 'Today', '7-day avg']} rows={rows.map((r) => [STATUS_LONG_LABEL[r.status], r.today, r.avg === null ? '—' : r.avg.toFixed(1)])} />}
      footer={
        <div className="flex flex-col gap-2">
          <LegendRow items={[{ label: 'Today, in the reason colour', color: ink() }, { label: '7-day average', color: lineStrong() }]} />
          {subTypes.length > 0 && (
            <p className="num text-xs text-ink-2">Others: {subTypes.map((x) => `${SUB_TYPE_LABEL[x.t]} ${x.n}`).join(' · ')}</p>
          )}
        </div>
      }
    >
      <div className="h-[200px] w-full">
        <Bar data={data} options={options} aria-label="Absence by reason, today against the 7-day average" role="img" />
      </div>
    </ChartCard>
  );
}
