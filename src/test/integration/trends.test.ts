import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDemoDataset, type DemoDataset } from '@shared/demo/dataset';
import type { TrendsDto } from '@shared/types';
import { insertDemoData } from '../../worker/db/seedDemo';
import { createHarness, type Harness } from './harness';

let h: Harness;
let data: DemoDataset;
let admin: string;
let cdr1: string;
let cdr2: string;
const AM = '2026-09-06-AM';

beforeAll(async () => {
  h = await createHarness({ DEMO_CONTROLS: 'true' } as never);
  data = await buildDemoDataset();
  await insertDemoData(h.db, data, new Map(data.users.map((u) => [u.id, u.id])));
  admin = data.users.find((u) => u.role === 'ADMIN')!.id;
  cdr1 = data.users.find((u) => u.unitId === 'COY1')!.id;
  cdr2 = data.users.find((u) => u.unitId === 'COY2')!.id;
});
afterAll(async () => { await h.close(); });

describe('battalion trends', () => {
  it('returns 14 days ending today, past days from submissions and today live', async () => {
    const { status, body } = await h.json<TrendsDto>(`/admin/trends/${AM}?days=14`, { as: admin });
    expect(status).toBe(200);
    expect(body.days).toHaveLength(14);
    expect(body.days.map((d) => d.date)[0]).toBe('2026-08-24');
    const today = body.days[13]!;
    expect(today).toMatchObject({ date: '2026-09-06', live: true, unitsSubmitted: 6, unitsTotal: 8, onTime: 6, late: 0 });
    expect(today.counts).toMatchObject({ strength: 312, present: 263, unmarked: 24, absent: 25 });
    // Thu 3 Sep: S2 did not submit, so the day covers 7 units and 298 personnel.
    const thu = body.days.find((d) => d.date === '2026-09-03')!;
    expect(thu).toMatchObject({ live: false, unitsSubmitted: 7, unitsTotal: 8 });
    expect(thu.counts.strength).toBe(298);
    expect(thu.counts.unmarked).toBe(0);
    // Tue 1 Sep is the report-sick spike.
    const tue = body.days.find((d) => d.date === '2026-09-01')!;
    expect(tue.counts.rsi).toBeGreaterThan(15);
    expect(body.othersSubTypes).toEqual({ ATTACHED_OUT: 1, COURSE: 1, OUTFIELD: 0, DUTY: 2 });
  });

  it('scores reporting discipline per unit over the window', async () => {
    const { body } = await h.json<TrendsDto>(`/admin/trends/${AM}`, { as: admin });
    const byUnit = Object.fromEntries(body.units.map((u) => [u.unitId, u]));
    expect(byUnit['COY2']).toMatchObject({ onTime: 11, late: 3, missed: 0, pending: 0 });
    expect(byUnit['S2']).toMatchObject({ onTime: 11, late: 0, missed: 2, pending: 1 });
    expect(byUnit['COY1']).toMatchObject({ onTime: 13, late: 0, missed: 0, pending: 1 });
    expect(byUnit['S1']).toMatchObject({ onTime: 14, late: 0, missed: 0, pending: 0 });
  });

  it('clamps the window and is admin only', async () => {
    const { body } = await h.json<TrendsDto>(`/admin/trends/${AM}?days=1`, { as: admin });
    expect(body.days).toHaveLength(2);
    expect((await h.request(`/admin/trends/${AM}`, { as: cdr1 })).status).toBe(403);
  });
});

describe('unit trends for the commander', () => {
  it('gives Coy 1 its own 14 days with today live and pending', async () => {
    const { status, body } = await h.json<TrendsDto>(`/units/COY1/attendance/${AM}/trends`, { as: cdr1 });
    expect(status).toBe(200);
    expect(body.units).toHaveLength(1);
    expect(body.units[0]).toMatchObject({ unitId: 'COY1', onTime: 13, pending: 1 });
    const today = body.days[13]!;
    expect(today.counts).toMatchObject({ strength: 102, present: 86, unmarked: 10 });
    expect(body.days[0]!.counts.strength).toBe(102);
    expect(body.days.slice(0, 13).every((d) => d.unitsSubmitted === 1 && d.unitsTotal === 1)).toBe(true);
  });

  it('is limited to the commander\'s own unit; S1 can read any unit', async () => {
    expect((await h.request(`/units/COY1/attendance/${AM}/trends`, { as: cdr2 })).status).toBe(403);
    expect((await h.request(`/units/COY1/attendance/${AM}/trends`, { as: admin })).status).toBe(200);
  });
});
