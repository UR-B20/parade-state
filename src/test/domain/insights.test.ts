import { describe, expect, it } from 'vitest';
import { buildBriefing, buildTrends, EMPTY_COUNTS, trendDates, type TrendsInput } from '@shared/domain';
import type { EventDto, UnitCounts, UnitSummaryRow } from '@shared/types';

const counts = (strength: number, present: number, o: Partial<UnitCounts> = {}): UnitCounts => {
  const c: UnitCounts = { ...EMPTY_COUNTS, strength, present, ...o };
  c.absent = c.ll + c.off + c.rsi + c.rso + c.mc + c.ma + c.hl + c.ol + c.others;
  return c;
};
const event: EventDto = { id: '2026-09-06-AM', date: '2026-09-06', type: 'AM', name: null, cutoffAt: '2026-09-06T02:00:00.000Z', label: 'AM parade', archivedAt: null };
const units = [{ id: 'A', name: 'Alpha', sortOrder: 1 }, { id: 'B', name: 'Bravo', sortOrder: 2 }];
const unit = (id: string, name: string): UnitSummaryRow['unit'] => ({ id: id as never, name, sortOrder: 1, platoons: [] });

function input(overrides: Partial<TrendsInput> = {}): TrendsInput {
  const dates = trendDates('2026-09-06', 8).slice(0, 7);
  const pastEvents = dates.map((d) => ({ id: `${d}-AM`, date: d, cutoffAt: `${d}T02:00:00.000Z` }));
  const submissions = pastEvents.flatMap((e, i) => [
    { unitId: 'A', eventId: e.id, submittedAt: `${e.date}T01:00:00.000Z`, counts: counts(50, 47, { mc: 3 }) },
    // Bravo is late twice and misses the third day.
    ...(i === 2 ? [] : [{ unitId: 'B', eventId: e.id, submittedAt: i < 2 ? `${e.date}T03:00:00.000Z` : `${e.date}T01:30:00.000Z`, counts: counts(50, 46, { rsi: 4 }) }]),
  ]);
  const rowA: UnitSummaryRow = { unit: unit('A', 'Alpha'), counts: counts(50, 45, { mc: 5 }), submission: { kind: 'SUBMITTED', version: 1, submittedAt: '2026-09-06T01:00:00.000Z', submittedBy: 'x', wasLate: false, hasChanges: false }, platoons: [] };
  const rowB: UnitSummaryRow = { unit: unit('B', 'Bravo'), counts: counts(50, 30, { unmarked: 20 }), submission: { kind: 'PENDING', lastChangedAt: '2026-09-06T01:00:00.000Z' }, platoons: [] };
  return {
    event, days: 8, units, pastEvents, submissions,
    today: { units: [rowA, rowB], totals: counts(100, 75, { mc: 5, unmarked: 20 }), unitsSubmitted: 1, unitsTotal: 2 },
    todayStatuses: [],
    serverNow: '2026-09-06T01:24:00.000Z',
    ...overrides,
  };
}

describe('buildTrends', () => {
  it('reads past days from the latest submissions and scores timeliness', () => {
    const t = buildTrends(input());
    expect(t.days).toHaveLength(8);
    expect(t.days[0]!.counts).toMatchObject({ strength: 100, present: 93, absent: 7 });
    expect(t.days[2]).toMatchObject({ unitsSubmitted: 1, onTime: 1, late: 0 });
    expect(t.days[2]!.counts.strength).toBe(50);
    expect(t.days[7]).toMatchObject({ live: true, unitsSubmitted: 1, unitsTotal: 2 });
    expect(t.units).toEqual([
      { unitId: 'A', unitName: 'Alpha', onTime: 8, late: 0, missed: 0, pending: 0 },
      { unitId: 'B', unitName: 'Bravo', onTime: 4, late: 2, missed: 1, pending: 1 },
    ]);
  });

  it('leaves days without a recorded parade empty rather than counting them as missed', () => {
    const t = buildTrends(input({ pastEvents: [], submissions: [] }));
    expect(t.days.slice(0, 7).every((d) => d.eventId === null && d.unitsSubmitted === 0)).toBe(true);
    expect(t.units[1]).toMatchObject({ missed: 0, pending: 1 });
  });
});

describe('buildBriefing', () => {
  it('leads with the reporting gap while marking is incomplete and names the slow unit', () => {
    const t = buildTrends(input());
    const b = buildBriefing(t, { units: input().today.units });
    expect(b.headline).toBe('1 of 2 Branches/Coy have submitted: 75 of 100 marked present, 20 still to mark. Of those marked, 94% are present. That is in line with the 7-day average of 93%.');
    expect(b.markedRate).toBeCloseTo(0.9375);
    expect(b.avg7).toBeCloseTo((6 * 0.93 + 0.94) / 7, 3);
    const texts = b.items.map((i) => i.text);
    expect(b.items[0]).toMatchObject({ tone: 'warn', text: 'Awaiting Bravo (20 personnel not yet marked).' });
    expect(texts.some((x) => x.startsWith('Medical certificate is the largest absence driver: 5 of 5 absentees (100%)'))).toBe(true);
    expect(texts.some((x) => x.includes('Bravo (2 late, 1 missed) over the last 7 parades'))).toBe(true);
  });

  it('turns danger after the cut-off and reports a clean week when everyone is in', () => {
    const base = input();
    const rowB: UnitSummaryRow = { ...base.today.units[1]!, counts: counts(50, 48, { ll: 2 }), submission: { kind: 'SUBMITTED', version: 1, submittedAt: '2026-09-06T01:50:00.000Z', submittedBy: 'y', wasLate: false, hasChanges: false } };
    const complete = input({ today: { units: [base.today.units[0]!, rowB], totals: counts(100, 93, { mc: 5, ll: 2 }), unitsSubmitted: 2, unitsTotal: 2 } });
    const b = buildBriefing(buildTrends(complete), { units: complete.today.units });
    expect(b.headline.startsWith('All 2 Branches/Coy have submitted: 93% present (93 of 100), 7 absent.')).toBe(true);
    expect(b.items.some((i) => i.text.startsWith('Awaiting'))).toBe(false);

    const late = input({ serverNow: '2026-09-06T02:30:00.000Z' });
    const lb = buildBriefing(buildTrends(late), { units: late.today.units });
    expect(lb.items[0]).toMatchObject({ tone: 'danger', text: 'Past the cut-off with one Branch/Coy still out: Bravo.' });
  });
});
