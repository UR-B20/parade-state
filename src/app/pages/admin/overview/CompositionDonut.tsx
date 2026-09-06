import { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { STATUS_LABEL, STATUSES, UNMARKED_LABEL, type EffectiveKind } from '@shared/statuses';
import type { UnitCounts } from '@shared/types';
import { markedRateOf, pct } from '@shared/domain';
import { STATUS_COLOR, surface } from '../../../charts/theme';
import { StatusLegend } from '../../../components/StrengthSummary';
import { ChartCard, DataTable } from './ChartCard';

const KINDS: EffectiveKind[] = [...STATUSES, 'UNMARKED'];
const labelFor = (k: EffectiveKind) => (k === 'UNMARKED' ? UNMARKED_LABEL : STATUS_LABEL[k]);

export function countFor(counts: UnitCounts, k: EffectiveKind): number {
  switch (k) {
    case 'PRESENT': return counts.present;
    case 'UNMARKED': return counts.unmarked;
    case 'MC': return counts.mc;
    case 'LL': return counts.ll;
    case 'MA': return counts.ma;
    case 'RSI': return counts.rsi;
    case 'OTHERS': return counts.others;
  }
}

export function CompositionDonut({ counts, title = 'Strength composition', subtitle }: { counts: UnitCounts; title?: string; subtitle?: string }) {
  const parts = useMemo(() => KINDS.map((k) => ({ kind: k, n: countFor(counts, k) })).filter((p) => p.n > 0), [counts]);
  const data = useMemo<ChartData<'doughnut'>>(() => ({
    labels: parts.map((p) => labelFor(p.kind)),
    datasets: [{
      data: parts.map((p) => p.n),
      backgroundColor: parts.map((p) => STATUS_COLOR[p.kind]!()),
      hoverBackgroundColor: parts.map((p) => STATUS_COLOR[p.kind]!()),
      borderColor: surface(),
      borderWidth: 2,
      hoverOffset: 6,
    }],
  }), [parts]);
  const options = useMemo<ChartOptions<'doughnut'>>(() => ({
    cutout: '74%',
    layout: { padding: 6 },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.parsed} (${counts.strength ? Math.round((ctx.parsed / counts.strength) * 100) : 0}%)`,
        },
      },
    },
  }), [counts.strength]);
  const rate = markedRateOf(counts);
  return (
    <ChartCard
      title={title}
      subtitle={subtitle ?? `${counts.strength} personnel · ${counts.absent} absent · ${counts.unmarked} not yet marked`}
      table={<DataTable caption="Strength composition" head={['Status', 'Personnel', 'Share']} rows={parts.map((p) => [labelFor(p.kind), p.n, `${counts.strength ? Math.round((p.n / counts.strength) * 100) : 0}%`])} />}
      footer={<StatusLegend counts={counts} />}
    >
      <div className="relative mx-auto h-[210px] w-full max-w-[260px]">
        <Doughnut data={data} options={options} aria-label={`Strength composition: ${parts.map((p) => `${labelFor(p.kind)} ${p.n}`).join(', ')}`} role="img" />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-[32px] font-bold leading-none tracking-[-0.5px] text-ink">{pct(rate)}</span>
          <span className="mt-1 text-xs text-ink-2">present of marked</span>
          <span className="num text-xs text-ink-2">{counts.present} / {counts.strength}</span>
        </div>
      </div>
    </ChartCard>
  );
}
