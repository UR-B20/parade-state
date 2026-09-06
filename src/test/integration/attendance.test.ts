import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness';
import type { EventDto, MarkResultDto, PersonDto, SettingsDto, UnitAttendanceDto } from '@shared/types';

let h: Harness;
let admin: string;
let cdr1: string;
let cdr2: string;
const AM = '2026-09-06-AM';
const PM = '2026-09-06-PM';
const people: Record<string, PersonDto> = {};

beforeAll(async () => {
  h = await createHarness({ DEMO_CONTROLS: 'true' } as never);
  admin = await h.seedUser({ email: 's1@bn.sg', role: 'ADMIN' });
  cdr1 = await h.seedUser({ email: 'cdr.coy1@bn.sg', role: 'COMMANDER', unitId: 'COY1' });
  cdr2 = await h.seedUser({ email: 'cdr.coy2@bn.sg', role: 'COMMANDER', unitId: 'COY2' });
  for (const [rank, name] of [['CPL', 'Daniel Tan'], ['LCP', 'Amir Rahman'], ['3SG', 'Ryan Lim']] as const) {
    const res = await h.json<PersonDto>('/units/COY1/personnel', { method: 'POST', as: cdr1, json: { rank, name, postedInDate: '2026-01-01' } });
    expect(res.status).toBe(201);
    people[name] = res.body;
  }
});
afterAll(async () => { await h.close(); });

const attendance = (eventId: string, as = cdr1) => h.json<UnitAttendanceDto>(`/units/COY1/attendance/${eventId}`, { as });
const mark = (eventId: string, personId: string, json: unknown, as = cdr1) => h.json<MarkResultDto>(`/units/COY1/attendance/${eventId}/persons/${personId}`, { method: 'PUT', as, json });
const statusOf = (dto: UnitAttendanceDto, name: string) => dto.persons.find((p) => p.name === name)!;

describe('events', () => {
  it('creates AM and PM parades for a date on first request, with cut-offs from settings', async () => {
    const { status, body } = await h.json<EventDto[]>('/events?date=2026-09-06', { as: cdr1 });
    expect(status).toBe(200);
    expect(body.map((e) => e.id)).toEqual([AM, PM]);
    expect(body[0]!.cutoffAt).toBe('2026-09-06T02:00:00.000Z');
    expect(body[1]!.cutoffAt).toBe('2026-09-06T06:00:00.000Z');
  });

  it('lets only S1 create ad hoc events', async () => {
    expect((await h.request('/events', { method: 'POST', as: cdr1, json: { date: '2026-09-06', name: 'Route march', cutoffTime: '15:00' } })).status).toBe(403);
    const created = await h.json<EventDto>('/events', { method: 'POST', as: admin, json: { date: '2026-09-06', name: 'Route march', cutoffTime: '15:00' } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ type: 'ADHOC', label: 'Route march', cutoffAt: '2026-09-06T07:00:00.000Z' });
    const list = await h.json<EventDto[]>('/events?date=2026-09-06', { as: admin });
    expect(list.body).toHaveLength(3);
  });
});

describe('roll', () => {
  it('scopes commanders to their own unit and lets S1 read any', async () => {
    expect((await h.request('/units/COY1/personnel', { as: cdr2 })).status).toBe(403);
    expect((await h.request('/units/COY1/personnel', { as: admin })).status).toBe(200);
    const mine = await h.json<PersonDto[]>('/units/COY1/personnel', { as: cdr1 });
    expect(mine.body.map((p) => p.name)).toEqual(['Ryan Lim', 'Daniel Tan', 'Amir Rahman']);
  });

  it('validates new personnel', async () => {
    const bad = await h.json<{ error: { details: { fields: Record<string, string> } } }>('/units/COY1/personnel', { method: 'POST', as: cdr1, json: { rank: 'GENERAL', name: 'X' } });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details.fields).sort()).toEqual(['name', 'rank']);
  });

  it('posts personnel out and hides them from the active roll and from attendance', async () => {
    const tmp = await h.json<PersonDto>('/units/COY1/personnel', { method: 'POST', as: cdr1, json: { rank: 'PTE', name: 'Leaving Soon', postedInDate: '2026-01-01' } });
    const out = await h.json<PersonDto>(`/units/COY1/personnel/${tmp.body.id}`, { method: 'PATCH', as: cdr1, json: { postedOutDate: '2026-09-01' } });
    expect(out.body.postedOutDate).toBe('2026-09-01');
    expect((await h.json<PersonDto[]>('/units/COY1/personnel', { as: cdr1 })).body.some((p) => p.id === tmp.body.id)).toBe(false);
    expect((await h.json<PersonDto[]>('/units/COY1/personnel?includeInactive=1', { as: cdr1 })).body.some((p) => p.id === tmp.body.id)).toBe(true);
    expect((await attendance(AM)).body.persons.some((p) => p.personId === tmp.body.id)).toBe(false);
    expect((await mark(AM, tmp.body.id, { action: 'PRESENT' })).status).toBe(400);
    const badDate = await h.json(`/units/COY1/personnel/${tmp.body.id}`, { method: 'PATCH', as: cdr1, json: { postedOutDate: '2025-12-01' } });
    expect(badDate.status).toBe(400);
  });
});

