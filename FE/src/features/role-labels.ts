/** Plain names for the role ids the server uses, so screens never show "developer-analyst". */
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
};

const fallback = (role: string) => role.replaceAll('-', ' ').replace(/^./, c => c.toUpperCase());

export const systemRoleLabel = (role: string) => (Object.hasOwn(systemRoles, role) ? systemRoles[role] : fallback(role));
export const projectRoleLabel = (role: string) => (Object.hasOwn(projectRoles, role) ? projectRoles[role] : fallback(role));
