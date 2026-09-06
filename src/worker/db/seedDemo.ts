import type { DemoDataset } from '@shared/demo/dataset';
import type { Db } from './client';
import { appSettings, eventMarks, events, notifications, personnel, platoons, profiles, statusSpans, submissions, unitEventState } from './schema';

/**
 * Inserts the fictional battalion. `userIds` maps dataset user ids to real profile ids (Supabase
 * Auth assigns ids on creation; tests use the identity map).
 */
export async function insertDemoData(db: Db, data: DemoDataset, userIds: Map<string, string>): Promise<void> {
  const uid = (id: string) => {
    const mapped = userIds.get(id);
    if (!mapped) throw new Error(`No profile id for demo user ${id}`);
    return mapped;
  };
  const chunk = <T>(rows: T[], size = 200): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
    return out;
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(profiles)
      .values(data.users.map((u) => ({ id: uid(u.id), email: u.email, displayName: u.displayName, role: u.role, unitId: u.unitId, mustChangePassword: false })))
      .onConflictDoNothing();

    await tx.insert(platoons).values(data.platoons.map((p) => ({ id: p.id, unitId: p.unitId, name: p.name, sortOrder: p.sortOrder }))).onConflictDoNothing();
    for (const rows of chunk(data.personnel)) {
      await tx.insert(personnel).values(rows.map((p) => ({ id: p.id, unitId: p.unitId, platoonId: p.platoonId, rank: p.rank, name: p.name, serviceNo: p.serviceNo, postedInDate: p.postedInDate, postedOutDate: p.postedOutDate }))).onConflictDoNothing();
    }
    await tx.insert(events).values(data.events.map((e) => ({ id: e.id, date: e.date, type: e.type, cutoffAt: new Date(e.cutoffAt) }))).onConflictDoNothing();
    for (const rows of chunk(data.spans)) {
      await tx.insert(statusSpans).values(rows.map((s) => ({
        id: s.id, personId: s.personId, unitId: s.unitId, status: s.status, subType: s.subType, startDate: s.startDate, endDate: s.endDate, remark: s.remark,
        createdBy: uid(s.createdBy), createdAt: new Date(s.createdAt),
      }))).onConflictDoNothing();
    }
    for (const rows of chunk(data.marks)) {
      await tx.insert(eventMarks).values(rows.map((m) => ({ eventId: m.eventId, personId: m.personId, unitId: m.unitId, markedBy: uid(m.markedBy), markedAt: new Date(m.markedAt) }))).onConflictDoNothing();
    }
    if (data.unitEventState.length) {
      await tx.insert(unitEventState).values(data.unitEventState.map((s) => ({
        unitId: s.unitId, eventId: s.eventId, firstChangedAt: new Date(s.firstChangedAt), lastChangedAt: new Date(s.lastChangedAt), lastChangedBy: uid(s.lastChangedBy),
      }))).onConflictDoNothing();
    }
    if (data.submissions.length) {
      await tx.insert(submissions).values(data.submissions.map((s) => ({
        id: s.id, unitId: s.unitId, eventId: s.eventId, version: s.version, submittedBy: uid(s.submittedBy), submittedAt: new Date(s.submittedAt),
        contentHash: s.contentHash, counts: s.counts, snapshot: s.snapshot,
      }))).onConflictDoNothing();
    }
    if (data.notifications.length) {
      await tx.insert(notifications).values(data.notifications.map((n) => ({
        id: n.id, userId: uid(n.userId), type: n.type, unitId: n.unitId, eventId: n.eventId, submissionId: n.submissionId, message: n.message,
        createdAt: new Date(n.createdAt), readAt: n.readAt ? new Date(n.readAt) : null,
      }))).onConflictDoNothing();
    }
    await tx.insert(appSettings).values({ key: 'demo_now', value: data.now }).onConflictDoUpdate({ target: appSettings.key, set: { value: data.now } });
  });
}
