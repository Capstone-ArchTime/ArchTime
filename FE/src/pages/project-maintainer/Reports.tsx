import { useEffect, useState } from 'react';
import { App, Button, Empty, Select, Spin } from 'antd';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { FileText, Download, Calendar, FolderKanban } from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';
import { getProjects } from '@/features/project-data';
import type { ProjectSummary } from '@/features/project-data';
import { getProjectReports, generateReport } from '@/features/pm-api';
import type { ProjectReport } from '@/features/pm-api';

const fontFamily = {
  mono: '"JetBrains Mono", monospace',
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

export default function Reports() {
  const { message } = App.useApp();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [reports, setReports] = useState<ProjectReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const [fromRevision, setFromRevision] = useState('v1.0.0');
  const [toRevision, setToRevision] = useState('HEAD');
  const [generating, setGenerating] = useState(false);

  const pagination = usePagination(reports);

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

    getProjectReports(selectedProject, controller.signal)
      .then(res => {
        setReports(res.data.reports);
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

  async function handleGenerate() {
    if (!selectedProject) return;
    setGenerating(true);
    try {
      await generateReport(selectedProject, {
        baseSnapshotId: fromRevision,
        targetSnapshotId: toRevision,
      });
      message.success('Report generation started.');
      refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  }

  function handleDownload(report: ProjectReport) {
    if (report.downloadUrl) {
      window.open(report.downloadUrl, '_blank');
    } else {
      message.info('Report is still being generated.');
    }
  }

  const currentProject = projects.find(p => p.id === selectedProject);

  return (
    <DashboardLayout>
      <div className="max-w-[1100px] mx-auto space-y-10">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Evolution Reports</h2>
          <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
            Export architecture evolution reports for maintenance handoff and developer onboarding.
          </p>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#242527] to-transparent mt-8"></div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
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

        {error && <p className="text-red-400">{error}</p>}

        <section>
          <h3 className="text-sm font-bold text-[#f4f4f6] tracking-tight uppercase mb-4" style={{ fontFamily: fontFamily.mono }}>New Export</h3>

          <div className="bg-[#161d24] border border-[#242527] p-6 space-y-5">
            <div>
              <label className="text-[10px] text-[#94a3b8] uppercase tracking-widest block mb-2" style={{ fontFamily: fontFamily.mono }}>Project</label>
              <div className="relative">
                <FolderKanban size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                <div className="w-full h-10 bg-[#11161b] border border-[#242527] pl-9 pr-9 text-sm text-[#f4f4f6] flex items-center">
                  {currentProject?.name ?? 'Select a project'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="from-revision" className="text-[10px] text-[#94a3b8] uppercase tracking-widest block mb-2" style={{ fontFamily: fontFamily.mono }}>From Revision</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                  <input
                    id="from-revision"
                    type="text"
                    value={fromRevision}
                    onChange={e => setFromRevision(e.target.value)}
                    className="w-full h-10 bg-[#11161b] border border-[#242527] pl-9 pr-4 text-sm text-[#f4f4f6] focus:outline-none focus:border-[#3b82f6]/50 transition-colors"
                    style={{ fontFamily: fontFamily.mono }}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="to-revision" className="text-[10px] text-[#94a3b8] uppercase tracking-widest block mb-2" style={{ fontFamily: fontFamily.mono }}>To Revision</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                  <input
                    id="to-revision"
                    type="text"
                    value={toRevision}
                    onChange={e => setToRevision(e.target.value)}
                    className="w-full h-10 bg-[#11161b] border border-[#242527] pl-9 pr-4 text-sm text-[#f4f4f6] focus:outline-none focus:border-[#3b82f6]/50 transition-colors"
                    style={{ fontFamily: fontFamily.mono }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleGenerate}
                disabled={generating || !selectedProject}
                className="h-10 px-5 bg-[#3b82f6] hover:bg-[#3b82f6]/90 disabled:opacity-50 text-[#080b0e] font-bold text-xs transition-colors flex items-center gap-2"
                style={{ fontFamily: fontFamily.mono }}
              >
                <Download size={14} />
                {generating ? 'GENERATING...' : 'GENERATE PDF'}
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-[#f4f4f6] tracking-tight uppercase mb-4" style={{ fontFamily: fontFamily.mono }}>Previously Exported</h3>

          {loading && reports.length === 0 ? (
            <div className="p-12 text-center">
              <Spin />
              <p className="mt-3 text-[#94a3b8]">Loading reports...</p>
            </div>
          ) : reports.length === 0 ? (
            <Empty description="No reports generated yet" />
          ) : (
            <>
              <div className="bg-[#11161b] border border-[#242527] overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#161d24] border-b border-[#242527] text-[10px] text-[#94a3b8] uppercase tracking-wider" style={{ fontFamily: fontFamily.mono }}>
                    <tr>
                      <th className="px-5 py-3 font-medium">Report</th>
                      <th className="px-5 py-3 font-medium">Project</th>
                      <th className="px-5 py-3 font-medium">Range</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Created</th>
                      <th className="px-5 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#242527]">
                    {pagination.items.map((report) => (
                      <tr key={report.id} className="hover:bg-[#161d24]/50 transition-colors group">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <FileText size={14} className="text-[#3b82f6] shrink-0" />
                            <span className="text-[#f4f4f6] font-medium text-xs" style={{ fontFamily: fontFamily.mono }}>
                              {report.project}_evolution.pdf
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-[#94a3b8] text-xs">{report.project}</td>
                        <td className="px-5 py-4 text-[#94a3b8] text-xs" style={{ fontFamily: fontFamily.mono }}>
                          {report.from} → {report.to}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`text-xs px-2 py-1 ${
                              report.status === 'completed'
                                ? 'bg-green-500/20 text-green-400'
                                : report.status === 'failed'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-yellow-500/20 text-yellow-400'
                            }`}
                            style={{ fontFamily: fontFamily.mono }}
                          >
                            {report.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[#94a3b8] text-xs" style={{ fontFamily: fontFamily.mono }}>
                          {formatTimeAgo(report.createdAt)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {report.status === 'completed' && (
                            <button
                              onClick={() => handleDownload(report)}
                              className="text-[#3b82f6] hover:text-[#00f0ff] text-xs font-semibold opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-opacity"
                              style={{ fontFamily: fontFamily.mono }}
                            >
                              Download &rarr;
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar {...pagination} />
            </>
          )}
        </section>

        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
}
