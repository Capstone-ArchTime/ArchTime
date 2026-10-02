// Deterministic layered layout for small dependency graphs (component level: ~8-15 nodes).
// Layers are rows. Edges that span several rows pass through reserved slots ("dummy" nodes) so they never
// cross a node, and ports on each node side are spread evenly so arrows do not pile up on one point.
// The same input always produces the same output regardless of input order.

export interface LayoutNodeInput { id: string; width: number; height: number; layer?: number }
export interface LayoutEdgeInput { id: string; source: string; target: string }
export interface LayoutOptions {
  layerGap?: number;
  nodeGap?: number;
  edgeGap?: number;
  padding?: number;
  portMargin?: number;
  laneStep?: number;
  sweeps?: number;
}
export interface Point { x: number; y: number }
export type Segment =
  | { kind: 'line'; to: Point }
  | { kind: 'curve'; c1: Point; c2: Point; to: Point };
export interface PlacedNode { id: string; x: number; y: number; width: number; height: number; layer: number }
export interface RoutedEdge {
  id: string;
  source: string;
  target: string;
  /** Waypoints in drawing direction (source to target). */
  points: Point[];
  segments: Segment[];
  path: string;
  /** Drawn against the layer direction (target sits above source). */
  reversed: boolean;
  /** Both ends are in the same layer. */
  flat: boolean;
  /** Part of a dependency cycle. */
  inCycle: boolean;
  labelAt: Point;
}
export interface GraphLayout {
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: RoutedEdge[];
  layers: { index: number; top: number; bottom: number }[];
}

