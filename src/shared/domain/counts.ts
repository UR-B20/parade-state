import type { EffectiveKind } from '../statuses';
import type { EffectiveStatus, PlatoonCounts, PlatoonDto, UnitCounts } from '../types';

export const EMPTY_COUNTS: UnitCounts = {
  strength: 0, present: 0, unmarked: 0,
  ll: 0, off: 0, rsi: 0, rso: 0, mc: 0, ma: 0, hl: 0, ol: 0, others: 0, absent: 0,
};

export function unitCounts(statuses: readonly EffectiveStatus[]): UnitCounts {
  const c: UnitCounts = { ...EMPTY_COUNTS };
  for (const s of statuses) {
    c.strength += 1;
    switch (s.status) {
      case 'PRESENT': c.present += 1; break;
      case 'UNMARKED': c.unmarked += 1; break;
      case 'LL': c.ll += 1; break;
      case 'OFF': c.off += 1; break;
      case 'RSI': c.rsi += 1; break;
      case 'RSO': c.rso += 1; break;
      case 'MC': c.mc += 1; break;
      case 'MA': c.ma += 1; break;
      case 'HL': c.hl += 1; break;
      case 'OL': c.ol += 1; break;
      case 'OTHERS': c.others += 1; break;
    }
  }
  c.absent = c.ll + c.off + c.rsi + c.rso + c.mc + c.ma + c.hl + c.ol + c.others;
  return c;
}

/** The count for one status (or Not yet marked) in a UnitCounts. */
export function countFor(counts: UnitCounts, kind: EffectiveKind): number {
  switch (kind) {
    case 'PRESENT': return counts.present;
    case 'UNMARKED': return counts.unmarked;
    case 'LL': return counts.ll;
    case 'OFF': return counts.off;
    case 'RSI': return counts.rsi;
    case 'RSO': return counts.rso;
    case 'MC': return counts.mc;
    case 'MA': return counts.ma;
    case 'HL': return counts.hl;
    case 'OL': return counts.ol;
    case 'OTHERS': return counts.others;
  }
}

/** Counts stored before a status existed lack its key; read them as zero. */
export function normalizeCounts(c: Partial<UnitCounts>): UnitCounts {
  return { ...EMPTY_COUNTS, ...c };
}

/** Per-platoon counts in platoon order, plus an unassigned group when needed. Empty when the unit has no platoons. */
export function platoonBreakdown(statuses: readonly EffectiveStatus[], platoons: readonly PlatoonDto[]): PlatoonCounts[] {
  if (platoons.length === 0) return [];
  const out: PlatoonCounts[] = platoons.map((p) => ({ platoon: p, counts: unitCounts(statuses.filter((s) => s.platoonId === p.id)) }));
  const known = new Set(platoons.map((p) => p.id));
  const unassigned = statuses.filter((s) => !s.platoonId || !known.has(s.platoonId));
  if (unassigned.length > 0) out.push({ platoon: null, counts: unitCounts(unassigned) });
  return out;
}

export function sumCounts(list: readonly Partial<UnitCounts>[]): UnitCounts {
  const total: UnitCounts = { ...EMPTY_COUNTS };
  for (const c of list) {
    for (const key of Object.keys(total) as (keyof UnitCounts)[]) total[key] += c[key] ?? 0;
  }
  return total;
}
