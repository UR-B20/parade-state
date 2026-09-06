import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorBody } from '@shared/types';

export type ErrorCode = ApiErrorBody['error']['code'];

const STATUS_FOR: Record<ErrorCode, ContentfulStatusCode> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DATE_LOCKED: 403,
  PASSWORD_CHANGE_REQUIRED: 403,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: ContentfulStatusCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_FOR[code];
    this.details = details;
  }

  toBody(): ApiErrorBody {
    const error: ApiErrorBody['error'] = { code: this.code, message: this.message };
    if (this.details !== undefined) error.details = this.details;
    return { error };
  }
}

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found`);
export const forbidden = (message = 'You do not have access to this unit') => new AppError('FORBIDDEN', message);
export const unauthorized = (message = 'Sign in to continue') => new AppError('UNAUTHORIZED', message);
export const validation = (message: string, details?: unknown) => new AppError('VALIDATION', message, details);
export const conflict = (message: string) => new AppError('CONFLICT', message);
export const passwordChangeRequired = () =>
  new AppError('PASSWORD_CHANGE_REQUIRED', 'Change your password to continue');

export function handleError(err: unknown, c: Context): Response {
  if (err instanceof AppError) {
    return c.json(err.toBody(), err.status);
  }
  console.error('Unhandled error', err);
  const body: ApiErrorBody = {
    error: { code: 'INTERNAL', message: 'Something went wrong on the server. Try again.' },
  };
  return c.json(body, 500);
}
