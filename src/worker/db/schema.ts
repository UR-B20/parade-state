/**
 * Parade State database schema (Supabase Postgres).
 *
 * Conventions:
 * - Civil dates are `date` columns read as 'YYYY-MM-DD' strings (Singapore dates, see shared/dates).
 * - Instants are `timestamptz` columns read as Date; the API layer serialises them as ISO strings.
 * - `profiles.id` mirrors `auth.users.id`. The foreign key to auth.users, row level security,
 *   policies and triggers live in the hand-written migration 0001 (drizzle-kit cannot express them).
 * - The Worker talks to the database with the service role and enforces authorisation itself.
 *   Row level security exists for what the client reads directly over Supabase Realtime.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { SnapshotEntry } from '@shared/domain/canonical';
import type { AbsenceStatus, OthersSubType } from '@shared/statuses';
import type { EventType, NotificationType, Role, UnitCounts, UnitId } from '@shared/types';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const civilDate = (name: string) => date(name, { mode: 'string' });

export const units = pgTable('units', {
  id: text('id').$type<UnitId>().primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export const profiles = pgTable(
  'profiles',
  {
    /** Same value as auth.users.id. */
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role').$type<Role>().notNull(),
    unitId: text('unit_id').$type<UnitId>().references(() => units.id),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('profiles_email_key').on(sql`lower(${t.email})`),
    index('profiles_unit_idx').on(t.unitId),
    check('profiles_role_check', sql`${t.role} in ('ADMIN', 'COMMANDER')`),
    // Commanders belong to exactly one unit; admins belong to none.
    check(
      'profiles_role_unit_check',
      sql`(${t.role} = 'COMMANDER' and ${t.unitId} is not null) or (${t.role} = 'ADMIN' and ${t.unitId} is null)`,
    ),
  ],
);

export const personnel = pgTable(
  'personnel',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    unitId: text('unit_id').$type<UnitId>().notNull().references(() => units.id),
    rank: text('rank').notNull(),
    name: text('name').notNull(),
    serviceNo: text('service_no'),
    postedInDate: civilDate('posted_in_date').notNull(),
    /** First day the person is no longer on the unit's roll. */
    postedOutDate: civilDate('posted_out_date'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('personnel_unit_idx').on(t.unitId, t.postedInDate, t.postedOutDate),
    check('personnel_posting_check', sql`${t.postedOutDate} is null or ${t.postedOutDate} > ${t.postedInDate}`),
  ],
);

/**
 * Absence spans are append-only. Changing a status writes a new span and marks the old one
 * superseded; the newest active span covering the event date wins (see domain/effectiveStatus).
 */
export const absenceSpans = pgTable(
  'absence_spans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id').notNull().references(() => personnel.id, { onDelete: 'cascade' }),
    unitId: text('unit_id').$type<UnitId>().notNull().references(() => units.id),
    status: text('status').$type<AbsenceStatus>().notNull(),
    subType: text('sub_type').$type<OthersSubType>(),
    startDate: civilDate('start_date').notNull(),
    /** Null means open-ended. RSI is always a single day (start = end). */
    endDate: civilDate('end_date'),
    remark: text('remark'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    createdBy: uuid('created_by').notNull().references(() => profiles.id),
    supersededAt: timestamptz('superseded_at'),
    supersededBy: uuid('superseded_by').references(() => profiles.id),
  },
  (t) => [
    index('absence_spans_person_active_idx').on(t.personId).where(sql`${t.supersededAt} is null`),
    index('absence_spans_unit_dates_idx').on(t.unitId, t.startDate, t.endDate).where(sql`${t.supersededAt} is null`),
    check('absence_spans_status_check', sql`${t.status} in ('MC', 'LL', 'MA', 'RSI', 'OTHERS')`),
    check(
      'absence_spans_sub_type_check',
      sql`(${t.status} = 'OTHERS' and ${t.subType} in ('ATTACHED_OUT', 'COURSE', 'OUTFIELD', 'DUTY')) or (${t.status} <> 'OTHERS' and ${t.subType} is null)`,
    ),
    check('absence_spans_dates_check', sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
    check('absence_spans_rsi_single_day_check', sql`${t.status} <> 'RSI' or ${t.endDate} = ${t.startDate}`),
    check(
      'absence_spans_superseded_check',
      sql`(${t.supersededAt} is null and ${t.supersededBy} is null) or (${t.supersededAt} is not null and ${t.supersededBy} is not null)`,
    ),
  ],
);

