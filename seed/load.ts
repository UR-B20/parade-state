/**
 * Insert the demo dataset into a migrated database. Shared by the Supabase seed script and
 * the integration tests, so the only environment-specific step (creating auth users) is
 * supplied by the caller as a map from demo user id to the real auth user id.
 */
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { DemoDataset } from '@shared/demo/dataset';
import * as schema from '../src/worker/db/schema';

/** Any Drizzle Postgres driver (postgres-js in the seed script, PGlite in tests). */
export type SeedDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Tables holding application data, in an order that satisfies foreign keys when truncated together. */
export const APP_TABLES = [
  'notifications',
  'submissions',
  'unit_event_state',
  'present_marks',
  'absence_spans',
  'date_unlocks',
  'events',
  'personnel',
  'profiles',
  'units',
] as const;

/** Remove all application rows and put the settings row back at its defaults. */
export async function resetAppData(db: SeedDatabase): Promise<void> {
  // CASCADE also empties settings (it references profiles), so the singleton row is re-created.
  await db.execute(sql.raw(`truncate table ${APP_TABLES.map((t) => `"${t}"`).join(', ')} cascade`));
  await db.execute(sql`
    insert into "settings" ("id") values (1)
    on conflict ("id") do update set "cutoff_am" = '10:00', "cutoff_pm" = '14:00', "demo_now" = null, "last_cron_at" = null, "updated_by" = null`);
}

export interface LoadOptions {
  /** Demo user id -> auth user id. Every dataset user must be present. */
  userIds: ReadonlyMap<string, string>;
}

const at = (iso: string) => new Date(iso);

export async function loadDemoDataset(db: SeedDatabase, dataset: DemoDataset, { userIds }: LoadOptions): Promise<void> {
  const uid = (demoId: string): string => {
    const id = userIds.get(demoId);
    if (!id) throw new Error(`No auth user id for demo user ${demoId}`);
    return id;
  };
  for (const user of dataset.users) uid(user.id);

  await db.transaction(async (tx) => {
    await tx.insert(schema.units).values(dataset.units.map((u) => ({ id: u.id, name: u.name, sortOrder: u.sortOrder })));

    await tx.insert(schema.profiles).values(
      dataset.users.map((u) => ({
        id: uid(u.id),
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        unitId: u.unitId,
        mustChangePassword: false,
        isActive: true,
      })),
    );

    await tx.insert(schema.personnel).values(
      dataset.personnel.map((p) => ({
        id: p.id,
        unitId: p.unitId,
        rank: p.rank,
        name: p.name,
        serviceNo: p.serviceNo,
        postedInDate: p.postedInDate,
        postedOutDate: p.postedOutDate,
      })),
    );

    await tx.insert(schema.events).values(
      dataset.events.map((e) => ({ id: e.id, date: e.date, type: e.type, name: null, cutoffAt: at(e.cutoffAt) })),
    );

    if (dataset.spans.length > 0) {
      await tx.insert(schema.absenceSpans).values(
        dataset.spans.map((s) => ({
          id: s.id,
          personId: s.personId,
          unitId: s.unitId,
          status: s.status,
          subType: s.subType,
          startDate: s.startDate,
          endDate: s.endDate,
          remark: s.remark,
          createdAt: at(s.createdAt),
          createdBy: uid(s.createdBy),
        })),
      );
    }

    if (dataset.marks.length > 0) {
      await tx.insert(schema.presentMarks).values(
        dataset.marks.map((m) => ({
          eventId: m.eventId,
          personId: m.personId,
          unitId: m.unitId,
          markedBy: uid(m.markedBy),
          markedAt: at(m.markedAt),
        })),
      );
    }

    if (dataset.unitEventState.length > 0) {
      await tx.insert(schema.unitEventState).values(
        dataset.unitEventState.map((s) => ({
          unitId: s.unitId,
          eventId: s.eventId,
          firstChangedAt: at(s.firstChangedAt),
          lastChangedAt: at(s.lastChangedAt),
          lastChangedBy: uid(s.lastChangedBy),
        })),
      );
    }

    if (dataset.submissions.length > 0) {
      await tx.insert(schema.submissions).values(
        dataset.submissions.map((s) => ({
          id: s.id,
          unitId: s.unitId,
          eventId: s.eventId,
          version: s.version,
          submittedBy: uid(s.submittedBy),
          submittedAt: at(s.submittedAt),
          contentHash: s.contentHash,
          counts: s.counts,
          snapshot: s.snapshot,
        })),
      );
    }

    if (dataset.notifications.length > 0) {
      await tx.insert(schema.notifications).values(
        dataset.notifications.map((n) => ({
          id: n.id,
          userId: uid(n.userId),
          type: n.type,
          unitId: n.unitId,
          eventId: n.eventId,
          submissionId: n.submissionId,
          message: n.message,
          createdAt: at(n.createdAt),
          readAt: n.readAt ? at(n.readAt) : null,
        })),
      );
    }

    // The demo clock is frozen at the brief's moment; DEMO_CONTROLS decides whether it is honoured.
    await tx
      .update(schema.settings)
      .set({ cutoffAm: '10:00', cutoffPm: '14:00', demoNow: at(dataset.now), updatedBy: uid(dataset.users[0]!.id) })
      .where(sql`${schema.settings.id} = 1`);
  });
}
