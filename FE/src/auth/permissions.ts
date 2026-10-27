/**
 * System roles the server hands out. Maintaining a project is not one of them: it is a role on one project (owner,
 * maintainer, or owner of its organization), which the server checks on every request to that project.
 */
export const roles = ['developer-analyst', 'system-administrator'] as const;
export type Role = typeof roles[number];
/** How the account can sign in, as GET /auth/me reports it (older servers leave it out). */
export type SignInMethods = { password: boolean; github: boolean };
export type AuthUser = { id: string; name: string; email: string; role: Role; username?: string | null; createdAt?: string; signInMethods?: SignInMethods };

export const roleHome: Record<Role, string> = {
  'developer-analyst': '/dashboard',
  'system-administrator': '/system-administrator',
};

/**
 * Pages for maintaining a project. Any developer-analyst may open them; each lists only the workspaces the account
 * maintains, and the server refuses everything else.
 */
export const maintainerRoutes: readonly string[] = ['/project-maintainer', '/project-maintainer/approvals', '/project-maintainer/team', '/project-maintainer/reports', '/project-maintainer/component-diagram', '/project-maintainer/architecture-rules', '/project-maintainer/design-decisions'];

const routes: Record<Role, readonly string[]> = {
  'developer-analyst': ['/dashboard', '/projects', '/organizations', '/project', '/history', '/architecture', '/compare', '/evidence', '/insights', '/reports', '/ai-usage', '/learning', ...maintainerRoutes],
  'system-administrator': ['/system-administrator', '/system-administrator/users', '/system-administrator/audit-log', '/system-administrator/settings', '/system-administrator/mining-jobs', '/system-administrator/ai-models', '/system-administrator/ai-metrics'],
};

/** Paths with an id after them (the workspace of one project or sample). */
const prefixes: Record<Role, readonly string[]> = {
  'developer-analyst': ['/workspace/', '/learning/', '/organizations/'],
  'system-administrator': [],
};

/** Pages every signed-in account has, whatever its role. */
const sharedRoutes: readonly string[] = ['/profile', '/my-work'];

export function canAccess(role: Role, path: string) {
  const pathname = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (!Object.hasOwn(routes, role)) return false;
  return sharedRoutes.includes(pathname) || routes[role].includes(pathname) || prefixes[role].some(p => pathname.startsWith(p) && pathname.length > p.length);
}

export function loginDestination(role: Role, requested?: string) {
  return requested && canAccess(role, requested) ? requested : roleHome[role];
}

export function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Record<string, unknown>;
  return typeof user.id === 'string' && !!user.id.trim() && typeof user.name === 'string' && typeof user.email === 'string' && roles.includes(user.role as Role);
}
