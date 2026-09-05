/** Request body schemas shared by the Worker (validation) and the client (forms). */
import * as v from 'valibot';
import { isClockTime, isIsoDate } from './dates';
import { ABSENCE_STATUSES, OTHERS_SUB_TYPES } from './statuses';
import { RANK_ORDER } from './ranks';

export const IsoDateSchema = v.pipe(v.string(), v.check(isIsoDate, 'Enter a valid date'));
export const ClockTimeSchema = v.pipe(v.string(), v.check(isClockTime, 'Enter a time as HH:MM'));
export const UnitIdSchema = v.picklist(['S1', 'S2', 'S3', 'S4', 'SSP', 'COY1', 'COY2', 'ISR'], 'Choose a unit');
export const RankSchema = v.picklist(RANK_ORDER, 'Choose a rank');
export const EmailSchema = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email('Enter a valid email'), v.maxLength(254));
export const PasswordSchema = v.pipe(v.string(), v.minLength(8, 'Use at least 8 characters'), v.maxLength(72));
const NameSchema = v.pipe(v.string(), v.trim(), v.minLength(2, 'Enter a name'), v.maxLength(80, 'Keep the name under 80 characters'));
const RemarkSchema = v.nullish(v.pipe(v.string(), v.maxLength(120, 'Keep the remark under 120 characters')));

export const MarkBodySchema = v.variant('action', [
  v.object({ action: v.literal('PRESENT') }),
  v.object({ action: v.literal('BACK_TO_PRESENT') }),
  v.object({
    action: v.literal('SET'),
    status: v.picklist(ABSENCE_STATUSES),
    subType: v.nullish(v.picklist(OTHERS_SUB_TYPES)),
    startDate: IsoDateSchema,
    endDate: v.nullable(IsoDateSchema),
    remark: RemarkSchema,
  }),
]);

export const CreatePersonSchema = v.object({
  rank: RankSchema,
  name: NameSchema,
  serviceNo: v.nullish(v.pipe(v.string(), v.trim(), v.maxLength(20))),
  postedInDate: v.optional(IsoDateSchema),
});

export const UpdatePersonSchema = v.object({
  rank: v.optional(RankSchema),
  name: v.optional(NameSchema),
  serviceNo: v.nullish(v.pipe(v.string(), v.trim(), v.maxLength(20))),
  postedOutDate: v.optional(v.nullable(IsoDateSchema)),
});

export const CreateAdhocEventSchema = v.object({
  date: IsoDateSchema,
  name: v.pipe(v.string(), v.trim(), v.minLength(2, 'Name the event'), v.maxLength(60)),
  cutoffTime: ClockTimeSchema,
});

export const CreateUserSchema = v.object({
  email: EmailSchema,
  displayName: NameSchema,
  role: v.picklist(['ADMIN', 'COMMANDER']),
  unitId: v.nullable(UnitIdSchema),
  password: PasswordSchema,
});

export const UpdateUserSchema = v.object({
  displayName: v.optional(NameSchema),
  unitId: v.optional(v.nullable(UnitIdSchema)),
  isActive: v.optional(v.boolean()),
});

export const ResetPasswordSchema = v.object({ newPassword: PasswordSchema });

export const BootstrapSchema = v.object({
  email: EmailSchema,
  displayName: NameSchema,
  password: PasswordSchema,
  setupKey: v.pipe(v.string(), v.minLength(1, 'Enter the setup key')),
});

export const SettingsSchema = v.object({
  cutoffAm: v.optional(ClockTimeSchema),
  cutoffPm: v.optional(ClockTimeSchema),
});

export const ReadNotificationsSchema = v.union([
  v.object({ ids: v.pipe(v.array(v.string()), v.minLength(1)) }),
  v.object({ all: v.literal(true) }),
]);

export const DemoClockSchema = v.object({ now: v.nullable(v.pipe(v.string(), v.isoTimestamp('Enter an ISO timestamp'))) });

/** First issue message for a form field, or null. */
export function firstIssue(issues: v.BaseIssue<unknown>[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues ?? []) {
    const key = i.path?.map((p) => String(p.key)).join('.') || '_';
    if (!out[key]) out[key] = i.message;
  }
  return out;
}
