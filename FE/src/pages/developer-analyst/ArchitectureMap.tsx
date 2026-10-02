import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Empty, Select, Spin } from 'antd';
import { RefreshCw, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ArchitectureViewer from '@/components/architecture/ArchitectureViewer';
import { FIXTURES, getFixture } from '@/features/architecture/fixtures';
import { generateArchitecture, getArchitecture, getSnapshotSummaries } from '@/features/architecture/api';
import type { ArchitecturePayload, SnapshotSummary } from '@/features/architecture/api';
import { getProjects } from '@/features/project-data';
import type { ProjectSummary } from '@/features/project-data';
import { parseHash, serializeHash } from '@/features/architecture/url-state';
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
  const { message } = App.useApp();
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
  const request = useRef(0);

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
  // The result only counts while it belongs to the current selection; anything else is still loading.
  const current: Load | null = projectId ? (load && load.key === key ? load : { key, status: 'loading' }) : null;

  const payload = current?.status === 'done' ? current.payload : null;

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
        {projectId && payload?.status === 'missing' && (
          <Empty image={<Workflow size={40} className="mx-auto text-[#38bdf8]" />} description={<span>No components yet for snapshot <code>{payload.snapshot?.hash}</code>.<br />Group its files into components to draw the architecture.</span>}>
            <Button type="primary" loading={generating} onClick={() => void generate()}>Group files into components</Button>
          </Empty>
        )}
        {projectId && payload?.status === 'ready' && payload.view && <>
          {payload.mapping?.stale && <Alert type="warning" showIcon title="These components are out of date" description="The snapshot's files or dependencies changed after they were generated." action={<Button size="small" loading={generating} onClick={() => void generate()}>Regenerate</Button>} />}
          <p className="text-xs text-[#94a3b8]">Components are grouped by dependency clustering and named from folder names. Roles marked INFERENCE come from folder naming; UNKNOWN means no convention matched. Snapshot <code>{payload.snapshot?.hash}</code>{payload.mapping ? `, generated ${new Date(payload.mapping.createdAt).toLocaleString()}` : ''}.</p>
          <ArchitectureViewer view={payload.view} base={base} hash={hash} commit={commit}
            actions={<Button icon={<RefreshCw size={14} />} loading={generating} onClick={() => void generate()}>Regenerate</Button>} />
        </>}
      </div>
    </DashboardLayout>
  );
}
