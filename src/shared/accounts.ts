/**
 * Accounts sign in with a username. Supabase Auth still needs an email per user, so accounts
 * created by S1 Branch get a synthetic one derived from the username; accounts created before
 * usernames existed keep their real email (sign-in resolves the username to it).
 */
export const ACCOUNT_EMAIL_DOMAIN = 'accounts.soldiertrack.app';

export function accountEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${ACCOUNT_EMAIL_DOMAIN}`;
}

export function usernameFromEmail(email: string): string {
  return email.split('@')[0]!.toLowerCase();
}

export function isEmailLike(login: string): boolean {
  return login.includes('@');
}
