import { useDemoStore } from './useDemoStore';
export const demoProjects = ['E-Commerce Platform', 'Payment Platform', 'Healthcare Connect'];
export type TeamMember = { id: string; name: string; email: string; projects: string[]; status: 'active' | 'invited'; role: 'developer-analyst' | 'project-maintainer' };
export type Approval = { id: string; project: string; title: string; commit: string; requestedBy: string; requestedAt: string; description: string; status: 'pending' | 'approved' | 'rejected'; reviewedBy?: string; reviewedAt?: string; reason?: string };
export type MaintainerData = { members: TeamMember[]; approvals: Approval[] };
const seed: MaintainerData = {
  members: [{ id: 'member-jamie', name: 'Jamie Tran', email: 'jamie@example.com', projects: [demoProjects[0]], role: 'developer-analyst', status: 'active' }],
  approvals: [{ id: 'approval-notification', project: demoProjects[0], title: 'Extract notification service', commit: 'd82f91a', requestedBy: 'Jamie Tran', requestedAt: '2026-09-21T08:00:00Z', description: 'Demo proposal: move notification delivery into a dedicated service. Review the proposed boundary and failure handling before approving.', status: 'pending' }],
};
function valid(value: unknown): value is MaintainerData {
  const d = value as MaintainerData;
  return !!d && Array.isArray(d.members) && d.members.every(m => m && ['id', 'name', 'email'].every(k => typeof m[k as keyof TeamMember] === 'string') && ['active', 'invited'].includes(m.status) && ['developer-analyst', 'project-maintainer'].includes(m.role) && Array.isArray(m.projects) && m.projects.length > 0 && m.projects.every(p => demoProjects.includes(p))) && Array.isArray(d.approvals) && d.approvals.every(a => a && ['id', 'project', 'title', 'commit', 'requestedBy', 'requestedAt', 'description'].every(k => typeof a[k as keyof Approval] === 'string') && ['pending', 'approved', 'rejected'].includes(a.status) && ['reviewedBy', 'reviewedAt', 'reason'].every(k => a[k as keyof Approval] === undefined || typeof a[k as keyof Approval] === 'string'));
}
export function useMaintainerDemo() { return useDemoStore('maintainer', seed, valid, 'project-maintainer'); }
