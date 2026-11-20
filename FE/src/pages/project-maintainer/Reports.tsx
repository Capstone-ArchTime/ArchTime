import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, App, Button, Empty, Input, Modal, Select, Spin, Tag } from 'antd';
import DashboardLayout from '@/components/layout/DashboardLayout';
import PageHeader from '@/components/PageHeader';
import { Download, Eye, FileText } from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';
import type { ProjectSummary } from '@/features/project-data';
import { ManagedWorkspaces } from './managed';
import { describeAccessError, pickWorkspace } from './managed-access';
import { downloadReportPdf, generateReport, getProjectReports } from '@/features/pm-api';
import type { ReportView } from '@/features/report-view';
import { formatDateTime } from '@/i18n/format';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  unknownDate: 'Unknown date', title: 'Reports', loadFailed: 'The reports of this workspace could not be loaded.', created: 'Report created.', createFailed: 'The report could not be created.',
  pdfFailed: 'The PDF could not be downloaded.', summary: "A snapshot of a workspace's architecture, to read here or download as a PDF.",
  details: 'A report is made for maintenance handoff and onboarding. It records the components, dependencies, rules, design decisions and the stretch of history mined, as they are when it is created: later changes to the map do not change it.',
  selectWorkspace: 'Select workspace', selectPlaceholder: 'Select a workspace', refresh: 'Refresh', newReport: 'New report', titleOptional: 'Title (optional)', titlePlaceholder: '{name} architecture report',
  workspace: 'Workspace', create: 'Create report', onlyMaintainers: 'Only maintainers of {name} can create reports. You can open and download the ones they made below.', thisWorkspace: 'this workspace',
  list: 'Reports of this workspace', loading: 'Loading reports…', none: 'No reports yet', components: '{count} components', components_one: '1 component', decisions: '{count} decisions', decisions_one: '1 decision',
  mined: '{count} mined commits', mined_one: '1 mined commit', openLabel: 'Open {title}', open: 'Open', pdfLabel: 'Download {title} as PDF', close: 'Close', downloadPdf: 'Download PDF',
  notStored: 'Not stored in this report: it was made before this list was kept. Create a new report to see it.', componentsTitle: 'Components', dependencies: 'Dependencies', rules: 'Architecture rules',
  rulesValue: '{n} ({active} active)', designDecisions: 'Design decisions', decisionsValue: '{n} ({accepted} accepted)', minedCommits: 'Mined commits', mapRevision: 'Map revision', made: 'Made {date}',
  keyFigures: 'Key figures', history: 'History covered', oldest: 'Oldest mined commit', newest: 'Newest mined commit', noComponents: 'No components on the map.', noDependencies: 'No dependencies on the map.',
  off: 'Off', must: 'must depend on', mustNot: 'must not depend on', noRules: 'No architecture rules.', noDecisions: 'No design decisions.',
}, {
  unknownDate: 'Không rõ ngày', title: 'Báo cáo', loadFailed: 'Không tải được các báo cáo của không gian làm việc này.', created: 'Đã tạo báo cáo.', createFailed: 'Không tạo được báo cáo.',
  pdfFailed: 'Không tải được PDF.', summary: 'Ảnh chụp kiến trúc của một không gian làm việc, để đọc ở đây hoặc tải về dạng PDF.',
  details: 'Báo cáo dùng để bàn giao bảo trì và hướng dẫn người mới. Nó ghi lại các thành phần, phụ thuộc, quy tắc, quyết định thiết kế và đoạn lịch sử đã mining tại thời điểm tạo: thay đổi về sau trên bản đồ không làm đổi báo cáo.',
  selectWorkspace: 'Chọn không gian làm việc', selectPlaceholder: 'Chọn không gian làm việc', refresh: 'Làm mới', newReport: 'Báo cáo mới', titleOptional: 'Tiêu đề (không bắt buộc)', titlePlaceholder: 'Báo cáo kiến trúc {name}',
  workspace: 'Không gian làm việc', create: 'Tạo báo cáo', onlyMaintainers: 'Chỉ người bảo trì {name} mới tạo được báo cáo. Bạn có thể mở và tải các báo cáo họ đã tạo bên dưới.', thisWorkspace: 'không gian làm việc này',
  list: 'Báo cáo của không gian làm việc này', loading: 'Đang tải báo cáo…', none: 'Chưa có báo cáo nào', components: '{count} thành phần', decisions: '{count} quyết định',
  mined: '{count} commit đã mining', openLabel: 'Mở {title}', open: 'Mở', pdfLabel: 'Tải {title} dạng PDF', close: 'Đóng', downloadPdf: 'Tải PDF',
  notStored: 'Báo cáo này không lưu mục này: nó được tạo trước khi danh sách này được lưu. Hãy tạo báo cáo mới để xem.', componentsTitle: 'Thành phần', dependencies: 'Phụ thuộc', rules: 'Quy tắc kiến trúc',
  rulesValue: '{n} ({active} đang bật)', designDecisions: 'Quyết định thiết kế', decisionsValue: '{n} ({accepted} đã chấp nhận)', minedCommits: 'Commit đã mining', mapRevision: 'Phiên bản bản đồ', made: 'Tạo lúc {date}',
  keyFigures: 'Số liệu chính', history: 'Lịch sử bao phủ', oldest: 'Commit cũ nhất đã mining', newest: 'Commit mới nhất đã mining', noComponents: 'Bản đồ không có thành phần nào.', noDependencies: 'Bản đồ không có phụ thuộc nào.',
  off: 'Tắt', must: 'phải phụ thuộc vào', mustNot: 'không được phụ thuộc vào', noRules: 'Không có quy tắc kiến trúc.', noDecisions: 'Không có quyết định thiết kế.',
});

