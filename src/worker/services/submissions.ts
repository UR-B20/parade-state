import { and, desc, eq } from 'drizzle-orm';
import { toSnapshot } from '@shared/domain';
import type { SubmissionDto, UnitId } from '@shared/types';
import type { Db } from '../db/client';
import { profiles, submissions, type EventRow, type ProfileRow, type SubmissionRow } from '../db/schema';
import type { Bindings } from '../env';
import { conflict } from '../errors';
import { computeUnit, getUnit, latestSubmission } from './attendance';
import { toEventDto } from './events';
import { notifyAdmins } from './notifications';

function toDto(s: SubmissionRow, submittedByName: string): SubmissionDto {
  return {
    id: s.id, unitId: s.unitId as UnitId, eventId: s.eventId, version: s.version, submittedAt: s.submittedAt.toISOString(),
    submittedBy: s.submittedBy, submittedByName, counts: s.counts, contentHash: s.contentHash,
  };
}

/**
 * Snapshot the unit's current attendance as the next version and tell S1.
 * Refuses when nothing changed since the last version, so a resubmit always carries a difference.
 */
export async function submit(db: Db, _env: Bindings, unitId: string, event: EventRow, user: ProfileRow, realNow: Date): Promise<SubmissionDto> {
  const unit = await getUnit(db, unitId);
  const { statuses, counts, hash } = await computeUnit(db, unitId, event);
  const latest = await latestSubmission(db, unitId, event.id);
  if (latest && latest.contentHash === hash) throw conflict('Nothing has changed since the last submission.');
  const version = (latest?.version ?? 0) + 1;

  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(submissions)
      .values({ unitId, eventId: event.id, version, submittedBy: user.id, submittedAt: realNow, contentHash: hash, counts, snapshot: toSnapshot(statuses) })
      .returning();
    const label = version === 1 ? 'submitted' : `resubmitted (v${version})`;
    await notifyAdmins(tx, {
      type: version === 1 ? 'SUBMITTED' : 'RESUBMITTED',
      unitId,
      eventId: event.id,
      submissionId: inserted!.id,
      message: `${unit.name} ${label} ${toEventDto(event).label} · ${counts.present}/${counts.strength} present`,
      at: realNow,
    });
    return inserted!;
  });
  return toDto(row, user.displayName);
}

export async function listSubmissions(db: Db, unitId: string, eventId: string): Promise<SubmissionDto[]> {
  const rows = await db
    .select({ s: submissions, name: profiles.displayName })
    .from(submissions)
    .leftJoin(profiles, eq(profiles.id, submissions.submittedBy))
    .where(and(eq(submissions.unitId, unitId), eq(submissions.eventId, eventId)))
    .orderBy(desc(submissions.version));
  return rows.map(({ s, name }) => toDto(s, name ?? 'Unknown'));
}
