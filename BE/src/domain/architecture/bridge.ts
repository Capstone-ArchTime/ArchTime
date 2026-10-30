import { fileDependencies } from './buildView.js';
import type { SnapshotGraph } from './buildView.js';
import type { Provenance } from './types.js';

/**
 * The read-time bridge between commit evidence and architecture components. Evidence is commit-level (it knows nothing of
 * components) and components belong to one snapshot's grouping; this module joins them without storing anything: it compares
 * the file dependencies of two snapshot graphs and projects what changed onto a file -> component map.
 *
 * Pure (no I/O). Everything it returns is labelled INFERENCE: the grouping is computed from import edges, and the change is
 * derived by comparing two mined snapshots, not read from the commit's source.
 *
 * Reading the result:
 * - A dependency is a resolved file-to-file import, exactly as the views see them (fileDependencies in buildView.ts), so
 *   npm packages, unresolved imports, test files and self imports are not part of it. The counts can therefore differ from
 *   the raw edge counts stored on a snapshot (depAdded / depRemoved).
 * - A renamed or moved file is a removed file plus an added file (the snapshots do not track renames), and the dependencies
 *   to and from it are removed under the old path and added under the new one. It is reported that way, not as a rename.
 * - Files a commit deleted do not exist in the grouping of the snapshot it produced, so they have no component there and
 *   show up as unmapped (an edge from a mapped file to a deleted one is reported as kind 'unmapped', never dropped).
 * - Components are only ever the ones of the mapping handed in; ids from other snapshots are never mixed in.
 */

export const IMPACT_LABEL = 'INFERENCE' satisfies Provenance;
/** Stands in for the side of an edge that no component owns. Not a valid component id (those are slugs). */
export const UNMAPPED = '(unmapped)';
export const DEFAULT_PAIR_CAP = 10;
export const DEFAULT_UNMAPPED_FILE_CAP = 20;

export interface FilePair { source: string; target: string }

/** A snapshot graph reduced to what the views use: analyzable files and the resolved dependencies between them. */
export interface ResolvedGraph { files: string[]; pairs: FilePair[] }

export interface FileDiff {
  /** False when there is no earlier snapshot to compare with (the first mined commit): nothing is reported as changed. */
  hasBaseline: boolean;
  addedPairs: FilePair[];
  removedPairs: FilePair[];
  addedFiles: string[];
  removedFiles: string[];
}

export interface PairSample {
  /** All file pairs behind the entry, whatever the cap. */
  totalFilePairs: number;
  /** The first pairs in path order, at most the cap. */
  filePairs: FilePair[];
}

/**
 * One changed dependency between components. `cross` is between two components, `internal` stays inside one, `unmapped` has
 * one side no component owns (source or target is null, shown as UNMAPPED in the id).
 */
export interface ComponentChange {
  id: string;
  kind: 'cross' | 'internal' | 'unmapped';
  source: string | null;
  target: string | null;
  added: PairSample;
  removed: PairSample;
}

export interface TouchedComponent {
  id: string;
  filesAdded: number;
  filesRemoved: number;
  /** Added / removed dependencies that start or end in one of its files (a dependency inside the component counts once). */
  pairsAdded: number;
  pairsRemoved: number;
}

export interface ImpactProjection {
  label: 'INFERENCE';
  hasBaseline: boolean;
  /** Totals over all files, before any component is involved. */
  fileChanges: { pairsAdded: number; pairsRemoved: number; filesAdded: number; filesRemoved: number };
  components: TouchedComponent[];
  componentEdges: ComponentChange[];
  /** Files in the change that no component owns (added, removed or on either end of a changed dependency). */
  unmappedFiles: { total: number; files: string[] };
  /** Changed dependencies whose two files are both unowned: counted here because no component edge can carry them. */
  unmappedPairs: number;
}

