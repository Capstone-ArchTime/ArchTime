import type { TeamMember } from '@/features/pm-api';

/** One person in one workspace: every action on a row goes to that workspace and that membership. */
export interface TeamRow {
  key: string;
  memberId: string;
  projectId: string;
  name: string;
  email: string;
  /** "owner", "project-maintainer" or "developer-analyst". */
  role: string;
  status: 'active' | 'invited';
  /** The owner's row cannot be removed or have its role changed. */
  isOwner: boolean;
}

/** Splits the server's people (grouped by email) into one row per member × workspace. */
export function teamRows(members: readonly TeamMember[]): TeamRow[] {
  return members.flatMap(m =>
    (m.memberships ?? []).map(ms => ({
      key: `${ms.projectId}:${ms.memberId}`,
      memberId: ms.memberId,
      projectId: ms.projectId,
      name: m.name,
      email: m.email,
      role: ms.role,
      status: ms.status,
      isOwner: ms.role === 'owner',
    })),
  );
}

/** Rows matching a name/email search and a workspace ("all" for every workspace). */
export function filterTeamRows(rows: readonly TeamRow[], query: string, projectId: string): TeamRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter(r => `${r.name} ${r.email}`.toLowerCase().includes(q) && (projectId === 'all' || r.projectId === projectId));
}
