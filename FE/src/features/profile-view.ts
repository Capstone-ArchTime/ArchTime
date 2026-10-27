import { canAccess } from '../auth/permissions.ts';
import type { Role, SignInMethods } from '../auth/permissions.ts';
import { orderPaths } from './my-work.ts';
import { checkNewPassword } from './profile-validation.ts';

// What the profile page shows about the signed-in person, worked out from what the server sent. Pure, so it is tested.

/** "Jane Doe" -> "JD", "Jane" -> "J": the first letter of the first and the last word, for the round avatar. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  // The first letter or digit of a word, so "(Jane)" still gives "J"; Array.from keeps letters outside the BMP whole.
  const first = (word: string) => Array.from(word).find(c => /[\p{L}\p{N}]/u.test(c)) ?? '';
  const letters = words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0] ?? '');
  return letters.toLocaleUpperCase() || '?';
}

/** "Member since January 15, 2026"; null when the server sent no usable date (an older server sends none). */
export function memberSince(createdAt: unknown): string | null {
  if (typeof createdAt !== 'string' || !createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Member since ${date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
}

/** The sign-in methods from GET /auth/me, or null when they are missing or not what we expect (then the page behaves as before). */
export function parseSignInMethods(value: unknown): SignInMethods | null {
  if (!value || typeof value !== 'object') return null;
  const { password, github } = value as Record<string, unknown>;
  return typeof password === 'boolean' && typeof github === 'boolean' ? { password, github } : null;
}

/** Only an account known to have no password gets the set-password form; when unsure, the change form as before. */
export const needsPassword = (methods: SignInMethods | null): boolean => methods?.password === false;

/** The reset page with the email filled in: another way for an account without a password to get one. */
export const forgotPasswordLink = (email: string): string => `/forgot-password?email=${encodeURIComponent(email)}`;

export type SetPasswordForm = { newPassword: string; confirmNewPassword: string };
export type SetPasswordProblems = Partial<Record<keyof SetPasswordForm, string>>;

/** The same checks as the change form, without the current password (there is none). */
export function checkSetPasswordForm(form: SetPasswordForm): SetPasswordProblems {
  const problems: SetPasswordProblems = {};
  const rule = checkNewPassword(form.newPassword);
  if (!form.newPassword) problems.newPassword = 'Enter a new password.';
  else if (rule) problems.newPassword = rule;
  if (!form.confirmNewPassword) problems.confirmNewPassword = 'Repeat the new password.';
  else if (form.confirmNewPassword !== form.newPassword) problems.confirmNewPassword = 'New passwords do not match.';
  return problems;
}

/** meta.total of a list asked for with limit=1, or the rows when an older server sends no total. */
export function listTotal(body: unknown, key: string): number {
  const b = body as { data?: Record<string, unknown>; meta?: { total?: unknown } } | null | undefined;
  const total = b?.meta?.total;
  if (typeof total === 'number' && Number.isFinite(total) && total >= 0) return total;
  const rows = b?.data?.[key];
  if (Array.isArray(rows)) return rows.length;
  throw new Error('The server returned an invalid list.');
}

export type OverviewTile = 'organizations' | 'workspaces' | 'learning' | 'ai';
const tilePages: [OverviewTile, string][] = [['organizations', '/organizations'], ['workspaces', '/projects'], ['learning', '/learning'], ['ai', '/ai-usage']];

/** The overview tiles whose page this account can open; a system administrator has none of them. */
export const overviewTiles = (role: Role): OverviewTile[] => tilePages.filter(([, path]) => canAccess(role, path)).map(([tile]) => tile);

/** "1 run", "2 runs". */
export const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** "1 you own", and up to `max` organizations to show, owned ones first, then by name. */
export function organizationOverview<T extends { name: string; myRole: 'owner' | 'member' }>(orgs: T[], max = 3) {
  const owned = orgs.filter(o => o.myRole === 'owner').length;
  const shown = [...orgs].sort((a, b) => Number(b.myRole === 'owner') - Number(a.myRole === 'owner') || a.name.localeCompare(b.name)).slice(0, max);
  return { count: orgs.length, ownedText: `${owned} you own`, shown, more: Math.max(0, orgs.length - shown.length) };
}

/**
 * "2 you created · 1 you can manage · 3 as member". "Created", not "own": owned counts only workspaces the person added,
 * while an organization owner's organization workspaces count under managed.
 */
export function workspaceOverview(counts: { owned: number; managed: number; participating: number }): string {
  return `${counts.owned} you created · ${counts.managed} you can manage · ${counts.participating} as member`;
}

/** The unfinished path the person worked on last, to pick up again; null when every path is finished or has no steps. */
export function pathToContinue<T extends { done: number; total: number; lastActivityAt: string }>(paths: T[]): T | null {
  return orderPaths(paths).find(p => p.total > 0 && p.done < p.total) ?? null;
}
