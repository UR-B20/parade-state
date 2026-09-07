import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness';
import { runScheduled } from '../../worker/scheduled';
import type { NotificationsDto, PersonDto, SubmissionDto, UnitAttendanceDto } from '@shared/types';

let h: Harness;
let admin: string;
let admin2: string;
let cdr1: string;
let cdr2: string;
let daniel: string;
const AM = '2026-09-06-AM';

beforeAll(async () => {
  h = await createHarness({ DEMO_CONTROLS: 'true' } as never);
  admin = await h.seedUser({ email: 's1@bn.sg', role: 'ADMIN', displayName: 'CPT Ong' });
  admin2 = await h.seedUser({ email: 's1b@bn.sg', role: 'ADMIN', displayName: 'LTA Koh' });
  cdr1 = await h.seedUser({ email: 'cdr.coy1@bn.sg', role: 'COMMANDER', unitId: 'COY1', displayName: 'MAJ Lim' });
  cdr2 = await h.seedUser({ email: 'cdr.coy2@bn.sg', role: 'COMMANDER', unitId: 'COY2' });
  const p = await h.json<PersonDto>('/units/COY1/personnel', { method: 'POST', as: cdr1, json: { rank: 'CPL', name: 'Daniel Tan', postedInDate: '2026-01-01' } });
  daniel = p.body.id;
  await h.json('/units/COY1/personnel', { method: 'POST', as: cdr1, json: { rank: 'LCP', name: 'Amir Rahman', postedInDate: '2026-01-01' } });
  await h.json('/units/COY2/personnel', { method: 'POST', as: cdr2, json: { rank: 'PTE', name: 'Someone', postedInDate: '2026-01-01' } });
});
afterAll(async () => { await h.close(); });

const attendance = () => h.json<UnitAttendanceDto>(`/units/COY1/attendance/${AM}`, { as: cdr1 });
const submitCoy1 = () => h.json<SubmissionDto>(`/units/COY1/submissions/${AM}`, { method: 'POST', as: cdr1 });
const notifs = (as = admin) => h.json<NotificationsDto>('/notifications', { as });

