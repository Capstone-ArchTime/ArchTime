import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { FileText, Download, Calendar, FolderKanban, ChevronDown } from 'lucide-react';

const fontFamily = {
  mono: '"JetBrains Mono", monospace',
};

const mockProjects = ['E-Commerce Platform', 'Payment Platform', 'Healthcare Connect'];

const mockExportedReports = [
  { name: 'ecomm-core_evolution_2026-Q3.pdf', project: 'E-Commerce Platform', range: 'v1.0.0 → v1.5.0', exportedAgo: '2 days ago', size: '1.2 MB' },
  { name: 'payment-service_evolution_2026-Q3.pdf', project: 'Payment Platform', range: 'v2.1.0 → v2.4.0', exportedAgo: '1 week ago', size: '840 KB' },
  { name: 'healthcare-connect_onboarding.pdf', project: 'Healthcare Connect', range: 'v1.0.0 → HEAD', exportedAgo: '2 weeks ago', size: '2.1 MB' },
];

const Reports: React.FC = () => {
  const [selectedProject, setSelectedProject] = useState(mockProjects[0]);

  return (
    <DashboardLayout>
      <div className="max-w-[1100px] mx-auto space-y-10">

        {/* HEADER */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Evolution Reports</h2>
          <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
            Export architecture evolution reports for maintenance handoff and developer onboarding.
          </p>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#222c37] to-transparent mt-8"></div>
        </div>

        {/* NEW EXPORT */}
        <section>
          <h3 className="text-sm font-bold text-[#f4f4f6] tracking-tight uppercase mb-4" style={{ fontFamily: fontFamily.mono }}>New Export</h3>

          <div className="bg-[#161d24] border border-[#222c37] p-6 space-y-5">
            <div>
              <label className="text-[10px] text-[#94a3b8] uppercase tracking-widest block mb-2" style={{ fontFamily: fontFamily.mono }}>Project</label>
              <div className="relative">
                <FolderKanban size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f636b]" />
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full h-10 bg-[#11161b] border border-[#222c37] pl-9 pr-9 text-sm text-[#f4f4f6] focus:outline-none focus:border-[#38bdf8]/50 transition-colors appearance-none"
                >
                  {mockProjects.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5f636b] pointer-events-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-[#94a3b8] uppercase tracking-widest block mb-2" style={{ fontFamily: fontFamily.mono }}>From Revision</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f636b]" />
                  <input
                    type="text"
                    defaultValue="v1.0.0"
                    className="w-full h-10 bg-[#11161b] border border-[#222c37] pl-9 pr-4 text-sm text-[#f4f4f6] focus:outline-none focus:border-[#38bdf8]/50 transition-colors"
                    style={{ fontFamily: fontFamily.mono }}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[#94a3b8] uppercase tracking-widest block mb-2" style={{ fontFamily: fontFamily.mono }}>To Revision</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f636b]" />
                  <input
                    type="text"
                    defaultValue="HEAD"
                    className="w-full h-10 bg-[#11161b] border border-[#222c37] pl-9 pr-4 text-sm text-[#f4f4f6] focus:outline-none focus:border-[#38bdf8]/50 transition-colors"
                    style={{ fontFamily: fontFamily.mono }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button className="h-10 px-5 bg-[#38bdf8] hover:bg-[#38bdf8]/90 text-[#080b0e] font-bold text-xs transition-colors flex items-center gap-2" style={{ fontFamily: fontFamily.mono }}>
                <Download size={14} />
                GENERATE PDF
              </button>
              <button className="h-10 px-5 bg-[#161d24] border border-[#222c37] hover:border-[#5f636b] text-[#94a3b8] hover:text-[#f4f4f6] font-bold text-xs transition-colors flex items-center gap-2" style={{ fontFamily: fontFamily.mono }}>
                <FileText size={14} />
                PREVIEW
              </button>
            </div>
          </div>
        </section>

        {/* EXPORTED REPORTS */}
        <section>
          <h3 className="text-sm font-bold text-[#f4f4f6] tracking-tight uppercase mb-4" style={{ fontFamily: fontFamily.mono }}>Previously Exported</h3>

          <div className="bg-[#11161b] border border-[#222c37] overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#161d24] border-b border-[#222c37] text-[10px] text-[#94a3b8] uppercase tracking-wider" style={{ fontFamily: fontFamily.mono }}>
                <tr>
                  <th className="px-5 py-3 font-medium">Report</th>
                  <th className="px-5 py-3 font-medium">Project</th>
                  <th className="px-5 py-3 font-medium">Range</th>
                  <th className="px-5 py-3 font-medium">Exported</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222c37]">
                {mockExportedReports.map((report) => (
                  <tr key={report.name} className="hover:bg-[#161d24]/50 transition-colors group">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-[#38bdf8] shrink-0" />
                        <span className="text-[#f4f4f6] font-medium text-xs" style={{ fontFamily: fontFamily.mono }}>{report.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#94a3b8] text-xs">{report.project}</td>
                    <td className="px-5 py-4 text-[#94a3b8] text-xs" style={{ fontFamily: fontFamily.mono }}>{report.range}</td>
                    <td className="px-5 py-4 text-[#5f636b] text-xs" style={{ fontFamily: fontFamily.mono }}>{report.exportedAgo} &middot; {report.size}</td>
                    <td className="px-5 py-4 text-right">
                      <button className="text-[#38bdf8] hover:text-[#00f0ff] text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontFamily: fontFamily.mono }}>
                        Download &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
};

export default Reports;
