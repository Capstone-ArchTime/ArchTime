import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { UserPlus, Mail, FolderKanban, ShieldCheck } from 'lucide-react';

const fontFamily = {
  mono: '"JetBrains Mono", monospace',
};

const mockTeam = [
  { name: 'j.tran', email: 'j.tran@archtime.io', role: 'Developer / Analyst', projects: ['E-Commerce Platform'], active: true, approvalsThisMonth: 8 },
  { name: 'm.nguyen', email: 'm.nguyen@archtime.io', role: 'Developer / Analyst', projects: ['E-Commerce Platform', 'Payment Platform'], active: true, approvalsThisMonth: 5 },
  { name: 'k.pham', email: 'k.pham@archtime.io', role: 'Developer / Analyst', projects: ['Payment Platform', 'Healthcare Connect'], active: false, approvalsThisMonth: 2 },
  { name: 'a.le', email: 'a.le@archtime.io', role: 'Developer / Analyst', projects: ['Healthcare Connect'], active: true, approvalsThisMonth: 4 },
];

const mockProjects = ['E-Commerce Platform', 'Payment Platform', 'Healthcare Connect'];

const Team: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="max-w-[1100px] mx-auto space-y-8">

        {/* HEADER */}
        <div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Team</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Members contributing to the projects you maintain.
              </p>
            </div>
            <button className="shrink-0 h-10 px-5 bg-[#38bdf8] hover:bg-[#38bdf8]/90 text-[#080b0e] font-bold text-xs transition-colors flex items-center gap-2" style={{ fontFamily: fontFamily.mono }}>
              <UserPlus size={16} />
              INVITE MEMBER
            </button>
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#222c37] to-transparent mt-8"></div>
        </div>

        {/* MEMBER LIST */}
        <div className="space-y-3">
          {mockTeam.map((member) => (
            <div key={member.email} className="bg-[#11161b] border border-[#222c37] p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-[#161d24] border border-[#222c37] flex items-center justify-center text-sm font-bold text-[#94a3b8]" style={{ fontFamily: fontFamily.mono }}>
                    {member.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div
                    className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#11161b]"
                    style={{ backgroundColor: member.active ? '#22c55e' : '#5f636b' }}
                  ></div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-[#f4f4f6] font-bold text-sm" style={{ fontFamily: fontFamily.mono }}>{member.name}</h4>
                    <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border border-[#38bdf8]/33 text-[#38bdf8] bg-[#38bdf8]/10" style={{ fontFamily: fontFamily.mono }}>
                      {member.role}
                    </span>
                  </div>
                  <div className="text-xs text-[#5f636b] mt-0.5" style={{ fontFamily: fontFamily.mono }}>{member.email}</div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {member.projects.map((p) => (
                      <span key={p} className="inline-flex items-center gap-1 text-[10px] text-[#94a3b8] bg-[#161d24] px-1.5 py-0.5 border border-[#222c37]">
                        <FolderKanban size={10} />
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center justify-end gap-1.5 text-[#22c55e]">
                  <ShieldCheck size={14} />
                  <span className="text-lg font-bold" style={{ fontFamily: fontFamily.mono }}>{member.approvalsThisMonth}</span>
                </div>
                <div className="text-[10px] text-[#5f636b] uppercase tracking-widest" style={{ fontFamily: fontFamily.mono }}>Approved this month</div>
              </div>
            </div>
          ))}
        </div>

        {/* PENDING INVITES */}
        <section>
          <h3 className="text-sm font-bold text-[#f4f4f6] tracking-tight uppercase mb-3" style={{ fontFamily: fontFamily.mono }}>Invite by Project</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {mockProjects.map((project) => (
              <div key={project} className="bg-[#161d24] border border-dashed border-[#222c37] hover:border-[#38bdf8]/50 p-4 flex items-center justify-between transition-colors group cursor-pointer">
                <div className="flex items-center gap-2 min-w-0">
                  <FolderKanban size={14} className="text-[#5f636b] group-hover:text-[#38bdf8] transition-colors shrink-0" />
                  <span className="text-xs text-[#94a3b8] group-hover:text-[#f4f4f6] transition-colors truncate">{project}</span>
                </div>
                <Mail size={14} className="text-[#5f636b] group-hover:text-[#38bdf8] transition-colors shrink-0" />
              </div>
            ))}
          </div>
        </section>

        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
};

export default Team;
