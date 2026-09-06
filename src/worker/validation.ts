import { vValidator } from '@hono/valibot-validator';
import * as v from 'valibot';
import { validation } from './errors';

export const emailSchema = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email('Enter a valid email address'), v.maxLength(200));
export const displayNameSchema = v.pipe(v.string(), v.trim(), v.minLength(1, 'Enter a name'), v.maxLength(80));
export const passwordSchema = v.pipe(
  v.string(),
  v.minLength(8, 'Use at least 8 characters'),
  v.maxLength(128, 'Use at most 128 characters'),
);
export const unitIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(16));
export const isoDateSchema = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'));

export const bootstrapBodySchema = v.object({
  email: emailSchema,
  displayName: displayNameSchema,
  bootstrapPassword: v.pipe(v.string(), v.minLength(1)),
});

export const changePasswordBodySchema = v.object({
  newPassword: passwordSchema,
});

export const createUserBodySchema = v.object({
  email: emailSchema,
  displayName: displayNameSchema,
  role: v.picklist(['ADMIN', 'COMMANDER']),
  unitId: v.optional(v.nullable(unitIdSchema)),
  temporaryPassword: passwordSchema,
});

export const resetPasswordBodySchema = v.object({
  temporaryPassword: passwordSchema,
});

/** Validate a JSON body; failures become a 400 VALIDATION error with one entry per field. */
export function jsonBody<T extends v.GenericSchema>(schema: T) {
  return vValidator('json', schema, (result) => {
    if (!result.success) {
      const details = result.issues.map((issue) => ({
        path: issue.path?.map((p) => String(p.key)).join('.') ?? '',
        message: issue.message,
      }));
      throw validation('Check the highlighted fields', details);
    }
  });
}

export function queryParams<T extends v.GenericSchema>(schema: T) {
  return vValidator('query', schema, (result) => {
    if (!result.success) {
      throw validation('Invalid query', result.issues.map((issue) => ({ path: issue.path?.map((p) => String(p.key)).join('.') ?? '', message: issue.message })));
    }
  });
}
