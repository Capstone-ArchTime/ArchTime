import { Tag } from 'antd';
import { Link } from 'react-router-dom';
import type { ArchitectureView } from '@/features/architecture/types';
import type { Scene } from '@/features/architecture/scene';
import { ROLE_LABEL, unitWord } from '@/features/architecture/scene';
import type { DiagramTheme } from '@/features/architecture/theme';
import type { Highlight } from '@/features/architecture/highlight';
import { IMPACT_NOTE, andMore, commitsTouchingComponent, componentDelta, deltaText, evidenceLink, shortDate, shortHash } from '@/features/evidence-bridge';
import type { CommitImpactsState } from '@/features/useCommitImpacts';

// The label tells how a component's ROLE was decided, never how well the component is proven: ArchTime's own grouping is always computed.
const PROVENANCE_HELP = {
  FACT: 'Set by hand, as in the samples. ArchTime does not give this label to components it computes.',
  INFERENCE: 'The role was decided from folder names that matched a known pattern, or by an AI model reading file paths. It is a best guess, not read from the code.',
  UNKNOWN: 'No role could be decided from the folder names or file paths.',
} as const;

const heading = 'text-[10px] font-mono uppercase tracking-wider text-[#94a3b8] mb-2';
/** Recent commits shown for one component; the list asked from the server is longer. */
const COMMITS_SHOWN = 5;

/** The commits that changed the viewed snapshot's components; absent for samples, which belong to no workspace. */
export interface CommitSource { projectId: string; state: CommitImpactsState; onRetry: () => void }

/** A file-level view names things by their relative path, the class view by the last part of the dotted name. */
const evidenceName =(unit: ArchitectureView['unit'], id: string) => (unit === 'file' ? id : id.split('.').pop() ?? id);

/**
 * "Changed in commits" for one component: the recent commits whose change touched it, found by comparing mined snapshots
 * (so it is an inference, and says so). Loading, failure and "not grouped" never hide the rest of the inspector.
 */
export function ChangedInCommits({ projectId, componentId, state, onRetry }: { projectId: string; componentId: string } & Pick<CommitSource, 'state' | 'onRetry'>) {
  let body;
  if (state.status === 'error') {
    body = <p className="text-xs text-slate-300">Could not load the commits ({state.message}). <button type="button" onClick={onRetry} className="text-[#93c5fd] underline hover:text-[#bfdbfe]">Try again</button></p>;
  } else if (state.status !== 'done') {
    body = <p role="status" className="text-xs text-[#94a3b8]">Looking through the recent commits…</p>;
  } else if (!state.impacts.grouped) {
    body = <p className="text-xs text-[#94a3b8]">This snapshot is not grouped into components yet, so commits cannot be matched to this one.</p>;
  } else {
    const all = commitsTouchingComponent(state.impacts, componentId);
    const shown = all.slice(0, COMMITS_SHOWN);
    body = <>
      {!shown.length && <p className="text-xs text-[#94a3b8]">No recorded changes to this component in the {state.impacts.commits.length} most recent commits.</p>}
      {shown.length > 0 && <ul className="space-y-1.5">{shown.map(c => {
        const delta = deltaText(componentDelta(c, componentId));
        return <li key={c.evidenceId || c.commit} className="border border-[#242527] p-2 text-xs">
          <div className="flex items-center gap-2">
            <Link to={evidenceLink(projectId, c.commit)} aria-label={`Open the evidence for commit ${shortHash(c.commit)}`} className="shrink-0 border border-[#3b82f6]/50 px-1.5 font-mono text-[#93c5fd] hover:bg-[#3b82f6]/10 hover:text-[#bfdbfe]">{shortHash(c.commit)}</Link>
            <span className="min-w-0 truncate text-slate-200" title={c.title}>{c.title || 'Untitled change'}</span>
          </div>
          <div className="mt-0.5 text-[#94a3b8]">{[shortDate(c.date), delta].filter(Boolean).join(' · ')}</div>
        </li>;
      })}</ul>}
      {andMore(all.length, shown.length) && <p className="mt-1 text-xs text-[#94a3b8]">{andMore(all.length, shown.length)} among the recent commits</p>}
      {state.impacts.skipped > 0 && <p className="mt-1 text-xs text-[#94a3b8]">{state.impacts.skipped} recent {state.impacts.skipped === 1 ? 'commit has' : 'commits have'} no mined snapshot and could not be checked.</p>}
      <p className="mt-2 text-[11px] leading-snug text-[#94a3b8]">{IMPACT_NOTE}</p>
    </>;
  }
  return <section aria-label="Changed in commits"><h3 className={heading}>Changed in commits</h3>{body}</section>;
}

