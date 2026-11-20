// The rules the server applies to a person's own profile (BE: UpdateProfileUseCase, shared/utils/validators.ts), so the page can
// say what is wrong before sending. The server checks everything again; these only mirror it.
import { translate } from '../i18n/index.ts';

export const NAME_MAX = 100;
export const PASSWORD_MAX_BYTES = 72;
export const USERNAME_HINT = '3 to 32 characters: lowercase letters, digits, ".", "_" or "-", starting and ending with a letter or digit.';
export const PASSWORD_HINT = 'At least 8 characters, no spaces, with an uppercase letter, a lowercase letter, a number and a special character.';
/** The special characters the server accepts in a password. */
export const SPECIAL_CHARACTERS = '! @ # $ % ^ & * ( ) , . ? " : { } | < > - _ + = [ ] / \' \\';

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/;
const SPECIAL = /[!@#$%^&*(),.?":{}|<>\-_+=[\]/'\\]/;

/** Usernames are compared in lower case; the server trims and lower-cases before it checks. */
export const normalizeUsername = (raw: string): string => raw.trim().toLowerCase();

export function checkName(raw: string): string | null {
  const name = raw.trim();
  if (!name) return translate('profile.enterName');
  if (name.length > NAME_MAX) return translate('profile.nameMax', { max: NAME_MAX });
  return null;
}

/** An empty username is allowed: it removes the username. */
export function checkUsername(raw: string): string | null {
  const username = normalizeUsername(raw);
  if (!username) return null;
  return USERNAME_PATTERN.test(username) ? null : translate('profile.usernameHint');
}

/** The server's password rules, in the server's order; null when the password is acceptable. */
export function checkNewPassword(password: string): string | null {
  // The limit is in bytes, not characters: a password of 30 CJK characters is 90 bytes.
  // In the page language (read when called, so a later language change applies to the next check).
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return translate('password.error.bytes');
  if (password.length < 8) return translate('password.error.length');
  if (/\s/.test(password)) return translate('password.error.spaces');
  if (!/[A-Z]/.test(password)) return translate('password.error.upper');
  if (!/[a-z]/.test(password)) return translate('password.error.lower');
  if (!/[0-9]/.test(password)) return translate('password.error.number');
  if (!SPECIAL.test(password)) return translate('password.error.special');
  return null;
}

export type PasswordRequirement = { label: string; met: boolean };

/** The same rules as checkNewPassword, as a checklist to show under a new-password field while it is typed. */
export function passwordRequirements(password: string): PasswordRequirement[] {
  return [
    { label: translate('password.rule.length'), met: password.length >= 8 },
    { label: translate('password.rule.upper'), met: /[A-Z]/.test(password) },
    { label: translate('password.rule.lower'), met: /[a-z]/.test(password) },
    { label: translate('password.rule.number'), met: /[0-9]/.test(password) },
    { label: translate('password.rule.special'), met: SPECIAL.test(password) },
    { label: translate('password.rule.spaces'), met: password.length > 0 && !/\s/.test(password) },
    { label: translate('password.rule.bytes'), met: new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES },
  ];
}

export type PasswordForm ={ oldPassword: string; newPassword: string; confirmNewPassword: string };
export type PasswordProblems = Partial<Record<keyof PasswordForm, string>>;

export function checkPasswordForm(form: PasswordForm): PasswordProblems {
  const problems: PasswordProblems = {};
  if (!form.oldPassword) problems.oldPassword = translate('profile.enterCurrent');
  const rule = checkNewPassword(form.newPassword);
  if (!form.newPassword) problems.newPassword = translate('profile.enterNewPassword');
  else if (rule) problems.newPassword = rule;
  if (!form.confirmNewPassword) problems.confirmNewPassword = translate('profile.repeatNewPassword');
  else if (form.confirmNewPassword !== form.newPassword) problems.confirmNewPassword = translate('profile.newMismatch');
  return problems;
}

export type ProfilePatch = { name?: string; username?: string | null };

/** Only what changed, as the server wants it (a removed username is null); null when there is nothing to save. */
export function buildProfilePatch(saved: { name: string; username?: string | null }, form: { name: string; username: string }): ProfilePatch | null {
  const patch: ProfilePatch = {};
  const name = form.name.trim();
  if (name !== saved.name) patch.name = name;
  const username = normalizeUsername(form.username);
  if (username !== (saved.username ?? '')) patch.username = username || null;
  return Object.keys(patch).length ? patch : null;
}

/** The two system roles the server has now; the older role names are shown as plain users. */
export function accountTypeLabel(role: string): string {
  return translate(role === 'system-administrator' ? 'role.system.system-administrator' : 'role.system.developer-analyst');
}