const DEFAULTS: Required<LayoutOptions> = { layerGap: 96, nodeGap: 28, edgeGap: 14, padding: 28, portMargin: 16, laneStep: 12, sweeps: 8 };
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export function layoutGraph(nodesIn: LayoutNodeInput[], edgesIn: LayoutEdgeInput[], options: LayoutOptions = {}): GraphLayout {
  const o = { ...DEFAULTS, ...options };
  const nodes = [...nodesIn].sort(byId);
  const ids = new Set(nodes.map(n => n.id));
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const edges = edgesIn.filter(e => e.source !== e.target && ids.has(e.source) && ids.has(e.target)).sort(byId);
  if (!nodes.length) return { width: o.padding * 2, height: o.padding * 2, nodes: [], edges: [], layers: [] };

  const out = new Map<string, LayoutEdgeInput[]>(nodes.map(n => [n.id, []]));
  for (const e of edges) out.get(e.source)!.push(e);
  for (const list of out.values()) list.sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : byId(a, b)));

  // --- cycles: strongly connected components (Tarjan), then DFS to choose which edges point "backwards"
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const component = new Map<string, number>();
  let counter = 0;
  let componentCount = 0;
  const connect = (v: string) => {
    index.set(v, counter); low.set(v, counter); counter++;
    stack.push(v); onStack.add(v);
    for (const e of out.get(v)!) {
      if (!index.has(e.target)) { connect(e.target); low.set(v, Math.min(low.get(v)!, low.get(e.target)!)); }
      else if (onStack.has(e.target)) low.set(v, Math.min(low.get(v)!, index.get(e.target)!));
    }
    if (low.get(v) === index.get(v)) {
      let w: string;
      do { w = stack.pop()!; onStack.delete(w); component.set(w, componentCount); } while (w !== v);
      componentCount++;
    }
  };
  for (const n of nodes) if (!index.has(n.id)) connect(n.id);
  const componentSize = new Map<number, number>();
  for (const c of component.values()) componentSize.set(c, (componentSize.get(c) ?? 0) + 1);
  const inCycle = (e: LayoutEdgeInput) => component.get(e.source) === component.get(e.target) && (componentSize.get(component.get(e.source)!) ?? 0) > 1;

  const back = new Set<string>();
  {
    const state = new Map<string, 0 | 1 | 2>();
    const visit = (v: string) => {
      state.set(v, 1);
      for (const e of out.get(v)!) {
        const s = state.get(e.target) ?? 0;
        if (s === 1) back.add(e.id);
        else if (s === 0) visit(e.target);
      }
      state.set(v, 2);
    };
    const starts = [...nodes].sort((a, b) => (a.layer ?? Infinity) - (b.layer ?? Infinity) || byId(a, b));
    for (const n of starts) if (!state.has(n.id)) visit(n.id);
  }

  // --- layer assignment: longest path over the acyclic orientation, overridden by explicit hints
  const depth = new Map<string, number>(nodes.map(n => [n.id, 0]));
  {
    const preds = new Map<string, string[]>(nodes.map(n => [n.id, []]));
    const indeg = new Map<string, number>(nodes.map(n => [n.id, 0]));
    const succ = new Map<string, string[]>(nodes.map(n => [n.id, []]));
    for (const e of edges) {
      const [a, b] = back.has(e.id) ? [e.target, e.source] : [e.source, e.target];
      succ.get(a)!.push(b); preds.get(b)!.push(a); indeg.set(b, indeg.get(b)! + 1);
    }
    const ready = nodes.filter(n => indeg.get(n.id) === 0).map(n => n.id).sort();
    while (ready.length) {
      const v = ready.shift()!;
      for (const w of succ.get(v)!.sort()) {
        depth.set(w, Math.max(depth.get(w)!, depth.get(v)! + 1));
        indeg.set(w, indeg.get(w)! - 1);
        if (indeg.get(w) === 0) { ready.push(w); ready.sort(); }
      }
    }
  }
  const rawLayer = new Map(nodes.map(n => [n.id, n.layer ?? depth.get(n.id)!]));
  const distinct = [...new Set(rawLayer.values())].sort((a, b) => a - b);
  const layerOf = new Map(nodes.map(n => [n.id, distinct.indexOf(rawLayer.get(n.id)!)]));
  const layerCount = distinct.length;

  // --- virtual graph: split multi-layer edges into chains through dummy items
  interface Chain { edge: LayoutEdgeInput; items: string[]; reversed: boolean; flat: boolean }
  const chains: Chain[] = [];
  const itemLayer = new Map<string, number>(layerOf);
  const itemWidth = new Map<string, number>(nodes.map(n => [n.id, n.width]));
  const isDummy = (id: string) => !ids.has(id);
  for (const e of edges) {
    const ls = layerOf.get(e.source)!;
    const lt = layerOf.get(e.target)!;
    if (ls === lt) { chains.push({ edge: e, items: [e.source, e.target], reversed: false, flat: true }); continue; }
    const reversed = ls > lt;
    const upper = reversed ? e.target : e.source;
    const lower = reversed ? e.source : e.target;
    const items = [upper];
    for (let k = layerOf.get(upper)! + 1; k < layerOf.get(lower)!; k++) {
      const d = `~${e.id}~${k}`;
      itemLayer.set(d, k); itemWidth.set(d, 0); items.push(d);
    }
    items.push(lower);
    chains.push({ edge: e, items, reversed, flat: false });
  }
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  for (const id of itemLayer.keys()) { up.set(id, []); down.set(id, []); }
  for (const c of chains) {
    if (c.flat) continue;
    for (let i = 0; i + 1 < c.items.length; i++) { down.get(c.items[i])!.push(c.items[i + 1]); up.get(c.items[i + 1])!.push(c.items[i]); }
  }

  // --- ordering within layers: barycenter sweeps with deterministic tie-breaks
  const layers: string[][] = Array.from({ length: layerCount }, () => []);
  for (const id of [...itemLayer.keys()].sort()) layers[itemLayer.get(id)!].push(id);
  const position = new Map<string, number>();
  const reindex = () => layers.forEach(l => l.forEach((id, i) => position.set(id, i)));
  reindex();
  const reorder = (k: number, neighbours: Map<string, string[]>) => {
    const key = new Map(layers[k].map(id => {
      const ns = neighbours.get(id)!;
      return [id, ns.length ? mean(ns.map(n => position.get(n)!)) : position.get(id)!] as const;
    }));
    layers[k].sort((a, b) => key.get(a)! - key.get(b)! || position.get(a)! - position.get(b)! || (a < b ? -1 : 1));
    layers[k].forEach((id, i) => position.set(id, i));
  };
  for (let s = 0; s < o.sweeps; s++) {
    if (s % 2 === 0) for (let k = 1; k < layerCount; k++) reorder(k, up);
    else for (let k = layerCount - 2; k >= 0; k--) reorder(k, down);
  }

  // --- horizontal coordinates: neighbour averaging, then an exact order-preserving fix-up per layer (isotonic regression)
  const sep = (a: string, b: string) => (itemWidth.get(a)! + itemWidth.get(b)!) / 2 + (isDummy(a) || isDummy(b) ? o.edgeGap : o.nodeGap);
  const cx = new Map<string, number>();
  const settle = (k: number, desired: Map<string, number>) => {
    const row = layers[k];
    const offset: number[] = [];
    row.forEach((id, i) => offset.push(i === 0 ? 0 : offset[i - 1] + sep(row[i - 1], id)));
    const target = row.map((id, i) => desired.get(id)! - offset[i]);
    const blocks: { sum: number; n: number }[] = [];
    for (const t of target) {
      blocks.push({ sum: t, n: 1 });
      while (blocks.length > 1) {
        const b = blocks[blocks.length - 1];
        const a = blocks[blocks.length - 2];
        if (a.sum / a.n <= b.sum / b.n) break;
        blocks.splice(blocks.length - 2, 2, { sum: a.sum + b.sum, n: a.n + b.n });
      }
    }
    let i = 0;
    for (const b of blocks) for (let j = 0; j < b.n; j++, i++) cx.set(row[i], b.sum / b.n + offset[i]);
  };
  for (let k = 0; k < layerCount; k++) settle(k, new Map(layers[k].map((id, i) => [id, i * 1000])));
  const pull = (k: number, neighbours: Map<string, string[]>) =>
    settle(k, new Map(layers[k].map(id => {
      const ns = neighbours.get(id)!;
      return [id, ns.length ? mean(ns.map(n => cx.get(n)!)) : cx.get(id)!] as const;
    })));
  for (let pass = 0; pass < 10; pass++) {
    for (let k = 1; k < layerCount; k++) pull(k, up);
    for (let k = layerCount - 2; k >= 0; k--) pull(k, down);
  }
  let minLeft = Infinity;
  for (const [id, x] of cx) minLeft = Math.min(minLeft, x - itemWidth.get(id)! / 2);
  const shiftX = o.padding - minLeft;
  for (const [id, x] of cx) cx.set(id, x + shiftX);

  // --- vertical coordinates
  const flatByLayer = new Array<number>(layerCount).fill(0);
  for (const c of chains) if (c.flat) flatByLayer[layerOf.get(c.edge.source)!]++;
  const bandHeight = layers.map(row => Math.max(0, ...row.filter(id => !isDummy(id)).map(id => nodeById.get(id)!.height)));
  const bandTop: number[] = [];
  const bandBottom: number[] = [];
  let cursor = o.padding;
  for (let k = 0; k < layerCount; k++) {
    cursor += (k === 0 ? 0 : o.layerGap) + flatByLayer[k] * o.laneStep;
    bandTop.push(cursor);
    cursor += bandHeight[k];
    bandBottom.push(cursor);
  }
  const placed: PlacedNode[] = nodes.map(n => {
    const k = layerOf.get(n.id)!;
    return { id: n.id, x: cx.get(n.id)! - n.width / 2, y: bandTop[k] + (bandHeight[k] - n.height) / 2, width: n.width, height: n.height, layer: k };
  });
  const placedById = new Map(placed.map(p => [p.id, p]));

  // --- ports: spread each side's attachment points evenly, ordered by where the edge heads
  type End = { chain: Chain; side: 'top' | 'bottom'; node: string; neighbourX: number };
  const ends: End[] = [];
  for (const c of chains) {
    if (c.flat) {
      const a = placedById.get(c.edge.source)!;
      const b = placedById.get(c.edge.target)!;
      ends.push({ chain: c, side: 'top', node: a.id, neighbourX: b.x + b.width / 2 });
      ends.push({ chain: c, side: 'top', node: b.id, neighbourX: a.x + a.width / 2 });
    } else {
      const first = c.items[0];
      const last = c.items[c.items.length - 1];
      ends.push({ chain: c, side: 'bottom', node: first, neighbourX: cx.get(c.items[1])! });
      ends.push({ chain: c, side: 'top', node: last, neighbourX: cx.get(c.items[c.items.length - 2])! });
    }
  }
  const portX = new Map<string, number>(); // `${edgeId}|${node}|${side}`
  const groups = new Map<string, End[]>();
  for (const e of ends) { const key = `${e.node}|${e.side}`; groups.set(key, [...(groups.get(key) ?? []), e]); }
  for (const list of groups.values()) {
    list.sort((a, b) => a.neighbourX - b.neighbourX || (a.chain.edge.id < b.chain.edge.id ? -1 : 1));
    const p = placedById.get(list[0].node)!;
    const usable = Math.max(0, p.width - 2 * o.portMargin);
    list.forEach((e, i) => portX.set(`${e.chain.edge.id}|${e.node}|${e.side}`, p.x + o.portMargin + ((i + 1) / (list.length + 1)) * usable));
  }

  // --- routing
  const flatOrder = new Map<string, number>();
  for (let k = 0; k < layerCount; k++) {
    chains.filter(c => c.flat && layerOf.get(c.edge.source) === k)
      .sort((a, b) => Math.abs(cx.get(a.edge.source)! - cx.get(a.edge.target)!) - Math.abs(cx.get(b.edge.source)! - cx.get(b.edge.target)!) || byId(a.edge, b.edge))
      .forEach((c, i) => flatOrder.set(c.edge.id, i));
  }
  const routed: RoutedEdge[] = chains.map(c => {
    const e = c.edge;
    let pts: Point[];
    if (c.flat) {
      const a = placedById.get(e.source)!;
      const b = placedById.get(e.target)!;
      const lane = bandTop[a.layer] - (flatOrder.get(e.id)! + 1) * o.laneStep;
      const ax = portX.get(`${e.id}|${a.id}|top`)!;
      const bx = portX.get(`${e.id}|${b.id}|top`)!;
      pts = [{ x: ax, y: a.y }, { x: ax, y: lane }, { x: bx, y: lane }, { x: bx, y: b.y }];
    } else {
      const upper = placedById.get(c.items[0])!;
      const lower = placedById.get(c.items[c.items.length - 1])!;
      const ux = portX.get(`${e.id}|${upper.id}|bottom`)!;
      const lx = portX.get(`${e.id}|${lower.id}|top`)!;
      pts = [{ x: ux, y: upper.y + upper.height }, { x: ux, y: bandBottom[upper.layer] }];
      for (const d of c.items.slice(1, -1)) {
        const k = itemLayer.get(d)!;
        pts.push({ x: cx.get(d)!, y: bandTop[k] }, { x: cx.get(d)!, y: bandBottom[k] });
      }
      pts.push({ x: lx, y: bandTop[lower.layer] }, { x: lx, y: lower.y });
      if (c.reversed) pts.reverse();
    }
    const segments = segmentsFromPoints(pts);
    return { id: e.id, source: e.source, target: e.target, points: pts, segments, path: pathData(pts[0], segments), reversed: c.reversed, flat: c.flat, inCycle: inCycle(e), labelAt: labelPoint(pts, c.flat) };
  });

  const width = Math.max(...placed.map(p => p.x + p.width), ...[...cx].map(([id, x]) => x + itemWidth.get(id)! / 2)) + o.padding;
  const height = bandBottom[layerCount - 1] + o.padding;
  return { width, height, nodes: placed, edges: routed.sort(byId), layers: bandTop.map((top, index) => ({ index, top, bottom: bandBottom[index] })) };
}

