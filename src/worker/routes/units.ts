import { and, asc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { Hono } from 'hono';
import * as v from 'valibot';
import { assertUnitAccess, requireAuth } from '../auth/middleware';
import { readClock } from '../clock';
import { personnel, units } from '../db/schema';
import type { AppEnv } from '../deps';
import { toPersonDto, toUnitDto } from '../dto';
import { notFound } from '../errors';
import { isoDateSchema, queryParams } from '../validation';
import { sgDateOf } from '@shared/dates';
import { compareByRankThenName } from '@shared/ranks';
import type { RollDto, UnitId, UnitsDto } from '@shared/types';

const rollQuerySchema = v.object({ date: v.optional(isoDateSchema) });

export const unitRoutes = new Hono<AppEnv>()
  .get('/units', requireAuth, async (c) => {
    const { db } = c.get('deps');
    const rows = await db.select().from(units).orderBy(asc(units.sortOrder));
    const body: UnitsDto = { units: rows.map(toUnitDto) };
    return c.json(body);
  })
  /** The unit's nominal roll on a date (today by default). Commanders see only their own unit. */
  .get('/units/:unitId/roll', requireAuth, queryParams(rollQuerySchema), async (c) => {
    const { db } = c.get('deps');
    const unitId = c.req.param('unitId') as UnitId;
    assertUnitAccess(c.get('user'), unitId);
    const [unit] = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
    if (!unit) throw notFound(`Unit ${unitId}`);
    const date = c.req.valid('query').date ?? sgDateOf((await readClock(db, c.env)).now);
    const rows = await db
      .select()
      .from(personnel)
      .where(
        and(
          eq(personnel.unitId, unitId),
          lte(personnel.postedInDate, date),
          or(isNull(personnel.postedOutDate), gt(personnel.postedOutDate, date)),
        ),
      );
    rows.sort(compareByRankThenName);
    const body: RollDto = { unit: toUnitDto(unit), date, persons: rows.map(toPersonDto) };
    return c.json(body);
  });
