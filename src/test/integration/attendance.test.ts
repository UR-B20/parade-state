/**
 * Attendance API on the demo battalion: events, derivation, marking, submission, date locks.
 * The demo clock is on (DEMO_CONTROLS=true), so "now" is Sun 6 Sep 2026 09:24 Singapore time.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDemoDataset, DEMO_DATE, type DemoDataset } from '@shared/demo/dataset';
import type { ApiErrorBody, EventsDto, MarkResultDto, SubmissionsDto, SubmitResultDto, UnitAttendanceDto } from '@shared/types';
import { loadDemoDataset } from '../../../seed/load';
import * as schema from '../../worker/db/schema';
import { createTestApp, type TestApp } from '../helpers/app';
import { createTestDb, type TestDb } from '../helpers/pglite';

let t: TestDb;
let api: TestApp;
let dataset: DemoDataset;
const userIds = new Map<string, string>();
let admin: string;
let coy1: string;
let coy2: string;
const AM = `${DEMO_DATE}-AM`;
const PM = `${DEMO_DATE}-PM`;

const personNamed = (name: string) => dataset.personnel.find((p) => p.name === name)!;
const attendance = (unit: string, event: string, as: string) => api.json<UnitAttendanceDto>('GET', `/units/${unit}/events/${event}/attendance`, { as });
const mark = (unit: string, event: string, personId: string, body: unknown, as: string) =>
  api.json<MarkResultDto & ApiErrorBody>('POST', `/units/${unit}/events/${event}/persons/${personId}/mark`, { as, body });

beforeAll(async () => {
  t = await createTestDb();
  api = createTestApp(t, { DEMO_CONTROLS: 'true' });
  dataset = await buildDemoDataset();
  for (const user of dataset.users) userIds.set(user.id, await t.createAuthUser(user.email));
  await loadDemoDataset(t.db, dataset, { userIds });
  admin = userIds.get(dataset.users[0]!.id)!;
  coy1 = userIds.get(dataset.users.find((u) => u.unitId === 'COY1')!.id)!;
  coy2 = userIds.get(dataset.users.find((u) => u.unitId === 'COY2')!.id)!;
});

afterAll(async () => {
  await t?.close();
});

describe('events', () => {
  it("lists today's parades with cutoffs from settings", async () => {
    const { status, body } = await api.json<EventsDto>('GET', `/events?date=${DEMO_DATE}`, { as: coy1 });
    expect(status).toBe(200);
    expect(body.date).toBe(DEMO_DATE);
    expect(body.events.map((e) => [e.id, e.label, e.cutoffAt])).toEqual([
      [AM, 'AM parade', '2026-09-06T02:00:00.000Z'],
      [PM, 'PM parade', '2026-09-06T06:00:00.000Z'],
    ]);
  });

  it('creates parades for a new date on first access, once', async () => {
    const first = await api.json<EventsDto>('GET', '/events?date=2026-09-07', { as: coy1 });
    const second = await api.json<EventsDto>('GET', '/events?date=2026-09-07', { as: coy1 });
    expect(first.body.events.map((e) => e.id)).toEqual(['2026-09-07-AM', '2026-09-07-PM']);
    expect(second.body.events).toEqual(first.body.events);
    const today = await api.json<EventsDto>('GET', '/events', { as: coy1 });
    expect(today.body.date).toBe(DEMO_DATE);
  });

  it('rejects bad or far-away dates', async () => {
    expect((await api.call('GET', '/events?date=2026-02-30', { as: coy1 })).status).toBe(400);
    expect((await api.call('GET', '/events?date=2030-01-01', { as: coy1 })).status).toBe(400);
  });
});

describe('unit attendance', () => {
  it('derives Coy 1 at the AM parade as in the brief', async () => {
    const { status, body } = await attendance('COY1', AM, coy1);
    expect(status).toBe(200);
    expect(body.unit.name).toBe('Coy 1');
    expect(body.event.id).toBe(AM);
    expect(body.counts).toMatchObject({ strength: 102, present: 96, absent: 6, mc: 2, ll: 1, ma: 1, rsi: 1, others: 1 });
    expect(body.persons).toHaveLength(102);
    expect(body.submission).toMatchObject({ kind: 'PENDING', lastChangedAt: '2026-09-06T01:21:00.000Z' });
    expect(body.changes).toEqual([]);
    expect(body.locked).toBe(false);
    expect(body.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const daniel = body.persons.find((p) => p.name === 'Daniel Tan')!;
    expect(daniel).toMatchObject({ status: 'MC', confirmed: true, startDate: '2026-09-05', endDate: '2026-09-08' });
  });

  it('shows submitted units with the latest version and no changes', async () => {
    const ssp = await attendance('SSP', AM, admin);
    expect(ssp.body.submission).toMatchObject({ kind: 'RESUBMITTED', version: 2, wasLate: false, hasChanges: false });
    const s2 = await attendance('S2', AM, admin);
    expect(s2.body.submission).toEqual({ kind: 'NOT_MARKED' });
  });

  it("refuses a commander another unit's attendance", async () => {
    const { status, body } = await attendance('COY1', AM, coy2);
    expect(status).toBe(403);
    expect((body as unknown as ApiErrorBody).error.code).toBe('FORBIDDEN');
  });

  it('resolves a parade id for a date nobody has opened yet', async () => {
    const { status, body } = await attendance('COY1', '2026-09-08-PM', coy1);
    expect(status).toBe(200);
    expect(body.event).toMatchObject({ id: '2026-09-08-PM', date: '2026-09-08', type: 'PM' });
    expect(body.submission).toEqual({ kind: 'NOT_MARKED' });
  });
});

describe('marking', () => {
  it('confirms a default Present', async () => {
    const before = await attendance('COY1', AM, coy1);
    const target = before.body.persons.find((p) => p.status === 'PRESENT' && !p.confirmed)!;
    const { status, body } = await mark('COY1', AM, target.personId, { action: 'PRESENT' }, coy1);
    expect(status).toBe(200);
    expect(body.person).toMatchObject({ personId: target.personId, status: 'PRESENT', confirmed: true });
    expect(body.counts.presentConfirmed).toBe(before.body.counts.presentConfirmed + 1);
    expect(body.counts.present).toBe(before.body.counts.present);
    expect(body.contentHash).toBe(before.body.contentHash);
    expect(body.submission).toMatchObject({ kind: 'PENDING', lastChangedAt: '2026-09-06T01:24:00.000Z' });
    expect(body.updatedAt).toBe('2026-09-06T01:24:00.000Z');
  });

  it('sets a multi-day MC and removes the person from Present', async () => {
    const amir = personNamed('Amir Rahman');
    const { status, body } = await mark(
      'COY1', AM, amir.id,
      { action: 'SET', status: 'MC', startDate: DEMO_DATE, endDate: '2026-09-08', remark: '  Fever  ' },
      coy1,
    );
    expect(status).toBe(200);
    expect(body.person).toMatchObject({ status: 'MC', confirmed: true, startDate: DEMO_DATE, endDate: '2026-09-08', remark: 'Fever' });
    expect(body.counts).toMatchObject({ mc: 3, present: 95, absent: 7 });
    // The same span shows on the PM parade and later days.
    const pm = await attendance('COY1', PM, coy1);
    expect(pm.body.persons.find((p) => p.personId === amir.id)!.status).toBe('MC');
    const later = await attendance('COY1', '2026-09-09-AM', coy1);
    expect(later.body.persons.find((p) => p.personId === amir.id)!.status).toBe('PRESENT');
  });

  it('validates the SET body', async () => {
    const ryan = personNamed('Ryan Lim');
    const cases: [unknown, RegExp][] = [
      [{ action: 'SET', status: 'MC', startDate: '2026-09-07', endDate: '2026-09-08' }, /include/],
      [{ action: 'SET', status: 'MC', startDate: '2026-09-05', endDate: '2026-09-04' }, /before/],
      [{ action: 'SET', status: 'OTHERS', startDate: DEMO_DATE, endDate: null }, /kind/],
      [{ action: 'SET', status: 'MC', subType: 'COURSE', startDate: DEMO_DATE, endDate: null }, /Others/],
      [{ action: 'SET', status: 'AWOL', startDate: DEMO_DATE, endDate: null }, /fields/],
      [{ action: 'SET', status: 'MC', startDate: 'tomorrow', endDate: null }, /fields/],
    ];
    for (const [body, pattern] of cases) {
      const res = await mark('COY1', AM, ryan.id, body, coy1);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.message, JSON.stringify(body)).toMatch(pattern);
    }
    const after = await attendance('COY1', AM, coy1);
    expect(after.body.persons.find((p) => p.personId === ryan.id)!.status).toBe('PRESENT');
  });

  it('pins RSI to the parade date whatever dates are sent', async () => {
    const ryan = personNamed('Ryan Lim');
    const { body } = await mark('COY1', AM, ryan.id, { action: 'SET', status: 'RSI', startDate: '2026-09-01', endDate: null }, coy1);
    expect(body.person).toMatchObject({ status: 'RSI', startDate: DEMO_DATE, endDate: DEMO_DATE });
  });

  it('lets Others carry a kind and an open end date', async () => {
    const ryan = personNamed('Ryan Lim');
    const { body } = await mark(
      'COY1', AM, ryan.id,
      { action: 'SET', status: 'OTHERS', subType: 'DUTY', startDate: DEMO_DATE, endDate: null, remark: 'Guard duty' },
      coy1,
    );
    expect(body.person).toMatchObject({ status: 'OTHERS', subType: 'DUTY', endDate: null, remark: 'Guard duty' });
    const spans = await t.db.select().from(schema.absenceSpans).where(and(eq(schema.absenceSpans.personId, ryan.id), isNull(schema.absenceSpans.supersededAt)));
    expect(spans).toHaveLength(1);
    expect(spans[0]!.status).toBe('OTHERS');
  });

  it('brings an MC person back to Present and keeps the earlier days as history', async () => {
    const daniel = personNamed('Daniel Tan');
    const { status, body } = await mark('COY1', AM, daniel.id, { action: 'BACK_TO_PRESENT' }, coy1);
    expect(status).toBe(200);
    expect(body.person).toMatchObject({ status: 'PRESENT', confirmed: true, spanId: null });
    const spans = await t.db.select().from(schema.absenceSpans).where(eq(schema.absenceSpans.personId, daniel.id));
    const active = spans.filter((s) => s.supersededAt === null);
    const superseded = spans.filter((s) => s.supersededAt !== null);
    expect(superseded).toHaveLength(1);
    expect(superseded[0]).toMatchObject({ startDate: '2026-09-05', endDate: '2026-09-08' });
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ status: 'MC', startDate: '2026-09-05', endDate: '2026-09-05', remark: 'Fever, Bedok Polyclinic' });
    const yesterday = await attendance('COY1', '2026-09-05-AM', admin);
    expect(yesterday.body.persons.find((p) => p.personId === daniel.id)!.status).toBe('MC');
  });

  it('refuses people outside the unit or off the roll', async () => {
    const other = dataset.personnel.find((p) => p.unitId === 'COY2')!;
    expect((await mark('COY1', AM, other.id, { action: 'PRESENT' }, coy1)).status).toBe(404);
    expect((await mark('COY2', AM, other.id, { action: 'PRESENT' }, coy1)).status).toBe(403);
    expect((await mark('COY1', AM, '00000000-0000-0000-0000-000000000000', { action: 'PRESENT' }, coy1)).status).toBe(404);
  });
});

describe('submission', () => {
  it('records version 1 and notifies S1', async () => {
    const before = await attendance('COY1', AM, coy1);
    const notesBefore = await t.db.select().from(schema.notifications);
    const { status, body } = await api.json<SubmitResultDto>('POST', '/units/COY1/events/' + AM + '/submit', { as: coy1, body: { contentHash: before.body.contentHash } });
    expect(status).toBe(201);
    expect(body.submission).toMatchObject({ unitId: 'COY1', eventId: AM, version: 1, submittedByName: 'Coy 1 commander', submittedAt: '2026-09-06T01:24:00.000Z' });
    expect(body.submission.counts).toEqual(before.body.counts);
    expect(body.attendance.submission).toMatchObject({ kind: 'SUBMITTED', version: 1, wasLate: false, hasChanges: false });
    expect(body.attendance.changes).toEqual([]);
    const notes = await t.db.select().from(schema.notifications);
    expect(notes).toHaveLength(notesBefore.length + 1);
    const note = notes.find((n) => n.submissionId === body.submission.id)!;
    expect(note).toMatchObject({ userId: admin, type: 'SUBMITTED', unitId: 'COY1', readAt: null });
    expect(note.message).toBe(`Coy 1 submitted AM parade · ${before.body.counts.present}/102 present`);
  });

  it('refuses to resubmit with no changes or with a stale hash', async () => {
    const same = await api.json<ApiErrorBody>('POST', `/units/COY1/events/${AM}/submit`, { as: coy1, body: {} });
    expect(same.status).toBe(409);
    expect(same.body.error.message).toMatch(/Nothing has changed/);
    const stale = await api.json<ApiErrorBody>('POST', `/units/COY1/events/${AM}/submit`, { as: coy1, body: { contentHash: 'f'.repeat(64) } });
    expect(stale.status).toBe(409);
    expect(stale.body.error.message).toMatch(/changed since you reviewed/);
  });

  it('shows the diff after a change and resubmits as version 2', async () => {
    const ryan = personNamed('Ryan Lim');
    const marked = await mark('COY1', AM, ryan.id, { action: 'BACK_TO_PRESENT' }, coy1);
    expect(marked.body.submission).toMatchObject({ kind: 'SUBMITTED', version: 1, hasChanges: true });
    expect(marked.body.changes).toEqual([
      expect.objectContaining({
        personId: ryan.id,
        before: expect.objectContaining({ status: 'OTHERS', subType: 'DUTY' }),
        after: expect.objectContaining({ status: 'PRESENT' }),
      }),
    ]);
    const { status, body } = await api.json<SubmitResultDto>('POST', `/units/COY1/events/${AM}/submit`, { as: coy1, body: {} });
    expect(status).toBe(201);
    expect(body.submission.version).toBe(2);
    expect(body.attendance.submission).toMatchObject({ kind: 'RESUBMITTED', version: 2, hasChanges: false });
    const history = await api.json<SubmissionsDto>('GET', `/units/COY1/events/${AM}/submissions`, { as: coy1 });
    expect(history.body.submissions.map((s) => s.version)).toEqual([2, 1]);
    expect((await api.call('GET', `/units/COY1/events/${AM}/submissions`, { as: coy2 })).status).toBe(403);
  });

  it('marks a submission made after cutoff as late', async () => {
    await t.db.update(schema.settings).set({ demoNow: new Date('2026-09-06T02:30:00.000Z') });
    try {
      const s2 = await attendance('S2', AM, admin);
      expect(s2.body.submission).toEqual({ kind: 'LATE', hasActivity: false, lastChangedAt: null });
      const coy1Pm = await attendance('COY1', PM, coy1);
      expect(coy1Pm.body.submission.kind).toBe('NOT_MARKED');
      const { body } = await api.json<SubmitResultDto>('POST', `/units/S2/events/${AM}/submit`, { as: admin, body: {} });
      expect(body.attendance.submission).toMatchObject({ kind: 'SUBMITTED', version: 1, wasLate: true });
    } finally {
      await t.db.update(schema.settings).set({ demoNow: new Date(dataset.now) });
    }
  });
});

describe('date lock', () => {
  const yesterday = '2026-09-05-AM';

  it('locks past dates for commanders but never for S1', async () => {
    const daniel = personNamed('Daniel Tan');
    const view = await attendance('COY1', yesterday, coy1);
    expect(view.body.locked).toBe(true);
    const asCommander = await mark('COY1', yesterday, daniel.id, { action: 'PRESENT' }, coy1);
    expect(asCommander.status).toBe(403);
    expect(asCommander.body.error.code).toBe('DATE_LOCKED');
    const submit = await api.json<ApiErrorBody>('POST', `/units/COY1/events/${yesterday}/submit`, { as: coy1, body: {} });
    expect(submit.body.error.code).toBe('DATE_LOCKED');
    const asAdmin = await mark('COY1', yesterday, daniel.id, { action: 'PRESENT' }, admin);
    expect(asAdmin.status).toBe(200);
    expect((await attendance('COY1', yesterday, admin)).body.locked).toBe(false);
  });

  it('opens a past date while an S1 unlock is in force', async () => {
    const daniel = personNamed('Daniel Tan');
    await t.db.insert(schema.dateUnlocks).values({ date: '2026-09-05', unlockedBy: admin, expiresAt: new Date('2026-09-06T03:00:00.000Z') });
    expect((await attendance('COY1', yesterday, coy1)).body.locked).toBe(false);
    expect((await mark('COY1', yesterday, daniel.id, { action: 'PRESENT' }, coy1)).status).toBe(200);
    await t.db.update(schema.dateUnlocks).set({ expiresAt: new Date('2026-09-06T01:00:00.000Z') });
    expect((await attendance('COY1', yesterday, coy1)).body.locked).toBe(true);
    expect((await mark('COY1', yesterday, daniel.id, { action: 'PRESENT' }, coy1)).status).toBe(403);
  });

  it('keeps future dates open', async () => {
    const daniel = personNamed('Daniel Tan');
    expect((await mark('COY1', '2026-09-07-AM', daniel.id, { action: 'PRESENT' }, coy1)).status).toBe(200);
  });
});
