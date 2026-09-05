import { describe, expect, it } from 'vitest';
import { diffAgainstSnapshot, MarkValidationError, planMark, toSnapshot, type SpanRow } from '@shared/domain';
import type { EffectiveStatus } from '@shared/types';

const es = (over: Partial<EffectiveStatus>): EffectiveStatus => ({
  personId: 'p', rank: 'PTE', name: 'X', status: 'PRESENT', confirmed: false, subType: null, startDate: null, endDate: null, remark: null, spanId: null, ...over,
});

describe('diffAgainstSnapshot', () => {
  it('reports changed, added and removed personnel', () => {
    const snapshot = toSnapshot([es({ personId: '1' }), es({ personId: '2', status: 'MC', confirmed: true, startDate: '2026-09-05', endDate: '2026-09-08' }), es({ personId: '3' })]);
    const current = [es({ personId: '1', status: 'LL', confirmed: true, startDate: '2026-09-06', endDate: '2026-09-07' }), es({ personId: '2', status: 'MC', confirmed: true, startDate: '2026-09-05', endDate: '2026-09-08' }), es({ personId: '4', name: 'New' })];
    const diff = diffAgainstSnapshot(snapshot, current);
    expect(diff.map((d) => d.personId).sort()).toEqual(['1', '3', '4']);
    expect(diff.find((d) => d.personId === '1')).toMatchObject({ before: { status: 'PRESENT' }, after: { status: 'LL' } });
    expect(diff.find((d) => d.personId === '3')?.after).toBeNull();
    expect(diff.find((d) => d.personId === '4')?.before).toBeNull();
  });

  it('ignores confirmation-only changes', () => {
    const snapshot = toSnapshot([es({ personId: '1', confirmed: false })]);
    expect(diffAgainstSnapshot(snapshot, [es({ personId: '1', confirmed: true })])).toEqual([]);
  });
});

const mc: SpanRow = { id: 'mc', personId: 'p', status: 'MC', subType: null, startDate: '2026-09-04', endDate: '2026-09-08', remark: 'fever', createdAt: '2026-09-04T01:00:00.000Z' };
const future: SpanRow = { id: 'fut', personId: 'p', status: 'OTHERS', subType: 'COURSE', startDate: '2026-09-10', endDate: '2026-09-12', remark: null, createdAt: '2026-09-04T01:00:00.000Z' };
const other: SpanRow = { ...mc, id: 'other', personId: 'q' };

describe('planMark', () => {
  it('PRESENT only confirms this event', () => {
    const plan = planMark({ action: 'PRESENT' }, 'p', [mc], '2026-09-06');
    expect(plan).toEqual({ supersedeSpanIds: [], insertSpans: [], deleteMarksInRange: null, upsertPresentMark: true });
  });

  it('BACK_TO_PRESENT truncates the covering span to yesterday and drops future spans', () => {
    const plan = planMark({ action: 'BACK_TO_PRESENT' }, 'p', [mc, future, other], '2026-09-06');
    expect(plan.supersedeSpanIds.sort()).toEqual(['fut', 'mc']);
    expect(plan.insertSpans).toEqual([{ personId: 'p', status: 'MC', subType: null, startDate: '2026-09-04', endDate: '2026-09-05', remark: 'fever', replacesId: 'mc' }]);
    expect(plan.upsertPresentMark).toBe(true);
  });

  it('BACK_TO_PRESENT on a span starting today removes it without a truncated copy', () => {
    const plan = planMark({ action: 'BACK_TO_PRESENT' }, 'p', [{ ...mc, startDate: '2026-09-06' }], '2026-09-06');
    expect(plan.supersedeSpanIds).toEqual(['mc']);
    expect(plan.insertSpans).toEqual([]);
  });

  it('SET replaces overlapping spans from the new start and keeps the earlier head', () => {
    const plan = planMark({ action: 'SET', status: 'LL', startDate: '2026-09-06', endDate: '2026-09-09' }, 'p', [mc, other], '2026-09-06');
    expect(plan.supersedeSpanIds).toEqual(['mc']);
    expect(plan.insertSpans).toHaveLength(2);
    expect(plan.insertSpans[0]).toMatchObject({ status: 'MC', startDate: '2026-09-04', endDate: '2026-09-05', replacesId: 'mc' });
    expect(plan.insertSpans[1]).toMatchObject({ status: 'LL', startDate: '2026-09-06', endDate: '2026-09-09', replacesId: null });
    expect(plan.deleteMarksInRange).toEqual({ start: '2026-09-06', end: '2026-09-09' });
    expect(plan.upsertPresentMark).toBe(false);
  });

  it('SET RSI forces the span to the event day', () => {
    const plan = planMark({ action: 'SET', status: 'RSI', startDate: '2026-09-01', endDate: null }, 'p', [], '2026-09-06');
    expect(plan.insertSpans[0]).toMatchObject({ status: 'RSI', startDate: '2026-09-06', endDate: '2026-09-06' });
  });

  it('validates dates and Others sub-type', () => {
    expect(() => planMark({ action: 'SET', status: 'MC', startDate: '2026-09-06', endDate: '2026-09-05' }, 'p', [], '2026-09-06')).toThrow(MarkValidationError);
    expect(() => planMark({ action: 'SET', status: 'MC', startDate: '2026-09-07', endDate: null }, 'p', [], '2026-09-06')).toThrow(/Start date/);
    expect(() => planMark({ action: 'SET', status: 'MC', startDate: '2026-09-01', endDate: '2026-09-05' }, 'p', [], '2026-09-06')).toThrow(/End date/);
    expect(() => planMark({ action: 'SET', status: 'OTHERS', startDate: '2026-09-06', endDate: null }, 'p', [], '2026-09-06')).toThrow(/type for Others/);
  });

  it('trims remarks and stores empty as null', () => {
    const plan = planMark({ action: 'SET', status: 'MA', startDate: '2026-09-06', endDate: '2026-09-06', remark: '   ' }, 'p', [], '2026-09-06');
    expect(plan.insertSpans[0]?.remark).toBeNull();
  });
});
