import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Empty, Progress, Select, Spin, Tooltip } from 'antd';
import { RefreshCw, Sparkles, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ArchitectureViewer from '@/components/architecture/ArchitectureViewer';
import { FIXTURES, getFixture } from '@/features/architecture/fixtures';
import { generateArchitecture, getArchitecture, getSnapshotSummaries, refineArchitecture } from '@/features/architecture/api';
import type { ArchitecturePayload, RefineReceipt, SnapshotSummary } from '@/features/architecture/api';
import { getMiningOverview } from '@/features/mining-api';
import { getProjects } from '@/features/project-data';
import type { ProjectSummary } from '@/features/project-data';
import { parseHash, serializeHash } from '@/features/architecture/url-state';
import ModelPicker, { RunUsage } from '@/components/architecture/ModelPicker';
import QualityPanel from '@/components/architecture/QualityPanel';
import { getUserModels, selectedModel } from '@/features/llm-api';
import type { UserModels } from '@/features/llm-api';
import type { ViewerState } from '@/features/architecture/url-state';

const SAMPLE_IDS = new Set(FIXTURES.map(f => f.id));

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);
  const commit = useCallback((state: ViewerState, push = false) => {
    const next = serializeHash(state);
    const url = `${window.location.pathname}${window.location.search}${next}`;
    if (push) window.history.pushState(null, '', url); else window.history.replaceState(null, '', url);
    setHash(next);
  }, []);
  return [hash, commit] as const;
}

type Load = { key: string; status: 'loading' } | { key: string; status: 'error'; message: string } | { key: string; status: 'done'; payload: ArchitecturePayload };

