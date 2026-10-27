// The rules the server applies to a person's own profile (BE: UpdateProfileUseCase, shared/utils/validators.ts), so the page can
// say what is wrong before sending. The server checks everything again; these only mirror it.

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
  if (!name) return 'Enter your name.';
  if (name.length > NAME_MAX) return `At most ${NAME_MAX} characters.`;
  return null;
}

/** An empty username is allowed: it removes the username. */
export function checkUsername(raw: string): string | null {
  const username = normalizeUsername(raw);
  if (!username) return null;
  return USERNAME_PATTERN.test(username) ? null : USERNAME_HINT;
}

/** The server's password rules, in the server's order; null when the password is acceptable. */
export function checkNewPassword(password: string): string | null {
  // The limit is in bytes, not characters: a password of 30 CJK characters is 90 bytes.
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return 'Password must be at most 72 bytes (fewer characters if some are not plain letters).';
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (/\s/.test(password)) return 'Password must not contain spaces.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!SPECIAL.test(password)) return 'Password must contain at least one special character.';
  return null;
}

export type PasswordRequirement = { label: string; met: boolean };

/** The same rules as checkNewPassword, as a checklist to show under a new-password field while it is typed. */
export function passwordRequirements(password: string): PasswordRequirement[] {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'An uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'A lowercase letter (a-z)', met: /[a-z]/.test(password) },
    { label: 'A number (0-9)', met: /[0-9]/.test(password) },
    { label: 'A special character, such as ! @ # $ % _ -', met: SPECIAL.test(password) },
    { label: 'No spaces', met: password.length > 0 && !/\s/.test(password) },
    { label: 'At most 72 bytes', met: new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES },
  ];
}

export type PasswordForm ={ oldPassword: string; newPassword: string; confirmNewPassword: string };
export type PasswordProblems = Partial<Record<keyof PasswordForm, string>>;

export function checkPasswordForm(form: PasswordForm): PasswordProblems {
  const problems: PasswordProblems = {};
  if (!form.oldPassword) problems.oldPassword = 'Enter your current password.';
  const rule = checkNewPassword(form.newPassword);
  if (!form.newPassword) problems.newPassword = 'Enter a new password.';
  else if (rule) problems.newPassword = rule;
  if (!form.confirmNewPassword) problems.confirmNewPassword = 'Repeat the new password.';
  else if (form.confirmNewPassword !== form.newPassword) problems.confirmNewPassword = 'New passwords do not match.';
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
  return role === 'system-administrator' ? 'System administrator' : 'User';
}
