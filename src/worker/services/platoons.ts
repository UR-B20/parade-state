import { and, asc, count, eq } from 'drizzle-orm';
import type { PlatoonDto, UnitDto, UnitId } from '@shared/types';
import type { Db } from '../db/client';
import { personnel, platoons, units, type PlatoonRow } from '../db/schema';
import { conflict, notFound, validation } from '../errors';

export function toPlatoonDto(p: PlatoonRow): PlatoonDto {
  return { id: p.id, unitId: p.unitId as UnitId, name: p.name, sortOrder: p.sortOrder };
}

export async function listPlatoons(db: Db, unitId?: string): Promise<PlatoonDto[]> {
  const rows = await db.select().from(platoons).where(unitId ? eq(platoons.unitId, unitId) : undefined).orderBy(asc(platoons.unitId), asc(platoons.sortOrder));
  return rows.map(toPlatoonDto);
}

/** All units with their platoons attached, in display order. */
export async function listUnits(db: Db): Promise<UnitDto[]> {
  const [unitRows, platoonRows] = await Promise.all([db.select().from(units).orderBy(asc(units.sortOrder)), listPlatoons(db)]);
  return unitRows.map((u) => ({ id: u.id as UnitId, name: u.name, sortOrder: u.sortOrder, platoons: platoonRows.filter((p) => p.unitId === u.id) }));
}

export async function getUnitWithPlatoons(db: Db, unitId: string): Promise<UnitDto> {
  const [row] = await db.select().from(units).where(eq(units.id, unitId));
  if (!row) throw notFound('Unit');
  return { id: row.id as UnitId, name: row.name, sortOrder: row.sortOrder, platoons: await listPlatoons(db, unitId) };
}

/** Throws unless the platoon belongs to the unit (or is null). */
export async function assertPlatoonInUnit(db: Db, unitId: string, platoonId: string | null | undefined): Promise<void> {
  if (!platoonId) return;
  const [row] = await db.select({ id: platoons.id }).from(platoons).where(and(eq(platoons.id, platoonId), eq(platoons.unitId, unitId)));
  if (!row) throw validation('Choose a platoon of this unit', { field: 'platoonId' });
}

export async function createPlatoon(db: Db, unitId: string, name: string): Promise<PlatoonDto> {
  const existing = await listPlatoons(db, unitId);
  if (existing.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw conflict('A platoon with this name already exists');
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 12) || 'P';
  const id = `${unitId}-${slug}-${crypto.randomUUID().slice(0, 4)}`;
  const sortOrder = (existing.at(-1)?.sortOrder ?? -1) + 1;
  const [row] = await db.insert(platoons).values({ id, unitId, name, sortOrder }).returning();
  return toPlatoonDto(row!);
}

export async function renamePlatoon(db: Db, id: string, name: string): Promise<PlatoonDto> {
  const [row] = await db.update(platoons).set({ name }).where(eq(platoons.id, id)).returning();
  if (!row) throw notFound('Platoon');
  return toPlatoonDto(row);
}

export async function deletePlatoon(db: Db, id: string): Promise<void> {
  const [n] = await db.select({ n: count() }).from(personnel).where(eq(personnel.platoonId, id));
  if ((n?.n ?? 0) > 0) throw conflict('Move its personnel to another platoon first');
  const deleted = await db.delete(platoons).where(eq(platoons.id, id)).returning({ id: platoons.id });
  if (deleted.length === 0) throw notFound('Platoon');
}
