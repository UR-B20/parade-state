import { sql } from 'drizzle-orm';
import {
  boolean, check, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import type { UnitCounts } from '@shared/types';
import type { SnapshotEntry } from '@shared/domain/canonical';

export const roleEnum = pgEnum('role', ['ADMIN', 'COMMANDER']);
export const eventTypeEnum = pgEnum('event_type', ['AM', 'PM', 'ADHOC']);
export const absenceStatusEnum = pgEnum('absence_status', ['MC', 'LL', 'MA', 'RSI', 'OTHERS']);
export const othersSubTypeEnum = pgEnum('others_sub_type', ['ATTACHED_OUT', 'COURSE', 'OUTFIELD', 'DUTY']);
export const notificationTypeEnum = pgEnum('notification_type', ['SUBMITTED', 'RESUBMITTED', 'LATE']);

const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const tz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const day = (name: string) => date(name, { mode: 'string' });

export const units = pgTable('units', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

/** Sub-units of the companies (platoons and a HQ element). Staff units have none. */
export const platoons = pgTable('platoons', {
  id: text('id').primaryKey(),
  unitId: text('unit_id').notNull().references(() => units.id),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull(),
}, (t) => [index('platoons_unit_idx').on(t.unitId, t.sortOrder)]);

/** One row per Supabase Auth user. The FK to auth.users is added by the Supabase-only migration. */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  role: roleEnum('role').notNull(),
  unitId: text('unit_id').references(() => units.id),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('profiles_email_idx').on(t.email),
  check('profiles_commander_has_unit', sql`${t.role} <> 'COMMANDER' OR ${t.unitId} IS NOT NULL`),
]);

export const personnel = pgTable('personnel', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: text('unit_id').notNull().references(() => units.id),
  platoonId: text('platoon_id').references(() => platoons.id),
  rank: text('rank').notNull(),
  name: text('name').notNull(),
  serviceNo: text('service_no'),
  postedInDate: day('posted_in_date').notNull(),
  postedOutDate: day('posted_out_date'),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('personnel_unit_idx').on(t.unitId, t.postedOutDate),
  check('personnel_posting_order', sql`${t.postedOutDate} IS NULL OR ${t.postedOutDate} >= ${t.postedInDate}`),
]);

export const events = pgTable('events', {
  /** 'YYYY-MM-DD-AM', 'YYYY-MM-DD-PM' or 'YYYY-MM-DD-X-<id>' */
  id: text('id').primaryKey(),
  date: day('date').notNull(),
  type: eventTypeEnum('type').notNull(),
  name: text('name'),
  cutoffAt: tz('cutoff_at').notNull(),
  unitId: text('unit_id').references(() => units.id),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
}, (t) => [
  index('events_date_idx').on(t.date),
  uniqueIndex('events_standard_unique').on(t.date, t.type).where(sql`${t.type} IN ('AM', 'PM')`),
  check('events_adhoc_named', sql`${t.type} <> 'ADHOC' OR ${t.name} IS NOT NULL`),
]);

/** Absence spans. Rows are immutable: an edit supersedes the row and inserts a replacement. */
export const statusSpans = pgTable('status_spans', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => personnel.id),
  unitId: text('unit_id').notNull().references(() => units.id),
  status: absenceStatusEnum('status').notNull(),
  subType: othersSubTypeEnum('sub_type'),
  startDate: day('start_date').notNull(),
  endDate: day('end_date'),
  remark: text('remark'),
  createdBy: uuid('created_by').notNull(),
  createdAt: createdAt(),
  supersededAt: tz('superseded_at'),
  supersededBy: uuid('superseded_by'),
  replacesId: uuid('replaces_id'),
}, (t) => [
  index('spans_unit_active_idx').on(t.unitId, t.supersededAt, t.startDate),
  index('spans_person_active_idx').on(t.personId, t.supersededAt),
  check('spans_rsi_single_day', sql`${t.status} <> 'RSI' OR ${t.endDate} = ${t.startDate}`),
  check('spans_others_sub_type', sql`${t.status} <> 'OTHERS' OR ${t.subType} IS NOT NULL`),
  check('spans_date_order', sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`),
]);

/** Confirmed Present for one event. Absence of a row means default Present. */
export const eventMarks = pgTable('event_marks', {
  eventId: text('event_id').notNull().references(() => events.id),
  personId: uuid('person_id').notNull().references(() => personnel.id),
  unitId: text('unit_id').notNull().references(() => units.id),
  markedBy: uuid('marked_by').notNull(),
  markedAt: tz('marked_at').notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.eventId, t.personId] }),
  index('event_marks_unit_idx').on(t.eventId, t.unitId),
]);

export const unitEventState = pgTable('unit_event_state', {
  unitId: text('unit_id').notNull().references(() => units.id),
  eventId: text('event_id').notNull().references(() => events.id),
  firstChangedAt: tz('first_changed_at').notNull(),
  lastChangedAt: tz('last_changed_at').notNull(),
  lastChangedBy: uuid('last_changed_by').notNull(),
}, (t) => [primaryKey({ columns: [t.unitId, t.eventId] })]);

export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: text('unit_id').notNull().references(() => units.id),
  eventId: text('event_id').notNull().references(() => events.id),
  version: integer('version').notNull(),
  submittedBy: uuid('submitted_by').notNull(),
  submittedAt: tz('submitted_at').notNull().defaultNow(),
  contentHash: text('content_hash').notNull(),
  counts: jsonb('counts').$type<UnitCounts>().notNull(),
  snapshot: jsonb('snapshot').$type<SnapshotEntry[]>().notNull(),
}, (t) => [
  uniqueIndex('submissions_version_unique').on(t.unitId, t.eventId, t.version),
  index('submissions_event_idx').on(t.eventId, t.unitId),
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  unitId: text('unit_id').notNull().references(() => units.id),
  eventId: text('event_id').notNull().references(() => events.id),
  submissionId: uuid('submission_id'),
  message: text('message').notNull(),
  createdAt: createdAt(),
  readAt: tz('read_at'),
}, (t) => [
  index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt),
  uniqueIndex('notifications_late_once').on(t.userId, t.unitId, t.eventId).where(sql`${t.type} = 'LATE'`),
]);

/** demo_now, cutoff_am, cutoff_pm */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** S1 unlocks a past date so commanders can correct it. */
export const dateUnlocks = pgTable('date_unlocks', {
  date: day('date').primaryKey(),
  unlockedBy: uuid('unlocked_by').notNull(),
  unlockedAt: tz('unlocked_at').notNull().defaultNow(),
  expiresAt: tz('expires_at').notNull(),
});

export type PlatoonRow = typeof platoons.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type PersonnelRow = typeof personnel.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type StatusSpanRow = typeof statusSpans.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
