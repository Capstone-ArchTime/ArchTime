import { layerForRole } from './naming.js';
import type { ComponentRole } from './types.js';

// Whether an architecture view means something, measured without a model and without hand-made answers where possible.
// Each function returns a score in [0, 1] (1 = best) plus what it found, so the UI can say why.
// See docs/ai-model-metrics-design.md, section 2.5.

const words = (text: string) => text
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter(Boolean);

/** Words that say nothing about what a component does, so they neither ground nor betray a name. */
const GENERIC = new Set([
  'and', 'the', 'of', 'for', 'to', 'with', 'a', 'an', 'in', 'on',
  'management', 'manager', 'managers', 'layer', 'layers', 'module', 'modules', 'core', 'common', 'shared', 'misc', 'general', 'other',
  'system', 'logic', 'handling', 'component', 'components', 'support', 'main', 'base', 'stuff', 'things', 'functionality', 'features',
]);
const EXTENSIONS = /\.(m?[jt]sx?|java|kt|py|go|rb|cs|php|vue|svelte|scala|swift|c|cpp|h|hpp|rs)$/i;

/** A name word is supported by a path word when they share a stem: "Authentication" by "auth", "Orders" by "order". */
function supported(term: string, pathWords: Set<string>): boolean {
  if (term.length < 3) return false;
  const stem = term.slice(0, Math.min(term.length, 5));
  for (const w of pathWords) {
    if (w.length < 3) continue;
    if (w.startsWith(stem) || (w.length >= 4 && term.startsWith(w))) return true;
  }
  return false;
}

export interface GroundingResult {
  /** Share of named components whose name has a word the member paths support. */
  score: number;
  /** Names nothing in the paths supports: invented, or too vague to check. */
  ungrounded: string[];
}

/**
 * Hallucination check for names. A model only sees file paths, so a name it gives a component should be traceable to the
 * paths of the files inside. Names made only of generic words ("Core Services") count as unsupported: they are not wrong,
 * but they do not tell a reader anything the paths do not.
 */
export function nameGrounding(components: { name: string; memberIds: string[] }[]): GroundingResult {
  const named = components.filter(c => c.memberIds.length && c.name !== 'Unassigned Files');
  if (!named.length) return { score: 1, ungrounded: [] };
  const ungrounded: string[] = [];
  for (const c of named) {
    const pathWords = new Set(c.memberIds.flatMap(p => words(p.replace(EXTENSIONS, ''))));
    const terms = words(c.name).filter(w => !GENERIC.has(w));
    if (!terms.some(t => supported(t, pathWords))) ungrounded.push(c.name);
  }
  return { score: round(1 - ungrounded.length / named.length), ungrounded };
}

export interface CycleResult {
  /** Share of components that are not part of a dependency cycle with other components. */
  score: number;
  cycles: string[][];
}

/** Components that depend on each other in a loop cannot be understood or changed one at a time (Tarjan's SCC). */
export function componentCycles(componentIds: string[], edges: { source: string; target: string }[]): CycleResult {
  const adj = new Map(componentIds.map(id => [id, [] as string[]]));
  for (const e of edges) if (e.source !== e.target && adj.has(e.source) && adj.has(e.target)) adj.get(e.source)!.push(e.target);
  let index = 0;
  const idx = new Map<string, number>(), low = new Map<string, number>(), onStack = new Set<string>(), stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (v: string) => {
    idx.set(v, index); low.set(v, index); index++; stack.push(v); onStack.add(v);
    for (const w of adj.get(v)!) {
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const scc: string[] = [];
      let w: string;
      do { w = stack.pop()!; onStack.delete(w); scc.push(w); } while (w !== v);
      if (scc.length > 1) cycles.push(scc.sort());
    }
  };
  for (const id of componentIds) if (!idx.has(id)) visit(id);
  const inCycles = cycles.reduce((n, c) => n + c.length, 0);
  return { score: componentIds.length ? round(1 - inCycles / componentIds.length) : 1, cycles };
}

export interface LayeringResult {
  /** Share of dependency weight between layered components that points down (or sideways), as layers should. */
  score: number;
  violations: { source: string; target: string; weight: number }[];
}

/**
 * controller (0) -> service (1) -> entity (2) -> repository / gateway / config / util (3). A dependency from a lower layer
 * to a higher one (a repository calling a controller) breaks the layering the roles claim. Components with no layered role
 * are left out.
 */
export function layerViolations(components: { id: string; role: ComponentRole }[], edges: { source: string; target: string; weight: number }[]): LayeringResult {
  const layer = new Map(components.map(c => [c.id, layerForRole(c.role)]));
  let total = 0, bad = 0;
  const violations: LayeringResult['violations'] = [];
  for (const e of edges) {
    const a = layer.get(e.source), b = layer.get(e.target);
    if (a === undefined || b === undefined || e.source === e.target) continue;
    total += e.weight;
    if (b < a) { bad += e.weight; violations.push({ source: e.source, target: e.target, weight: e.weight }); }
  }
  return { score: total ? round(1 - bad / total) : 1, violations };
}

