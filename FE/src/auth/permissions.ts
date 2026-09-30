export const roles = ['developer-analyst', 'project-maintainer', 'system-administrator'] as const;
export type Role = typeof roles[number];
export type AuthUser = { id: string; name: string; email: string; role: Role };

export const roleHome: Record<Role, string> = {
  'developer-analyst': '/dashboard',
  'project-maintainer': '/project-maintainer',
  'system-administrator': '/system-administrator',
};

const routes: Record<Role, readonly string[]> = {
  'developer-analyst': ['/dashboard', '/projects', '/project', '/history', '/compare', '/evidence', '/insights', '/reports'],
  'project-maintainer': ['/project-maintainer', '/project-maintainer/approvals', '/project-maintainer/team', '/project-maintainer/reports', '/project-maintainer/component-diagram', '/project-maintainer/architecture-rules', '/project-maintainer/design-decisions'],
  'system-administrator': ['/system-administrator', '/system-administrator/users', '/system-administrator/audit-log', '/system-administrator/settings', '/system-administrator/mining-jobs'],
};

export function canAccess(role: Role, path: string) {
  const pathname = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return Object.hasOwn(routes, role) && routes[role].includes(pathname);
}

export function loginDestination(role: Role, requested?: string) {
  return requested && canAccess(role, requested) ? requested : roleHome[role];
}

export function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Record<string, unknown>;
  return typeof user.id === 'string' && !!user.id.trim() && typeof user.name === 'string' && typeof user.email === 'string' && roles.includes(user.role as Role);
}
