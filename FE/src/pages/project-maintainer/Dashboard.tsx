import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Empty, Select, Spin, Tag } from 'antd';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  ShieldCheck,
  UserPlus,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import type { ProjectSummary } from '@/features/project-data';
import { ApiError } from '@/api/client';
import { ManagedWorkspaces } from './managed';
import { UnreadFindingsNotice } from './UnreadFindingsNotice';
import { describeAccessError, pickWorkspace } from './managed-access';
import {
  getProjectDashboard,
  getProjectApprovals,
  getTeamMembers,
} from '@/features/pm-api';
import type { ProjectDashboard, Approval } from '@/features/pm-api';
import { projectRoleLabel } from '@/features/role-labels';
import { filterTeamRows, teamRows, type TeamRow } from './team-rows';


import { formatDate } from '@/i18n/format';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';
import { fontFamily } from '@/theme/fonts';

const MSG = defineMessages({
  pending: 'PENDING', approved: 'APPROVED', rejected: 'REJECTED', title: 'Maintainer overview', loadFailed: 'This workspace could not be loaded.',
  intro: 'The health of a workspace you maintain, and what waits for you.', selectWorkspace: 'Select workspace', selectPlaceholder: 'Select a workspace', refresh: 'Refresh', loading: 'Loading dashboard...',
  components: 'Components', confirmed: 'Confirmed', draft: 'Draft', rules: 'Rules', violations: '{count} violations', violations_one: '1 violation', decisions: 'Decisions', pendingApprovals: 'Pending Approvals',
  noData: 'Dashboard data not available for this workspace', selectToView: 'Select a workspace to view dashboard', recent: 'Recent architectural change requests.', viewAll: 'View all →',
  noPending: 'No pending approvals', requestedBy: '{project} · requested by {name}', team: 'Team', members: 'Members on this workspace.', manage: 'Manage →', noTeam: 'No team members', invite: 'Invite',
}, {
  pending: 'ĐANG CHỜ', approved: 'ĐÃ DUYỆT', rejected: 'BỊ TỪ CHỐI', title: 'Tổng quan người bảo trì', loadFailed: 'Không tải được không gian làm việc này.',
  intro: 'Tình trạng của không gian làm việc bạn bảo trì, và những việc đang chờ bạn.', selectWorkspace: 'Chọn không gian làm việc', selectPlaceholder: 'Chọn không gian làm việc', refresh: 'Làm mới', loading: 'Đang tải tổng quan...',
  components: 'Thành phần', confirmed: 'Đã xác nhận', draft: 'Nháp', rules: 'Quy tắc', violations: '{count} vi phạm', decisions: 'Quyết định', pendingApprovals: 'Chờ phê duyệt',
  noData: 'Không có dữ liệu tổng quan cho không gian làm việc này', selectToView: 'Chọn một không gian làm việc để xem tổng quan', recent: 'Các yêu cầu thay đổi kiến trúc gần đây.', viewAll: 'Xem tất cả →',
  noPending: 'Không có yêu cầu chờ duyệt', requestedBy: '{project} · do {name} yêu cầu', team: 'Nhóm', members: 'Thành viên của không gian làm việc này.', manage: 'Quản lý →', noTeam: 'Không có thành viên', invite: 'Mời',
});

const statusMeta = {
  pending: { label: 'pending', color: 'var(--at-warn)', icon: Clock },
  approved: { label: 'approved', color: 'var(--at-success)', icon: CheckCircle2 },
  rejected: { label: 'rejected', color: 'var(--at-danger)', icon: XCircle },
} as const;

export default function ProjectMaintainerDashboard() {
  const m = useMessages(MSG);
  return <ManagedWorkspaces title={m('title')}>{projects => <ProjectMaintainerDashboardView projects={projects} />}</ManagedWorkspaces>;
}

