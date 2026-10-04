import type { ArchClass, ArchComponent, ArchEdge, ArchitectureView, ComponentRole, Evidence, Provenance } from './types.ts';

// A scene is what gets drawn: either the component map or the classes inside one component.
export type SceneMode = 'components' | 'classes';
export interface SceneNode {
  id: string;
  kind: 'component' | 'class' | 'neighbour';
  title: string;
  subtitle: string;
  role?: ComponentRole;
  tag?: Provenance;
  width: number;
  height: number;
  layer?: number;
  aria: string;
}
export interface SceneEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  evidence: Evidence[];
  kinds: ArchEdge['kinds'];
}
export interface Scene { mode: SceneMode; componentId?: string; nodes: SceneNode[]; edges: SceneEdge[] }

export const ROLE_LABEL: Record<ComponentRole, string> = {
  controller: 'Controller', service: 'Service', repository: 'Repository', entity: 'Entity', gateway: 'Gateway', config: 'Config', util: 'Utility', external: 'External', other: 'Other',
};
export const unitWord = (view: Pick<ArchitectureView, 'unit'>, n: number) => {
  const file = view.unit === 'file';
  return n === 1 ? (file ? 'file' : 'class') : file ? 'files' : 'classes';
};

export function componentScene(view: ArchitectureView): Scene {
  const out = new Map<string, number>();
  const into = new Map<string, number>();
  for (const e of view.edges) { out.set(e.source, (out.get(e.source) ?? 0) + 1); into.set(e.target, (into.get(e.target) ?? 0) + 1); }
  const nodes = view.components.map((c): SceneNode => ({
    id: c.id, kind: 'component', title: c.name, subtitle: `${ROLE_LABEL[c.role]} · ${c.memberIds.length} ${unitWord(view, c.memberIds.length)}`, role: c.role, tag: c.label,
    width: 196, height: 84, layer: c.layer,
    aria: `${c.name}, ${ROLE_LABEL[c.role]}, ${c.memberIds.length} ${unitWord(view, c.memberIds.length)}, ${c.label}. Depends on ${out.get(c.id) ?? 0} components, used by ${into.get(c.id) ?? 0}.`,
  }));
  const edges = view.edges.map((e): SceneEdge => ({ id: e.id, source: e.source, target: e.target, weight: e.weight, evidence: e.evidence, kinds: e.kinds }));
  return { mode: 'components', nodes, edges };
}

/** The classes of one component, plus the components they talk to (drawn as dashed neighbours). */
export function classScene(view: ArchitectureView, componentId: string): Scene {
  const component = view.components.find(c => c.id === componentId);
  if (!component) return { mode: 'classes', componentId, nodes: [], edges: [] };
  const members = new Set(component.memberIds);
  const classById = new Map<string, ArchClass>(view.classes.map(c => [c.id, c]));
  const componentById = new Map<string, ArchComponent>(view.components.map(c => [c.id, c]));
  const nodes: SceneNode[] = [];
  const edgeMap = new Map<string, SceneEdge>();
  const neighbours = new Set<string>();

  for (const id of component.memberIds) {
    const c = classById.get(id);
    if (!c) continue;
    nodes.push({ id, kind: 'class', title: c.name, subtitle: c.path.split('/').slice(-2).join('/'), role: component.role, width: 188, height: 52, aria: `${c.name}, ${view.unit === 'file' ? 'file' : 'class'} in ${component.name}, ${c.path}.` });
  }
  const add = (source: string, target: string, ev: Evidence) => {
    const id = `${source}->${target}`;
    const edge = edgeMap.get(id) ?? { id, source, target, weight: 0, evidence: [], kinds: {} };
    edge.weight++; edge.evidence.push(ev);
    edge.kinds[ev.kind] = (edge.kinds[ev.kind] ?? 0) + 1;
    edgeMap.set(id, edge);
  };
  for (const ce of view.classEdges) {
    const from = members.has(ce.source), to = members.has(ce.target);
    if (!from && !to) continue;
    const ev: Evidence = { fromClass: ce.source, toClass: ce.target, kind: ce.kind, path: ce.path, ...(ce.line === undefined ? {} : { line: ce.line }) };
    if (from && to) { if (ce.source !== ce.target) add(ce.source, ce.target, ev); continue; }
    const other = classById.get(from ? ce.target : ce.source);
    if (!other) continue;
    neighbours.add(other.componentId);
    if (from) add(ce.source, `component:${other.componentId}`, ev);
    else add(`component:${other.componentId}`, ce.target, ev);
  }
  for (const id of [...neighbours].sort()) {
    const c = componentById.get(id);
    if (!c) continue;
    nodes.push({ id: `component:${id}`, kind: 'neighbour', title: c.name, subtitle: `${ROLE_LABEL[c.role]} (outside)`, role: c.role, width: 188, height: 44, aria: `${c.name}, a component outside ${component.name}.` });
  }
  return { mode: 'classes', componentId, nodes, edges: [...edgeMap.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}
