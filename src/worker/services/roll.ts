import { and, asc, eq, isNull } from 'drizzle-orm';
import { sgDateOf, type IsoDate } from '@shared/dates';
import { compareByRankThenName } from '@shared/ranks';
import type { PersonDto, UnitId } from '@shared/types';
import type { Db } from '../db/client';
import { personnel, type PersonnelRow } from '../db/schema';
import { notFound, validation } from '../errors';
import { assertPlatoonInUnit } from './platoons';

export function toPersonDto(p: PersonnelRow): PersonDto {
  return { id: p.id, unitId: p.unitId as UnitId, platoonId: p.platoonId, rank: p.rank, name: p.name, serviceNo: p.serviceNo, postedInDate: p.postedInDate, postedOutDate: p.postedOutDate };
}

export async function listPersonnel(db: Db, unitId: string, includeInactive: boolean): Promise<PersonDto[]> {
  const where = includeInactive ? eq(personnel.unitId, unitId) : and(eq(personnel.unitId, unitId), isNull(personnel.postedOutDate));
  const rows = await db.select().from(personnel).where(where).orderBy(asc(personnel.name));
  return rows.sort(compareByRankThenName).map(toPersonDto);
}

/** Personnel of a unit who are on strength on the given date. */
export async function activePersonnelOn(db: Db, unitId: string, date: IsoDate): Promise<PersonnelRow[]> {
  const rows = await db.select().from(personnel).where(eq(personnel.unitId, unitId));
  return rows.filter((p) => p.postedInDate <= date && (p.postedOutDate === null || p.postedOutDate > date));
}

export async function createPerson(db: Db, unitId: string, input: { rank: string; name: string; platoonId?: string | null; serviceNo?: string | null; postedInDate?: IsoDate }, createdBy: string, now: Date): Promise<PersonDto> {
  await assertPlatoonInUnit(db, unitId, input.platoonId);
  const [row] = await db
    .insert(personnel)
    .values({ unitId, platoonId: input.platoonId ?? null, rank: input.rank, name: input.name, serviceNo: input.serviceNo ?? null, postedInDate: input.postedInDate ?? sgDateOf(now), createdBy })
    .returning();
  return toPersonDto(row!);
}

export async function updatePerson(db: Db, unitId: string, personId: string, patch: { rank?: string; name?: string; platoonId?: string | null; serviceNo?: string | null; postedOutDate?: IsoDate | null }): Promise<PersonDto> {
  const [current] = await db.select().from(personnel).where(and(eq(personnel.id, personId), eq(personnel.unitId, unitId)));
  if (!current) throw notFound('Person');
  if (patch.platoonId !== undefined) await assertPlatoonInUnit(db, unitId, patch.platoonId);
  if (patch.postedOutDate && patch.postedOutDate < current.postedInDate) throw validation('Posted-out date cannot be before the posted-in date', { field: 'postedOutDate' });
  const set: Partial<typeof personnel.$inferInsert> = { updatedAt: new Date() };
  if (patch.rank !== undefined) set.rank = patch.rank;
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.platoonId !== undefined) set.platoonId = patch.platoonId;
  if (patch.serviceNo !== undefined) set.serviceNo = patch.serviceNo;
  if (patch.postedOutDate !== undefined) set.postedOutDate = patch.postedOutDate;
  const [row] = await db.update(personnel).set(set).where(eq(personnel.id, personId)).returning();
  return toPersonDto(row!);
}
