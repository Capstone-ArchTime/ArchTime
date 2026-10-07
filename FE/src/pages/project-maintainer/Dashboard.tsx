import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Empty, Select, Spin, Tag } from 'antd';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  ShieldCheck,
  ArrowRight,
  UserPlus,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
} from 'lucide-react';
import { getProjects } from '@/features/project-data';
import type { ProjectSummary } from '@/features/project-data';
import {
  getProjectDashboard,
  getProjectApprovals,
  getTeamMembers,
} from '@/features/pm-api';
import type { ProjectDashboard, Approval, TeamMember } from '@/features/pm-api';

const fontFamily = { mono: '"JetBrains Mono", monospace' };

const statusMeta = {
  pending: { label: 'PENDING', color: '#ffb03a', icon: Clock },
  approved: { label: 'APPROVED', color: '#22c55e', icon: CheckCircle2 },
  rejected: { label: 'REJECTED', color: '#ef4444', icon: XCircle },
};

export default function ProjectMaintainerDashboard() {
  const { message } = App.useApp();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [dashboard, setDashboard] = useState<ProjectDashboard | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getProjects(controller.signal)
      .then(res => {
        setProjects(res);
        if (res.length > 0 && !selectedProject) {
          setSelectedProject(res[0].id);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedProject) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);

    Promise.all([
      getProjectDashboard(selectedProject, controller.signal).catch(() => null),
      getProjectApprovals(selectedProject, { status: 'pending' }, controller.signal).catch(() => ({ data: { approvals: [] } })),
      getTeamMembers(controller.signal).catch(() => ({ data: { members: [] } })),
    ])
      .then(([dashboardRes, approvalsRes, teamRes]) => {
        setDashboard(dashboardRes?.data ?? null);
        setApprovals(approvalsRes.data.approvals.slice(0, 5));
        setTeam(teamRes.data.members.filter(m => m.projects.includes(selectedProject)).slice(0, 6));
        setError(null);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [selectedProject, revision]);

  function refresh() {
    setRevision(v => v + 1);
  }

  const currentProject = projects.find(p => p.id === selectedProject);

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#161d24] border border-[#222c37] mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shadow-[0_0_5px_#38bdf8]"></div>
            <span className="text-[10px] text-[#38bdf8] tracking-wider font-semibold uppercase" style={{ fontFamily: fontFamily.mono }}>
              Project Maintainer Workspace
            </span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Project &amp; architecture overview</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Track architecture health, review changes, manage teams, and document diagrams, rules, and design decisions.
              </p>
            </div>
            <div className="flex gap-2">
              <Select
                aria-label="Select project"
                value={selectedProject}
                onChange={setSelectedProject}
                className="min-w-60"
                options={projects.map(p => ({ value: p.id, label: p.name }))}
                placeholder="Select a project"
              />
              <Button loading={loading} onClick={refresh}>Refresh</Button>
            </div>
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#222c37] to-transparent mt-8"></div>
        </div>

        {error && <p className="text-red-400">{error}</p>}

        <section aria-label="Architecture maintenance" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[
            { path: 'component-diagram', title: 'Confirm & edit component diagram', description: 'Refine components and dependencies, then confirm the reviewed model.' },
            { path: 'architecture-rules', title: 'Define architecture rules', description: 'Set dependency constraints and check the saved diagram for violations.' },
            { path: 'design-decisions', title: 'Record design decisions', description: 'Capture context, alternatives, and the consequences of each decision.' },
          ].map(item => (
            <Link
              key={item.path}
              to={`/project-maintainer/${item.path}${selectedProject ? `?project=${selectedProject}` : ''}`}
              className="group border border-[#222c37] bg-[#11161b] p-5 hover:border-[#38bdf8] focus-visible:outline focus-visible:outline-[#38bdf8] transition-colors"
            >
              <div className="flex justify-between gap-3">
                <h3 className="font-semibold text-sm group-hover:text-[#38bdf8]">{item.title}</h3>
                <ArrowRight size={16} className="text-[#38bdf8] shrink-0" />
              </div>
              <p className="text-xs text-[#94a3b8] leading-relaxed mt-3">{item.description}</p>
            </Link>
          ))}
        </section>

        {loading ? (
          <div className="p-12 text-center"><Spin /><p className="mt-3 text-[#94a3b8]">Loading dashboard...</p></div>
        ) : dashboard ? (
          <>
            <section>
              <div className="mb-6 flex items-center gap-2">
                <ShieldCheck size={18} className="text-[#38bdf8]" />
                <h3 className="text-xl font-bold text-[#f4f4f6] tracking-tight">{dashboard.project.name}</h3>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#161d24] border border-[#222c37] p-5">
                  <p className="text-xs text-[#94a3b8] uppercase tracking-wider mb-2" style={{ fontFamily: fontFamily.mono }}>Components</p>
                  <p className="text-3xl font-bold text-[#f4f4f6]" style={{ fontFamily: fontFamily.mono }}>{dashboard.diagram.componentsCount}</p>
                  <Tag className="mt-2" color={dashboard.diagram.confirmedAt ? 'green' : 'gold'}>
                    {dashboard.diagram.confirmedAt ? 'Confirmed' : 'Draft'}
                  </Tag>
                </div>
                <div className="bg-[#161d24] border border-[#222c37] p-5">
                  <p className="text-xs text-[#94a3b8] uppercase tracking-wider mb-2" style={{ fontFamily: fontFamily.mono }}>Rules</p>
                  <p className="text-3xl font-bold text-[#f4f4f6]" style={{ fontFamily: fontFamily.mono }}>{dashboard.rules.enabled}/{dashboard.rules.total}</p>
                  {dashboard.rules.violations > 0 && (
                    <Tag className="mt-2" color="red">{dashboard.rules.violations} violations</Tag>
                  )}
                </div>
                <div className="bg-[#161d24] border border-[#222c37] p-5">
                  <p className="text-xs text-[#94a3b8] uppercase tracking-wider mb-2" style={{ fontFamily: fontFamily.mono }}>Decisions</p>
                  <p className="text-3xl font-bold text-[#f4f4f6]" style={{ fontFamily: fontFamily.mono }}>{dashboard.decisions.total}</p>
                </div>
                <div className="bg-[#161d24] border border-[#222c37] p-5">
                  <p className="text-xs text-[#94a3b8] uppercase tracking-wider mb-2" style={{ fontFamily: fontFamily.mono }}>Pending Approvals</p>
                  <p className="text-3xl font-bold text-[#ffb03a]" style={{ fontFamily: fontFamily.mono }}>{dashboard.approvals.pending}</p>
                </div>
              </div>
            </section>
          </>
        ) : selectedProject ? (
          <Empty description="Dashboard data not available for this project" />
        ) : (
          <Empty description="Select a project to view dashboard" />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <section className="lg:col-span-3">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-[#f4f4f6] tracking-tight">Pending Approvals</h3>
                <p className="text-sm text-[#94a3b8] mt-1">Recent architectural change requests.</p>
              </div>
              <Link to="/project-maintainer/approvals" className="text-sm text-[#38bdf8]">View all →</Link>
            </div>

            {approvals.length === 0 ? (
              <Empty description="No pending approvals" />
            ) : (
              <div className="relative pl-6 space-y-6">
                <div className="absolute left-[3px] top-1 bottom-1 w-px bg-[#222c37]"></div>
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
                              className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest"
                              style={{ fontFamily: fontFamily.mono, color: meta.color }}
                            >
                              <StatusIcon size={11} />
                              {meta.label}
                            </span>
                            <span className="text-[10px] text-[#94a3b8]" style={{ fontFamily: fontFamily.mono }}>
                              {new Date(item.requestedAt).toLocaleDateString()}
                            </span>
                          </div>
                          <h4 className="text-[#f4f4f6] text-sm font-bold mb-1">{item.title}</h4>
                          <div className="text-xs text-[#94a3b8]" style={{ fontFamily: fontFamily.mono }}>
                            {item.project} · requested by {item.requestedBy}
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
                <h3 className="text-xl font-bold text-[#f4f4f6] tracking-tight">Team</h3>
                <p className="text-sm text-[#94a3b8] mt-1">Members on this project.</p>
              </div>
              <Link to="/project-maintainer/team" className="text-sm text-[#38bdf8]">Manage →</Link>
            </div>

            {team.length === 0 ? (
              <Empty description="No team members" />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {team.map(member => (
                  <div key={member.id} className="bg-[#11161b] border border-[#222c37] p-4 flex flex-col items-center text-center gap-2">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-full bg-[#161d24] border border-[#222c37] flex items-center justify-center text-sm font-bold text-[#94a3b8]" style={{ fontFamily: fontFamily.mono }}>
                        {member.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#11161b]"
                        style={{ backgroundColor: member.status === 'active' ? '#22c55e' : '#5f636b' }}
                      ></div>
                    </div>
                    <div className="min-w-0 w-full">
                      <h4 className="text-[#f4f4f6] text-xs font-bold truncate" style={{ fontFamily: fontFamily.mono }}>{member.name}</h4>
                      <p className="text-[10px] text-[#94a3b8] truncate">{member.role}</p>
                    </div>
                  </div>
                ))}
                <Link
                  to="/project-maintainer/team"
                  className="border border-dashed border-[#222c37] hover:border-[#38bdf8]/50 p-4 flex flex-col items-center justify-center gap-2 text-[#94a3b8] hover:text-[#38bdf8] transition-colors"
                >
                  <UserPlus size={18} />
                  <span className="text-[10px] uppercase tracking-widest" style={{ fontFamily: fontFamily.mono }}>Invite</span>
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
