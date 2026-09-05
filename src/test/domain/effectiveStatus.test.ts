import { describe, expect, it } from 'vitest';
import { effectiveStatuses, type RollPerson, type SpanRow } from '@shared/domain';

const people: RollPerson[] = [
  { id: 'a', rank: 'CPL', name: 'Daniel Tan', postedInDate: '2025-01-01', postedOutDate: null },
  { id: 'b', rank: '3SG', name: 'Ryan Lim', postedInDate: '2025-01-01', postedOutDate: null },
  { id: 'c', rank: 'PTE', name: 'Posted Out', postedInDate: '2025-01-01', postedOutDate: '2026-09-01' },
  { id: 'd', rank: 'PTE', name: 'Not Yet In', postedInDate: '2026-09-10', postedOutDate: null },
];

const span = (over: Partial<SpanRow>): SpanRow => ({
  id: 's1', personId: 'a', status: 'MC', subType: null, startDate: '2026-09-05', endDate: '2026-09-08', remark: null, createdAt: '2026-09-05T01:00:00.000Z', ...over,
});

describe('effectiveStatuses', () => {
  it('excludes personnel not active on the event date and sorts by rank then name', () => {
    const out = effectiveStatuses(people, [], new Set(), '2026-09-06');
    expect(out.map((p) => p.personId)).toEqual(['b', 'a']);
  });

  it('defaults unmarked personnel to unconfirmed Present', () => {
    const out = effectiveStatuses(people, [], new Set(), '2026-09-06');
    expect(out.find((p) => p.personId === 'a')).toMatchObject({ status: 'PRESENT', confirmed: false, spanId: null });
  });

  it('applies a covering span, including its end date, and not after it', () => {
    const spans = [span({})];
    expect(effectiveStatuses(people, spans, new Set(), '2026-09-08').find((p) => p.personId === 'a')).toMatchObject({ status: 'MC', confirmed: true, spanId: 's1', endDate: '2026-09-08' });
    expect(effectiveStatuses(people, spans, new Set(), '2026-09-09').find((p) => p.personId === 'a')).toMatchObject({ status: 'PRESENT', confirmed: false });
    expect(effectiveStatuses(people, spans, new Set(), '2026-09-04').find((p) => p.personId === 'a')).toMatchObject({ status: 'PRESENT' });
  });

  it('treats an open-ended span as covering every later date', () => {
    const spans = [span({ endDate: null, status: 'OTHERS', subType: 'COURSE' })];
    expect(effectiveStatuses(people, spans, new Set(), '2026-12-25').find((p) => p.personId === 'a')).toMatchObject({ status: 'OTHERS', subType: 'COURSE' });
  });

  it('lets a confirmed Present mark override a covering span for that event only', () => {
    const spans = [span({})];
    expect(effectiveStatuses(people, spans, new Set(['a']), '2026-09-06').find((p) => p.personId === 'a')).toMatchObject({ status: 'PRESENT', confirmed: true });
    expect(effectiveStatuses(people, spans, new Set(), '2026-09-06').find((p) => p.personId === 'a')).toMatchObject({ status: 'MC' });
  });

  it('picks the newest of two covering spans', () => {
    const spans = [span({ id: 'old', createdAt: '2026-09-05T01:00:00.000Z' }), span({ id: 'new', status: 'LL', createdAt: '2026-09-05T02:00:00.000Z' })];
    expect(effectiveStatuses(people, spans, new Set(), '2026-09-06').find((p) => p.personId === 'a')).toMatchObject({ status: 'LL', spanId: 'new' });
  });

  it('keeps RSI to its single day', () => {
    const spans = [span({ status: 'RSI', startDate: '2026-09-06', endDate: '2026-09-06' })];
    expect(effectiveStatuses(people, spans, new Set(), '2026-09-06').find((p) => p.personId === 'a')?.status).toBe('RSI');
    expect(effectiveStatuses(people, spans, new Set(), '2026-09-07').find((p) => p.personId === 'a')?.status).toBe('PRESENT');
  });
});
