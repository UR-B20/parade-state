import type { PersonRow, ProfileRow, UnitRow } from './db/schema';
import type { PersonDto, UnitDto, UserDto } from '@shared/types';

export const toUserDto = (p: ProfileRow): UserDto => ({
  id: p.id,
  email: p.email,
  displayName: p.displayName,
  role: p.role,
  unitId: p.unitId,
  mustChangePassword: p.mustChangePassword,
  isActive: p.isActive,
  createdAt: p.createdAt.toISOString(),
});

export const toUnitDto = (u: UnitRow): UnitDto => ({ id: u.id, name: u.name, sortOrder: u.sortOrder });

export const toPersonDto = (p: PersonRow): PersonDto => ({
  id: p.id,
  unitId: p.unitId,
  rank: p.rank,
  name: p.name,
  serviceNo: p.serviceNo,
  postedInDate: p.postedInDate,
  postedOutDate: p.postedOutDate,
});