function ProjectMaintainerDashboardView({ projects }: { projects: ProjectSummary[] }) {
  const [selectedProject, setSelectedProject] = useState(() => pickWorkspace(projects));
  const [dashboard, setDashboard] = useState<ProjectDashboard | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const m = useMessages(MSG);

  useEffect(() => {
    if (!selectedProject) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);

    Promise.all([
      // A refusal is worth showing; the other panels just stay empty when their data is missing.
      getProjectDashboard(selectedProject, controller.signal).catch(e => {
        if (e instanceof ApiError && e.status === 403) throw e;
        return null;
      }),
      getProjectApprovals(selectedProject, { status: 'pending' }, controller.signal).catch(() => ({ data: { approvals: [] } })),
      getTeamMembers(controller.signal).catch(() => ({ data: { members: [] } })),
    ])
      .then(([dashboardRes, approvalsRes, teamRes]) => {
        setDashboard(dashboardRes?.data ?? null);
        setApprovals(approvalsRes.data.approvals.slice(0, 5));
        setTeam(filterTeamRows(teamRows(teamRes.data.members), '', selectedProject).slice(0, 6));
        setError(null);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(describeAccessError(e, translate(MSG, 'loadFailed')));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [selectedProject, revision]);

  function refresh() {
    setRevision(v => v + 1);
  }

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-10">
        <div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[var(--at-text)] mb-2">{m('title')}</h2>
              <p className="text-[var(--at-muted)] text-sm max-w-xl leading-relaxed">
                {m('intro')}
              </p>
            </div>
            <div className="flex gap-2">
              <Select
                aria-label={m('selectWorkspace')}
                value={selectedProject}
                onChange={setSelectedProject}
                className="min-w-60"
                options={projects.map(p => ({ value: p.id, label: p.name }))}
                placeholder={m('selectPlaceholder')}
              />
              <Button loading={loading} onClick={refresh}>{m('refresh')}</Button>
            </div>
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[var(--at-line)] to-transparent mt-8"></div>
        </div>

        <UnreadFindingsNotice />
        {error && <p className="text-[var(--at-danger)]">{error}</p>}

        {loading ? (
          <div className="p-12 text-center"><Spin /><p className="mt-3 text-[var(--at-muted)]">{m('loading')}</p></div>
        ) : dashboard ? (
          <>
            <section>
              <div className="mb-6 flex items-center gap-2">
                <ShieldCheck size={18} className="text-[var(--at-link)]" />
                <h3 className="text-xl font-bold text-[var(--at-text)] tracking-tight">{dashboard.project.name}</h3>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[var(--at-panel-2)] border border-[var(--at-line)] p-5">
                  <p className="text-xs text-[var(--at-muted)] uppercase tracking-wider mb-2" style={{ fontFamily: fontFamily.mono }}>{m('components')}</p>
                  <p className="text-3xl font-bold text-[var(--at-text)]" style={{ fontFamily: fontFamily.mono }}>{dashboard.diagram.componentsCount}</p>
                  <Tag className="mt-2" color={dashboard.diagram.confirmedAt ? 'green' : 'gold'}>
                    {dashboard.diagram.confirmedAt ? m('confirmed') : m('draft')}
                  </Tag>
                </div>
                <div className="bg-[var(--at-panel-2)] border border-[var(--at-line)] p-5">
                  <p className="text-xs text-[var(--at-muted)] uppercase tracking-wider mb-2" style={{ fontFamily: fontFamily.mono }}>{m('rules')}</p>
                  <p className="text-3xl font-bold text-[var(--at-text)]" style={{ fontFamily: fontFamily.mono }}>{dashboard.rules.enabled}/{dashboard.rules.total}</p>
                  {dashboard.rules.violations > 0 && (
                    <Tag className="mt-2" color="red">{m('violations', { count: dashboard.rules.violations })}</Tag>
                  )}
                </div>
                <div className="bg-[var(--at-panel-2)] border border-[var(--at-line)] p-5">
                  <p className="text-xs text-[var(--at-muted)] uppercase tracking-wider mb-2" style={{ fontFamily: fontFamily.mono }}>{m('decisions')}</p>
                  <p className="text-3xl font-bold text-[var(--at-text)]" style={{ fontFamily: fontFamily.mono }}>{dashboard.decisions.total}</p>
                </div>
                <div className="bg-[var(--at-panel-2)] border border-[var(--at-line)] p-5">
                  <p className="text-xs text-[var(--at-muted)] uppercase tracking-wider mb-2" style={{ fontFamily: fontFamily.mono }}>{m('pendingApprovals')}</p>
                  <p className="text-3xl font-bold text-[var(--at-warn)]" style={{ fontFamily: fontFamily.mono }}>{dashboard.approvals.pending}</p>
                </div>
              </div>
            </section>
          </>
        ) : selectedProject ? (
          <Empty description={m('noData')} />
        ) : (
          <Empty description={m('selectToView')} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <section className="lg:col-span-3">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-[var(--at-text)] tracking-tight">{m('pendingApprovals')}</h3>
                <p className="text-sm text-[var(--at-muted)] mt-1">{m('recent')}</p>
              </div>
              <Link to="/project-maintainer/approvals" className="text-sm text-[var(--at-link)]">{m('viewAll')}</Link>
            </div>

            {approvals.length === 0 ? (
              <Empty description={m('noPending')} />
            ) : (
              <div className="relative pl-6 space-y-6">
                <div className="absolute left-[3px] top-1 bottom-1 w-px bg-[var(--at-line)]"></div>
                {approvals.map(item => {
                  const meta = statusMeta[item.status];
                  const StatusIcon = meta.icon;
                  return (
                    <div key={item.id} className="relative">
                      <div
                        className="absolute -left-6 top-1 w-[7px] h-[7px] rounded-full"
                        style={{ backgroundColor: meta.color, boxShadow: `0 0 6px ${meta.color}` }}
                      ></div>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest"
                              style={{ fontFamily: fontFamily.mono, color: meta.color }}
                            >
                              <StatusIcon size={11} />
                              {m(meta.label)}
                            </span>
                            <span className="text-[10px] text-[var(--at-muted)]" style={{ fontFamily: fontFamily.mono }}>
                              {formatDate(item.requestedAt)}
                            </span>
                          </div>
                          <h4 className="text-[var(--at-text)] text-sm font-bold mb-1">{item.title}</h4>
                          <div className="text-xs text-[var(--at-muted)]" style={{ fontFamily: fontFamily.mono }}>
                            {m('requestedBy', { project: item.project, name: item.requestedBy })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="lg:col-span-2">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-[var(--at-text)] tracking-tight">{m('team')}</h3>
                <p className="text-sm text-[var(--at-muted)] mt-1">{m('members')}</p>
              </div>
              <Link to="/project-maintainer/team" className="text-sm text-[var(--at-link)]">{m('manage')}</Link>
            </div>

            {team.length === 0 ? (
              <Empty description={m('noTeam')} />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {team.map(member => (
                  <div key={member.key} className="bg-[var(--at-panel)] border border-[var(--at-line)] p-4 flex flex-col items-center text-center gap-2">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-full bg-[var(--at-panel-2)] border border-[var(--at-line)] flex items-center justify-center text-sm font-bold text-[var(--at-muted)]" style={{ fontFamily: fontFamily.mono }}>
                        {member.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[var(--at-panel)]"
                        style={{ backgroundColor: member.status === 'active' ? 'var(--at-success)' : 'var(--at-line-strong)' }}
                      ></div>
                    </div>
                    <div className="min-w-0 w-full">
                      <h4 className="text-[var(--at-text)] text-xs font-bold truncate" style={{ fontFamily: fontFamily.mono }}>{member.name}</h4>
                      <p className="text-[10px] text-[var(--at-muted)] truncate">{projectRoleLabel(member.role)}</p>
                    </div>
                  </div>
                ))}
                <Link
                  to="/project-maintainer/team"
                  className="border border-dashed border-[var(--at-line)] hover:border-[var(--at-accent)]/50 p-4 flex flex-col items-center justify-center gap-2 text-[var(--at-muted)] hover:text-[var(--at-link)] transition-colors"
                >
                  <UserPlus size={18} />
                  <span className="text-[10px] uppercase tracking-widest" style={{ fontFamily: fontFamily.mono }}>{m('invite')}</span>
                </Link>
              </div>
            )}
          </section>
        </div>

        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
}
