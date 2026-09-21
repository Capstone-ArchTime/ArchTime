import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  ShieldCheck,
  UserPlus,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
} from 'lucide-react';

const fontFamily = {
  mono: '"JetBrains Mono", monospace',
};

const mockProjectHealth = [
  { name: 'E-Commerce Platform', repos: 4, health: 91, changes: 12, healthColor: '#22c55e' },
  { name: 'Payment Platform', repos: 2, health: 76, changes: 21, healthColor: '#ffb03a' },
  { name: 'Healthcare Connect', repos: 3, health: 64, changes: 38, healthColor: '#ef4444' },
];

const mockApprovalFeed = [
  {
    status: 'pending' as const,
    title: 'Extract notification-service from core-monolith',
    repo: 'ecomm-core',
    requestedBy: 'j.tran',
    ago: '2 hours ago',
  },
  {
    status: 'pending' as const,
    title: 'Reverse dependency: catalog-svc → pricing-svc',
    repo: 'catalog-service',
    requestedBy: 'm.nguyen',
    ago: 'Yesterday',
  },
  {
    status: 'approved' as const,
    title: 'Split payment-gateway into auth and settlement modules',
    repo: 'payment-service',
    requestedBy: 'k.pham',
    ago: '2 days ago',
  },
  {
    status: 'rejected' as const,
    title: 'Merge legacy-job into settlement-core',
    repo: 'settlement-core',
    requestedBy: 'k.pham',
    ago: '3 days ago',
  },
];

const mockTeamRoster = [
  { name: 'j.tran', role: 'Developer / Analyst', projects: 3, active: true },
  { name: 'm.nguyen', role: 'Developer / Analyst', projects: 2, active: true },
  { name: 'k.pham', role: 'Developer / Analyst', projects: 4, active: false },
  { name: 'a.le', role: 'Developer / Analyst', projects: 1, active: true },
];

const statusMeta = {
  pending: { label: 'PENDING', color: '#ffb03a', icon: Clock },
  approved: { label: 'APPROVED', color: '#22c55e', icon: CheckCircle2 },
  rejected: { label: 'REJECTED', color: '#ef4444', icon: XCircle },
};

const ProjectMaintainerDashboard: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-10">

        {/* HEADER */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#161d24] border border-[#222c37] mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shadow-[0_0_5px_#38bdf8]"></div>
            <span
              className="text-[10px] text-[#38bdf8] tracking-wider font-semibold uppercase"
              style={{ fontFamily: fontFamily.mono }}
            >
              Project Maintainer Workspace
            </span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Project &amp; architecture overview</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Track architecture health, review pending changes, and manage teams across all projects you maintain.
              </p>
            </div>
            <button className="shrink-0 h-10 px-5 bg-[#161d24] hover:bg-[#222c37] border border-[#222c37] text-[#f4f4f6] font-medium text-xs transition-colors flex items-center gap-2">
              <UserPlus size={16} className="text-[#38bdf8]" />
              INVITE TEAM MEMBER
            </button>
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#222c37] to-transparent mt-8"></div>
        </div>

        {/* PROJECT HEALTH — horizontal progress strip */}
        <section>
          <div className="mb-6 flex items-center gap-2">
            <ShieldCheck size={18} className="text-[#38bdf8]" />
            <h3 className="text-xl font-bold text-[#f4f4f6] tracking-tight">Project Health</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {mockProjectHealth.map((project) => (
              <div key={project.name} className="bg-[#161d24] border border-[#222c37] p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-[#f4f4f6]">{project.name}</h4>
                  <span className="text-lg font-bold" style={{ fontFamily: fontFamily.mono, color: project.healthColor }}>
                    {project.health}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-[#0b0f14] overflow-hidden mb-3">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${project.health}%`, backgroundColor: project.healthColor }}
                  ></div>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[#5f636b] uppercase tracking-wider" style={{ fontFamily: fontFamily.mono }}>
                  <span>{project.repos} repos</span>
                  <span>&middot;</span>
                  <span>{project.changes} changes</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* APPROVAL FEED — vertical timeline */}
          <section className="lg:col-span-3">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-[#f4f4f6] tracking-tight">Approval Activity</h3>
              <p className="text-sm text-[#94a3b8] mt-1">Recent architectural change requests across your projects.</p>
            </div>

            <div className="relative pl-6 space-y-6">
              <div className="absolute left-[3px] top-1 bottom-1 w-px bg-[#222c37]"></div>
              {mockApprovalFeed.map((item) => {
                const meta = statusMeta[item.status];
                const StatusIcon = meta.icon;
                return (
                  <div key={item.title} className="relative">
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
                          <span className="text-[10px] text-[#5f636b]" style={{ fontFamily: fontFamily.mono }}>{item.ago}</span>
                        </div>
                        <h4 className="text-[#f4f4f6] text-sm font-bold mb-1">{item.title}</h4>
                        <div className="text-xs text-[#5f636b]" style={{ fontFamily: fontFamily.mono }}>
                          {item.repo} &middot; requested by {item.requestedBy}
                        </div>
                      </div>
                      {item.status === 'pending' && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button className="h-7 px-2.5 bg-[#161d24] border border-[#222c37] hover:border-[#ef4444]/50 text-[#ef4444] text-[10px] font-bold transition-colors" style={{ fontFamily: fontFamily.mono }}>
                            REJECT
                          </button>
                          <button className="h-7 px-2.5 bg-[#22c55e]/10 border border-[#22c55e]/30 hover:border-[#22c55e] text-[#22c55e] text-[10px] font-bold transition-colors" style={{ fontFamily: fontFamily.mono }}>
                            APPROVE
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* TEAM ROSTER — grid of cards */}
          <section className="lg:col-span-2">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-[#f4f4f6] tracking-tight">Team Roster</h3>
              <p className="text-sm text-[#94a3b8] mt-1">Members across projects you maintain.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {mockTeamRoster.map((member) => (
                <div key={member.name} className="bg-[#11161b] border border-[#222c37] p-4 flex flex-col items-center text-center gap-2">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-[#161d24] border border-[#222c37] flex items-center justify-center text-sm font-bold text-[#94a3b8]" style={{ fontFamily: fontFamily.mono }}>
                      {member.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div
                      className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#11161b]"
                      style={{ backgroundColor: member.active ? '#22c55e' : '#5f636b' }}
                    ></div>
                  </div>
                  <div className="min-w-0 w-full">
                    <h4 className="text-[#f4f4f6] text-xs font-bold truncate" style={{ fontFamily: fontFamily.mono }}>{member.name}</h4>
                    <p className="text-[10px] text-[#5f636b] truncate">{member.role}</p>
                    <p className="text-[10px] text-[#38bdf8] mt-1" style={{ fontFamily: fontFamily.mono }}>{member.projects} projects</p>
                  </div>
                </div>
              ))}
              <button className="border border-dashed border-[#222c37] hover:border-[#38bdf8]/50 p-4 flex flex-col items-center justify-center gap-2 text-[#5f636b] hover:text-[#38bdf8] transition-colors">
                <Mail size={18} />
                <span className="text-[10px] uppercase tracking-widest" style={{ fontFamily: fontFamily.mono }}>Invite</span>
              </button>
            </div>
          </section>
        </div>

        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
};

export default ProjectMaintainerDashboard;
