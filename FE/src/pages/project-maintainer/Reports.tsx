import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Empty, Modal, Select, Table } from 'antd';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { getProjects, getSnapshots } from '@/features/project-data';
import type { ProjectSummary, Snapshot } from '@/features/project-data';
import { createEvolutionReport, reportHtml, validReports } from '@/features/evolution-report';
import type { EvolutionReport } from '@/features/evolution-report';
import MiningCoverageNotice from '@/components/MiningCoverageNotice';
import { useDemoStore } from '@/features/useDemoStore';
import { downloadText } from '@/features/download';
const emptyHistory: EvolutionReport[] = [];

function RevisionReport({ project, onReport }: { project: ProjectSummary; onReport: (report: EvolutionReport) => void }) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [base, setBase] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    getSnapshots(project.id, controller.signal).then(rows => { setSnapshots(rows); setBase(rows.at(-1)?.id ?? ''); setTarget(rows[0]?.id ?? ''); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [project.id, revision]);
  const options = snapshots.map(s => ({ value: s.id, label: `${s.hash.slice(0, 10)} · ${s.title}` }));
  return <section className={featurePanel}>
    <MiningCoverageNotice project={project} context="report" className="mb-4" onMiningFinished={() => { setLoading(true); setRevision(v => v + 1); }} />
    {error && <Alert type="error" title={error} action={<Button onClick={() => { setLoading(true); setRevision(v => v + 1); }}>Retry</Button>} />}
    <div className="grid sm:grid-cols-2 gap-4"><div><label htmlFor="report-base" className="block text-sm mb-2">From revision</label><Select id="report-base" loading={loading} disabled={loading || !!error} className="w-full" value={base || undefined} onChange={setBase} options={options} /></div><div><label htmlFor="report-target" className="block text-sm mb-2">To revision</label><Select id="report-target" loading={loading} disabled={loading || !!error} className="w-full" value={target || undefined} onChange={setTarget} options={options} /></div></div>
    {!loading && !error && snapshots.length < 2 && <Empty description="At least two mined snapshots are needed to create an evolution report." />}
    {base && base === target && <p className="text-sm text-amber-400 mt-3">Choose two different revisions.</p>}
    <Button className="mt-5" type="primary" disabled={loading || !!error || !base || !target || base === target} onClick={() => { const a = snapshots.find(s => s.id === base), b = snapshots.find(s => s.id === target); if (a && b) onReport(createEvolutionReport(project.name, a, b)); }}>Preview report</Button>
  </section>;
}

export default function Reports() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState<EvolutionReport | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [frameReady, setFrameReady] = useState(false);
  const history = useDemoStore('report-history', emptyHistory, validReports, 'project-maintainer');
  const { message } = App.useApp();
  useEffect(() => {
    const controller = new AbortController();
    getProjects(controller.signal).then(rows => { setProjects(rows); setProjectId(rows[0]?.id ?? ''); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const project = projects.find(p => p.id === projectId);
  function show(report: EvolutionReport) { setFrameReady(false); setPreview(report); }
  function remember(report: EvolutionReport) {
    if (!history.data.some(r => r.id === report.id)) return history.save([report, ...history.data].slice(0, 30));
    return true;
  }
  return <FeaturePage title="Evolution Reports" description="Compare server snapshots, preview the report, and print or save it as PDF using your browser." demo={false} error={history.error}>
    {error && <Alert type="error" title={error} action={<Button onClick={() => { setLoading(true); setRevision(v => v + 1); }}>Retry</Button>} />}
    <Select aria-label="Report project" loading={loading} disabled={loading || !!error} className="w-full sm:max-w-md" placeholder="Select a project" value={projectId || undefined} onChange={setProjectId} options={projects.map(p => ({ value: p.id, label: p.name }))} />
    {!loading && !error && !projects.length && <Empty description="No projects were returned for this account." />}
    {project && !error && <RevisionReport key={project.id} project={project} onReport={show} />}
    <section><h3 className="font-semibold mb-2">Export history on this device</h3><p className="text-xs text-[#94a3b8] mb-4">The latest 30 reports are stored in this browser only. Print history records that the print dialog was requested, not whether a PDF was saved.</p><Table rowKey="id" dataSource={history.data} pagination={{ pageSize: 5, showSizeChanger: false }} scroll={{ x: 650 }} columns={[{ title: 'Project', dataIndex: 'project' }, { title: 'Generated', dataIndex: 'createdAt', render: at => new Date(at).toLocaleString() }, { title: 'Revision range', render: (_, r: EvolutionReport) => `${r.from.slice(0, 10)} → ${r.to.slice(0, 10)}` }, { title: 'Actions', render: (_, r: EvolutionReport) => <Button onClick={() => show(r)}>Open report</Button> }]} /></section>
    <Modal title="Evolution report preview" width={1000} open={!!preview} onCancel={() => setPreview(null)} footer={<div className="flex flex-wrap justify-end gap-2"><Button onClick={() => setPreview(null)}>Close</Button><Button disabled={!preview} onClick={() => { if (preview) { downloadText(`evolution-${preview.id}.html`, reportHtml(preview), 'text/html;charset=utf-8'); if (!remember(preview)) message.warning('Downloaded, but history could not be saved.'); } }}>Download HTML</Button><Button type="primary" disabled={!preview || !frameReady} onClick={() => { try { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); if (preview) remember(preview); } catch { message.error('Printing is unavailable here. Download HTML and print it from your browser.'); } }}>Print / Save as PDF</Button></div>}>
      {preview && <iframe ref={frame} title="Evolution report" sandbox="allow-same-origin allow-modals" srcDoc={reportHtml(preview)} onLoad={() => setFrameReady(true)} className="w-full h-[65vh] bg-white border-0" />}
    </Modal>
  </FeaturePage>;
}
