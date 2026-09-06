import type { EffectiveStatus, UnitCounts } from '../types';

export const EMPTY_COUNTS: UnitCounts = {
  strength: 0, present: 0, unmarked: 0,
  mc: 0, ll: 0, ma: 0, rsi: 0, others: 0, absent: 0,
};

export function unitCounts(statuses: readonly EffectiveStatus[]): UnitCounts {
  const c: UnitCounts = { ...EMPTY_COUNTS };
  for (const s of statuses) {
    c.strength += 1;
    switch (s.status) {
      case 'PRESENT': c.present += 1; break;
      case 'UNMARKED': c.unmarked += 1; break;
      case 'MC': c.mc += 1; break;
      case 'LL': c.ll += 1; break;
      case 'MA': c.ma += 1; break;
      case 'RSI': c.rsi += 1; break;
      case 'OTHERS': c.others += 1; break;
    }
  }
  c.absent = c.mc + c.ll + c.ma + c.rsi + c.others;
  return c;
}

export function sumCounts(list: readonly UnitCounts[]): UnitCounts {
  const total: UnitCounts = { ...EMPTY_COUNTS };
  for (const c of list) {
    for (const key of Object.keys(total) as (keyof UnitCounts)[]) total[key] += c[key];
  }
  return total;
}
