import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { formatSgTime } from '@shared/dates';
import type { NotificationDto, NotificationsDto, NotificationType, UnitId } from '@shared/types';
import type { Db } from '../db/client';
import { notifications, profiles, submissions, units, type EventRow } from '../db/schema';
import { toEventDto } from './events';

async function activeAdminIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.role, 'ADMIN'), eq(profiles.isActive, true)));
  return rows.map((r) => r.id);
}

/** One notification row per active S1 admin. */
export async function notifyAdmins(db: Db, input: { type: NotificationType; unitId: string; eventId: string; submissionId: string | null; message: string; at: Date }): Promise<void> {
  const admins = await activeAdminIds(db);
  if (admins.length === 0) return;
  await db
    .insert(notifications)
    .values(admins.map((userId) => ({ userId, type: input.type, unitId: input.unitId, eventId: input.eventId, submissionId: input.submissionId, message: input.message, createdAt: input.at })))
    .onConflictDoNothing();
}

/**
 * After an event's cut-off, every unit without a submission gets one Late notification per
 * admin. Idempotent through the partial unique index, so the dashboard and the cron can both call it.
 */
export async function ensureLateNotifications(db: Db, event: EventRow, now: Date): Promise<number> {
  const cutoffAt = event.cutoffAt;
  if (!cutoffAt || now.getTime() < cutoffAt.getTime()) return 0;
  const [allUnits, submitted, admins] = await Promise.all([
    db.select().from(units),
    db.selectDistinct({ unitId: submissions.unitId }).from(submissions).where(eq(submissions.eventId, event.id)),
    activeAdminIds(db),
  ]);
  const submittedIds = new Set(submitted.map((s) => s.unitId));
  const late = allUnits.filter((u) => !submittedIds.has(u.id));
  if (late.length === 0 || admins.length === 0) return 0;
  const label = toEventDto(event).label;
  const rows = late.flatMap((u) =>
    admins.map((userId) => ({
      userId, type: 'LATE' as const, unitId: u.id, eventId: event.id, submissionId: null,
      message: `${u.name} has not submitted ${label} · cut-off ${formatSgTime(cutoffAt)}`,
      createdAt: cutoffAt,
    })),
  );
  const inserted = await db
    .insert(notifications)
    .values(rows)
    .onConflictDoNothing({ target: [notifications.userId, notifications.unitId, notifications.eventId], where: sql`${notifications.type} = 'LATE'` })
    .returning({ id: notifications.id });
  return inserted.length;
}

export async function listNotifications(db: Db, userId: string, unreadOnly: boolean, limit: number): Promise<NotificationsDto> {
  const where = unreadOnly ? and(eq(notifications.userId, userId), isNull(notifications.readAt)) : eq(notifications.userId, userId);
  const [rows, unread] = await Promise.all([
    db.select({ n: notifications, unitName: units.name }).from(notifications).innerJoin(units, eq(units.id, notifications.unitId)).where(where).orderBy(desc(notifications.createdAt)).limit(limit),
    db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  ]);
  const items: NotificationDto[] = rows.map(({ n, unitName }) => ({
    id: n.id, type: n.type, unitId: n.unitId as UnitId, unitName, eventId: n.eventId, message: n.message, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null,
  }));
  return { items, unreadCount: unread[0]?.count ?? 0 };
}

export async function markNotificationsRead(db: Db, userId: string, ids: string[] | 'all', at: Date): Promise<void> {
  const base = and(eq(notifications.userId, userId), isNull(notifications.readAt));
  await db.update(notifications).set({ readAt: at }).where(ids === 'all' ? base : and(base, inArray(notifications.id, ids)));
}
