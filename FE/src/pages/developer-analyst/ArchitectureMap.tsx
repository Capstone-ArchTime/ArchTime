import { useEffect, useState } from 'react';
import { Alert, Empty, Input, Spin } from 'antd';
import { Boxes, FolderGit2, Search } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { FIXTURES } from '@/features/architecture/fixtures';
import { parseHash } from '@/features/architecture/url-state';
import { getProjects } from '@/features/project-data';
import type { ProjectSummary } from '@/features/project-data';

const SAMPLE_IDS = new Set(FIXTURES.map(f => f.id));

function Card({ to, title, subtitle, icon, sample }: { to: string; title: string; subtitle: string; icon: React.ReactNode; sample?: boolean }) {
  return <Link to={to} className="group flex flex-col overflow-hidden rounded-lg border border-[#222c37] bg-[#11161b] transition-colors hover:border-[#38bdf8]/60 focus-visible:outline-2 focus-visible:outline-[#38bdf8]">
    <div className="relative flex h-36 items-center justify-center border-b border-[#222c37] bg-[#080b0e]"
      style={{ backgroundImage: 'radial-gradient(circle, #1c2530 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
      <div className="text-[#38bdf8] opacity-70 transition-opacity group-hover:opacity-100">{icon}</div>
      {sample && <span className="absolute left-2 top-2 rounded border border-[#38bdf8]/30 bg-[#38bdf8]/10 px-1.5 py-0.5 text-[10px] text-[#7dd3fc]">Sample</span>}
    </div>
    <div className="px-3 py-2.5">
      <p className="truncate text-sm font-medium group-hover:text-white">{title}</p>
      <p className="truncate text-xs text-[#94a3b8]">{subtitle}</p>
    </div>
  </Link>;
}

/**
 * Where architectures are opened, like a design tool's file browser: every project and the samples, each opening in the
 * full-screen workspace. Older links (#project=… or #view=…) go straight to the workspace with their view state.
 */
export default function ArchitectureMap() {
  const hash = window.location.hash;
  const parsed = parseHash(hash, { views: SAMPLE_IDS });
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    getProjects(controller.signal).then(setProjects).catch(cause => { if (!controller.signal.aborted) { setProjects([]); setError(cause instanceof Error ? cause.message : 'Could not load your projects.'); } });
    return () => controller.abort();
  }, []);

  if (parsed.project) return <Navigate replace to={`/workspace/${encodeURIComponent(parsed.project)}${hash}`} />;
  if (parsed.view && SAMPLE_IDS.has(parsed.view)) return <Navigate replace to={`/workspace/sample/${encodeURIComponent(parsed.view)}`} />;

  const q = query.trim().toLowerCase();
  const shown = (projects ?? []).filter(p => !q || p.name.toLowerCase().includes(q));
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#222c37] pb-5">
          <div>
            <h2 className="mb-1 text-3xl font-bold tracking-tight">Architecture Map</h2>
            <p className="max-w-2xl text-sm text-[#94a3b8]">Open a repository to explore its architecture in a full-screen workspace: layers on the left, the diagram in the middle, details on the right.</p>
          </div>
          <Input allowClear prefix={<Search size={14} className="text-[#64748b]" />} placeholder="Search projects" aria-label="Search projects" className="!w-64" value={query} onChange={e => setQuery(e.target.value)} />
        </header>
        {error && <Alert type="error" showIcon title={error} />}

        <section aria-label="Your projects" className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#94a3b8]">Your projects</h3>
          {projects === null ? <div className="p-10 text-center"><Spin /></div>
            : shown.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map(p => <Card key={p.id} to={`/workspace/${encodeURIComponent(p.id)}`} title={p.name} subtitle="Open architecture" icon={<FolderGit2 size={40} />} />)}
            </div>
            : <Empty description={q ? `No project matches “${query}”.` : <span>No projects yet. <Link to="/projects">Add a repository</Link> to see its architecture.</span>} />}
        </section>

        <section aria-label="Samples" className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#94a3b8]">Samples</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {FIXTURES.map(f => <Card key={f.id} sample to={`/workspace/sample/${f.id}`} title={f.label.split(':')[0]} subtitle={f.label.split(':').slice(1).join(':').trim()} icon={<Boxes size={40} />} />)}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
