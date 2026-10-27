import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, App, Button, Empty, Input, Modal, Select, Spin, Tag } from 'antd';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Download, Eye, FileText } from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';
import type { ProjectSummary } from '@/features/project-data';
import { ManagedWorkspaces } from './managed';
import { describeAccessError, pickWorkspace } from './managed-access';
import { downloadReportPdf, generateReport, getProjectReports } from '@/features/pm-api';
import type { ReportView } from '@/features/report-view';

const mono = { fontFamily: '"JetBrains Mono", monospace' };
const panel = 'bg-[#11161b] border border-[#242527] p-6';
const label = 'text-[11px] text-slate-300 uppercase tracking-widest block mb-2';
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'Unknown date');

/** Saves a file the page received (a link would not carry the session's token). */
function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Reports of every workspace the account can see; only its maintainers can create new ones (the server checks too). */
export default function Reports() {
  return <ManagedWorkspaces title="Reports" scope="readable">{(projects, managed) => <ReportsView projects={projects} managed={managed} />}</ManagedWorkspaces>;
}

function ReportsView({ projects, managed }: { projects: ProjectSummary[]; managed: ReadonlySet<string> }) {
  const { message } = App.useApp();
  const [selectedProject, setSelectedProject] = useState(() => pickWorkspace(projects));
  const [revision, setRevision] = useState(0);
  // What the last load returned, and for which workspace and refresh: anything else is still loading.
  const [loaded, setLoaded] = useState<{ key: string; reports: ReportView[]; error: string | null } | null>(null);
  const key = `${selectedProject}:${revision}`;
  const loading = !!selectedProject && loaded?.key !== key;
  const reports = loaded?.reports ?? [];
  const error = loaded?.key === key ? loaded.error : null;
  const [title, setTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [viewing, setViewing] = useState<ReportView | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const pagination = usePagination(reports);

  useEffect(() => {
    if (!selectedProject) return;
    const controller = new AbortController();
    const at = `${selectedProject}:${revision}`;
    getProjectReports(selectedProject, controller.signal)
      .then(list => setLoaded({ key: at, reports: list, error: null }))
      .catch(e => { if (!controller.signal.aborted) setLoaded(last => ({ key: at, reports: last?.reports ?? [], error: describeAccessError(e, 'The reports of this workspace could not be loaded.') })); });
    return () => controller.abort();
  }, [selectedProject, revision]);

  async function handleGenerate() {
    if (!selectedProject || generating) return;
    setGenerating(true);
    try {
      const report = await generateReport(selectedProject, title.trim() ? { title: title.trim() } : {});
      setTitle('');
      message.success('Report created.');
      setRevision(v => v + 1);
      if (report) setViewing(report);
    } catch (e) {
      message.error(describeAccessError(e, 'The report could not be created.'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload(report: ReportView) {
    if (!selectedProject || downloading) return;
    setDownloading(report.id);
    try {
      const { blob, filename } = await downloadReportPdf(selectedProject, report);
      save(blob, filename);
    } catch (e) {
      message.error(describeAccessError(e, 'The PDF could not be downloaded.'));
    } finally {
      setDownloading(null);
    }
  }

  const currentProject = projects.find(p => p.id === selectedProject);
  const canGenerate = managed.has(selectedProject);

  return (
    <DashboardLayout>
      <div className="max-w-[1100px] mx-auto space-y-10">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Reports</h2>
          <p className="text-slate-300 text-sm max-w-xl leading-relaxed">
            Architecture reports of a workspace for maintenance handoff and onboarding: its components, dependencies, rules,
            design decisions and the stretch of history mined. Open one here or download it as a PDF.
          </p>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#242527] to-transparent mt-8"></div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Select aria-label="Select workspace" value={selectedProject} onChange={setSelectedProject} className="min-w-60"
            options={projects.map(p => ({ value: p.id, label: p.name }))} placeholder="Select a workspace" />
          <Button loading={loading} onClick={() => setRevision(v => v + 1)}>Refresh</Button>
        </div>

        {error && <Alert type="error" showIcon title={error} />}

        {canGenerate ? <section aria-labelledby="new-report">
          <h3 id="new-report" className="text-sm font-bold text-[#f4f4f6] tracking-tight uppercase mb-4" style={mono}>New report</h3>
          <div className={`${panel} space-y-4`}>
            <p className="text-sm text-slate-300">A report records {currentProject?.name ?? 'the workspace'} as it is now. Later changes to the map do not change it.</p>
            <div>
              <label htmlFor="report-title" className={label} style={mono}>Title (optional)</label>
              <Input id="report-title" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder={`${currentProject?.name ?? 'Workspace'} architecture report`} />
            </div>
            <Button type="primary" icon={<FileText size={14} />} loading={generating} disabled={!selectedProject} onClick={() => void handleGenerate()}>Create report</Button>
          </div>
        </section> : <p className="text-sm text-slate-300">Only maintainers of {currentProject?.name ?? 'this workspace'} can create reports. You can open and download the ones they made below.</p>}

        <section aria-labelledby="report-list">
          <h3 id="report-list" className="text-sm font-bold text-[#f4f4f6] tracking-tight uppercase mb-4" style={mono}>Reports of this workspace</h3>
          {loading && reports.length === 0 ? (
            <div className="p-12 text-center"><Spin /><p className="mt-3 text-slate-300">Loading reports…</p></div>
          ) : reports.length === 0 ? (
            <Empty description="No reports yet" />
          ) : (
            <>
              <ul className="divide-y divide-[#242527] border border-[#242527] bg-[#11161b]">
                {pagination.items.map(report => (
                  <li key={report.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <FileText size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#f4f4f6]">{report.title}</p>
                      <p className="text-xs text-slate-400">
                        {when(report.createdAt)} · {report.figures.components} components · {report.figures.decisions} decisions · {report.figures.minedCommits} mined commits
                      </p>
                    </div>
                    {report.status !== 'ready' && <Tag color={report.status === 'failed' ? 'red' : 'gold'}>{report.status === 'failed' ? 'Failed' : 'Being made'}</Tag>}
                    <div className="flex gap-2">
                      <Button icon={<Eye size={14} />} onClick={() => setViewing(report)} aria-label={`Open ${report.title}`}>Open</Button>
                      <Button icon={<Download size={14} />} loading={downloading === report.id} disabled={report.status !== 'ready'} onClick={() => void handleDownload(report)} aria-label={`Download ${report.title} as PDF`}>PDF</Button>
                    </div>
                  </li>
                ))}
              </ul>
              <PaginationBar {...pagination} />
            </>
          )}
        </section>

        <div className="h-10"></div>
      </div>

      <Modal open={!!viewing} onCancel={() => setViewing(null)} width={820} title={viewing?.title} destroyOnHidden
        footer={viewing ? [
          <Button key="close" onClick={() => setViewing(null)}>Close</Button>,
          <Button key="pdf" type="primary" icon={<Download size={14} />} loading={downloading === viewing.id} onClick={() => void handleDownload(viewing)}>Download PDF</Button>,
        ] : null}>
        {viewing && <ReportBody report={viewing} />}
      </Modal>
    </DashboardLayout>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-2">
    <h4 className="border-b border-[#242527] pb-1 text-sm font-semibold text-[#f4f4f6]">{title}</h4>
    {children}
  </section>;
}

const notStored = <p className="text-sm text-slate-400">Not stored in this report: it was made before this list was kept. Create a new report to see it.</p>;

/** What the report stored, laid out like its PDF. */
function ReportBody({ report: r }: { report: ReportView }) {
  const f = r.figures;
  const figures: [string, string][] = [
    ['Components', String(f.components)], ['Dependencies', String(f.dependencies)],
    ['Architecture rules', `${f.rules} (${f.activeRules} active)`], ['Design decisions', `${f.decisions} (${f.acceptedDecisions} accepted)`],
    ['Mined commits', String(f.minedCommits)], ['Map revision', f.mapRevision === null ? '-' : String(f.mapRevision)],
  ];
  return <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1 text-sm text-slate-200">
    <p className="text-xs text-slate-400">Made {when(r.createdAt)}{r.project.repoUrl ? ` · ${r.project.repoUrl}` : ''}</p>
    {r.summary && <p>{r.summary}</p>}
    <Section title="Key figures">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        {figures.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-400">{k}</dt><dd className="font-semibold text-[#f4f4f6]">{v}</dd></div>)}
      </dl>
    </Section>
    {(r.history.first || r.history.latest) && <Section title="History covered">
      {[['Oldest mined commit', r.history.first], ['Newest mined commit', r.history.latest]].map(([k, c]) => c && typeof c === 'object' &&
        <p key={k as string}><span className="text-slate-400">{k as string}: </span><code className="text-slate-100">{c.hash}</code> · {c.date?.slice(0, 10)} · {c.title}</p>)}
    </Section>}
    <Section title="Components">
      {r.components.length ? <ul className="space-y-1.5">{r.components.map((c, i) => <li key={`${c.name}-${i}`}>
        <span className="font-medium text-[#f4f4f6]">{c.name}</span>{c.kind && <span className="text-slate-400"> · {c.kind}</span>}
        {c.description && <p className="text-xs text-slate-400">{c.description}</p>}
      </li>)}</ul> : <p className="text-slate-400">No components on the map.</p>}
    </Section>
    <Section title="Dependencies">
      {r.dependencies === null ? notStored : r.dependencies.length ? <ul className="space-y-1">{r.dependencies.map((d, i) => <li key={i}>{d.source} → {d.target}{d.label && <span className="text-slate-400"> ({d.label})</span>}</li>)}</ul> : <p className="text-slate-400">No dependencies on the map.</p>}
    </Section>
    <Section title="Architecture rules">
      {r.rules === null ? notStored : r.rules.length ? <ul className="space-y-1.5">{r.rules.map((x, i) => <li key={i}>
        <span className="font-medium text-[#f4f4f6]">{x.name}</span>{!x.enabled && <Tag className="ml-2">Off</Tag>}
        <p className="text-xs text-slate-400">{x.source} {x.constraint === 'required' ? 'must depend on' : 'must not depend on'} {x.target} · {x.severity}</p>
      </li>)}</ul> : <p className="text-slate-400">No architecture rules.</p>}
    </Section>
    <Section title="Design decisions">
      {r.decisions === null ? notStored : r.decisions.length ? <ul className="space-y-1">{r.decisions.map(d => <li key={d.number}>ADR-{d.number}: {d.title} <span className="text-slate-400">· {d.status}</span></li>)}</ul> : <p className="text-slate-400">No design decisions.</p>}
    </Section>
  </div>;
}
