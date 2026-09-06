import { vValidator } from '@hono/valibot-validator';
import type { GenericSchema, GenericSchemaAsync } from 'valibot';
import { firstIssue } from '@shared/schemas';
import { validation } from './errors';

/** JSON body validation that reports field-level messages in the standard error shape. */
export function body<S extends GenericSchema | GenericSchemaAsync>(schema: S) {
  return vValidator('json', schema, (result) => {
    if (!result.success) {
      const fields = firstIssue(result.issues);
      const first = Object.values(fields)[0] ?? 'Check the highlighted fields';
      throw validation(first, { fields });
    }
  });
}