export default function Inspector({ view, scene, theme, selectedNode, selectedEdge, highlight, onSelectNode, onSelectEdge, onOpen, commits }: {
  view: ArchitectureView; scene: Scene; theme: DiagramTheme; selectedNode?: string; selectedEdge?: string; highlight: Highlight;
  onSelectNode: (id: string) => void; onSelectEdge: (id: string) => void; onOpen: (componentId: string) => void;
  commits?: CommitSource;
}) {
  const nameOf = (id: string) => scene.nodes.find(n => n.id === id)?.title ?? id;
  const edge = scene.edges.find(e => e.id === selectedEdge);
  const component = scene.mode === 'components' ? view.components.find(c => c.id === selectedNode) : undefined;
  const classNode = scene.mode === 'classes' ? scene.nodes.find(n => n.id === selectedNode) : undefined;

  if (highlight.routes.length) {
    return <aside aria-label="Route details" className="space-y-4">
      <div><h3 className={heading}>Routes</h3><p className="text-xs text-[#94a3b8]">Directed dependency paths, shortest first. The shortest is drawn in amber.</p></div>
      <ol className="space-y-2">{highlight.routes.map((r, i) => <li key={r.edges.join()} className="border border-[#242527] p-2 text-xs">
        <span className="text-[#94a3b8]">{i === 0 ? 'Shortest' : `Alternative ${i}`} · {r.edges.length} hop{r.edges.length === 1 ? '' : 's'}</span>
        <div className="mt-1 leading-relaxed">{r.nodes.map((n, j) => <span key={n + j}>{j > 0 && <span className="text-[#94a3b8]"> → </span>}<button type="button" className="underline decoration-dotted" onClick={() => onSelectNode(n)}>{nameOf(n)}</button></span>)}</div>
      </li>)}</ol>
    </aside>;
  }
  if (edge) {
    return <aside aria-label="Dependency details" className="space-y-4">
      <div><h3 className={heading}>Dependency</h3>
        <p className="text-sm font-semibold">{nameOf(edge.source)} <span className="text-[#94a3b8]">→</span> {nameOf(edge.target)}</p>
        <p className="text-xs text-[#94a3b8] mt-1">{edge.weight} {view.unit === 'file' ? 'file' : 'class'}-level {edge.weight === 1 ? 'dependency' : 'dependencies'} back this arrow.</p></div>
      <div className="flex flex-wrap gap-1">{Object.entries(edge.kinds).map(([k, n]) => <Tag key={k}>{k} × {n}</Tag>)}</div>
      <div><h3 className={heading}>Evidence</h3>
        <ul className="space-y-1.5 max-h-80 overflow-auto pr-1">{edge.evidence.map((ev, i) => <li key={i} className="text-xs border border-[#242527] p-2">
          <div className="font-mono break-all">{evidenceName(view.unit, ev.fromClass)} → {evidenceName(view.unit, ev.toClass)}</div>
          <div className="text-[#94a3b8] mt-0.5 break-all">{ev.kind} · {ev.path}{ev.line ? `:${ev.line}` : ''}</div></li>)}</ul>
          {edge.evidence.some(ev => !ev.line) && <p className="mt-2 text-xs text-[#94a3b8]">Static import analysis{view.unit === 'file' ? ', file level' : ''} (the line is not recorded).</p>}</div>
    </aside>;
  }

  if (component) {
    const outgoing = view.edges.filter(e => e.source === component.id);
    const incoming = view.edges.filter(e => e.target === component.id);
    const members = view.classes.filter(c => c.componentId === component.id);
    return <aside aria-label="Component details" className="space-y-4">
      <div>
        <h3 className={heading}>Component</h3>
        <p className="text-base font-semibold" style={{ color: theme.role[component.role] }}>{component.name}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1"><Tag>{ROLE_LABEL[component.role]}</Tag><Tag color={component.label === 'FACT' ? 'green' : component.label === 'INFERENCE' ? 'gold' : 'default'}>{component.label}</Tag></div>
        <p className="text-xs text-[#94a3b8] mt-1">{PROVENANCE_HELP[component.label]}</p>
        <p className="text-sm mt-3 leading-relaxed">{component.description}</p>
      </div>
      <button type="button" onClick={() => onOpen(component.id)} className="w-full h-9 border border-[#3b82f6]/50 text-[#93c5fd] text-xs font-bold hover:bg-[#3b82f6]/10">SHOW {members.length} {unitWord(view, members.length).toUpperCase()}</button>
      <List title={`Depends on (${outgoing.length})`} items={outgoing.map(e => ({ id: e.target, label: nameOf(e.target), edge: e.id, weight: e.weight }))} onNode={onSelectNode} onEdge={onSelectEdge} />
      <List title={`Used by (${incoming.length})`} items={incoming.map(e => ({ id: e.source, label: nameOf(e.source), edge: e.id, weight: e.weight }))} onNode={onSelectNode} onEdge={onSelectEdge} />
      {commits && <ChangedInCommits projectId={commits.projectId} componentId={component.id} state={commits.state} onRetry={commits.onRetry} />}
    </aside>;
  }

  if (classNode) {
    const cls = view.classes.find(c => c.id === classNode.id);
    const out = scene.edges.filter(e => e.source === classNode.id);
    const inn = scene.edges.filter(e => e.target === classNode.id);
    return <aside aria-label="Details" className="space-y-4">
      <div><h3 className={heading}>{classNode.kind === 'neighbour' ? 'Outside component' : view.unit === 'file' ? 'File' : 'Class'}</h3><p className="text-base font-semibold">{classNode.title}</p>
        {cls && <p className="text-xs text-[#94a3b8] mt-1 break-all">{cls.path}</p>}</div>
      <List title={`Depends on (${out.length})`} items={out.map(e => ({ id: e.target, label: nameOf(e.target), edge: e.id, weight: e.weight }))} onNode={onSelectNode} onEdge={onSelectEdge} />
      <List title={`Used by (${inn.length})`} items={inn.map(e => ({ id: e.source, label: nameOf(e.source), edge: e.id, weight: e.weight }))} onNode={onSelectNode} onEdge={onSelectEdge} />
    </aside>;
  }

  return <aside aria-label="Diagram summary" className="space-y-4">
    <div><h3 className={heading}>{scene.mode === 'components' ? 'Overview' : view.unit === 'file' ? 'Files' : 'Classes'}</h3>
      <p className="text-sm leading-relaxed">{scene.mode === 'components'
        ? <><span className="text-[#4ade80]" title="Every arrow can be traced to the mined import edges. This checks the drawing against the mined data, not against the repository itself.">✓ Consistent with the import graph</span> · {scene.nodes.length} components, {scene.edges.length} dependencies. Every arrow is computed from {view.unit === 'file' ? 'file' : 'class'}-level dependencies; select one to see them.</>
        : <>{scene.nodes.filter(n => n.kind === 'class').length} {unitWord(view, 2)}. Dashed boxes are components outside this one.</>}</p></div>
    <details className="group text-xs">
      <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-wider text-slate-300 hover:text-white">How to read this</summary>
      <ul className="mt-2 space-y-1 leading-relaxed text-slate-300">
        <li>Click a box to focus it; double-click (or Shift + Enter) to show what is inside.</li>
        <li>Rows are architectural tiers; arrows point from the dependent to what it uses.</li>
        <li>Dashed arrows point upward, against the tier order; red arrows are circular dependencies.</li>
        <li>FACT / INFERENCE / UNKNOWN shows how a component's role was decided: folder names matched, or an AI model reading file paths. It does not say how well the component is proven.</li>
        <li>The grouping into components is computed from import dependencies, so it is an inference. The dependencies and the commits behind it are the facts.</li>
      </ul>
    </details>
  </aside>;
}

function List({ title, items, onNode, onEdge }: { title: string; items: { id: string; label: string; edge: string; weight: number }[]; onNode: (id: string) => void; onEdge: (id: string) => void }) {
  if (!items.length) return <div><h3 className={heading}>{title}</h3><p className="text-xs text-[#94a3b8]">None</p></div>;
  return <div><h3 className={heading}>{title}</h3><ul className="space-y-1">{items.map(i => <li key={i.edge} className="flex items-center justify-between gap-2 text-xs">
    <button type="button" className="text-left hover:underline" onClick={() => onNode(i.id)}>{i.label}</button>
    <button type="button" aria-label={`Show ${i.weight} dependencies to ${i.label}`} className="font-mono text-[#94a3b8] border border-[#2a3441] px-1.5 hover:border-[#3b82f6]" onClick={() => onEdge(i.edge)}>{i.weight}</button></li>)}</ul></div>;
}
