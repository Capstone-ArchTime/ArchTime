import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { ExportMeta } from '@/features/architecture/export-file';
import type { IssueAction } from '@/features/architecture/issues';
import { parseHash } from '@/features/architecture/url-state';
import type { ViewerState } from '@/features/architecture/url-state';
import { useFocusMode } from '@/features/architecture/useFocusMode';
import { useHash, useProjectArchitecture } from '@/features/architecture/useProjectArchitecture';
import { getProjects } from '@/features/project-data';
import type { ProjectSummary } from '@/features/project-data';
import { getWorkspace } from '@/features/workspace-summary';

const SAMPLE_IDS = new Set(FIXTURES.map(f => f.id));
const sectionTitle = 'text-[10px] font-mono uppercase tracking-wider text-[#94a3b8]';

function ReceiptSummary({ receipt }: { receipt: RefineReceipt }) {
  const failed = receipt.attempts.filter(a => !a.ok).length;
  return <section className="space-y-2 text-xs">
    <h3 className={sectionTitle}>AI refinement</h3>
    <RunUsage key={receipt.runId ?? receipt.model} receipt={receipt} />
    {receipt.accepted
      ? <p className="text-[#94a3b8]">Accepted after {failed + 1} attempt{failed ? 's' : ''}{receipt.mode === 'name-only' ? ` (names only${receipt.narrowed ? `: ${receipt.narrowed}` : ''})` : receipt.movedRatio !== undefined ? `; ${Math.round(receipt.movedRatio * 100)}% of files moved` : ''}.</p>
      // The Issues list explains the fallback; the attempts' verifier codes stay here for whoever digs deeper.
      : <div className="text-[#94a3b8]">
        <p>No usable AI answer; the grouping by dependencies is shown. Verifier codes per attempt:</p>
        <ol className="mt-1 list-decimal pl-4">{receipt.attempts.map(a => <li key={a.n}>{a.issues.slice(0, 2).map(i => i.code).join(', ') || 'ok'}</li>)}</ol>
      </div>}
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
  // Mining, grouping files and the AI are maintainer work; the server refuses them to members who only read. Hidden until known.
  const [maintains, setMaintains] = useState<{ projectId: string; yes: boolean } | null>(null);
  const canMaintain = !!projectId && maintains?.projectId === projectId && maintains.yes;
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    getWorkspace(projectId, controller.signal).then(w => setMaintains({ projectId, yes: w.canMaintain })).catch(() => { /* stays read-only; the page reports its own load errors */ });
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    getProjects(controller.signal).then(setProjects).catch(() => { /* the switcher is optional */ });
    return () => controller.abort();
  }, []);

  const project = projects.find(p => p.id === projectId);
  const title = sample ? sample.label.split(':')[0] : project?.name ?? 'Workspace';
  useEffect(() => { document.title = `${title} · Architecture · ArchTime`; }, [title]);

  const base: ViewerState = useMemo(() => (projectId ? { project: projectId, ...(snapshotParam ? { snapshot: snapshotParam } : {}) } : { view: sample?.id }), [projectId, snapshotParam, sample?.id]);
  const payload = arch.payload;
  const view = sample?.view ?? (payload?.status === 'ready' ? payload.view : null);
  const busy = !!arch.refining || arch.generating;
  // Full screen hides this header too, so it only counts while there is a drawing to leave it from.
  const fullScreen = useFocusMode();
  const focusMode = fullScreen.focus && !!view;

  // What the Issues list is built from, besides the view itself.
  const issueContext = useMemo(() => ({ quality: payload?.quality ?? null, stale: payload?.mapping?.stale ?? false, receipt: payload?.mapping?.receipt ?? null, canEdit: canMaintain }), [payload, canMaintain]);
  const openReference = useRef<(() => void) | null>(null);
  const onIssueAction = (action: IssueAction) => {
    if (action === 'regenerate') { if (!busy) void arch.generate(); } else openReference.current?.();
  };
  // Exports are named after the workspace and snapshot, not after the view's title (which is the commit title).
  const snapshot = payload?.snapshot;
  const exportInfo = useMemo<ExportMeta>(() => (sample ? { workspace: title, sample: true } : { workspace: title, hash: snapshot?.hash, date: snapshot?.date, commitTitle: snapshot?.title }), [sample, title, snapshot]);

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

  // The long explanations sit in collapsed disclosures; an out-of-date snapshot is an issue card (with its Regenerate button), not a box here.
  const overview = payload?.status === 'ready' && payload.view && projectId ? <>
    <section className="space-y-1.5 text-xs">
      <h3 className={sectionTitle}>Architecture</h3>
      <p className="text-[#94a3b8]">Snapshot <code>{payload.snapshot?.hash}</code>{payload.mapping ? ` · generated ${new Date(payload.mapping.createdAt).toLocaleString()}` : ''}</p>
      <details className="text-[#94a3b8]">
        <summary className="cursor-pointer select-none text-slate-300 hover:text-white">How these components were made</summary>
        <p className="mt-1.5 leading-relaxed">{payload.mapping?.generator === 'cluster+llm'
          ? 'Grouped by dependency clustering, then named and refined by an AI model; the answer was verified, and every arrow still comes from file dependencies.'
          : 'Grouped by dependency clustering and named from folder names.'}</p>
      </details>
    </section>
    {payload.quality && <section className="space-y-2"><h3 className={sectionTitle}>Quality</h3>
      <QualityPanel projectId={projectId} quality={payload.quality} view={payload.view} onSaved={arch.reload} canEdit={canMaintain} openEditorRef={openReference} /></section>}
    {payload.mapping?.receipt && <ReceiptSummary receipt={payload.mapping.receipt} />}
  </> : sample ? <details className="text-xs text-[#94a3b8]">
    <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-wider text-slate-300 hover:text-white">About this sample</summary>
    <p className="mt-1.5 leading-relaxed">A hand-built example that follows the same rules as real output. Open one of your workspaces to see its own architecture.</p></details> : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#080b0e] text-[#f4f4f6]">
      {!focusMode && <header className="flex h-10 shrink-0 items-center gap-2 border-b border-[#242527] bg-[#0d1116] px-3">
        <Link to="/architecture" className="shrink-0 font-bold tracking-tight text-[#93c5fd] hover:text-white" aria-label="ArchTime: all architectures">Arch<span className="text-white">Time</span></Link>
        <span className="text-[#2a3441]">/</span>
        <Dropdown trigger={['click']} menu={switcher}>
          <button type="button" className="flex min-w-0 max-w-56 items-center gap-1 whitespace-nowrap rounded px-1.5 py-1 text-sm font-medium hover:bg-white/10" aria-label={`Switch workspace (now ${title})`}>
            <span className="truncate">{title}</span> <ChevronDown size={14} className="shrink-0 text-[#94a3b8]" />
          </button>
        </Dropdown>
        {projectId && <Select size="small" variant="borderless" aria-label="Snapshot" className="hidden w-44 shrink-0 md:inline-flex" placeholder="Latest snapshot" allowClear value={snapshotParam}
          options={arch.snapshots.map(s => ({ value: s.id, label: `${s.hash} · ${s.title.split('\n')[0].slice(0, 40)}` }))}
          onChange={(id?: string) => commit({ project: projectId, ...(id ? { snapshot: id } : {}) }, true)} />}

        {/* The "Consistent with the import graph: N components, M dependencies" check lives in the Issues chip and the overview, not here. */}
        {arch.refining && <div className="mx-auto hidden min-w-0 items-center gap-3 whitespace-nowrap text-xs text-[#94a3b8] xl:flex" role="status">
          <span className="flex items-center gap-2"><Sparkles size={13} className="text-[#93c5fd]" /> {arch.refining.stage}<Progress percent={arch.refining.progress} size="small" showInfo={false} className="!m-0 w-24" status="active" /></span>
        </div>}

        <div className={`ml-auto flex shrink-0 items-center gap-2 ${arch.refining ? 'xl:ml-0' : ''}`}>
          {projectId && !canMaintain && maintains?.projectId === projectId && <Tooltip title="Only maintainers of this workspace can mine it or define its architecture with AI."><span className="rounded border border-[#242527] px-2 py-0.5 text-xs text-slate-300">Read only</span></Tooltip>}
          {canMaintain && <Tooltip title="Scan and mine the repository's history"><Button size="small" icon={<Pickaxe size={13} />} aria-label="Mine" onClick={() => setMining(true)}><span className="hidden lg:inline">Mine</span></Button></Tooltip>}
          {canMaintain && payload && aiControls()}
          {canMaintain && payload?.status === 'ready' && <Tooltip title="Group the files again by their dependencies (no AI)"><Button size="small" icon={<RefreshCw size={13} />} aria-label="Regenerate" loading={arch.generating} disabled={busy} onClick={() => void arch.generate()} /></Tooltip>}
          {projectId && <Dropdown trigger={['click']} menu={{ items: [
            { key: 'detail', label: <Link to={`/project?projectId=${projectId}`}>Workspace details</Link> },
            { key: 'compare', label: <Link to={`/compare?projectId=${projectId}`}>Compare revisions</Link> },
            { key: 'usage', label: <Link to="/ai-usage">AI usage</Link> },
          ] }}><Button size="small" aria-label="More">⋯</Button></Dropdown>}
          <div className="flex h-8 w-8 items-center justify-center"><div className="scale-[0.8]"><AccountMenu onNavigate={() => {}} /></div></div>
        </div>
      </header>}

      <main className="relative min-h-0 flex-1">
        {view && <ArchitectureViewer view={view} base={base} hash={hash} commit={commit} overview={overview}
          focusMode={focusMode} onFocusMode={fullScreen.set} issueContext={issueContext} onIssueAction={onIssueAction} exportInfo={exportInfo}
          projectId={projectId} mappingVersion={payload?.mapping?.createdAt}
          {...(projectId ? { snapshots: arch.snapshots, snapshotId: snapshotParam ?? payload?.snapshot?.id, onSnapshot: (id: string) => commit({ project: projectId, snapshot: id }, true) } : {})} />}

        {/* No drawing for this snapshot (yet): keep the snapshot list, like a design file's pages, so another can be opened. */}
        {projectId && !view && arch.snapshots.length > 0 && <aside aria-label="Snapshots" className="absolute inset-y-0 left-0 z-10 hidden w-60 border-r border-[#242527] bg-[#0d1116] lg:block">
          <LayersPanel snapshots={arch.snapshots} snapshotId={snapshotParam ?? payload?.snapshot?.id} onSnapshot={id => commit({ project: projectId, snapshot: id }, true)} />
        </aside>}
        {projectId && arch.current?.status === 'loading' && <div role="status" className="flex h-full flex-col items-center justify-center gap-3"><Spin /><p className="text-sm text-[#94a3b8]">Loading architecture…</p></div>}
        {projectId && arch.current?.status === 'error' && <div className="mx-auto max-w-xl p-10">
          <Alert type="error" showIcon title="Could not load the architecture" description={arch.current.message}
            action={<div className="flex gap-2"><Button onClick={arch.reload}>Retry</Button>{canMaintain && <Button onClick={() => setMining(true)}>Mine</Button>}</div>} />
        </div>}
        {projectId && payload?.status === 'missing' && <div className="flex h-full items-center justify-center">
          <Empty image={<Workflow size={40} className="mx-auto text-[#93c5fd]" />} description={<span>No components yet for snapshot <code>{payload.snapshot?.hash}</code>.<br />{canMaintain ? 'Group its files into components to draw the architecture.' : 'A maintainer of this workspace has not grouped its files into components yet.'}</span>}>
            {canMaintain && <div className="flex flex-wrap justify-center gap-2">
              <Button type="primary" loading={arch.generating} disabled={busy} onClick={() => void arch.generate()}>Group files into components</Button>
            </div>}
          </Empty>
        </div>}
        {sampleId && !sample && <div className="p-10"><Alert type="error" showIcon title="Unknown sample" action={<Link to="/architecture"><Button>All architectures</Button></Link>} /></div>}
      </main>

      {mining && canMaintain && projectId && <MiningPanel project={{ id: projectId, name: title }} open onClose={() => setMining(false)} onChanged={arch.reload} />}
    </div>
  );
}
