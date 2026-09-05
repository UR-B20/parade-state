import { describe, expect, it } from 'vitest';
import { canonicalizeUnitState, contentHash, sumCounts, unitCounts } from '@shared/domain';
import type { EffectiveStatus } from '@shared/types';

const es = (over: Partial<EffectiveStatus>): EffectiveStatus => ({
  personId: 'p', rank: 'PTE', name: 'X', status: 'PRESENT', confirmed: false, subType: null, startDate: null, endDate: null, remark: null, spanId: null, ...over,
});

describe('unitCounts', () => {
  it('splits present into confirmed and default and sums absences', () => {
    const c = unitCounts([
      es({ personId: '1', confirmed: true }),
      es({ personId: '2' }),
      es({ personId: '3', status: 'MC', confirmed: true }),
      es({ personId: '4', status: 'RSI', confirmed: true }),
      es({ personId: '5', status: 'OTHERS', subType: 'DUTY', confirmed: true }),
    ]);
    expect(c).toEqual({ strength: 5, present: 2, presentConfirmed: 1, presentDefault: 1, mc: 1, ll: 0, ma: 0, rsi: 1, others: 1, absent: 3 });
  });

  it('sums battalion totals', () => {
    const a = unitCounts([es({ personId: '1' })]);
    const b = unitCounts([es({ personId: '2', status: 'LL', confirmed: true })]);
    expect(sumCounts([a, b])).toMatchObject({ strength: 2, present: 1, ll: 1, absent: 1 });
  });
});

describe('content hash', () => {
  it('ignores whether a Present is confirmed', async () => {
    const a = [es({ personId: '1', confirmed: false })];
    const b = [es({ personId: '1', confirmed: true })];
    expect(await contentHash(a)).toBe(await contentHash(b));
  });

  it('changes when status, dates, remark or roll membership change', async () => {
    const base = [es({ personId: '1' }), es({ personId: '2' })];
    const h = await contentHash(base);
    expect(await contentHash([es({ personId: '1', status: 'MC', confirmed: true, startDate: '2026-09-06', endDate: '2026-09-07' }), es({ personId: '2' })])).not.toBe(h);
    expect(await contentHash([es({ personId: '1' })])).not.toBe(h);
    expect(await contentHash([es({ personId: '1', remark: 'x' }), es({ personId: '2' })])).not.toBe(h);
  });

  it('is independent of input order', () => {
    const a = canonicalizeUnitState([es({ personId: 'b' }), es({ personId: 'a' })]);
    const b = canonicalizeUnitState([es({ personId: 'a' }), es({ personId: 'b' })]);
    expect(a).toBe(b);
  });
});
