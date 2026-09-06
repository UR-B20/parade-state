import type { Briefing } from '@shared/domain';
import { pct } from '@shared/domain';
import type { BattalionSummaryDto, TrendsDto } from '@shared/types';

type Tone = 'ok' | 'warn' | 'danger' | 'neutral';
const toneClass: Record<Tone, string> = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger', neutral: 'text-ink-2' };

function Tile({ label, value, sub, delta, tone = 'neutral' }: { label: string; value: string; sub: string; delta?: string; tone?: Tone }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-line bg-surface p-4">
      <span className="text-xs font-medium text-ink-2">{label}</span>
      <span className="num text-[30px] font-bold leading-none tracking-[-0.5px] text-ink">{value}</span>
      <span className="text-xs text-ink-2">{sub}</span>
      {delta && <span className={`num text-xs font-semibold ${toneClass[tone]}`}>{delta}</span>}
    </div>
  );
}

function signed(n: number, digits = 1, unit = ''): string {
  const v = n.toFixed(digits);
  return `${n > 0 ? '▲ +' : n < 0 ? '▼ ' : '● '}${v}${unit}`;
}

export function KpiTiles({ summary, trends, briefing }: { summary: BattalionSummaryDto; trends: TrendsDto; briefing: Briefing }) {
  const c = summary.totals;
  const today = trends.days[trends.days.length - 1]!;
  const awaiting = trends.units.filter((u) => u.pending > 0).length;
  const presentDelta = briefing.markedRate !== null && briefing.avg7 !== null ? (briefing.markedRate - briefing.avg7) * 100 : null;
  const absentAvg = briefing.avgAbsent7 !== null ? briefing.avgAbsent7 * c.strength : null;
  const absentDelta = absentAvg !== null ? c.absent - absentAvg : null;
  return (
    <div className="grid grid-cols-2 gap-3 wide:grid-cols-4" role="list" aria-label="Key figures">
      <div role="listitem" className="contents">
        <Tile
          label="Present, of those marked"
          value={pct(briefing.markedRate)}
          sub={`${c.present} of ${c.strength - c.unmarked} marked · ${c.strength} strength`}
          delta={presentDelta !== null ? `${signed(presentDelta, 1, ' pts')} vs 7-day avg ${pct(briefing.avg7)}` : undefined}
          tone={presentDelta === null ? 'neutral' : presentDelta <= -1.5 ? 'danger' : presentDelta >= 1.5 ? 'ok' : 'neutral'}
        />
      </div>
      <div role="listitem" className="contents">
        <Tile
          label="Absent"
          value={String(c.absent)}
          sub={`${pct(briefing.absentRate, 1)} of strength · MC ${c.mc} · RSI ${c.rsi}`}
          delta={absentDelta !== null ? `${signed(absentDelta, 1)} vs 7-day avg ${absentAvg!.toFixed(1)}` : undefined}
          tone={absentDelta === null ? 'neutral' : absentDelta >= 3 ? 'danger' : absentDelta <= -3 ? 'ok' : 'neutral'}
        />
      </div>
      <div role="listitem" className="contents">
        <Tile
          label="Not yet marked"
          value={String(c.unmarked)}
          sub={awaiting > 0 ? `${awaiting} ${awaiting === 1 ? 'unit' : 'units'} still to submit` : 'Every unit has submitted'}
          delta={c.unmarked > 0 ? 'Blocks the units from submitting' : '● Everyone marked'}
          tone={c.unmarked > 0 ? 'warn' : 'ok'}
        />
      </div>
      <div role="listitem" className="contents">
        <Tile
          label="Units submitted"
          value={`${summary.unitsSubmitted} / ${summary.unitsTotal}`}
          sub={`${today.onTime} on time · ${today.late} late`}
          delta={summary.unitsSubmitted === summary.unitsTotal ? '● Report complete' : Date.parse(trends.serverNow) >= Date.parse(summary.event.cutoffAt) ? '▼ Past the cut-off' : '● Before the cut-off'}
          tone={summary.unitsSubmitted === summary.unitsTotal ? 'ok' : Date.parse(trends.serverNow) >= Date.parse(summary.event.cutoffAt) ? 'danger' : 'neutral'}
        />
      </div>
    </div>
  );
}
