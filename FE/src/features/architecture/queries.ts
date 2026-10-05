import type { ComponentRole } from './types.ts';

export interface GraphEdge { id: string; source: string; target: string }
export type ReachDirection = 'upstream' | 'downstream';

/** Everything that transitively depends on `id` (upstream) or that `id` transitively depends on (downstream). */
export function reach(edges: GraphEdge[], id: string, direction: ReachDirection): { nodes: Set<string>; edges: Set<string> } {
  const next = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    const from = direction === 'downstream' ? e.source : e.target;
    next.set(from, [...(next.get(from) ?? []), e]);
  }
  const nodes = new Set<string>([id]);
  const used = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const v = queue.shift()!;
    for (const e of next.get(v) ?? []) {
      used.add(e.id);
      const w = direction === 'downstream' ? e.target : e.source;
      if (!nodes.has(w)) { nodes.add(w); queue.push(w); }
    }
  }
  return { nodes, edges: used };
}

export interface Route { nodes: string[]; edges: string[] }

/** Simple directed paths from `from` to `to`, shortest first, capped so dense graphs stay responsive. */
export function routes(edges: GraphEdge[], from: string, to: string, options: { maxRoutes?: number; maxHops?: number } = {}): Route[] {
  const { maxRoutes = 8, maxHops = 8 } = options;
  if (from === to) return [];
  const out = new Map<string, GraphEdge[]>();
  for (const e of [...edges].sort((a, b) => (a.id < b.id ? -1 : 1))) out.set(e.source, [...(out.get(e.source) ?? []), e]);
  const found: Route[] = [];
  const walk = (v: string, nodes: string[], used: string[]) => {
    if (found.length >= 500) return; // hard stop on pathological graphs; results are sorted and trimmed below
    if (v === to) { found.push({ nodes: [...nodes], edges: [...used] }); return; }
    if (used.length >= maxHops) return;
    for (const e of out.get(v) ?? []) {
      if (nodes.includes(e.target)) continue;
      walk(e.target, [...nodes, e.target], [...used, e.id]);
    }
  };
  walk(from, [from], []);
  return found.sort((a, b) => a.edges.length - b.edges.length || a.edges.join().localeCompare(b.edges.join())).slice(0, maxRoutes);
}

/** Groups of components that depend on each other, directly or through others. */
export function cycles(edges: GraphEdge[]): string[][] {
  const ids = [...new Set(edges.flatMap(e => [e.source, e.target]))].sort();
  const out = new Map<string, string[]>(ids.map(id => [id, []]));
  for (const e of edges) out.get(e.source)!.push(e.target);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const groups: string[][] = [];
  let counter = 0;
  const connect = (v: string) => {
    index.set(v, counter); low.set(v, counter); counter++;
    stack.push(v); onStack.add(v);
    for (const w of out.get(v)!) {
      if (!index.has(w)) { connect(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) {
      const group: string[] = [];
      let w: string;
      do { w = stack.pop()!; onStack.delete(w); group.push(w); } while (w !== v);
      if (group.length > 1) groups.push(group.sort());
    }
  };
  for (const id of ids) if (!index.has(id)) connect(id);
  return groups.sort((a, b) => a[0].localeCompare(b[0]));
}

export function byRole<T extends { id: string; role: ComponentRole }>(components: T[], roles: readonly ComponentRole[]): Set<string> {
  const wanted = new Set(roles);
  return new Set(components.filter(c => wanted.has(c.role)).map(c => c.id));
}
