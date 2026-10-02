import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Tag } from 'antd';
import FeaturePage, { DemoNotice, featurePanel } from '@/components/FeaturePage';
import { demoProjects, useMaintainerDemo } from '@/features/maintainer-demo';
import { getProjects } from '@/features/project-data';
import type { ProjectSummary } from '@/features/project-data';
import { evaluateRule } from '@/features/evaluate-rule';
import { useWorkspace } from './workspace-store';

function WorkspaceSummary({ project }: { project: string }) {
  const { data, loadError } = useWorkspace(project);
  const violations = data.rules.filter(r => evaluateRule(data.diagram, r).label === 'Violation').length;
  return <article className={featurePanel}><h3 className="font-semibold mb-3">{project}</h3>{loadError ? <Alert type="error" title="Local workspace could not be loaded" /> : <><Tag color={data.diagram.confirmedAt ? 'green' : 'gold'}>{data.diagram.confirmedAt ? 'Confirmed' : 'Draft'} · Revision {data.diagram.revision}</Tag><dl className="grid grid-cols-2 gap-4 mt-5 text-sm"><div><dt className="text-[#94a3b8]">Components</dt><dd className="text-2xl mt-1">{data.diagram.components.length}</dd></div><div><dt className="text-[#94a3b8]">Rule violations</dt><dd className="text-2xl mt-1">{violations}</dd></div><div><dt className="text-[#94a3b8]">Enabled rules</dt><dd>{data.rules.filter(r => r.enabled).length}</dd></div><div><dt className="text-[#94a3b8]">Design decisions</dt><dd>{data.decisions.length}</dd></div></dl><Link to={`/project-maintainer/component-diagram?project=${encodeURIComponent(project)}`} className="inline-block text-sm text-[#38bdf8] mt-5">Open diagram →</Link></>}</article>;
}

export default function Dashboard() {
  const store = useMaintainerDemo();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    getProjects(controller.signal).then(setProjects).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const pending = store.data.approvals.filter(a => a.status === 'pending');
  return <FeaturePage title="Project & architecture overview" description="Open server reports and review your local architecture workspace." demo={false} error={store.error} actions={<Link to="/project-maintainer/team" className="text-sm text-[#38bdf8]">Manage team →</Link>}>
    <section className={featurePanel}><div className="flex justify-between items-center mb-3"><h3 className="font-semibold">Projects returned by the server</h3><Button loading={loading} onClick={() => setRevision(v => v + 1)}>Refresh projects</Button></div><p className="text-xs text-[#94a3b8] mb-4">The current API returns projects owned by this account. Team membership and managed-project discovery still require BE support.</p>{error ? <Alert type="error" title={error} action={<Button onClick={() => setRevision(v => v + 1)}>Retry</Button>} /> : loading ? <p role="status">Loading projects…</p> : projects.length ? <ul className="space-y-2">{projects.map(p => <li key={p.id} className="text-sm border-t border-[#222c37] pt-2">{p.name}</li>)}</ul> : <Empty description="No server projects for this account" />}<Link to="/project-maintainer/reports" className="inline-block mt-4 text-sm text-[#38bdf8]">Create an evolution report →</Link></section>
    <DemoNotice />
    <div className="grid md:grid-cols-3 gap-4">{demoProjects.map(project => <WorkspaceSummary key={project} project={project} />)}</div>
    <div className="flex flex-wrap gap-3">{[['component-diagram', 'Component diagram'], ['architecture-rules', 'Architecture rules'], ['design-decisions', 'Design decisions']].map(([path, label]) => <Link key={path} to={`/project-maintainer/${path}`} className="border border-[#222c37] px-4 py-3 text-sm text-[#38bdf8] hover:border-[#38bdf8]">{label} →</Link>)}</div>
    <div className="grid lg:grid-cols-2 gap-5"><section className={featurePanel}><div className="flex justify-between gap-3 mb-4"><h3 className="font-semibold">Awaiting review <Tag>{pending.length}</Tag></h3><Link to="/project-maintainer/approvals" className="text-sm text-[#38bdf8]">Review queue →</Link></div>{pending.length ? <ul className="space-y-3">{pending.slice(0, 5).map(a => <li key={a.id} className="border-t border-[#222c37] pt-3"><p className="text-sm">{a.title}</p><p className="text-xs text-[#94a3b8] mt-1">{a.project} · {a.requestedBy}</p></li>)}</ul> : <Empty description="All local proposals have been reviewed" />}</section><section className={featurePanel}><h3 className="font-semibold mb-4">Team overview</h3><p className="text-sm text-[#94a3b8] mb-4">{store.data.members.filter(m => m.status === 'active').length} active members · {store.data.members.filter(m => m.status === 'invited').length} pending demo invitations</p>{store.data.members.slice(0, 5).map(m => <div key={m.id} className="border-t border-[#222c37] py-3 text-sm">{m.name} <Tag>{m.status}</Tag><p className="text-xs text-[#94a3b8] mt-1">{m.projects.join(' · ')}</p></div>)}<Link to="/project-maintainer/team" className="text-sm text-[#38bdf8]">Manage memberships →</Link></section></div>
  </FeaturePage>;
}
