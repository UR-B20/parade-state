import { awaitingRank, platoonBreakdown, sumCounts } from '@shared/domain';
import type { AbsenteeDto, AbsenteesDto, BattalionSummaryDto, UnitSummaryRow } from '@shared/types';
import { ABSENCE_STATUSES } from '@shared/statuses';
import type { Db } from '../db/client';
import type { EventRow } from '../db/schema';
import { listUnits } from './platoons';
import type { Bindings } from '../env';
import { computeUnit, submissionStateFor } from './attendance';
import { toEventDto } from './events';
import { ensureLateNotifications } from './notifications';
import { resolveNow } from './settings';

export async function unitRows(db: Db, event: EventRow, now: Date) {
  const all = await listUnits(db);
  return Promise.all(
    all.map(async (u) => {
      const { statuses, counts, hash } = await computeUnit(db, u.id, event);
      const sub = await submissionStateFor(db, u.id, event, hash, now);
      const row: UnitSummaryRow = { unit: u, counts, submission: sub.state, platoons: platoonBreakdown(statuses, u.platoons) };
      return { row, statuses };
    }),
  );
}

export async function battalionSummary(db: Db, env: Bindings, event: EventRow, realNow: Date): Promise<BattalionSummaryDto> {
  const { now } = await resolveNow(db, env, realNow);
  await ensureLateNotifications(db, event, now);
  const rows = (await unitRows(db, event, now)).map((r) => r.row);
  rows.sort((a, b) => awaitingRank(a.submission) - awaitingRank(b.submission) || a.unit.sortOrder - b.unit.sortOrder);
  const submitted = rows.filter((r) => r.submission.kind === 'SUBMITTED' || r.submission.kind === 'RESUBMITTED').length;
  return { event: toEventDto(event), totals: sumCounts(rows.map((r) => r.counts)), unitsSubmitted: submitted, unitsTotal: rows.length, units: rows, serverNow: realNow.toISOString() };
}

export async function absentees(db: Db, env: Bindings, event: EventRow, realNow: Date): Promise<AbsenteesDto> {
  const { now } = await resolveNow(db, env, realNow);
  const groups = ABSENCE_STATUSES.map((status) => ({ status, items: [] as AbsenteeDto[] }));
  for (const { row, statuses } of await unitRows(db, event, now)) {
    for (const s of statuses) {
      if (s.status === 'PRESENT' || s.status === 'UNMARKED') continue;
      groups.find((g) => g.status === s.status)!.items.push({
        personId: s.personId, rank: s.rank, name: s.name, unitId: row.unit.id, unitName: row.unit.name,
        status: s.status, subType: s.subType, startDate: s.startDate, endDate: s.endDate, remark: s.remark,
      });
    }
  }
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return { event: toEventDto(event), total, groups: groups.filter((g) => g.items.length > 0) };
}
