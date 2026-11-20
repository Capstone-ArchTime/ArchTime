import { translateOr } from '../i18n/index.ts';

/** Plain names for the role ids the server uses, so screens never show "developer-analyst" (in the page language). */
const systemRoles: Record<string, string> = {
  'developer-analyst': 'User',
  'project-maintainer': 'Project maintainer',
  'system-administrator': 'System administrator',
};
/** Roles on one workspace (ProjectMember.role, plus the owner). */
const projectRoles: Record<string, string> = {
  owner: 'Owner',
  'project-maintainer': 'Maintainer',
  'developer-analyst': 'Member',
  'system-administrator': 'Administrator',
  viewer: 'Viewer',
};
/** Roles in an organization. */
const organizationRoles: Record<string, string> = { owner: 'Owner', member: 'Member' };

const fallback = (role: string) => role.replaceAll('-', ' ').replace(/^./, c => c.toUpperCase());

export const systemRoleLabel = (role: string) => translateOr(`role.system.${role}`, Object.hasOwn(systemRoles, role) ? systemRoles[role] : fallback(role));
export const projectRoleLabel = (role: string) => translateOr(`role.project.${role}`, Object.hasOwn(projectRoles, role) ? projectRoles[role] : fallback(role));
export const organizationRoleLabel = (role: string) => translateOr(`role.org.${role}`, Object.hasOwn(organizationRoles, role) ? organizationRoles[role] : fallback(role));