export default function ArchitectureMap() {
  const { message, modal } = App.useApp();
  const [hash, commit] = useHash();
  const parsed = parseHash(hash, { views: SAMPLE_IDS });
  const sample = parsed.project ? undefined : getFixture(parsed.view);
  const projectId = parsed.project;
  const snapshotParam = parsed.snapshot;

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [snapshots, setSnapshots] = useState<{ projectId: string; rows: SnapshotSummary[] } | null>(null);
  const [load, setLoad] = useState<Load | null>(null);
  const [reloads, setReloads] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState<{ stage: string; progress: number } | null>(null);
  const request = useRef(0);
  const [models, setModels] = useState<UserModels | null>(null);
  const [modelChoice, setModelChoice] = useState<string | undefined>();

  useEffect(() => {
    const controller = new AbortController();
    getProjects(controller.signal).then(setProjects).catch(() => { /* samples still work without the server */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    getSnapshotSummaries(projectId, controller.signal).then(rows => setSnapshots({ projectId, rows })).catch(() => { if (!controller.signal.aborted) setSnapshots({ projectId, rows: [] }); });
    return () => controller.abort();
  }, [projectId, reloads]);

  // The models the user may pick, with estimates for this snapshot's size. Optional: the default model works without it.
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    getUserModels(projectId, snapshotParam, controller.signal).then(setModels).catch(() => { if (!controller.signal.aborted) setModels(null); });
    return () => controller.abort();
  }, [projectId, snapshotParam, reloads]);

  const key = projectId ? `${projectId}:${snapshotParam ?? 'latest'}:${reloads}` : '';
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    const mine = ++request.current;
    getArchitecture(projectId, snapshotParam, controller.signal)
      .then(payload => { if (!controller.signal.aborted && mine === request.current) setLoad({ key, status: 'done', payload }); })
      .catch(cause => { if (!controller.signal.aborted && mine === request.current) setLoad({ key, status: 'error', message: cause instanceof Error ? cause.message : 'Could not load the architecture.' }); });
    return () => controller.abort();
  }, [projectId, snapshotParam, key]);
  // While an AI refinement runs in the background, follow its progress and reload when it ends.
  const polling = refining !== null;
  useEffect(() => {
    if (!projectId || !polling) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      getMiningOverview(projectId, controller.signal).then(overview => {
        const job = overview.activeJob;
        if (job) { setRefining({ stage: job.stage || 'Working', progress: job.progress }); return; }
        setRefining(null);
        setReloads(v => v + 1);
        message[overview.lastJob?.status === 'failed' ? 'error' : 'success'](overview.lastJob?.stage || 'The refinement finished.');
      }).catch(() => { /* keep polling; a transient error should not end the wait */ });
    }, 1500);
    return () => { controller.abort(); clearInterval(timer); };
  }, [projectId, polling, message]);

  // The result only counts while it belongs to the current selection; anything else is still loading.
  const current: Load | null = projectId ? (load && load.key === key ? load : { key, status: 'loading' }) : null;

  const payload = current?.status === 'done' ? current.payload : null;

  async function startRefine() {
    if (!projectId || !payload) return;
    try {
      const id = payload.snapshot?.id ?? snapshotParam;
      await refineArchitecture(projectId, id, models?.allowUserModelChoice ? modelChoice : undefined);
      setRefining({ stage: 'Queued', progress: 0 });
    } catch (cause) { message.error(cause instanceof Error ? cause.message : 'Could not start the refinement.'); }
  }
  function confirmRefine() {
    const llm = payload?.llm;
    if (!llm?.enabled) return;
    const chosen = selectedModel(models, modelChoice);
    const target = chosen ? { host: chosen.host, model: chosen.displayName, external: chosen.external } : { host: llm.host, model: llm.displayName ?? llm.model, external: llm.external };
    if (!target.external) { void startRefine(); return; }
    const estimate = chosen?.estimate ? ` Expected use: about ${chosen.estimate.tokens.toLocaleString('en-US')} tokens.` : '';
    modal.confirm({
      title: 'Send file paths to an external AI service?',
      content: `ArchTime will send this snapshot's file paths and which files import which to ${target.host} (model ${target.model}). It never sends source code, commit messages, or access tokens. The answer is checked before it is used, and the dependency-based result is kept if it fails.${estimate}`,
      okText: 'Send and refine', cancelText: 'Cancel',
      onOk: () => startRefine(),
    });
  }

  async function generate() {
    if (!projectId) return;
    setGenerating(true);
    try {
      const next = await generateArchitecture(projectId, snapshotParam ?? payload?.snapshot?.id);
      setLoad({ key, status: 'done', payload: next });
      message.success('Components generated.');
    } catch (cause) { message.error(cause instanceof Error ? cause.message : 'Generating the components failed.'); }
    finally { setGenerating(false); }
  }

  function aiButton() {
    const llm = payload?.llm;
    const button = <Button icon={<Sparkles size={14} />} disabled={!llm?.enabled || !!refining || generating} loading={!!refining} onClick={confirmRefine}>
      {payload?.status === 'ready' ? 'Refine with AI' : 'Group with AI'}
    </Button>;
    if (llm?.enabled) {
      const chosen = selectedModel(models, modelChoice);
      const t = chosen ? { host: chosen.host, model: chosen.displayName, external: chosen.external } : { host: llm.host, model: llm.displayName ?? llm.model, external: llm.external };
      return <>
        <ModelPicker models={models} value={modelChoice} onChange={setModelChoice} disabled={!!refining || generating} />
        <Tooltip title={t.external ? `Sends file paths to ${t.host} (${t.model}); asks first` : `Uses ${t.model} on ${t.host}; nothing leaves your network`}>{button}</Tooltip>
      </>;
    }
    return <Tooltip title={llm?.reason ?? 'AI refinement is not available'}><span>{button}</span></Tooltip>;
  }
  function receiptNote(receipt: RefineReceipt | null) {
    if (!receipt) return null;
    const failed = receipt.attempts.filter(a => !a.ok).length;
    const notes = receipt.notes?.length ? <ul className="list-disc pl-5 text-xs text-[#94a3b8]">{receipt.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null;
    if (receipt.accepted) {
      return <div className="space-y-1"><RunUsage key={receipt.runId ?? receipt.model} receipt={receipt} /><p className="text-xs text-[#94a3b8]" role="status">AI refinement by <code>{receipt.model}</code> was accepted after {failed + 1} attempt{failed ? 's' : ''}{receipt.mode === 'name-only' ? (receipt.narrowed ? ` (names only: ${receipt.narrowed})` : ' (names only: the repository was too large to regroup)') : receipt.movedRatio !== undefined ? `; ${Math.round(receipt.movedRatio * 100)}% of files moved from the dependency grouping` : ''}.</p>{notes}</div>;
    }
    return <Alert type="warning" showIcon title="AI refinement did not produce a usable answer"
      description={<div className="space-y-2">
        <p>{receipt.fallbackReason ?? 'No answer passed verification.'} The grouping by dependencies is shown instead.</p>
        <RunUsage key={receipt.runId ?? receipt.model} receipt={receipt} />
        <ol className="list-decimal pl-5 text-xs space-y-1">{receipt.attempts.map(a => <li key={a.n}>Attempt {a.n}: {a.issues.length ? a.issues.slice(0, 3).map((i, k) => <span key={k} className="block"><code>{i.code}</code> {i.message}</span>) : 'no answer'}</li>)}</ol>
        {notes}
      </div>} />;
  }

  const base: ViewerState = useMemo(() => (projectId ? { project: projectId, ...(snapshotParam ? { snapshot: snapshotParam } : {}) } : { view: sample?.id }), [projectId, snapshotParam, sample?.id]);
  const sourceValue = projectId ? `project:${projectId}` : `sample:${sample?.id}`;
  const sourceOptions = [
    { label: 'Projects', options: projects.map(p => ({ value: `project:${p.id}`, label: p.name })) },
    { label: 'Samples', options: FIXTURES.map(f => ({ value: `sample:${f.id}`, label: f.label })) },
  ].filter(g => g.options.length);
  const snapshotOptions = (snapshots && snapshots.projectId === projectId ? snapshots.rows : []).map(s => ({ value: s.id, label: `${s.hash} · ${s.title.split('\n')[0].slice(0, 48)}${s.date ? ` · ${new Date(s.date).toLocaleDateString()}` : ''}` }));

  return (
    <DashboardLayout>
      <div className="max-w-[1500px] mx-auto space-y-3">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#222c37] pb-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-1">Architecture Map</h2>
            <p className="text-sm text-[#94a3b8] max-w-2xl">The system as a handful of components. Every arrow is computed from dependencies between files.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Architecture source" className="min-w-64" value={sourceValue} options={sourceOptions} showSearch optionFilterProp="label"
              onChange={(value: string) => { const [kind, id] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)]; commit(kind === 'project' ? { project: id } : { view: id }, true); }} />
            {projectId && <Select aria-label="Snapshot" className="min-w-72" placeholder="Latest snapshot" allowClear value={snapshotParam} options={snapshotOptions} onChange={(id?: string) => commit({ project: projectId, ...(id ? { snapshot: id } : {}) }, true)} />}
          </div>
        </header>

        {sample && <>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#94a3b8]"><span className="rounded border border-[#38bdf8]/30 bg-[#38bdf8]/5 px-2 py-1 text-[#7dd3fc]">Sample architecture</span>Hand-built examples that follow the same rules as real output. Pick a project above to see its own architecture.</p>
          <ArchitectureViewer view={sample.view} base={base} hash={hash} commit={commit} />
        </>}

        {projectId && current?.status === 'loading' && <div role="status" className="p-16 text-center"><Spin /><p className="mt-3 text-sm text-[#94a3b8]">Loading architecture…</p></div>}
        {projectId && current?.status === 'error' && (
          <Alert type="error" showIcon title="Could not load the architecture" description={current.message}
            action={<div className="flex gap-2"><Button onClick={() => setReloads(v => v + 1)}>Retry</Button><Link to="/projects"><Button>Projects</Button></Link></div>} />
        )}
        {projectId && refining && (
          <Alert type="info" showIcon title="Refining with AI" description={<div className="space-y-1"><Progress percent={refining.progress} size="small" status="active" /><span className="text-xs">{refining.stage}. Safe to leave this page; the result is saved when it finishes.</span></div>} />
        )}
        {projectId && payload?.status === 'missing' && (
          <Empty image={<Workflow size={40} className="mx-auto text-[#38bdf8]" />} description={<span>No components yet for snapshot <code>{payload.snapshot?.hash}</code>.<br />Group its files into components to draw the architecture.</span>}>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="primary" loading={generating} disabled={!!refining} onClick={() => void generate()}>Group files into components</Button>
              {aiButton()}
            </div>
          </Empty>
        )}
        {projectId && payload?.status === 'ready' && payload.view && <>
          {payload.mapping?.stale && <Alert type="warning" showIcon title="These components are out of date" description="The snapshot's files or dependencies changed after they were generated." action={<Button size="small" loading={generating} disabled={!!refining} onClick={() => void generate()}>Regenerate</Button>} />}
          <p className="text-xs text-[#94a3b8]">{payload.mapping?.generator === 'cluster+llm'
            ? 'Files were grouped by dependency clustering, then named and refined by an AI model. The answer was verified before use, and every arrow is still computed from file dependencies. '
            : 'Components are grouped by dependency clustering and named from folder names. '}
            Roles marked INFERENCE come from names; UNKNOWN means nothing identified a role. Snapshot <code>{payload.snapshot?.hash}</code>{payload.mapping ? `, generated ${new Date(payload.mapping.createdAt).toLocaleString()}` : ''}.</p>
          {receiptNote(payload.mapping?.receipt ?? null)}
          {payload.quality && <QualityPanel projectId={projectId} quality={payload.quality} view={payload.view} onSaved={() => setReloads(v => v + 1)} />}
          <ArchitectureViewer view={payload.view} base={base} hash={hash} commit={commit}
            actions={<>{aiButton()}<Button icon={<RefreshCw size={14} />} loading={generating} disabled={!!refining} onClick={() => void generate()}>Regenerate</Button></>} />
        </>}
      </div>
    </DashboardLayout>
  );
}