describe('submissions', () => {
  it('only the unit commander can submit', async () => {
    expect((await h.request(`/units/COY1/submissions/${AM}`, { method: 'POST', as: cdr2 })).status).toBe(403);
    expect((await h.request(`/units/COY1/submissions/${AM}`, { method: 'POST', as: admin })).status).toBe(403);
  });

  it('refuses to submit while anyone is unmarked', async () => {
    await h.json(`/units/COY1/attendance/${AM}/persons/${daniel}`, { method: 'PUT', as: cdr1, json: { action: 'SET', status: 'MC', startDate: '2026-09-06', endDate: '2026-09-08' } });
    const res = await h.json<{ error: { code: string; message: string } }>(`/units/COY1/submissions/${AM}`, { method: 'POST', as: cdr1 });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/1 person is not yet marked/);
  });

  it('submits v1 with a snapshot and notifies every active admin', async () => {
    await h.json(`/units/COY1/attendance/${AM}/mark-remaining-present`, { method: 'POST', as: cdr1 });
    const res = await submitCoy1();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ version: 1, submittedByName: 'MAJ Lim', counts: { strength: 2, present: 1, mc: 1 } });
    expect(res.body.submittedAt).toBe(h.clock.now.toISOString());
    const view = await attendance();
    expect(view.body.submission).toMatchObject({ kind: 'SUBMITTED', version: 1, hasChanges: false, wasLate: false });
    for (const who of [admin, admin2]) {
      const n = await notifs(who);
      expect(n.body.unreadCount).toBe(1);
      expect(n.body.items[0]).toMatchObject({ type: 'SUBMITTED', unitName: 'Coy 1', message: 'Coy 1 submitted AM parade · 1/2 present' });
    }
    expect((await notifs(cdr1)).status).toBe(403);
  });

  it('refuses to resubmit when nothing changed', async () => {
    const res = await h.json<{ error: { code: string } }>(`/units/COY1/submissions/${AM}`, { method: 'POST', as: cdr1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('shows changes since submission and resubmits as v2 with an amber notification', async () => {
    await h.json(`/units/COY1/attendance/${AM}/persons/${daniel}`, { method: 'PUT', as: cdr1, json: { action: 'BACK_TO_PRESENT' } });
    const view = await attendance();
    expect(view.body.submission).toMatchObject({ kind: 'SUBMITTED', hasChanges: true });
    expect(view.body.changes).toEqual([expect.objectContaining({ name: 'Daniel Tan', before: expect.objectContaining({ status: 'MC' }), after: expect.objectContaining({ status: 'PRESENT' }) })]);
    const res = await submitCoy1();
    expect(res.body.version).toBe(2);
    expect((await attendance()).body.submission).toMatchObject({ kind: 'RESUBMITTED', version: 2, hasChanges: false });
    const n = await notifs();
    expect(n.body.items.find((i) => i.type === 'RESUBMITTED')).toMatchObject({ message: 'Coy 1 resubmitted (v2) AM parade · 2/2 present' });
    const history = await h.json<SubmissionDto[]>(`/units/COY1/submissions/${AM}`, { as: admin });
    expect(history.body.map((s) => s.version)).toEqual([2, 1]);
  });

  it('re-marking an already Present person is not a change', async () => {
    const amir = (await attendance()).body.persons.find((p) => p.name === 'Amir Rahman')!;
    await h.json(`/units/COY1/attendance/${AM}/persons/${amir.personId}`, { method: 'PUT', as: cdr1, json: { action: 'PRESENT' } });
    expect((await attendance()).body.submission).toMatchObject({ hasChanges: false });
  });

  it('an ad hoc event is pre-filled from the last submitted parade state', async () => {
    // Coy 1 last submitted v2: Daniel Present (Back to Present), Amir Present. Give Daniel a new MC afterwards.
    await h.json(`/units/COY1/attendance/${AM}/persons/${daniel}`, { method: 'PUT', as: cdr1, json: { action: 'SET', status: 'MC', startDate: '2026-09-06', endDate: '2026-09-09' } });
    const created = await h.json<{ id: string }>('/events', { method: 'POST', as: admin, json: { date: '2026-09-06', name: 'Route march', cutoffTime: '16:00' } });
    expect(created.status).toBe(201);
    const view = await h.json<UnitAttendanceDto>(`/units/COY1/attendance/${created.body.id}`, { as: cdr1 });
    const byName = Object.fromEntries(view.body.persons.map((p) => [p.name, p.status]));
    // Amir was submitted Present -> pre-filled Present. Daniel's new MC covers the day, so the span wins.
    expect(byName).toEqual({ 'Amir Rahman': 'PRESENT', 'Daniel Tan': 'MC' });
    expect(view.body.submission.kind).toBe('NOT_MARKED');
    // Coy 2 never submitted, so nothing is pre-filled there.
    const coy2 = await h.json<UnitAttendanceDto>(`/units/COY2/attendance/${created.body.id}`, { as: cdr2 });
    expect(coy2.body.counts).toMatchObject({ unmarked: 1, present: 0 });
  });

  it('marks and reads notifications', async () => {
    const before = await notifs();
    expect(before.body.unreadCount).toBe(2);
    await h.json('/notifications/read', { method: 'POST', as: admin, json: { ids: [before.body.items[0]!.id] } });
    expect((await notifs()).body.unreadCount).toBe(1);
    await h.json('/notifications/read', { method: 'POST', as: admin, json: { all: true } });
    expect((await notifs()).body.unreadCount).toBe(0);
    expect((await h.json<NotificationsDto>('/notifications?unreadOnly=1', { as: admin })).body.items).toHaveLength(0);
    // The other admin's notifications are untouched.
    expect((await notifs(admin2)).body.unreadCount).toBe(2);
  });
});

describe('late notifications', () => {
  it('does nothing before cut-off and creates one Late per unit per admin after it, idempotently', async () => {
    const deps = { getDb: () => ({ db: h.db, close: async () => undefined }), verifyToken: async () => ({ sub: '', email: null }), authAdmin: () => h.auth, now: () => h.clock.now };
    expect((await runScheduled(h.env, deps)).lateNotifications).toBe(0);
    // Move the demo clock past the AM cut-off (10:05 SGT).
    await h.json('/admin/demo-clock', { method: 'PUT', as: admin, json: { now: '2026-09-06T02:05:00.000Z' } });
    const first = await runScheduled(h.env, deps);
    expect(first).toEqual({ date: '2026-09-06', lateNotifications: 8 * 2 }); // 8 units without a submission x 2 admins (9 units, Coy 1 submitted)
    const second = await runScheduled(h.env, deps);
    expect(second.lateNotifications).toBe(0);
    const n = await notifs();
    const late = n.body.items.filter((i) => i.type === 'LATE');
    expect(late).toHaveLength(8);
    expect(late.some((i) => i.unitName === 'Coy 1')).toBe(false);
    expect(late.find((i) => i.unitName === 'S2')?.message).toBe('S2 has not submitted AM parade · cut-off 10:00');
    const coy2 = await h.json<UnitAttendanceDto>(`/units/COY2/attendance/${AM}`, { as: cdr2 });
    expect(coy2.body.submission.kind).toBe('LATE');
    // A submission after cut-off is recorded as late but still counts. Real time, not the demo clock, stamps it.
    h.clock.now = new Date('2026-09-06T02:10:00.000Z');
    await h.json(`/units/COY2/attendance/${AM}/mark-remaining-present`, { method: 'POST', as: cdr2 });
    const lateSub = await h.json<SubmissionDto>(`/units/COY2/submissions/${AM}`, { method: 'POST', as: cdr2 });
    expect(lateSub.status).toBe(201);
    expect((await h.json<UnitAttendanceDto>(`/units/COY2/attendance/${AM}`, { as: cdr2 })).body.submission).toMatchObject({ kind: 'SUBMITTED', wasLate: true });
  });
});