/** How evenly files are spread over components (normalised entropy): 1 when equal, low when one component holds most files. */
export function sizeBalance(sizes: number[]): number {
  const xs = sizes.filter(n => n > 0);
  const n = xs.reduce((a, b) => a + b, 0);
  if (xs.length < 2 || n === 0) return 1;
  const h = -xs.reduce((s, x) => s + (x / n) * Math.log(x / n), 0);
  return round(h / Math.log(xs.length));
}

/**
 * Adjusted Rand Index of two groupings over the items both contain: 1 = identical, about 0 = no better than chance
 * (can be slightly negative). Used against a reference architecture and against the previous snapshot.
 */
export function adjustedRandIndex(a: Map<string, string>, b: Map<string, string>): { score: number; common: number } | null {
  const items = [...a.keys()].filter(k => b.has(k));
  const n = items.length;
  if (n < 2) return null;
  const table = new Map<string, number>(), rows = new Map<string, number>(), cols = new Map<string, number>();
  for (const k of items) {
    const x = a.get(k)!, y = b.get(k)!;
    table.set(`${x}\u0000${y}`, (table.get(`${x}\u0000${y}`) ?? 0) + 1);
    rows.set(x, (rows.get(x) ?? 0) + 1);
    cols.set(y, (cols.get(y) ?? 0) + 1);
  }
  const c2 = (m: number) => (m * (m - 1)) / 2;
  const index = [...table.values()].reduce((s, m) => s + c2(m), 0);
  const sumRows = [...rows.values()].reduce((s, m) => s + c2(m), 0);
  const sumCols = [...cols.values()].reduce((s, m) => s + c2(m), 0);
  const expected = (sumRows * sumCols) / c2(n);
  const max = (sumRows + sumCols) / 2;
  if (max === expected) return { score: 1, common: n }; // both groupings put everything together (or apart) the same way
  return { score: round((index - expected) / (max - expected)), common: n };
}

/** A reference architecture written by people: component name and the path prefixes of its files. */
export interface ReferenceComponent { name: string; prefixes: string[] }

/** Assigns each file to the first reference component with a matching prefix; files no prefix matches are left out. */
export function referenceGrouping(files: string[], reference: ReferenceComponent[]): Map<string, string> {
  const out = new Map<string, string>();
  const rules = reference.flatMap(r => r.prefixes.map(p => ({ name: r.name, prefix: p.replace(/^\.?\/+/, '') }))).filter(r => r.prefix)
    .sort((x, y) => y.prefix.length - x.prefix.length); // the most specific prefix wins
  for (const f of files) {
    const hit = rules.find(r => f.startsWith(r.prefix));
    if (hit) out.set(f, hit.name);
  }
  return out;
}

export const groupingOf = (components: { id: string; memberIds: string[] }[]) =>
  new Map(components.flatMap(c => c.memberIds.map(f => [f, c.id] as [string, string])));

function round(x: number) { return Math.round(x * 10_000) / 10_000; }

export interface ViewAssessment {
  grounding: GroundingResult;
  acyclicity: CycleResult;
  layering: LayeringResult;
  balance: number;
  components: number;
  /** Against the project's reference architecture, when one is set and shares files with the view. */
  agreement?: { score: number; common: number };
  /** Against the components of the previous snapshot, over the files both contain. */
  stability?: { score: number; common: number; snapshotId: string };
}

/** Every measure above for one view. Works for any view, AI-refined or not, so the clustering result is a baseline. */
export function assessView(
  view: { components: { id: string; name: string; role: ComponentRole; memberIds: string[] }[]; edges: { source: string; target: string; weight: number }[] },
  context: { reference?: ReferenceComponent[] | null; previous?: { snapshotId: string; components: { id: string; memberIds: string[] }[] } | null } = {},
): ViewAssessment {
  const mine = groupingOf(view.components);
  const out: ViewAssessment = {
    grounding: nameGrounding(view.components),
    acyclicity: componentCycles(view.components.map(c => c.id), view.edges),
    layering: layerViolations(view.components, view.edges),
    balance: sizeBalance(view.components.map(c => c.memberIds.length)),
    components: view.components.length,
  };
  if (context.reference?.length) {
    const ari = adjustedRandIndex(mine, referenceGrouping([...mine.keys()], context.reference));
    if (ari) out.agreement = ari;
  }
  if (context.previous) {
    const ari = adjustedRandIndex(mine, groupingOf(context.previous.components));
    if (ari) out.stability = { ...ari, snapshotId: context.previous.snapshotId };
  }
  return out;
}
