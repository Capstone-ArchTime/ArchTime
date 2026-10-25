import { apiRequest } from '@/api/client';

// Team Members
export interface ProjectMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'developer-analyst' | 'project-maintainer';
  status: 'active' | 'invited';
  joinedAt?: string;
}

export interface ProjectMembersResponse {
  data: {
    members: ProjectMember[];
    total: number;
  };
}

export interface ProjectInvitation {
  id: string;
  email: string;
  role: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt?: string;
}

export interface ProjectInvitationsResponse {
  data: {
    invitations: ProjectInvitation[];
  };
}

export async function getProjectMembers(
  projectId: string,
  signal?: AbortSignal
): Promise<ProjectMembersResponse> {
  return apiRequest<ProjectMembersResponse>(`/projects/${projectId}/members`, { signal });
}

export async function inviteProjectMember(
  projectId: string,
  data: { email: string; role: string },
  signal?: AbortSignal
): Promise<{ data: { invitation: ProjectInvitation } }> {
  return apiRequest(`/projects/${projectId}/members/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export async function updateMemberRole(
  projectId: string,
  memberId: string,
  role: string,
  signal?: AbortSignal
): Promise<{ data: { member: ProjectMember } }> {
  return apiRequest(`/projects/${projectId}/members/${memberId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
    signal,
  });
}

export async function removeMember(
  projectId: string,
  memberId: string,
  signal?: AbortSignal
): Promise<void> {
  return apiRequest(`/projects/${projectId}/members/${memberId}`, {
    method: 'DELETE',
    signal,
  });
}

export async function getProjectInvitations(
  projectId: string,
  signal?: AbortSignal
): Promise<ProjectInvitationsResponse> {
  return apiRequest<ProjectInvitationsResponse>(`/projects/${projectId}/invitations`, { signal });
}

export async function cancelInvitation(
  projectId: string,
  invitationId: string,
  signal?: AbortSignal
): Promise<void> {
  return apiRequest(`/projects/${projectId}/invitations/${invitationId}`, {
    method: 'DELETE',
    signal,
  });
}

// Team members across all projects (for maintainer)
export interface TeamMembership {
  projectId: string;
  /** The id the member routes of that workspace take. */
  memberId: string;
  /** "owner" for the workspace owner, else the membership role. */
  role: string;
  status: 'active' | 'invited';
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'invited';
  projects: string[];
  memberships: TeamMembership[];
}

export interface TeamMembersResponse {
  data: {
    members: TeamMember[];
  };
}

export async function getTeamMembers(signal?: AbortSignal): Promise<TeamMembersResponse> {
  return apiRequest<TeamMembersResponse>('/projects/team/members', { signal });
}

// Approvals
export interface Approval {
  id: string;
  projectId: string;
  project: string;
  title: string;
  description: string;
  commit: string;
  snapshotId?: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reason?: string;
}

export interface ApprovalsResponse {
  data: {
    approvals: Approval[];
    total: number;
  };
}

export async function getProjectApprovals(
  projectId: string,
  params?: { status?: string },
  signal?: AbortSignal
): Promise<ApprovalsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
  const qs = searchParams.toString();
  return apiRequest<ApprovalsResponse>(`/projects/${projectId}/approvals${qs ? `?${qs}` : ''}`, { signal });
}

export async function getApprovalDetail(
  projectId: string,
  approvalId: string,
  signal?: AbortSignal
): Promise<{ data: { approval: Approval } }> {
  return apiRequest(`/projects/${projectId}/approvals/${approvalId}`, { signal });
}

export async function createApproval(
  projectId: string,
  data: { title: string; description: string; commit: string; snapshotId?: string },
  signal?: AbortSignal
): Promise<{ data: { approval: Approval } }> {
  return apiRequest(`/projects/${projectId}/approvals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export async function approveRequest(
  projectId: string,
  approvalId: string,
  reason?: string,
  signal?: AbortSignal
): Promise<{ data: { approval: Approval } }> {
  return apiRequest(`/projects/${projectId}/approvals/${approvalId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
    signal,
  });
}