function segmentsFromPoints(pts: Point[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.x === b.x || a.y === b.y) out.push({ kind: 'line', to: b });
    else { const my = (a.y + b.y) / 2; out.push({ kind: 'curve', c1: { x: a.x, y: my }, c2: { x: b.x, y: my }, to: b }); }
  }
  return out;
}

const round = (n: number) => Math.round(n * 10) / 10;
function pathData(start: Point, segments: Segment[]): string {
  return `M${round(start.x)},${round(start.y)}` + segments.map(s =>
    s.kind === 'line' ? `L${round(s.to.x)},${round(s.to.y)}` : `C${round(s.c1.x)},${round(s.c1.y)} ${round(s.c2.x)},${round(s.c2.y)} ${round(s.to.x)},${round(s.to.y)}`).join('');
}

function labelPoint(pts: Point[], flat: boolean): Point {
  if (flat) return { x: (pts[1].x + pts[2].x) / 2, y: pts[1].y };
  let best = 0;
  let bestDy = -1;
  for (let i = 1; i < pts.length; i++) {
    const dy = Math.abs(pts[i].y - pts[i - 1].y);
    if (pts[i].x !== pts[i - 1].x && dy > bestDy) { best = i; bestDy = dy; }
  }
  if (bestDy < 0) { const m = Math.floor(pts.length / 2); return { x: pts[m].x, y: (pts[m - 1].y + pts[m].y) / 2 }; }
  return { x: (pts[best - 1].x + pts[best].x) / 2, y: (pts[best - 1].y + pts[best].y) / 2 };
}

/** Points along an edge for geometric checks and hit tests. */
export function samplePath(edge: RoutedEdge, perCurve = 24): Point[] {
  const out: Point[] = [edge.points[0]];
  let prev = edge.points[0];
  for (const s of edge.segments) {
    if (s.kind === 'line') out.push(s.to);
    else for (let i = 1; i <= perCurve; i++) {
      const t = i / perCurve;
      const u = 1 - t;
      out.push({
        x: u * u * u * prev.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.to.x,
        y: u * u * u * prev.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.to.y,
      });
    }
    prev = s.to;
  }
  return out;
}
