import { count, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { profiles, type ProfileRow } from '../db/schema';
import type { AuthAdmin } from '../auth/supabaseAdmin';
import { conflict, notFound, validation } from '../errors';
import type { Role, UnitId, UserDto } from '@shared/types';
import { accountEmail } from '@shared/accounts';

export function toUserDto(p: ProfileRow): UserDto {
  return {
    id: p.id,
    username: p.username,
    email: p.email,
    displayName: p.displayName,
    role: p.role,
    unitId: (p.unitId as UnitId | null) ?? null,
    mustChangePassword: p.mustChangePassword,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function listUsers(db: Db): Promise<UserDto[]> {
  const rows = await db.select().from(profiles).orderBy(profiles.role, profiles.displayName);
  return rows.map(toUserDto);
}

export async function profileCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(profiles);
  return row?.n ?? 0;
}

export async function getProfile(db: Db, id: string): Promise<ProfileRow | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, id));
  return row ?? null;
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  role: Role;
  unitId: UnitId | null;
  password: string;
  mustChangePassword: boolean;
}

/** Creates the Supabase Auth user, then the profile. Rolls the auth user back if the profile insert fails. */
export async function createUser(db: Db, auth: AuthAdmin, input: CreateUserInput): Promise<UserDto> {
  if (input.role === 'COMMANDER' && !input.unitId) throw validation('A commander must be assigned to a unit', { field: 'unitId' });
  const username = input.username.trim().toLowerCase();
  const email = accountEmail(username);
  const [existing] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.username, username));
  if (existing) throw conflict('An account with this username already exists');
  const { id } = await auth.createUser({ email, password: input.password, displayName: input.displayName });
  try {
    const [row] = await db
      .insert(profiles)
      .values({ id, username, email, displayName: input.displayName, role: input.role, unitId: input.role === 'COMMANDER' ? input.unitId : null, mustChangePassword: input.mustChangePassword })
      .returning();
    return toUserDto(row!);
  } catch (err) {
    await auth.deleteUser(id).catch(() => undefined);
    throw err;
  }
}

export async function updateUser(db: Db, auth: AuthAdmin, id: string, patch: { username?: string; displayName?: string; unitId?: UnitId | null; isActive?: boolean }): Promise<UserDto> {
  const current = await getProfile(db, id);
  if (!current) throw notFound('Account');
  if (patch.username !== undefined && patch.username !== current.username) {
    const [taken] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.username, patch.username));
    if (taken) throw conflict('An account with this username already exists');
  }
  if (current.role === 'COMMANDER' && patch.unitId === null) throw validation('A commander must be assigned to a unit', { field: 'unitId' });
  const set: Partial<typeof profiles.$inferInsert> = { updatedAt: new Date() };
  if (patch.displayName !== undefined) set.displayName = patch.displayName;
  if (patch.username !== undefined) set.username = patch.username;
  if (patch.unitId !== undefined && current.role === 'COMMANDER') set.unitId = patch.unitId;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  const [row] = await db.update(profiles).set(set).where(eq(profiles.id, id)).returning();
  if (patch.isActive !== undefined && patch.isActive !== current.isActive) await auth.setBanned(id, !patch.isActive);
  return toUserDto(row!);
}

export async function resetPassword(db: Db, auth: AuthAdmin, id: string, newPassword: string): Promise<void> {
  const current = await getProfile(db, id);
  if (!current) throw notFound('Account');
  await auth.updatePassword(id, newPassword);
  await db.update(profiles).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(profiles.id, id));
}

export async function markPasswordChanged(db: Db, id: string): Promise<void> {
  await db.update(profiles).set({ mustChangePassword: false, updatedAt: new Date() }).where(eq(profiles.id, id));
}

/** The sign-in email behind a username, or null when no such account exists. */
export async function emailForLogin(db: Db, login: string): Promise<string | null> {
  const value = login.trim().toLowerCase();
  if (value.includes('@')) return value;
  const [row] = await db.select({ email: profiles.email }).from(profiles).where(eq(profiles.username, value));
  return row?.email ?? null;
}