export async function rejectRequest(
  projectId: string,
  approvalId: string,
  reason: string,
  signal?: AbortSignal
): Promise<{ data: { approval: Approval } }> {
  return apiRequest(`/projects/${projectId}/approvals/${approvalId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
    signal,
  });
}

// Dashboard
export interface ProjectDashboard {
  project: {
    id: string;
    name: string;
    description?: string;
  };
  diagram: {
    componentsCount: number;
    revision: number;
    confirmedAt?: string;
  };
  rules: {
    total: number;
    enabled: number;
    violations: number;
  };
  decisions: {
    total: number;
  };
  approvals: {
    pending: number;
  };
  team: {
    active: number;
    invited: number;
  };
}

export interface ProjectDashboardResponse {
  data: ProjectDashboard;
}

/** What GET /projects/:id/dashboard sends (BE GetProjectDashboardUseCase), as far as the page uses it. */
type ServerDashboard = {
  project?: { id?: unknown; name?: unknown; description?: unknown };
  architecture?: { revision?: unknown; componentsCount?: unknown; confirmedAt?: unknown };
  rules?: { total?: unknown; active?: unknown; violationsCount?: unknown };
  decisions?: { total?: unknown };
  approvals?: { pendingCount?: unknown };
  team?: { totalMembers?: unknown };
};

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0);

/** Turns the server's workspace summary into the shape the maintainer overview shows. */
export function toProjectDashboard(server: ServerDashboard | undefined): ProjectDashboard {
  const project = server?.project;
  if (!project || typeof project.id !== 'string' || typeof project.name !== 'string') throw new Error('The server returned an invalid workspace summary.');
  const confirmedAt = server.architecture?.confirmedAt;
  return {
    project: { id: project.id, name: project.name, description: typeof project.description === 'string' ? project.description : undefined },
    diagram: { componentsCount: count(server.architecture?.componentsCount), revision: count(server.architecture?.revision), confirmedAt: typeof confirmedAt === 'string' && confirmedAt ? confirmedAt : undefined },
    rules: { total: count(server.rules?.total), enabled: count(server.rules?.active), violations: count(server.rules?.violationsCount) },
    decisions: { total: count(server.decisions?.total) },
    approvals: { pending: count(server.approvals?.pendingCount) },
    team: { active: count(server.team?.totalMembers), invited: 0 },
  };
}

export async function getProjectDashboard(
  projectId: string,
  signal?: AbortSignal
): Promise<ProjectDashboardResponse> {
  const body = await apiRequest<{ data?: { dashboard?: ServerDashboard } }>(`/projects/${encodeURIComponent(projectId)}/dashboard`, { signal });
  return { data: toProjectDashboard(body?.data?.dashboard) };
}

// Reports
export interface ProjectReport {
  id: string;
  projectId: string;
  project: string;
  baseSnapshotId: string;
  targetSnapshotId: string;
  from: string;
  to: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  createdBy: string;
  downloadUrl?: string;
}

export interface ProjectReportsResponse {
  data: {
    reports: ProjectReport[];
    total: number;
  };
}

export async function getProjectReports(
  projectId: string,
  signal?: AbortSignal
): Promise<ProjectReportsResponse> {
  return apiRequest<ProjectReportsResponse>(`/projects/${projectId}/reports`, { signal });
}

export async function generateReport(
  projectId: string,
  data: { baseSnapshotId: string; targetSnapshotId: string },
  signal?: AbortSignal
): Promise<{ data: { report: ProjectReport } }> {
  return apiRequest(`/projects/${projectId}/reports/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
}

export async function getReportDetail(
  projectId: string,
  reportId: string,
  signal?: AbortSignal
): Promise<{ data: { report: ProjectReport } }> {
  return apiRequest(`/projects/${projectId}/reports/${reportId}`, { signal });
}
