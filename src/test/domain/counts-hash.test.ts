import { describe, expect, it } from 'vitest';
import { canonicalizeUnitState, contentHash, sumCounts, unitCounts } from '@shared/domain';
import type { EffectiveStatus } from '@shared/types';

const es = (over: Partial<EffectiveStatus>): EffectiveStatus => ({
  personId: 'p', rank: 'PTE', name: 'X', status: 'UNMARKED', subType: null, startDate: null, endDate: null, remark: null, spanId: null, ...over,
});

describe('unitCounts', () => {
  it('counts present, unmarked and absences separately', () => {
    const c = unitCounts([
      es({ personId: '1', status: 'PRESENT' }),
      es({ personId: '2' }),
      es({ personId: '3', status: 'MC' }),
      es({ personId: '4', status: 'RSI' }),
      es({ personId: '5', status: 'OTHERS', subType: 'DUTY' }),
    ]);
    expect(c).toEqual({ strength: 5, present: 1, unmarked: 1, mc: 1, ll: 0, ma: 0, rsi: 1, others: 1, absent: 3 });
  });

  it('sums battalion totals', () => {
    const a = unitCounts([es({ personId: '1', status: 'PRESENT' })]);
    const b = unitCounts([es({ personId: '2', status: 'LL' }), es({ personId: '3' })]);
    expect(sumCounts([a, b])).toMatchObject({ strength: 3, present: 1, unmarked: 1, ll: 1, absent: 1 });
  });
});

describe('content hash', () => {
  it('treats marking an unmarked person Present as a change', async () => {
    const a = [es({ personId: '1' })];
    const b = [es({ personId: '1', status: 'PRESENT' })];
    expect(await contentHash(a)).not.toBe(await contentHash(b));
  });

  it('changes when status, dates, remark or roll membership change', async () => {
    const base = [es({ personId: '1' }), es({ personId: '2' })];
    const h = await contentHash(base);
    expect(await contentHash([es({ personId: '1', status: 'MC', startDate: '2026-09-06', endDate: '2026-09-07' }), es({ personId: '2' })])).not.toBe(h);
    expect(await contentHash([es({ personId: '1' })])).not.toBe(h);
    expect(await contentHash([es({ personId: '1', remark: 'x' }), es({ personId: '2' })])).not.toBe(h);
  });

  it('is independent of input order', () => {
    const a = canonicalizeUnitState([es({ personId: 'b' }), es({ personId: 'a' })]);
    const b = canonicalizeUnitState([es({ personId: 'a' }), es({ personId: 'b' })]);
    expect(a).toBe(b);
  });
});
