import { Hono } from 'hono';
import { CreatePersonSchema, UpdatePersonSchema } from '@shared/schemas';
import { requireAuth, requireUnitAccess, type AppEnv } from '../auth/middleware';
import { getUnit } from '../services/attendance';
import { createPerson, listPersonnel, updatePerson } from '../services/roll';
import { body } from '../validate';

/** Mounted at /units/:unitId/personnel. Commanders manage their own roll; S1 can manage any. */
export const rollRoutes = new Hono<AppEnv>();
rollRoutes.use('*', requireAuth);

rollRoutes.get('/', requireUnitAccess('read'), async (c) => {
  const unitId = c.req.param('unitId')!;
  await getUnit(c.get('db'), unitId);
  return c.json(await listPersonnel(c.get('db'), unitId, c.req.query('includeInactive') === '1'));
});

rollRoutes.post('/', requireUnitAccess('manage'), body(CreatePersonSchema), async (c) => {
  const unitId = c.req.param('unitId')!;
  await getUnit(c.get('db'), unitId);
  return c.json(await createPerson(c.get('db'), unitId, c.req.valid('json'), c.get('user').id, c.get('realNow')), 201);
});

rollRoutes.patch('/:personId', requireUnitAccess('manage'), body(UpdatePersonSchema), async (c) => {
  return c.json(await updatePerson(c.get('db'), c.req.param('unitId')!, c.req.param('personId'), c.req.valid('json')));
});
