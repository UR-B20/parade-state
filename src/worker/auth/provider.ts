/**
 * The identity provider behind the API. Production uses Supabase Auth (tokens verified
 * against the project's keys, accounts managed through the Admin API); tests use an
 * in-memory fake so the whole API runs on PGlite.
 */
export interface NewAuthUser {
  email: string;
  password: string;
  displayName: string;
}

export interface AuthProvider {
  /** Returns the user id for a valid, unexpired access token, or null. Never throws for bad tokens. */
  verifyAccessToken(token: string): Promise<string | null>;
  /** Creates a confirmed account. Throws AppError CONFLICT when the email is taken. */
  createUser(input: NewAuthUser): Promise<{ id: string }>;
  deleteUser(id: string): Promise<void>;
  setPassword(id: string, password: string): Promise<void>;
}
