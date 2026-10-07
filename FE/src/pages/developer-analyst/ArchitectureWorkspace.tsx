import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Dropdown, Empty, Progress, Select, Spin, Tooltip } from 'antd';
import { ChevronDown, Pickaxe, RefreshCw, Sparkles, Workflow } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ArchitectureViewer from '@/components/architecture/ArchitectureViewer';
import LayersPanel from '@/components/architecture/LayersPanel';
import ModelPicker, { RunUsage } from '@/components/architecture/ModelPicker';
import QualityPanel from '@/components/architecture/QualityPanel';
import AccountMenu from '@/components/AccountMenu';
import MiningPanel from '@/components/MiningPanel';
import { FIXTURES, getFixture } from '@/features/architecture/fixtures';
import type { RefineReceipt } from '@/features/architecture/api';
import { parseHash } from '@/features/architecture/url-state';
import type { ViewerState } from '@/features/architecture/url-state';
import { useHash, useProjectArchitecture } from '@/features/architecture/useProjectArchitecture';
import { getProjects } from '@/features/project-data';
import type { ProjectSummary } from '@/features/project-data';

const SAMPLE_IDS = new Set(FIXTURES.map(f => f.id));
const sectionTitle = 'text-[10px] font-mono uppercase tracking-wider text-[#94a3b8]';

function ReceiptSummary({ receipt }: { receipt: RefineReceipt }) {
  const failed = receipt.attempts.filter(a => !a.ok).length;
  return <section className="space-y-2 text-xs">
    <h3 className={sectionTitle}>AI refinement</h3>
    <RunUsage key={receipt.runId ?? receipt.model} receipt={receipt} />
    {receipt.accepted
      ? <p className="text-[#94a3b8]">Accepted after {failed + 1} attempt{failed ? 's' : ''}{receipt.mode === 'name-only' ? ` (names only${receipt.narrowed ? `: ${receipt.narrowed}` : ''})` : receipt.movedRatio !== undefined ? `; ${Math.round(receipt.movedRatio * 100)}% of files moved` : ''}.</p>
      : <Alert type="warning" showIcon title="No usable AI answer" description={<>
        <p>{receipt.fallbackReason ?? 'No answer passed verification.'} The grouping by dependencies is shown.</p>
        <ol className="mt-1 list-decimal pl-4">{receipt.attempts.map(a => <li key={a.n}>{a.issues.slice(0, 2).map(i => i.code).join(', ') || 'ok'}</li>)}</ol>
      </>} />}
  </section>;
}

/**
 * A project's architecture as a full-screen workspace, like a design tool's editor: a top bar for the file (project,
 * snapshot, AI), layers on the left, the artboard, and properties on the right. Samples open here too.
 */