export interface ImpactOptions {
  /** File pairs listed per component edge and side (totalFilePairs always has the full count). */
  pairCap?: number;
  unmappedFileCap?: number;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const cmpPair = (a: FilePair, b: FilePair) => cmp(a.source, b.source) || cmp(a.target, b.target);
const pairKey = (p: FilePair) => `${p.source}\u0000${p.target}`;
const cap = (value: number | undefined, fallback: number) => (value !== undefined && Number.isInteger(value) && value >= 0 ? value : fallback);

/** Resolves a snapshot graph the way the architecture views do, so a dependency here is a dependency there. */
export function resolveGraph(graph: SnapshotGraph): ResolvedGraph {
  const { files, edges } = fileDependencies(graph);
  return { files, pairs: edges.map(e => ({ source: e.source, target: e.target })) };
}

/**
 * What changed between two resolved graphs. With no `before` (the first snapshot) there is no baseline and nothing is
 * reported as changed; an empty `before` graph is a real baseline, so everything in `after` counts as added.
 */
export function diffResolved(before: ResolvedGraph | null, after: ResolvedGraph): FileDiff {
  if (!before) return { hasBaseline: false, addedPairs: [], removedPairs: [], addedFiles: [], removedFiles: [] };
  const had = new Set(before.pairs.map(pairKey)), has = new Set(after.pairs.map(pairKey));
  const hadFiles = new Set(before.files), hasFiles = new Set(after.files);
  const unique = (pairs: FilePair[], other: Set<string>) => {
    const seen = new Set<string>();
    return pairs.filter(p => {
      const key = pairKey(p);
      if (other.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort(cmpPair);
  };
  return {
    hasBaseline: true,
    addedPairs: unique(after.pairs, had),
    removedPairs: unique(before.pairs, has),
    addedFiles: [...new Set(after.files.filter(f => !hadFiles.has(f)))].sort(cmp),
    removedFiles: [...new Set(before.files.filter(f => !hasFiles.has(f)))].sort(cmp),
  };
}

/** Totals over all files, before any component is involved. */
export function fileChangeTotals(diff: FileDiff): ImpactProjection['fileChanges'] {
  return { pairsAdded: diff.addedPairs.length, pairsRemoved: diff.removedPairs.length, filesAdded: diff.addedFiles.length, filesRemoved: diff.removedFiles.length };
}

/** file -> component id from a mapping's components. A file listed twice belongs to the first component, as in buildView. */
export function ownerMapOf(components: readonly { id: string; memberIds: readonly string[] }[]): Map<string, string> {
  const owner = new Map<string, string>();
  for (const c of components) for (const file of c.memberIds) if (!owner.has(file)) owner.set(file, c.id);
  return owner;
}

/** Projects a file-level change onto components. Ordering is by path and id, so the same input always gives the same output. */
export function projectImpact(diff: FileDiff, owner: ReadonlyMap<string, string>, options: ImpactOptions = {}): ImpactProjection {
  const pairCap = cap(options.pairCap, DEFAULT_PAIR_CAP), fileCap = cap(options.unmappedFileCap, DEFAULT_UNMAPPED_FILE_CAP);
  const touched = new Map<string, TouchedComponent>();
  const touch = (id: string) => {
    let t = touched.get(id);
    if (!t) { t = { id, filesAdded: 0, filesRemoved: 0, pairsAdded: 0, pairsRemoved: 0 }; touched.set(id, t); }
    return t;
  };
  const unmapped = new Set<string>();
  const note = (file: string) => { const id = owner.get(file); if (!id) unmapped.add(file); return id; };

  for (const f of diff.addedFiles) { const id = note(f); if (id) touch(id).filesAdded++; }
  for (const f of diff.removedFiles) { const id = note(f); if (id) touch(id).filesRemoved++; }

  const changes = new Map<string, { kind: ComponentChange['kind']; source: string | null; target: string | null; added: FilePair[]; removed: FilePair[] }>();
  let unmappedPairs = 0;
  const place = (pair: FilePair, side: 'added' | 'removed') => {
    const source = note(pair.source) ?? null, target = note(pair.target) ?? null;
    for (const id of new Set([source, target])) if (id) touch(id)[side === 'added' ? 'pairsAdded' : 'pairsRemoved']++;
    if (!source && !target) { unmappedPairs++; return; }
    const kind = !source || !target ? 'unmapped' : source === target ? 'internal' : 'cross';
    const id = kind === 'internal' ? source! : `${source ?? UNMAPPED}->${target ?? UNMAPPED}`;
    let change = changes.get(id);
    if (!change) { change = { kind, source, target, added: [], removed: [] }; changes.set(id, change); }
    change[side].push(pair);
  };
  for (const p of diff.addedPairs) place(p, 'added');
  for (const p of diff.removedPairs) place(p, 'removed');

  const sample = (pairs: FilePair[]): PairSample => ({ totalFilePairs: pairs.length, filePairs: pairs.slice(0, pairCap) });
  const rank = { cross: 0, internal: 1, unmapped: 2 } as const;
  const componentEdges = [...changes.entries()]
    .map(([id, c]): ComponentChange => ({ id, kind: c.kind, source: c.source, target: c.target, added: sample(c.added), removed: sample(c.removed) }))
    .sort((a, b) => rank[a.kind] - rank[b.kind] || cmp(a.id, b.id));
  const unmappedFiles = [...unmapped].sort(cmp);
  return {
    label: IMPACT_LABEL,
    hasBaseline: diff.hasBaseline,
    fileChanges: fileChangeTotals(diff),
    components: [...touched.values()].sort((a, b) => cmp(a.id, b.id)),
    componentEdges,
    unmappedFiles: { total: unmappedFiles.length, files: unmappedFiles.slice(0, fileCap) },
    unmappedPairs,
  };
}

/** Both steps at once: the change between two snapshot graphs, seen through one grouping. `before` is null for the first snapshot. */
export function analyzeImpact(
  before: SnapshotGraph | null,
  after: SnapshotGraph,
  components: readonly { id: string; memberIds: readonly string[] }[],
  options: ImpactOptions = {},
): ImpactProjection {
  return projectImpact(diffResolved(before ? resolveGraph(before) : null, resolveGraph(after)), ownerMapOf(components), options);
}

/** The short form for lists of commits: touched component ids, edges with plain counts (no file pairs) and how many files are unowned. */
export function compactImpact(projection: ImpactProjection) {
  return {
    components: projection.components.map(c => c.id),
    componentEdges: projection.componentEdges.map(e => ({ id: e.id, kind: e.kind, source: e.source, target: e.target, added: e.added.totalFilePairs, removed: e.removed.totalFilePairs })),
    unmappedCount: projection.unmappedFiles.total,
  };
}
