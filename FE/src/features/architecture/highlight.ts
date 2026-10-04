import { reach, routes } from './queries.ts';
import type { Route } from './queries.ts';
import type { ComponentRole } from './types.ts';
import type { Scene } from './scene.ts';
import type { ViewerState } from './url-state.ts';

export interface Highlight {
  /** null means nothing is emphasised, so nothing is dimmed. */
  nodes: Set<string> | null;
  edges: Set<string> | null;
  /** The shortest route when probing a route; drawn strongest. */
  primaryRoute: Route | null;
  routes: Route[];
}

export const NO_HIGHLIGHT: Highlight = { nodes: null, edges: null, primaryRoute: null, routes: [] };

/** Decides what the viewer emphasises. Route probing wins over focus, which wins over a selected edge and the role lens. */
export function computeHighlight(scene: Scene, state: ViewerState): Highlight {
  const ids = new Set(scene.nodes.map(n => n.id));
  if (state.route && ids.has(state.route[0]) && ids.has(state.route[1])) {
    const found = routes(scene.edges, state.route[0], state.route[1], { maxRoutes: 3 });
    const nodes = new Set<string>(state.route);
    const edges = new Set<string>();
    for (const r of found) { r.nodes.forEach(n => nodes.add(n)); r.edges.forEach(e => edges.add(e)); }
    return { nodes, edges, primaryRoute: found[0] ?? null, routes: found };
  }
  if (state.focus && ids.has(state.focus)) {
    if (state.reach) {
      const r = reach(scene.edges, state.focus, state.reach);
      return { nodes: r.nodes, edges: r.edges, primaryRoute: null, routes: [] };
    }
    const nodes = new Set<string>([state.focus]);
    const edges = new Set<string>();
    for (const e of scene.edges) if (e.source === state.focus || e.target === state.focus) { edges.add(e.id); nodes.add(e.source); nodes.add(e.target); }
    return { nodes, edges, primaryRoute: null, routes: [] };
  }
  if (state.edge) {
    const e = scene.edges.find(x => x.id === state.edge);
    if (e) return { nodes: new Set([e.source, e.target]), edges: new Set([e.id]), primaryRoute: null, routes: [] };
  }
  if (state.lens?.length) {
    const wanted = new Set<ComponentRole>(state.lens);
    const nodes = new Set(scene.nodes.filter(n => n.role && wanted.has(n.role)).map(n => n.id));
    return { nodes, edges: new Set(scene.edges.filter(e => nodes.has(e.source) && nodes.has(e.target)).map(e => e.id)), primaryRoute: null, routes: [] };
  }
  return NO_HIGHLIGHT;
}
