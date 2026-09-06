import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '@shared/demo/dataset';
import { effectiveStatuses, sumCounts, unitCounts } from '@shared/domain';

describe('demo dataset', () => {
  it('has 312 strength, 263 marked present, 24 not yet marked, 25 absent, 6 of 8 submitted, 3 unread', async () => {
    const d = await buildDemoDataset();
    const perUnit = d.units.map((u) => {
      const people = d.personnel.filter((p) => p.unitId === u.id);
      const spans = d.spans.filter((s) => s.unitId === u.id);
      const marks = new Set(d.marks.filter((m) => m.unitId === u.id && m.eventId === `${d.date}-AM`).map((m) => m.personId));
      return unitCounts(effectiveStatuses(people, spans, marks, d.date));
    });
    const totals = sumCounts(perUnit);
    expect(totals).toMatchObject({ strength: 312, present: 263, unmarked: 24, absent: 25, mc: 9, ll: 5, ma: 4, rsi: 3, others: 4 });
    expect(perUnit[5]).toMatchObject({ strength: 102, present: 86, unmarked: 10, absent: 6 });
    expect(perUnit[1]).toMatchObject({ strength: 14, present: 0, unmarked: 14 });
    expect(new Set(d.submissions.filter((s) => s.eventId === `${d.date}-AM`).map((s) => s.unitId)).size).toBe(6);
    expect(d.notifications.filter((n) => !n.readAt)).toHaveLength(3);
    expect(d.submissions.find((s) => s.unitId === 'SSP' && s.version === 2)).toBeTruthy();
    // 13 prior AM parades of history: every unit submitted except S2 twice; no history absence reaches the demo day.
    expect(d.events.filter((e) => e.type === 'AM')).toHaveLength(14);
    expect(d.submissions.filter((s) => s.eventId !== `${d.date}-AM`)).toHaveLength(13 * 8 - 2);
    expect(d.spans.filter((s) => s.startDate < d.date && (s.endDate === null || s.endDate >= d.date)).every((s) => d.spans.some((x) => x.id === s.id && x.createdAt < `${d.date}T00`))).toBe(true);
    expect(d.personnel.filter((p) => p.name === 'Daniel Tan')).toHaveLength(1);
    expect(new Set(d.personnel.map((p) => p.name)).size).toBe(312);
    expect(d.personnel.filter((p) => p.unitId === 'COY1').every((p) => p.platoonId?.startsWith('COY1-'))).toBe(true);
    expect(d.personnel.filter((p) => p.unitId === 'S1').every((p) => p.platoonId === null)).toBe(true);
    expect(d.personnel.filter((p) => p.platoonId === 'COY1-HQ')).toHaveLength(8);
  });
});
