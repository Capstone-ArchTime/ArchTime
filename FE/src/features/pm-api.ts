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
  return apiRequest(`/projects/${projectId}/members/${memberId}/role`, {
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
export interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'invited';
  projects: string[];
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

export async function getProjectDashboard(
  projectId: string,
  signal?: AbortSignal
): Promise<ProjectDashboardResponse> {
  return apiRequest<ProjectDashboardResponse>(`/projects/${projectId}/dashboard`, { signal });
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
