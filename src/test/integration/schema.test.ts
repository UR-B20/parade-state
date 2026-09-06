/**
 * M1 exit check: the real migrations apply to a fresh Postgres, the demo dataset loads through
 * the seed path, and deriving attendance from the stored rows reproduces the brief's numbers.
 */
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDemoDataset, DEMO_UNITS, type DemoDataset } from '@shared/demo/dataset';
import { contentHash, effectiveStatuses, sumCounts, unitCounts } from '@shared/domain';
import type { UnitCounts, UnitId } from '@shared/types';
import { loadDemoDataset, resetAppData } from '../../../seed/load';
import * as schema from '../../worker/db/schema';
import { createTestDb, type TestDb } from '../helpers/pglite';

const BRIEF_TOTALS: UnitCounts = {
  strength: 312, present: 287, presentConfirmed: 242, presentDefault: 45,
  mc: 9, ll: 5, ma: 4, rsi: 3, others: 4, absent: 25,
};

let t: TestDb;
let dataset: DemoDataset;

/** Drizzle wraps database errors; match against the Postgres message and constraint name too. */
async function expectDbError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await promise;
  } catch (err) {
    const cause = (err as { cause?: { message?: string; constraint?: string } }).cause;
    const text = [String(err), cause?.message, cause?.constraint].filter(Boolean).join('\n');
    expect(text).toMatch(pattern);
    return;
  }
  throw new Error(`Expected a database error matching ${pattern}`);
}
const userIds = new Map<string, string>();

beforeAll(async () => {
  t = await createTestDb();
  dataset = await buildDemoDataset();
  for (const user of dataset.users) userIds.set(user.id, await t.createAuthUser(user.email));
  await loadDemoDataset(t.db, dataset, { userIds });
});

afterAll(async () => {
  await t?.close();
});

/** Derive one unit's attendance from stored rows the way the API will. */
async function storedCounts(unitId: UnitId, eventId: string) {
  const people = await t.db.select().from(schema.personnel).where(eq(schema.personnel.unitId, unitId));
  const spans = await t.db
    .select()
    .from(schema.absenceSpans)
    .where(and(eq(schema.absenceSpans.unitId, unitId), isNull(schema.absenceSpans.supersededAt)));
  const marks = await t.db
    .select({ personId: schema.presentMarks.personId })
    .from(schema.presentMarks)
    .where(and(eq(schema.presentMarks.unitId, unitId), eq(schema.presentMarks.eventId, eventId)));
  const statuses = effectiveStatuses(
    people,
    spans.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
    new Set(marks.map((m) => m.personId)),
    dataset.date,
  );
  return { statuses, counts: unitCounts(statuses) };
}

