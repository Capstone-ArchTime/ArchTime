import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  FileText,
  Download,
  PenLine,
  FolderKanban,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const fontFamily = {
  mono: '"JetBrains Mono", monospace',
};

const mockStats = [
  { label: 'Documented Changes', value: '38', caption: 'Across all maintained projects', color: '#38bdf8' },
  { label: 'Reports Exported', value: '12', caption: 'This quarter', color: '#ffb03a' },
  { label: 'Pending Annotation', value: '05', caption: 'Changes awaiting a written note', color: '#ef4444' },
];

const mockRecentChanges = [
  {
    title: 'Extract notification-service from core-monolith',
    repo: 'ecomm-core',
    commit: 'd82f91a',
    ago: '2 hours ago',
    annotated: true,
  },
  {
    title: 'Reverse dependency: catalog-svc → pricing-svc',
    repo: 'catalog-service',
    commit: '8af31c2',
    ago: 'Yesterday',
    annotated: false,
  },
  {
    title: 'Split payment-gateway into auth and settlement modules',
    repo: 'payment-service',
    commit: 'c4199be',
    ago: '2 days ago',
    annotated: true,
  },
];

const mockProjects = [
  { name: 'E-Commerce Platform', repos: 4, documentedChanges: 18 },
  { name: 'Payment Platform', repos: 2, documentedChanges: 11 },
  { name: 'Healthcare Connect', repos: 3, documentedChanges: 9 },
];

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
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Architectural documentation</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Annotate architectural changes and export evolution reports for maintenance and developer onboarding.
              </p>
            </div>
            <Link
              to="/project-maintainer/reports"
              className="shrink-0 h-10 px-5 bg-[#38bdf8] hover:bg-[#38bdf8]/90 text-[#080b0e] font-bold text-xs transition-colors flex items-center gap-2"
              style={{ fontFamily: fontFamily.mono }}
            >
              <Download size={16} />
              EXPORT EVOLUTION REPORT
            </Link>
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#222c37] to-transparent mt-8"></div>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {mockStats.map((stat) => (
            <div key={stat.label} className="bg-[#161d24] border border-[#222c37] p-5">
              <h4 className="text-[10px] font-semibold text-[#94a3b8] tracking-widest uppercase mb-4" style={{ fontFamily: fontFamily.mono }}>
                {stat.label}
              </h4>
              <div className="text-4xl font-bold mb-1" style={{ fontFamily: fontFamily.mono, color: stat.color }}>{stat.value}</div>
              <p className="text-xs text-[#5f636b]">{stat.caption}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* RECENT CHANGES TO ANNOTATE */}
          <section className="lg:col-span-3">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-[#f4f4f6] tracking-tight">Recent Architectural Changes</h3>
              <p className="text-sm text-[#94a3b8] mt-1">Add a written note explaining why each change happened.</p>
            </div>

            <div className="space-y-3">
              {mockRecentChanges.map((item) => (
                <div key={item.commit} className="bg-[#11161b] border border-[#222c37] p-5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h4 className="text-[#f4f4f6] font-bold text-sm mb-2">{item.title}</h4>
                    <div className="flex items-center gap-3 text-xs" style={{ fontFamily: fontFamily.mono }}>
                      <span className="text-[#94a3b8]">{item.repo}</span>
                      <span className="text-[#5f636b]">&middot;</span>
                      <span className="text-[#5f636b]">{item.commit}</span>
                      <span className="text-[#5f636b]">&middot;</span>
                      <span className="text-[#5f636b]">{item.ago}</span>
                    </div>
                  </div>
                  {item.annotated ? (
                    <span className="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold text-[#22c55e]" style={{ fontFamily: fontFamily.mono }}>
                      <CheckCircle2 size={14} />
                      ANNOTATED
                    </span>
                  ) : (
                    <button className="shrink-0 h-8 px-3 bg-[#161d24] border border-[#38bdf8]/30 hover:border-[#38bdf8] text-[#38bdf8] text-[10px] font-bold transition-colors flex items-center gap-1.5" style={{ fontFamily: fontFamily.mono }}>
                      <PenLine size={12} />
                      ADD NOTE
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* PROJECTS SUMMARY */}
          <section className="lg:col-span-2">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-[#f4f4f6] tracking-tight">Documentation Coverage</h3>
              <p className="text-sm text-[#94a3b8] mt-1">Documented changes per project.</p>
            </div>

            <div className="space-y-3">
              {mockProjects.map((project) => (
                <div key={project.name} className="bg-[#11161b] border border-[#222c37] p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FolderKanban size={16} className="text-[#38bdf8] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-[#f4f4f6] font-medium truncate">{project.name}</div>
                      <div className="text-[10px] text-[#5f636b]" style={{ fontFamily: fontFamily.mono }}>{project.repos} repos</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-[#38bdf8]" style={{ fontFamily: fontFamily.mono }}>{project.documentedChanges}</div>
                    <div className="text-[9px] text-[#5f636b] uppercase tracking-widest" style={{ fontFamily: fontFamily.mono }}>documented</div>
                  </div>
                </div>
              ))}
            </div>

            <Link
              to="/project-maintainer/reports"
              className="mt-4 flex items-center justify-between px-4 py-3 bg-[#161d24] border border-dashed border-[#222c37] hover:border-[#38bdf8]/50 transition-colors group"
            >
              <span className="flex items-center gap-2 text-xs text-[#94a3b8] group-hover:text-[#f4f4f6] transition-colors">
                <FileText size={14} />
                View all evolution reports
              </span>
              <ArrowRight size={14} className="text-[#5f636b] group-hover:text-[#38bdf8] transition-colors" />
            </Link>
          </section>
        </div>

        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
};

export default ProjectMaintainerDashboard;
