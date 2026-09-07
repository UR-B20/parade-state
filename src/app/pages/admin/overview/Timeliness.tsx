import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import type { TrendsDto } from '@shared/types';
import { ink, ink3, lineStrong, surface, TONE_COLOR } from '../../../charts/theme';
import { ChartCard, DataTable, LegendRow } from './ChartCard';

export function Timeliness({ trends }: { trends: TrendsDto }) {
  const units = trends.units;
  const recorded = trends.days.filter((d) => d.eventId !== null).length;
  const series = [
    { key: 'onTime' as const, label: 'On time', color: TONE_COLOR.ok() },
    { key: 'late' as const, label: 'Late', color: TONE_COLOR.warn() },
    { key: 'missed' as const, label: 'Missed', color: TONE_COLOR.danger() },
    { key: 'pending' as const, label: 'Not yet in today', color: lineStrong() },
  ];
  const data = useMemo<ChartData<'bar'>>(() => ({
    labels: units.map((u) => u.unitName),
    datasets: series.map((s) => ({
      label: s.label,
      data: units.map((u) => u[s.key]),
      backgroundColor: s.color,
      hoverBackgroundColor: s.color,
      borderColor: surface(),
      borderWidth: { left: 0, right: 2, top: 0, bottom: 0 },
      borderSkipped: false,
      barThickness: 14,
    })),
  }), [units]);
  const options = useMemo<ChartOptions<'bar'>>(() => ({
    indexAxis: 'y',
    scales: {
      x: { stacked: true, min: 0, max: recorded, ticks: { precision: 0, maxTicksLimit: 8 }, grid: { color: ink3() + '33', drawTicks: false }, border: { display: false } },
      y: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: ink(), font: { weight: 600 } } },
    },
    plugins: { tooltip: { filter: (item) => (item.parsed.x ?? 0) > 0, callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.x}` } } },
  }), [recorded]);
  const slow = units.filter((u) => u.late + u.missed > 0).length;
  return (
    <ChartCard
      title="Reporting discipline"
      subtitle={`Submissions against the cut-off over the last ${recorded} parades · ${slow === 0 ? 'no slips' : `${slow} ${slow === 1 ? 'Branch/Coy' : 'Branches/Coy'} with a late or missed report`}`}
      table={<DataTable caption="Reporting discipline" head={['Branch/Coy', 'On time', 'Late', 'Missed', 'Pending today']} rows={units.map((u) => [u.unitName, u.onTime, u.late, u.missed, u.pending])} />}
      footer={<LegendRow items={series.map((s) => ({ label: s.label, color: s.color }))} />}
    >
      <div style={{ height: 24 + units.length * 30 }} className="w-full">
        <Bar data={data} options={options} aria-label="Reporting discipline by Branch/Coy" role="img" />
      </div>
    </ChartCard>
  );
}