const mono = { fontFamily: '"JetBrains Mono", monospace' };
const panel = 'bg-[var(--at-panel)] border border-[var(--at-line)] p-6';
const label = 'text-[11px] text-slate-300 uppercase tracking-widest block mb-2';
const when = (iso: string | null) => (iso ? formatDateTime(iso) : translate(MSG, 'unknownDate'));

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
  const m = useMessages(MSG);
  return <ManagedWorkspaces title={m('title')} scope="readable">{(projects, managed) => <ReportsView projects={projects} managed={managed} />}</ManagedWorkspaces>;
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
  const m = useMessages(MSG);

  const pagination = usePagination(reports);

  useEffect(() => {
    if (!selectedProject) return;
    const controller = new AbortController();
    const at = `${selectedProject}:${revision}`;
    getProjectReports(selectedProject, controller.signal)
      .then(list => setLoaded({ key: at, reports: list, error: null }))
      .catch(e => { if (!controller.signal.aborted) setLoaded(last => ({ key: at, reports: last?.reports ?? [], error: describeAccessError(e, translate(MSG, 'loadFailed')) })); });
    return () => controller.abort();
  }, [selectedProject, revision]);

  async function handleGenerate() {
    if (!selectedProject || generating) return;
    setGenerating(true);
    try {
      const report = await generateReport(selectedProject, title.trim() ? { title: title.trim() } : {});
      setTitle('');
      message.success(m('created'));
      setRevision(v => v + 1);
      if (report) setViewing(report);
    } catch (e) {
      message.error(describeAccessError(e, m('createFailed')));
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
      message.error(describeAccessError(e, m('pdfFailed')));
    } finally {
      setDownloading(null);
    }
  }

  const currentProject = projects.find(p => p.id === selectedProject);
  const canGenerate = managed.has(selectedProject);

  return (
    <DashboardLayout>
      <div className="max-w-[1100px] mx-auto space-y-10">
        <PageHeader title={m('title')} summary={m('summary')}
          details={<p>{m('details')}</p>}
          actions={<>
            <Select aria-label={m('selectWorkspace')} value={selectedProject} onChange={setSelectedProject} className="min-w-60"
              options={projects.map(p => ({ value: p.id, label: p.name }))} placeholder={m('selectPlaceholder')} />
            <Button loading={loading} onClick={() => setRevision(v => v + 1)}>{m('refresh')}</Button>
          </>} />

        {error && <Alert type="error" showIcon title={error} />}

        {canGenerate ? <section aria-labelledby="new-report">
          <h3 id="new-report" className="text-sm font-bold text-[var(--at-text)] tracking-tight uppercase mb-4" style={mono}>{m('newReport')}</h3>
          <div className={`${panel} space-y-4`}>
            <div>
              <label htmlFor="report-title" className={label} style={mono}>{m('titleOptional')}</label>
              <Input id="report-title" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder={m('titlePlaceholder', { name: currentProject?.name ?? m('workspace') })} />
            </div>
            <Button type="primary" icon={<FileText size={14} />} loading={generating} disabled={!selectedProject} onClick={() => void handleGenerate()}>{m('create')}</Button>
          </div>
        </section> : <p className="text-sm text-slate-300">{m('onlyMaintainers', { name: currentProject?.name ?? m('thisWorkspace') })}</p>}

        <section aria-labelledby="report-list">
          <h3 id="report-list" className="text-sm font-bold text-[var(--at-text)] tracking-tight uppercase mb-4" style={mono}>{m('list')}</h3>
          {loading && reports.length === 0 ? (
            <div className="p-12 text-center"><Spin /><p className="mt-3 text-slate-300">{m('loading')}</p></div>
          ) : reports.length === 0 ? (
            <Empty description={m('none')} />
          ) : (
            <>
              <ul className="divide-y divide-[var(--at-line)] border border-[var(--at-line)] bg-[var(--at-panel)]">
                {pagination.items.map(report => (
                  <li key={report.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <FileText size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--at-text)]">{report.title}</p>
                      <p className="text-xs text-slate-400">
                        {when(report.createdAt)} · {m('components', { count: report.figures.components })} · {m('decisions', { count: report.figures.decisions })} · {m('mined', { count: report.figures.minedCommits })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button icon={<Eye size={14} />} onClick={() => setViewing(report)} aria-label={m('openLabel', { title: report.title })}>{m('open')}</Button>
                      <Button icon={<Download size={14} />} loading={downloading === report.id} onClick={() => void handleDownload(report)} aria-label={m('pdfLabel', { title: report.title })}>PDF</Button>
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
          <Button key="close" onClick={() => setViewing(null)}>{m('close')}</Button>,
          <Button key="pdf" type="primary" icon={<Download size={14} />} loading={downloading === viewing.id} onClick={() => void handleDownload(viewing)}>{m('downloadPdf')}</Button>,
        ] : null}>
        {viewing && <ReportBody report={viewing} />}
      </Modal>
    </DashboardLayout>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-2">
    <h4 className="border-b border-[var(--at-line)] pb-1 text-sm font-semibold text-[var(--at-text)]">{title}</h4>
    {children}
  </section>;
}

const NotStored = () => <p className="text-sm text-slate-400">{translate(MSG, 'notStored')}</p>;
const notStored = <NotStored />;

/** What the report stored, laid out like its PDF. */
function ReportBody({ report: r }: { report: ReportView }) {
  const f = r.figures;
  const m = useMessages(MSG);
  const figures: [string, string][] = [
    [m('componentsTitle'), String(f.components)], [m('dependencies'), String(f.dependencies)],
    [m('rules'), m('rulesValue', { n: f.rules, active: f.activeRules })], [m('designDecisions'), m('decisionsValue', { n: f.decisions, accepted: f.acceptedDecisions })],
    [m('minedCommits'), String(f.minedCommits)], [m('mapRevision'), f.mapRevision === null ? '-' : String(f.mapRevision)],
  ];
  return <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1 text-sm text-slate-200">
    <p className="text-xs text-slate-400">{m('made', { date: when(r.createdAt) })}{r.project.repoUrl ? ` · ${r.project.repoUrl}` : ''}</p>
    {r.summary && <p>{r.summary}</p>}
    <Section title={m('keyFigures')}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        {figures.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-400">{k}</dt><dd className="font-semibold text-[var(--at-text)]">{v}</dd></div>)}
      </dl>
    </Section>
    {(r.history.first || r.history.latest) && <Section title={m('history')}>
      {[[m('oldest'), r.history.first], [m('newest'), r.history.latest]].map(([k, c]) => c && typeof c === 'object' &&
        <p key={k as string}><span className="text-slate-400">{k as string}: </span><code className="text-slate-100">{c.hash}</code> · {c.date?.slice(0, 10)} · {c.title}</p>)}
    </Section>}
    <Section title={m('componentsTitle')}>
      {r.components.length ? <ul className="space-y-1.5">{r.components.map((c, i) => <li key={`${c.name}-${i}`}>
        <span className="font-medium text-[var(--at-text)]">{c.name}</span>{c.kind && <span className="text-slate-400"> · {c.kind}</span>}
        {c.description && <p className="text-xs text-slate-400">{c.description}</p>}
      </li>)}</ul> : <p className="text-slate-400">{m('noComponents')}</p>}
    </Section>
    <Section title={m('dependencies')}>
      {r.dependencies === null ? notStored : r.dependencies.length ? <ul className="space-y-1">{r.dependencies.map((d, i) => <li key={i}>{d.source} → {d.target}{d.label && <span className="text-slate-400"> ({d.label})</span>}</li>)}</ul> : <p className="text-slate-400">{m('noDependencies')}</p>}
    </Section>
    <Section title={m('rules')}>
      {r.rules === null ? notStored : r.rules.length ? <ul className="space-y-1.5">{r.rules.map((x, i) => <li key={i}>
        <span className="font-medium text-[var(--at-text)]">{x.name}</span>{!x.enabled && <Tag className="ml-2">{m('off')}</Tag>}
        <p className="text-xs text-slate-400">{x.source} {x.constraint === 'required' ? m('must') : m('mustNot')} {x.target} · {x.severity}</p>
      </li>)}</ul> : <p className="text-slate-400">{m('noRules')}</p>}
    </Section>
    <Section title={m('designDecisions')}>
      {r.decisions === null ? notStored : r.decisions.length ? <ul className="space-y-1">{r.decisions.map(d => <li key={d.number}>ADR-{d.number}: {d.title} <span className="text-slate-400">· {d.status}</span></li>)}</ul> : <p className="text-slate-400">{m('noDecisions')}</p>}
    </Section>
  </div>;
}