export const events = pgTable(
  'events',
  {
    /** 'YYYY-MM-DD-AM', 'YYYY-MM-DD-PM' or 'YYYY-MM-DD-ADHOC-<uuid>'. */
    id: text('id').primaryKey(),
    date: civilDate('date').notNull(),
    type: text('type').$type<EventType>().notNull(),
    /** Ad hoc event name; null for AM/PM parades. */
    name: text('name'),
    cutoffAt: timestamptz('cutoff_at').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => profiles.id),
  },
  (t) => [
    // One AM and one PM parade per date; any number of ad hoc events.
    uniqueIndex('events_date_parade_key').on(t.date, t.type).where(sql`${t.type} in ('AM', 'PM')`),
    index('events_date_idx').on(t.date),
    check('events_type_check', sql`${t.type} in ('AM', 'PM', 'ADHOC')`),
    check(
      'events_name_check',
      sql`(${t.type} = 'ADHOC' and ${t.name} is not null) or (${t.type} <> 'ADHOC' and ${t.name} is null)`,
    ),
  ],
);

/** A confirmed Present mark for one person at one event. Absence of a row means default Present. */
export const presentMarks = pgTable(
  'present_marks',
  {
    eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    personId: uuid('person_id').notNull().references(() => personnel.id, { onDelete: 'cascade' }),
    unitId: text('unit_id').$type<UnitId>().notNull().references(() => units.id),
    markedBy: uuid('marked_by').notNull().references(() => profiles.id),
    markedAt: timestamptz('marked_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.personId] }), index('present_marks_unit_event_idx').on(t.unitId, t.eventId)],
);

/** Exists once a unit has touched an event. Drives Pending vs Not marked. */
export const unitEventState = pgTable(
  'unit_event_state',
  {
    unitId: text('unit_id').$type<UnitId>().notNull().references(() => units.id),
    eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    firstChangedAt: timestamptz('first_changed_at').notNull(),
    lastChangedAt: timestamptz('last_changed_at').notNull(),
    lastChangedBy: uuid('last_changed_by').notNull().references(() => profiles.id),
  },
  (t) => [primaryKey({ columns: [t.unitId, t.eventId] }), index('unit_event_state_event_idx').on(t.eventId)],
);

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    unitId: text('unit_id').$type<UnitId>().notNull().references(() => units.id),
    eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    submittedBy: uuid('submitted_by').notNull().references(() => profiles.id),
    submittedAt: timestamptz('submitted_at').notNull().defaultNow(),
    /** sha256 of the canonical unit state at submission (see domain/canonical). */
    contentHash: text('content_hash').notNull(),
    counts: jsonb('counts').$type<UnitCounts>().notNull(),
    snapshot: jsonb('snapshot').$type<SnapshotEntry[]>().notNull(),
  },
  (t) => [
    uniqueIndex('submissions_unit_event_version_key').on(t.unitId, t.eventId, t.version),
    check('submissions_version_check', sql`${t.version} >= 1`),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    type: text('type').$type<NotificationType>().notNull(),
    unitId: text('unit_id').$type<UnitId>().notNull().references(() => units.id),
    eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    submissionId: uuid('submission_id').references(() => submissions.id, { onDelete: 'set null' }),
    message: text('message').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    readAt: timestamptz('read_at'),
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    index('notifications_user_unread_idx').on(t.userId).where(sql`${t.readAt} is null`),
    // The cutoff cron notifies each admin at most once per unit and event.
    uniqueIndex('notifications_late_once_key').on(t.userId, t.unitId, t.eventId).where(sql`${t.type} = 'LATE'`),
    check('notifications_type_check', sql`${t.type} in ('SUBMITTED', 'RESUBMITTED', 'LATE')`),
  ],
);

/** Single-row table (id is always 1). */
export const settings = pgTable(
  'settings',
  {
    id: integer('id').primaryKey().default(1),
    cutoffAm: text('cutoff_am').notNull().default('10:00'),
    cutoffPm: text('cutoff_pm').notNull().default('14:00'),
    /** Demo clock override; only honoured when DEMO_CONTROLS is enabled. */
    demoNow: timestamptz('demo_now'),
    /** Set by the scheduled handler on every successful run. */
    lastCronAt: timestamptz('last_cron_at'),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => profiles.id),
  },
  (t) => [
    check('settings_singleton_check', sql`${t.id} = 1`),
    check('settings_cutoff_am_check', sql`${t.cutoffAm} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check('settings_cutoff_pm_check', sql`${t.cutoffPm} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  ],
);

/** S1 unlock of a past date so commanders can edit it until the unlock expires. */
export const dateUnlocks = pgTable('date_unlocks', {
  date: civilDate('date').primaryKey(),
  unlockedBy: uuid('unlocked_by').notNull().references(() => profiles.id),
  unlockedAt: timestamptz('unlocked_at').notNull().defaultNow(),
  expiresAt: timestamptz('expires_at').notNull(),
});

export type UnitRow = typeof units.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type PersonRow = typeof personnel.$inferSelect;
export type AbsenceSpanRow = typeof absenceSpans.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type PresentMarkRow = typeof presentMarks.$inferSelect;
export type UnitEventStateRow = typeof unitEventState.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
export type DateUnlockRow = typeof dateUnlocks.$inferSelect;