export default function ArchitectureWorkspace() {
  const { projectId: routeProject, sampleId } = useParams();
  const navigate = useNavigate();
  const [hash, commit] = useHash();
  const parsed = parseHash(hash, { views: SAMPLE_IDS });
  const sample = sampleId ? getFixture(sampleId) : undefined;
  const projectId = sample ? undefined : routeProject;
  const snapshotParam = parsed.snapshot;
  const arch = useProjectArchitecture(projectId, snapshotParam);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [mining, setMining] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getProjects(controller.signal).then(setProjects).catch(() => { /* the switcher is optional */ });
    return () => controller.abort();
  }, []);

  const project = projects.find(p => p.id === projectId);
  const title = sample ? sample.label.split(':')[0] : project?.name ?? 'Project';
  useEffect(() => { document.title = `${title} · Architecture · ArchTime`; }, [title]);

  const base: ViewerState = useMemo(() => (projectId ? { project: projectId, ...(snapshotParam ? { snapshot: snapshotParam } : {}) } : { view: sample?.id }), [projectId, snapshotParam, sample?.id]);
  const payload = arch.payload;
  const view = sample?.view ?? (payload?.status === 'ready' ? payload.view : null);
  const busy = !!arch.refining || arch.generating;

  const switcher = {
    items: [
      ...projects.map(p => ({ key: `p:${p.id}`, label: p.name })),
      ...(projects.length ? [{ type: 'divider' as const }] : []),
      ...FIXTURES.map(f => ({ key: `s:${f.id}`, label: <span className="text-[#94a3b8]">Sample · {f.label}</span> })),
    ],
    onClick: ({ key }: { key: string }) => navigate(key.startsWith('p:') ? `/workspace/${key.slice(2)}` : `/workspace/sample/${key.slice(2)}`),
  };

  const aiControls = () => {
    const llm = payload?.llm;
    const button = <Button size="small" type="primary" icon={<Sparkles size={13} />} aria-label={payload?.status === 'ready' ? 'Refine with AI' : 'Group with AI'} disabled={!llm?.enabled || busy} loading={!!arch.refining} onClick={arch.refine}>
      <span className="hidden sm:inline">{payload?.status === 'ready' ? 'Refine with AI' : 'Group with AI'}</span>
    </Button>;
    if (!llm?.enabled) return <Tooltip title={llm?.reason ?? 'AI refinement is not available'}><span>{button}</span></Tooltip>;
    const t = arch.target();
    return <>
      <span className="hidden lg:inline-flex"><ModelPicker models={arch.models} value={arch.modelChoice} onChange={arch.setModelChoice} disabled={busy} /></span>
      <Tooltip title={t.external ? `Sends file paths to ${t.host} (${t.model}); asks first` : `Uses ${t.model} on ${t.host}; nothing leaves your network`}>{button}</Tooltip>
    </>;
  };

  const overview = payload?.status === 'ready' && payload.view && projectId ? <>
    <section className="space-y-2 text-xs">
      <h3 className={sectionTitle}>Architecture</h3>
      <p className="text-[#94a3b8]">{payload.mapping?.generator === 'cluster+llm'
        ? 'Grouped by dependency clustering, then named and refined by an AI model; the answer was verified, and every arrow still comes from file dependencies.'
        : 'Grouped by dependency clustering and named from folder names.'}</p>
      <p className="text-[#64748b]">Snapshot <code>{payload.snapshot?.hash}</code>{payload.mapping ? ` · generated ${new Date(payload.mapping.createdAt).toLocaleString()}` : ''}</p>
      {payload.mapping?.stale && <Alert type="warning" showIcon title="Out of date: the snapshot changed after these components were made."
        action={<Button size="small" loading={arch.generating} disabled={busy} onClick={() => void arch.generate()}>Regenerate</Button>} />}
    </section>
    {payload.quality && <section className="space-y-2"><h3 className={sectionTitle}>Quality</h3>
      <QualityPanel projectId={projectId} quality={payload.quality} view={payload.view} onSaved={arch.reload} /></section>}
    {payload.mapping?.receipt && <ReceiptSummary receipt={payload.mapping.receipt} />}
  </> : sample ? <section className="space-y-2 text-xs"><h3 className={sectionTitle}>Sample</h3>
    <p className="text-[#94a3b8]">A hand-built example that follows the same rules as real output. Open one of your projects to see its own architecture.</p></section> : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#080b0e] text-[#f4f4f6]">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#222c37] bg-[#0d1116] px-3">
        <Link to="/architecture" className="shrink-0 font-bold tracking-tight text-[#38bdf8] hover:text-white" aria-label="ArchTime: all architectures">Arch<span className="text-white">Time</span></Link>
        <span className="text-[#2a3441]">/</span>
        <Dropdown trigger={['click']} menu={switcher}>
          <button type="button" className="flex min-w-0 max-w-56 items-center gap-1 whitespace-nowrap rounded px-1.5 py-1 text-sm font-medium hover:bg-white/10" aria-label={`Switch project (now ${title})`}>
            <span className="truncate">{title}</span> <ChevronDown size={14} className="shrink-0 text-[#94a3b8]" />
          </button>
        </Dropdown>
        {projectId && <Select size="small" variant="borderless" aria-label="Snapshot" className="hidden w-44 shrink-0 md:inline-flex" placeholder="Latest snapshot" allowClear value={snapshotParam}
          options={arch.snapshots.map(s => ({ value: s.id, label: `${s.hash} · ${s.title.split('\n')[0].slice(0, 40)}` }))}
          onChange={(id?: string) => commit({ project: projectId, ...(id ? { snapshot: id } : {}) }, true)} />}

        <div className="mx-auto hidden min-w-0 items-center gap-3 whitespace-nowrap text-xs text-[#94a3b8] xl:flex" role="status">
          {arch.refining
            ? <span className="flex items-center gap-2"><Sparkles size={13} className="text-[#38bdf8]" /> {arch.refining.stage}<Progress percent={arch.refining.progress} size="small" showInfo={false} className="!m-0 w-24" status="active" /></span>
            : view && <><span className="text-[#4ade80]">✓ Verified</span><span>{view.components.length} components · {view.edges.length} dependencies</span></>}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
          {projectId && <Tooltip title="Scan and mine the repository's history"><Button size="small" icon={<Pickaxe size={13} />} aria-label="Mine" onClick={() => setMining(true)}><span className="hidden lg:inline">Mine</span></Button></Tooltip>}
          {projectId && payload && aiControls()}
          {projectId && payload?.status === 'ready' && <Tooltip title="Group the files again by their dependencies (no AI)"><Button size="small" icon={<RefreshCw size={13} />} aria-label="Regenerate" loading={arch.generating} disabled={busy} onClick={() => void arch.generate()} /></Tooltip>}
          {projectId && <Dropdown trigger={['click']} menu={{ items: [
            { key: 'detail', label: <Link to={`/project?projectId=${projectId}`}>Project details</Link> },
            { key: 'history', label: <Link to="/history">Architecture history</Link> },
            { key: 'usage', label: <Link to="/ai-usage">AI usage</Link> },
          ] }}><Button size="small" aria-label="More">⋯</Button></Dropdown>}
          <div className="scale-[0.8]"><AccountMenu onNavigate={() => {}} /></div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        {view && <ArchitectureViewer view={view} base={base} hash={hash} commit={commit} overview={overview}
          {...(projectId ? { snapshots: arch.snapshots, snapshotId: snapshotParam ?? payload?.snapshot?.id, onSnapshot: (id: string) => commit({ project: projectId, snapshot: id }, true) } : {})} />}

        {/* No drawing for this snapshot (yet): keep the snapshot list, like a design file's pages, so another can be opened. */}
        {projectId && !view && arch.snapshots.length > 0 && <aside aria-label="Snapshots" className="absolute inset-y-0 left-0 z-10 hidden w-60 border-r border-[#222c37] bg-[#0d1116] lg:block">
          <LayersPanel snapshots={arch.snapshots} snapshotId={snapshotParam ?? payload?.snapshot?.id} onSnapshot={id => commit({ project: projectId, snapshot: id }, true)} />
        </aside>}
        {projectId && arch.current?.status === 'loading' && <div role="status" className="flex h-full flex-col items-center justify-center gap-3"><Spin /><p className="text-sm text-[#94a3b8]">Loading architecture…</p></div>}
        {projectId && arch.current?.status === 'error' && <div className="mx-auto max-w-xl p-10">
          <Alert type="error" showIcon title="Could not load the architecture" description={arch.current.message}
            action={<div className="flex gap-2"><Button onClick={arch.reload}>Retry</Button><Button onClick={() => setMining(true)}>Mine</Button></div>} />
        </div>}
        {projectId && payload?.status === 'missing' && <div className="flex h-full items-center justify-center">
          <Empty image={<Workflow size={40} className="mx-auto text-[#38bdf8]" />} description={<span>No components yet for snapshot <code>{payload.snapshot?.hash}</code>.<br />Group its files into components to draw the architecture.</span>}>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="primary" loading={arch.generating} disabled={busy} onClick={() => void arch.generate()}>Group files into components</Button>
            </div>
          </Empty>
        </div>}
        {sampleId && !sample && <div className="p-10"><Alert type="error" showIcon title="Unknown sample" action={<Link to="/architecture"><Button>All architectures</Button></Link>} /></div>}
      </main>

      {mining && projectId && <MiningPanel project={{ id: projectId, name: title }} open onClose={() => setMining(false)} onChanged={arch.reload} />}
    </div>
  );
}
