import type { IsoDate } from '@shared/dates';

export const keys = {
  me: ['me'] as const,
  units: ['units'] as const,
  events: (date: IsoDate) => ['events', date] as const,
  archivedEvents: ['events', 'archived'] as const,
  personnel: (unitId: string, includeInactive: boolean) => ['personnel', unitId, includeInactive] as const,
  attendance: (unitId: string, eventId: string) => ['attendance', unitId, eventId] as const,
  submissions: (unitId: string, eventId: string) => ['submissions', unitId, eventId] as const,
  summary: (eventId: string) => ['summary', eventId] as const,
  absentees: (eventId: string) => ['absentees', eventId] as const,
  trends: (eventId: string, days: number) => ['trends', eventId, days] as const,
  unitTrends: (unitId: string, eventId: string, days: number) => ['unit-trends', unitId, eventId, days] as const,
  notifications: ['notifications'] as const,
  users: ['users'] as const,
  settings: ['settings'] as const,
};