describe('migrations', () => {
  it('apply both migration files', async () => {
    const rows = await t.client.query<{ count: string }>('select count(*)::text as count from drizzle.__drizzle_migrations');
    expect(rows.rows[0]!.count).toBe('2');
  });

  it('enable row level security on every application table', async () => {
    const rows = await t.client.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by c.relname`,
    );
    expect(rows.rows.length).toBe(11);
    expect(rows.rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it('create the settings row', async () => {
    const [row] = await t.db.select().from(schema.settings);
    expect(row).toMatchObject({ id: 1, cutoffAm: '10:00', cutoffPm: '14:00' });
  });
});

describe('demo seed', () => {
  it('loads every row of the dataset', async () => {
    const rows = await t.client.query<{ personnel: string; spans: string; marks: string; subs: string; notes: string; profiles: string }>(
      `select (select count(*) from personnel)::text as personnel,
              (select count(*) from absence_spans)::text as spans,
              (select count(*) from present_marks)::text as marks,
              (select count(*) from submissions)::text as subs,
              (select count(*) from notifications)::text as notes,
              (select count(*) from profiles)::text as profiles`,
    );
    expect(rows.rows[0]).toEqual({
      personnel: String(dataset.personnel.length),
      spans: String(dataset.spans.length),
      marks: String(dataset.marks.length),
      subs: String(dataset.submissions.length),
      notes: String(dataset.notifications.length),
      profiles: String(dataset.users.length),
    });
  });

  it('reproduces the brief from stored rows: 312 strength, 287 present, 25 absent', async () => {
    const am = dataset.events[0]!;
    const perUnit = await Promise.all(DEMO_UNITS.map((u) => storedCounts(u.id, am.id)));
    expect(sumCounts(perUnit.map((p) => p.counts))).toEqual(BRIEF_TOTALS);

    // Coy 1 carries the five named rows from the brief with their statuses.
    const coy1 = perUnit[DEMO_UNITS.findIndex((u) => u.id === 'COY1')]!;
    const byName = new Map(coy1.statuses.map((s) => [s.name, s]));
    expect(byName.get('Daniel Tan')).toMatchObject({ rank: 'CPL', status: 'MC', remark: 'Fever, Bedok Polyclinic' });
    expect(byName.get('Ethan Goh')).toMatchObject({ rank: 'PTE', status: 'OTHERS', subType: 'COURSE' });
    expect(byName.get('Marcus Lee')).toMatchObject({ rank: 'CPL', status: 'LL' });
    expect(byName.get('Amir Rahman')).toMatchObject({ rank: 'LCP', status: 'PRESENT' });
    expect(byName.get('Ryan Lim')).toMatchObject({ rank: '3SG', status: 'PRESENT' });
    expect(coy1.counts).toMatchObject({ strength: 102, mc: 2, ll: 1, ma: 1, rsi: 1, others: 1 });
  });

  it('matches the in-memory derivation unit by unit', async () => {
    const am = dataset.events[0]!;
    for (const unit of DEMO_UNITS) {
      const stored = await storedCounts(unit.id, am.id);
      const people = dataset.personnel.filter((p) => p.unitId === unit.id);
      const spans = dataset.spans.filter((s) => s.unitId === unit.id);
      const marks = new Set(dataset.marks.filter((m) => m.unitId === unit.id).map((m) => m.personId));
      expect(stored.counts, unit.id).toEqual(unitCounts(effectiveStatuses(people, spans, marks, dataset.date)));
    }
  });

  it('stores a latest submission whose hash matches the current state for submitted units', async () => {
    const am = dataset.events[0]!;
    for (const unitId of ['S1', 'S3', 'S4', 'SSP', 'COY2', 'ISR'] as UnitId[]) {
      const [latest] = await t.db
        .select()
        .from(schema.submissions)
        .where(and(eq(schema.submissions.unitId, unitId), eq(schema.submissions.eventId, am.id)))
        .orderBy(desc(schema.submissions.version))
        .limit(1);
      const { statuses } = await storedCounts(unitId, am.id);
      expect(latest, unitId).toBeDefined();
      expect(latest!.contentHash, unitId).toBe(await contentHash(statuses));
      expect(latest!.counts, unitId).toEqual(unitCounts(statuses));
    }
    expect(await t.db.select().from(schema.submissions).where(eq(schema.submissions.unitId, 'SSP'))).toHaveLength(2);
    expect(await t.db.select().from(schema.submissions).where(eq(schema.submissions.unitId, 'COY1'))).toHaveLength(0);
  });

  it('keeps S2 untouched and Coy 1 pending', async () => {
    const states = await t.db.select().from(schema.unitEventState).orderBy(asc(schema.unitEventState.unitId));
    const ids = states.map((s) => s.unitId);
    expect(ids).not.toContain('S2');
    expect(ids).toContain('COY1');
  });

  it('stores 7 admin notifications with 3 unread', async () => {
    const rows = await t.db.select().from(schema.notifications);
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.readAt === null)).toHaveLength(3);
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([userIds.get(dataset.users[0]!.id)]));
  });

  it('freezes the demo clock in settings', async () => {
    const [row] = await t.db.select().from(schema.settings);
    expect(row!.demoNow?.toISOString()).toBe(dataset.now);
  });

  it('can be reset and reloaded', async () => {
    await resetAppData(t.db);
    expect(await t.db.select().from(schema.personnel)).toHaveLength(0);
    const [settings] = await t.db.select().from(schema.settings);
    expect(settings!.demoNow).toBeNull();
    await loadDemoDataset(t.db, dataset, { userIds });
    expect(await t.db.select().from(schema.personnel)).toHaveLength(dataset.personnel.length);
  });
});

describe('integrity rules', () => {
  it('rejects editing an absence span but allows superseding it once', async () => {
    const [span] = await t.db.select().from(schema.absenceSpans).limit(1);
    const admin = userIds.get(dataset.users[0]!.id)!;
    await expectDbError(
      t.db.update(schema.absenceSpans).set({ remark: 'edited' }).where(eq(schema.absenceSpans.id, span!.id)),
      /append-only/,
    );
    await t.db
      .update(schema.absenceSpans)
      .set({ supersededAt: new Date(), supersededBy: admin })
      .where(eq(schema.absenceSpans.id, span!.id));
    await expectDbError(
      t.db
        .update(schema.absenceSpans)
        .set({ supersededAt: new Date(), supersededBy: admin })
        .where(eq(schema.absenceSpans.id, span!.id)),
      /already superseded/,
    );
  });

  it('rejects changing a submission', async () => {
    const [sub] = await t.db.select().from(schema.submissions).limit(1);
    await expectDbError(
      t.db.update(schema.submissions).set({ contentHash: 'x' }).where(eq(schema.submissions.id, sub!.id)),
      /immutable/,
    );
  });

  it('allows one AM and one PM parade per date but many ad hoc events', async () => {
    await expectDbError(
      t.db.insert(schema.events).values({ id: 'dup', date: dataset.date, type: 'AM', name: null, cutoffAt: new Date() }),
      /events_date_parade_key/,
    );
    await t.db.insert(schema.events).values([
      { id: `${dataset.date}-ADHOC-a`, date: dataset.date, type: 'ADHOC', name: 'Range', cutoffAt: new Date() },
      { id: `${dataset.date}-ADHOC-b`, date: dataset.date, type: 'ADHOC', name: 'CO talk', cutoffAt: new Date() },
    ]);
  });

  it('enforces role and unit consistency on profiles', async () => {
    const id = await t.createAuthUser('bad@parade-state.demo');
    await expectDbError(
      t.db.insert(schema.profiles).values({ id, email: 'bad@parade-state.demo', displayName: 'x', role: 'COMMANDER', unitId: null }),
      /profiles_role_unit_check/,
    );
  });

  it('notifies an admin of a late unit at most once per event', async () => {
    const admin = userIds.get(dataset.users[0]!.id)!;
    const row = { userId: admin, type: 'LATE' as const, unitId: 'S2' as const, eventId: dataset.events[0]!.id, message: 'S2 late' };
    await t.db.insert(schema.notifications).values(row);
    await expectDbError(t.db.insert(schema.notifications).values(row), /notifications_late_once_key/);
  });
});

describe('row level security for signed-in clients', () => {
  it('lets a commander read only their own unit', async () => {
    const coy1 = dataset.users.find((u) => u.unitId === 'COY1')!;
    await t.asUser(userIds.get(coy1.id)!, async () => {
      const people = await t.db.select().from(schema.personnel);
      expect(new Set(people.map((p) => p.unitId))).toEqual(new Set(['COY1']));
      expect(people).toHaveLength(102);
      expect(await t.db.select().from(schema.submissions)).toHaveLength(0);
      expect(await t.db.select().from(schema.notifications)).toHaveLength(0);
      expect(await t.db.select().from(schema.profiles)).toHaveLength(1);
      expect(await t.db.select().from(schema.units)).toHaveLength(8);
    });
  });

  it('lets an admin read the whole battalion and their notifications', async () => {
    const admin = dataset.users[0]!;
    await t.asUser(userIds.get(admin.id)!, async () => {
      expect(await t.db.select().from(schema.personnel)).toHaveLength(312);
      expect(await t.db.select().from(schema.submissions)).toHaveLength(dataset.submissions.length);
      expect(await t.db.select().from(schema.profiles)).toHaveLength(dataset.users.length);
    });
  });

  it('refuses writes from a signed-in client', async () => {
    const admin = dataset.users[0]!;
    await t.asUser(userIds.get(admin.id)!, async () => {
      await expectDbError(t.db.update(schema.settings).set({ cutoffAm: '09:00' }), /permission denied/);
    });
  });
});