describe('attendance', () => {
  it('starts with everyone unmarked and no activity', async () => {
    const { status, body } = await attendance(AM);
    expect(status).toBe(200);
    expect(body.counts).toMatchObject({ strength: 3, present: 0, unmarked: 3, absent: 0 });
    expect(body.submission).toEqual({ kind: 'NOT_MARKED' });
    expect(body.updatedAt).toBeNull();
    expect(body.locked).toBe(false);
  });

  it('a multi-day MC covers AM, PM and the following days', async () => {
    const daniel = people['Daniel Tan']!.id;
    const res = await mark(AM, daniel, { action: 'SET', status: 'MC', startDate: '2026-09-06', endDate: '2026-09-08', remark: ' Fever ' });
    expect(res.status).toBe(200);
    expect(res.body.person).toMatchObject({ status: 'MC', endDate: '2026-09-08', remark: 'Fever' });
    expect(res.body.counts).toMatchObject({ present: 0, unmarked: 2, mc: 1, absent: 1 });
    expect(res.body.submission.kind).toBe('PENDING');
    expect(statusOf((await attendance(PM)).body, 'Daniel Tan').status).toBe('MC');
    expect(statusOf((await attendance('2026-09-08-AM')).body, 'Daniel Tan').status).toBe('MC');
    expect(statusOf((await attendance('2026-09-09-AM')).body, 'Daniel Tan').status).toBe('UNMARKED');
  });

  it('PRESENT marks this event only; the MC keeps running', async () => {
    const daniel = people['Daniel Tan']!.id;
    const res = await mark(AM, daniel, { action: 'PRESENT' });
    expect(res.body.person).toMatchObject({ status: 'PRESENT' });
    expect(statusOf((await attendance(PM)).body, 'Daniel Tan').status).toBe('MC');
  });

  it('setting a new absence removes the confirmed-present mark inside its range', async () => {
    const daniel = people['Daniel Tan']!.id;
    await mark(AM, daniel, { action: 'SET', status: 'LL', startDate: '2026-09-06', endDate: '2026-09-07' });
    expect(statusOf((await attendance(AM)).body, 'Daniel Tan').status).toBe('LL');
    // The earlier MC was truncated to nothing (it started today), so the 8th is unmarked again.
    expect(statusOf((await attendance('2026-09-08-AM')).body, 'Daniel Tan').status).toBe('UNMARKED');
  });

  it('BACK_TO_PRESENT ends the absence from today and confirms Present', async () => {
    const daniel = people['Daniel Tan']!.id;
    const res = await mark(PM, daniel, { action: 'BACK_TO_PRESENT' });
    expect(res.body.person).toMatchObject({ status: 'PRESENT' });
    // The LL started today, so ending it from today removes it entirely: AM falls back to unmarked.
    expect(statusOf((await attendance(AM)).body, 'Daniel Tan')).toMatchObject({ status: 'UNMARKED' });
    expect(statusOf((await attendance(PM)).body, 'Daniel Tan')).toMatchObject({ status: 'PRESENT' });
  });

  it('RSI applies to the day only', async () => {
    const amir = people['Amir Rahman']!.id;
    const res = await mark(AM, amir, { action: 'SET', status: 'RSI', startDate: '2026-09-01', endDate: null });
    expect(res.body.person).toMatchObject({ status: 'RSI', startDate: '2026-09-06', endDate: '2026-09-06' });
    expect(statusOf((await attendance(PM)).body, 'Amir Rahman').status).toBe('RSI');
    expect(statusOf((await attendance('2026-09-07-AM')).body, 'Amir Rahman').status).toBe('UNMARKED');
  });

  it('marks everyone still unmarked as Present in one call, leaving absences alone', async () => {
    const before = (await attendance(AM)).body;
    expect(before.counts.unmarked).toBeGreaterThan(0);
    const res = await h.json<UnitAttendanceDto>(`/units/COY1/attendance/${AM}/mark-remaining-present`, { method: 'POST', as: cdr1 });
    expect(res.status).toBe(200);
    expect(res.body.counts.unmarked).toBe(0);
    expect(statusOf(res.body, 'Amir Rahman').status).toBe('RSI');
    expect(statusOf(res.body, 'Ryan Lim').status).toBe('PRESENT');
    expect((await h.request(`/units/COY1/attendance/${AM}/mark-remaining-present`, { method: 'POST', as: admin })).status).toBe(403);
  });

  it('validates mark bodies', async () => {
    const ryan = people['Ryan Lim']!.id;
    expect((await mark(AM, ryan, { action: 'SET', status: 'OTHERS', startDate: '2026-09-06', endDate: null })).status).toBe(400);
    expect((await mark(AM, ryan, { action: 'SET', status: 'MC', startDate: '2026-09-06', endDate: '2026-09-05' })).status).toBe(400);
    expect((await mark(AM, ryan, { action: 'DANCE' })).status).toBe(400);
  });

  it('enforces roles: other commanders and S1 cannot mark', async () => {
    const ryan = people['Ryan Lim']!.id;
    expect((await mark(AM, ryan, { action: 'PRESENT' }, cdr2)).status).toBe(403);
    expect((await mark(AM, ryan, { action: 'PRESENT' }, admin)).status).toBe(403);
    expect((await attendance(AM, admin)).status).toBe(200);
  });

  it('locks past dates for commanders until S1 unlocks them', async () => {
    const ryan = people['Ryan Lim']!.id;
    const pastAm = '2026-09-05-AM';
    const view = await attendance(pastAm);
    expect(view.body.locked).toBe(true);
    const locked = await h.json<{ error: { code: string } }>(`/units/COY1/attendance/${pastAm}/persons/${ryan}`, { method: 'PUT', as: cdr1, json: { action: 'PRESENT' } });
    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe('DATE_LOCKED');
    expect((await h.request('/admin/date-unlocks/2026-09-05', { method: 'POST', as: cdr1 })).status).toBe(403);
    expect((await h.json('/admin/date-unlocks/2026-09-06', { method: 'POST', as: admin })).status).toBe(400);
    const unlocked = await h.json<SettingsDto>('/admin/date-unlocks/2026-09-05', { method: 'POST', as: admin });
    expect(unlocked.body.dateUnlocks.map((u) => u.date)).toEqual(['2026-09-05']);
    expect((await attendance(pastAm)).body.locked).toBe(false);
    expect((await mark(pastAm, ryan, { action: 'PRESENT' })).status).toBe(200);
    await h.request('/admin/date-unlocks/2026-09-05', { method: 'DELETE', as: admin });
    expect((await attendance(pastAm)).body.locked).toBe(true);
  });
});

describe('settings and demo clock', () => {
  it('updates cut-offs and applies them to newly created dates', async () => {
    const res = await h.json<SettingsDto>('/admin/settings', { method: 'PUT', as: admin, json: { cutoffAm: '09:30' } });
    expect(res.body.cutoffAm).toBe('09:30');
    const list = await h.json<EventDto[]>('/events?date=2026-10-01', { as: admin });
    expect(list.body[0]!.cutoffAt).toBe('2026-10-01T01:30:00.000Z');
    expect((await h.json('/admin/settings', { method: 'PUT', as: admin, json: { cutoffPm: '25:00' } })).status).toBe(400);
  });

  it('moves the demo clock, which flips units to Late after cut-off without touching real timestamps', async () => {
    await h.json('/admin/demo-clock', { method: 'PUT', as: admin, json: { now: '2026-09-06T02:05:00.000Z' } });
    const dto = (await attendance(AM)).body;
    expect(dto.submission.kind).toBe('LATE');
    expect(dto.updatedAt).toBe(h.clock.now.toISOString());
    await h.json('/admin/demo-clock', { method: 'PUT', as: admin, json: { now: null } });
    expect((await attendance(AM)).body.submission.kind).toBe('PENDING');
  });
});
