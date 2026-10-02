import { Tag } from 'antd';
import type { ArchitectureView } from '@/features/architecture/types';
import type { Scene } from '@/features/architecture/scene';
import { ROLE_LABEL, unitWord } from '@/features/architecture/scene';
import type { DiagramTheme } from '@/features/architecture/theme';
import type { Highlight } from '@/features/architecture/highlight';
import { cycles } from '@/features/architecture/queries';

const PROVENANCE_HELP = {
  FACT: 'Confirmed by source code or Git history.',
  INFERENCE: 'Reasoned from the available evidence; not directly confirmed.',
  UNKNOWN: 'Not determinable from what the repository provides.',
} as const;

const heading = 'text-[10px] font-mono uppercase tracking-wider text-[#94a3b8] mb-2';

export default function Inspector({ view, scene, theme, selectedNode, selectedEdge, highlight, onSelectNode, onSelectEdge, onOpen }: {
  view: ArchitectureView; scene: Scene; theme: DiagramTheme; selectedNode?: string; selectedEdge?: string; highlight: Highlight;
  onSelectNode: (id: string) => void; onSelectEdge: (id: string) => void; onOpen: (componentId: string) => void;
}) {
  const nameOf = (id: string) => scene.nodes.find(n => n.id === id)?.title ?? id;
  const edge = scene.edges.find(e => e.id === selectedEdge);
  const component = scene.mode === 'components' ? view.components.find(c => c.id === selectedNode) : undefined;
  const classNode = scene.mode === 'classes' ? scene.nodes.find(n => n.id === selectedNode) : undefined;

  if (highlight.routes.length) {
    return <aside aria-label="Route details" className="space-y-4">
      <div><h3 className={heading}>Routes</h3><p className="text-xs text-[#94a3b8]">Directed dependency paths, shortest first. The shortest is drawn in amber.</p></div>
      <ol className="space-y-2">{highlight.routes.map((r, i) => <li key={r.edges.join()} className="border border-[#222c37] p-2 text-xs">
        <span className="text-[#94a3b8]">{i === 0 ? 'Shortest' : `Alternative ${i}`} · {r.edges.length} hop{r.edges.length === 1 ? '' : 's'}</span>
        <div className="mt-1 leading-relaxed">{r.nodes.map((n, j) => <span key={n + j}>{j > 0 && <span className="text-[#64748b]"> → </span>}<button type="button" className="underline decoration-dotted" onClick={() => onSelectNode(n)}>{nameOf(n)}</button></span>)}</div>
      </li>)}</ol>
    </aside>;
  }
  if (edge) {
    return <aside aria-label="Dependency details" className="space-y-4">
      <div><h3 className={heading}>Dependency</h3>
        <p className="text-sm font-semibold">{nameOf(edge.source)} <span className="text-[#64748b]">→</span> {nameOf(edge.target)}</p>
        <p className="text-xs text-[#94a3b8] mt-1">{edge.weight} {view.unit === 'file' ? 'file' : 'class'}-level {edge.weight === 1 ? 'dependency' : 'dependencies'} back this arrow.</p></div>
      <div className="flex flex-wrap gap-1">{Object.entries(edge.kinds).map(([k, n]) => <Tag key={k}>{k} × {n}</Tag>)}</div>
      <div><h3 className={heading}>Evidence</h3>
        <ul className="space-y-1.5 max-h-80 overflow-auto pr-1">{edge.evidence.map((ev, i) => <li key={i} className="text-xs border border-[#222c37] p-2">
          <div className="font-mono break-all">{ev.fromClass.split('.').pop()} → {ev.toClass.split('.').pop()}</div>
          <div className="text-[#94a3b8] mt-0.5 break-all">{ev.kind} · {ev.path}{ev.line ? `:${ev.line}` : ''}</div></li>)}</ul></div>
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
      <button type="button" onClick={() => onOpen(component.id)} className="w-full h-9 border border-[#38bdf8]/50 text-[#38bdf8] text-xs font-bold hover:bg-[#38bdf8]/10">SHOW {members.length} {unitWord(view, members.length).toUpperCase()}</button>
      <List title={`Depends on (${outgoing.length})`} items={outgoing.map(e => ({ id: e.target, label: nameOf(e.target), edge: e.id, weight: e.weight }))} onNode={onSelectNode} onEdge={onSelectEdge} />
      <List title={`Used by (${incoming.length})`} items={incoming.map(e => ({ id: e.source, label: nameOf(e.source), edge: e.id, weight: e.weight }))} onNode={onSelectNode} onEdge={onSelectEdge} />
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

  const loops = cycles(scene.edges);
  return <aside aria-label="Diagram summary" className="space-y-4">
    <div><h3 className={heading}>{scene.mode === 'components' ? 'Overview' : view.unit === 'file' ? 'Files' : 'Classes'}</h3>
      <p className="text-sm leading-relaxed">{scene.mode === 'components'
        ? <>{scene.nodes.length} components and {scene.edges.length} dependencies. Every arrow is computed from {view.unit === 'file' ? 'file' : 'class'}-level dependencies; select one to see them.</>
        : <>{scene.nodes.filter(n => n.kind === 'class').length} {unitWord(view, 2)}. Dashed boxes are components outside this one.</>}</p></div>
    {loops.length > 0 && <div className="text-xs text-[#fca5a5] border border-[#7f1d1d] p-2 space-y-1">
      <p>{loops.length} circular {loops.length === 1 ? 'dependency' : 'dependencies'} (red arrows):</p>
      <ul>{loops.map(g => <li key={g.join()}>{g.map(nameOf).join(' ↔ ')}</li>)}</ul></div>}
    <div><h3 className={heading}>How to read it</h3><ul className="text-xs text-[#94a3b8] space-y-1 leading-relaxed">
      <li>Click a box to focus it; double-click (or Shift + Enter) to show what is inside.</li>
      <li>Rows are architectural tiers; arrows point from the dependent to what it uses.</li>
      <li>Dashed arrows point upward, against the tier order.</li>
      <li>FACT / INFERENCE / UNKNOWN tells how well the evidence supports a component's role.</li>
    </ul></div>
  </aside>;
}

function List({ title, items, onNode, onEdge }: { title: string; items: { id: string; label: string; edge: string; weight: number }[]; onNode: (id: string) => void; onEdge: (id: string) => void }) {
  if (!items.length) return <div><h3 className={heading}>{title}</h3><p className="text-xs text-[#64748b]">None</p></div>;
  return <div><h3 className={heading}>{title}</h3><ul className="space-y-1">{items.map(i => <li key={i.edge} className="flex items-center justify-between gap-2 text-xs">
    <button type="button" className="text-left hover:underline" onClick={() => onNode(i.id)}>{i.label}</button>
    <button type="button" aria-label={`Show ${i.weight} dependencies to ${i.label}`} className="font-mono text-[#94a3b8] border border-[#2a3441] px-1.5 hover:border-[#38bdf8]" onClick={() => onEdge(i.edge)}>{i.weight}</button></li>)}</ul></div>;
}
