import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from './setup';
import * as schema from '../../worker/db/schema';

let t: Awaited<ReturnType<typeof createTestDb>>;

/** Drizzle wraps driver errors; the constraint name lives on the cause. */
async function expectConstraint(promise: Promise<unknown>, name: string) {
  let message = '';
  try {
    await promise;
  } catch (err) {
    const e = err as Error & { cause?: Error };
    message = `${e.message} ${e.cause?.message ?? ''}`;
  }
  expect(message).toMatch(name);
}
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.close(); });

describe('schema and migrations', () => {
  it('applies all migrations and seeds the eight units', async () => {
    const units = await t.raw.select().from(schema.units).orderBy(schema.units.sortOrder);
    expect(units.map((u) => u.name)).toEqual(['S1', 'S2', 'S3', 'S4', 'SSP', 'Coy 1', 'Coy 2', 'ISR Coy']);
    const settings = await t.raw.select().from(schema.appSettings);
    expect(Object.fromEntries(settings.map((s) => [s.key, s.value]))).toEqual({ cutoff_am: '10:00', cutoff_pm: '14:00' });
  });

  it('enforces span constraints', async () => {
    const [p] = await t.raw.insert(schema.personnel).values({ unitId: 'S1', rank: 'PTE', name: 'Test', postedInDate: '2026-01-01' }).returning();
    const by = '00000000-0000-4000-8000-000000000001';
    await expectConstraint(
      t.raw.insert(schema.statusSpans).values({ personId: p!.id, unitId: 'S1', status: 'RSI', startDate: '2026-09-06', endDate: '2026-09-07', createdBy: by }),
      'spans_rsi_single_day',
    );
    await expectConstraint(
      t.raw.insert(schema.statusSpans).values({ personId: p!.id, unitId: 'S1', status: 'OTHERS', startDate: '2026-09-06', endDate: null, createdBy: by }),
      'spans_others_sub_type',
    );
    await expectConstraint(
      t.raw.insert(schema.statusSpans).values({ personId: p!.id, unitId: 'S1', status: 'MC', startDate: '2026-09-06', endDate: '2026-09-05', createdBy: by }),
      'spans_date_order',
    );
  });

  it('allows one AM and one PM per date but many ad hoc events', async () => {
    const cutoff = new Date('2026-09-06T02:00:00Z');
    await t.raw.insert(schema.events).values({ id: '2026-09-06-AM', date: '2026-09-06', type: 'AM', cutoffAt: cutoff });
    await expect(t.raw.insert(schema.events).values({ id: '2026-09-06-AM-dup', date: '2026-09-06', type: 'AM', cutoffAt: cutoff })).rejects.toThrow();
    await t.raw.insert(schema.events).values([
      { id: '2026-09-06-X-a', date: '2026-09-06', type: 'ADHOC', name: 'Route march', cutoffAt: cutoff },
      { id: '2026-09-06-X-b', date: '2026-09-06', type: 'ADHOC', name: 'Range', cutoffAt: cutoff },
    ]);
    const res = await t.raw.execute<{ n: number }>(sql`select count(*)::int as n from events where date = '2026-09-06'`);
    expect(res.rows[0]?.n).toBe(3);
  });

  it('keeps the Late notification unique per admin, unit and event', async () => {
    const admin = '00000000-0000-4000-8000-0000000000aa';
    await t.raw.insert(schema.profiles).values({ id: admin, email: 'a@x', displayName: 'A', role: 'ADMIN' });
    const row = { userId: admin, type: 'LATE' as const, unitId: 'S2', eventId: '2026-09-06-AM', message: 'late' };
    await t.raw.insert(schema.notifications).values(row);
    await expect(t.raw.insert(schema.notifications).values(row)).rejects.toThrow();
    await t.raw.insert(schema.notifications).values({ ...row, type: 'SUBMITTED' });
  });
});
