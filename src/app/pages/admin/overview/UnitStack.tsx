import { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartData, ChartOptions, ChartType, Plugin } from 'chart.js';
import { STATUS_LABEL, STATUSES, UNMARKED_LABEL, type EffectiveKind } from '@shared/statuses';
import type { BattalionSummaryDto, UnitCounts } from '@shared/types';
import { pct, rateOf } from '@shared/domain';
import { ink, ink3, STATUS_COLOR, surface } from '../../../charts/theme';
import { ChartCard, DataTable, LegendRow } from './ChartCard';
import { countFor } from '@shared/domain';

const KINDS: EffectiveKind[] = [...STATUSES, 'UNMARKED'];
const labelFor = (k: EffectiveKind) => (k === 'UNMARKED' ? UNMARKED_LABEL : STATUS_LABEL[k]);

interface Row { id: string; name: string; counts: UnitCounts; drill: boolean }

/** Draws the present share at the right of each 100% bar, in ink, once the stacks are painted. */
declare module 'chart.js' {
  interface PluginOptionsByType<TType extends ChartType> {
    endLabels?: { labels: string[] } & Partial<Record<TType, never>>;
  }
}

const endLabels: Plugin<'bar', { labels: string[] }> = {
  id: 'endLabels',
  afterDatasetsDraw(chart, _args, opts) {
    const meta = chart.getDatasetMeta(0);
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.font = `600 12px ${chart.options.font?.family ?? 'Inter, sans-serif'}`;
    ctx.fillStyle = ink();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    opts.labels.forEach((label, i) => {
      const bar = meta.data[i];
      if (!bar) return;
      ctx.fillText(label, chartArea.right + 8, bar.y);
    });
    ctx.restore();
  },
};

export function UnitStack({ summary }: { summary: BattalionSummaryDto }) {
  const [drill, setDrill] = useState<string>('');
  const drillable = summary.units.filter((u) => u.platoons.length > 0);
  const unitRow = summary.units.find((u) => u.unit.id === drill);

  const rows = useMemo<Row[]>(() => {
    if (unitRow) {
      return unitRow.platoons.map((p) => ({ id: p.platoon?.id ?? 'unassigned', name: p.platoon?.name ?? 'Unassigned', counts: p.counts, drill: false }));
    }
    return [...summary.units]
      .map((u) => ({ id: u.unit.id, name: u.unit.name, counts: u.counts, drill: u.platoons.length > 0 }))
      .sort((a, b) => (rateOf(a.counts) ?? 0) - (rateOf(b.counts) ?? 0));
  }, [summary, unitRow]);

  const data = useMemo<ChartData<'bar'>>(() => ({
    labels: rows.map((r) => r.name),
    datasets: KINDS.map((k) => ({
      label: labelFor(k),
      data: rows.map((r) => (r.counts.strength ? (countFor(r.counts, k) / r.counts.strength) * 100 : 0)),
      backgroundColor: STATUS_COLOR[k]!(),
      hoverBackgroundColor: STATUS_COLOR[k]!(),
      borderColor: surface(),
      borderWidth: { left: 0, right: 2, top: 0, bottom: 0 },
      borderSkipped: false,
      barThickness: 18,
    })),
  }), [rows]);

  const options = useMemo<ChartOptions<'bar'>>(() => ({
    indexAxis: 'y',
    layout: { padding: { right: 44 } },
    scales: {
      x: { stacked: true, min: 0, max: 100, ticks: { callback: (v) => `${v}%`, maxTicksLimit: 6 }, grid: { color: ink3() + '33', drawTicks: false }, border: { display: false } },
      y: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: ink(), font: { weight: 600 } } },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const row = rows[ctx.dataIndex]!;
            const n = countFor(row.counts, KINDS[ctx.datasetIndex]!);
            return n === 0 ? '' : ` ${ctx.dataset.label}: ${n} (${Math.round(ctx.parsed.x ?? 0)}%)`;
          },
          footer: (items) => { const row = rows[items[0]?.dataIndex ?? 0]; return row ? `${row.counts.present} of ${row.counts.strength} present` : ''; },
        },
        filter: (item) => (item.parsed.x ?? 0) > 0,
      },
    },
    onClick: (_e, elements) => {
      const row = elements[0] ? rows[elements[0].index] : undefined;
      if (row?.drill) setDrill(row.id);
    },
  }), [rows]);

  const labels = rows.map((r) => pct(rateOf(r.counts)));
  const height = 28 + rows.length * 34;
  return (
    <ChartCard
      title={unitRow ? `${unitRow.unit.name} by platoon` : 'Present share by Branch/Coy'}
      subtitle={unitRow ? `${unitRow.counts.present} of ${unitRow.counts.strength} present · click a platoon's row in the roll for names` : 'Weakest first · click a Coy for its platoons'}
      action={
        drillable.length > 0 && (
          <label className="text-xs text-ink-2">
            <span className="sr-only">Drill into</span>
            <select className="field__input min-h-9 py-0 text-xs" value={drill} onChange={(e) => setDrill(e.target.value)} aria-label="Drill into a company">
              <option value="">15C4I Battalion</option>
              {drillable.map((u) => <option key={u.unit.id} value={u.unit.id}>{u.unit.name}</option>)}
            </select>
          </label>
        )
      }
      table={<DataTable caption="Present share" head={['Branch/Coy', 'Strength', 'Present', 'Share', 'Absent', 'Unmarked']} rows={rows.map((r) => [r.name, r.counts.strength, r.counts.present, pct(rateOf(r.counts)), r.counts.absent, r.counts.unmarked])} />}
      footer={<LegendRow items={KINDS.map((k) => ({ label: labelFor(k), color: STATUS_COLOR[k]!() }))} />}
    >
      <div style={{ height }} className="w-full">
        <Bar data={data} options={{ ...options, plugins: { ...options.plugins, endLabels: { labels } } }} plugins={[endLabels]} key={drill} aria-label="Present share by Branch/Coy" role="img" />
      </div>
    </ChartCard>
  );
}
