import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDemoDataset, type DemoDataset } from '@shared/demo/dataset';
import { insertDemoData } from '../../worker/db/seedDemo';
import { createHarness, type Harness } from './harness';
import type { BattalionSummaryDto, PersonDto, PlatoonDto, UnitAttendanceDto, UnitDto } from '@shared/types';

let h: Harness;
let data: DemoDataset;
let admin: string;
let cdr1: string;
let cdrS1: string;
const AM = '2026-09-06-AM';

beforeAll(async () => {
  h = await createHarness({ DEMO_CONTROLS: 'true' } as never);
  data = await buildDemoDataset();
  await insertDemoData(h.db, data, new Map(data.users.map((u) => [u.id, u.id])));
  admin = data.users.find((u) => u.role === 'ADMIN')!.id;
  cdr1 = data.users.find((u) => u.unitId === 'COY1')!.id;
  cdrS1 = data.users.find((u) => u.unitId === 'S1')!.id;
});
afterAll(async () => { await h.close(); });

describe('platoons', () => {
  it('companies list their platoons; staff units have none', async () => {
    const { body } = await h.json<UnitDto[]>('/units', { as: cdr1 });
    expect(body.find((u) => u.id === 'COY1')!.platoons.map((p) => p.name)).toEqual(['Coy HQ', 'Platoon 1', 'Platoon 2', 'Platoon 3']);
    expect(body.find((u) => u.id === 'ISR')!.platoons).toHaveLength(3);
    expect(body.find((u) => u.id === 'S1')!.platoons).toEqual([]);
  });

  it('unit attendance carries a per-platoon breakdown that sums to the unit', async () => {
    const { body } = await h.json<UnitAttendanceDto>(`/units/COY1/attendance/${AM}`, { as: cdr1 });
    expect(body.platoons.map((p) => p.platoon?.name)).toEqual(['Coy HQ', 'Platoon 1', 'Platoon 2', 'Platoon 3']);
    const sum = body.platoons.reduce((n, p) => n + p.counts.strength, 0);
    expect(sum).toBe(body.counts.strength);
    expect(body.platoons.every((p) => p.counts.strength > 0)).toBe(true);
    const daniel = body.persons.find((p) => p.name === 'Daniel Tan')!;
    expect(daniel.platoonId).toBe('COY1-P1');
    const s1 = await h.json<UnitAttendanceDto>(`/units/S1/attendance/${AM}`, { as: cdrS1 });
    expect(s1.body.platoons).toEqual([]);
  });

  it('the battalion summary includes platoon counts for companies', async () => {
    const { body } = await h.json<BattalionSummaryDto>(`/admin/summary/${AM}`, { as: admin });
    const coy2 = body.units.find((u) => u.unit.id === 'COY2')!;
    expect(coy2.platoons).toHaveLength(4);
    expect(coy2.platoons.reduce((n, p) => n + p.counts.present, 0)).toBe(coy2.counts.present);
    expect(body.units.find((u) => u.unit.id === 'S2')!.platoons).toEqual([]);
  });

  it('assigns personnel to a platoon of their own unit only', async () => {
    const created = await h.json<PersonDto>('/units/COY1/personnel', { method: 'POST', as: cdr1, json: { rank: 'PTE', name: 'New Recruit', platoonId: 'COY1-P2', postedInDate: '2026-09-01' } });
    expect(created.status).toBe(201);
    expect(created.body.platoonId).toBe('COY1-P2');
    const wrongUnit = await h.json('/units/COY1/personnel', { method: 'POST', as: cdr1, json: { rank: 'PTE', name: 'Wrong Platoon', platoonId: 'COY2-P1' } });
    expect(wrongUnit.status).toBe(400);
    const moved = await h.json<PersonDto>(`/units/COY1/personnel/${created.body.id}`, { method: 'PATCH', as: cdr1, json: { platoonId: 'COY1-HQ' } });
    expect(moved.body.platoonId).toBe('COY1-HQ');
    const view = await h.json<UnitAttendanceDto>(`/units/COY1/attendance/${AM}`, { as: cdr1 });
    expect(view.body.platoons.find((p) => p.platoon?.id === 'COY1-HQ')!.counts.unmarked).toBeGreaterThan(0);
  });

  it('S1 manages platoons: add, rename, and remove only when empty', async () => {
    expect((await h.request('/admin/units/ISR/platoons', { method: 'POST', as: cdr1, json: { name: 'Platoon 3' } })).status).toBe(403);
    const added = await h.json<PlatoonDto>('/admin/units/ISR/platoons', { method: 'POST', as: admin, json: { name: 'Platoon 3' } });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ unitId: 'ISR', name: 'Platoon 3', sortOrder: 3 });
    expect((await h.json('/admin/units/ISR/platoons', { method: 'POST', as: admin, json: { name: 'platoon 3' } })).status).toBe(409);
    const renamed = await h.json<PlatoonDto>(`/admin/platoons/${added.body.id}`, { method: 'PATCH', as: admin, json: { name: 'Recce Platoon' } });
    expect(renamed.body.name).toBe('Recce Platoon');
    expect((await h.json('/admin/platoons/ISR-P1', { method: 'DELETE', as: admin })).status).toBe(409);
    expect((await h.json(`/admin/platoons/${added.body.id}`, { method: 'DELETE', as: admin })).status).toBe(200);
    const units = await h.json<UnitDto[]>('/units', { as: admin });
    expect(units.body.find((u) => u.id === 'ISR')!.platoons).toHaveLength(3);
  });
});
