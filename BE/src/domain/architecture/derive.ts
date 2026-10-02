import type { ArchEdge, ClassEdge, DependencyKind, Evidence } from './types.js';

/**
 * Collapses class-level dependencies into component-level edges. This is the only way a component edge is
 * created, so each one carries the exact class dependencies that justify it. Dependencies inside one
 * component and dependencies on unknown classes are dropped.
 */
export function deriveComponentEdges(classToComponent: Record<string, string>, classEdges: ClassEdge[]): ArchEdge[] {
  const byId = new Map<string, ArchEdge>();
  for (const e of classEdges) {
    const source = Object.hasOwn(classToComponent, e.source) ? classToComponent[e.source] : undefined;
    const target = Object.hasOwn(classToComponent, e.target) ? classToComponent[e.target] : undefined;
    if (!source || !target || source === target) continue;
    const id = `${source}->${target}`;
    let edge = byId.get(id);
    if (!edge) { edge = { id, source, target, weight: 0, kinds: {}, evidence: [] }; byId.set(id, edge); }
    const evidence: Evidence = { fromClass: e.source, toClass: e.target, kind: e.kind, path: e.path, ...(e.line === undefined ? {} : { line: e.line }) };
    edge.evidence.push(evidence);
    edge.weight++;
    const kind: DependencyKind = e.kind;
    edge.kinds[kind] = (edge.kinds[kind] ?? 0) + 1;
  }
  const edges = [...byId.values()];
  for (const edge of edges) {
    edge.evidence.sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0) || a.fromClass.localeCompare(b.fromClass) || a.toClass.localeCompare(b.toClass));
  }
  return edges.sort((a, b) => a.id.localeCompare(b.id));
}
