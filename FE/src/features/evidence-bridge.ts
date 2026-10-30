import { apiRequest } from '@/api/client';

/**
 * The front end of the evidence-to-component bridge. Evidence is commit-level and components are a computed grouping of one
 * snapshot; the server joins them at read time (BE: domain/architecture/bridge.ts) and answers two questions:
 * what ONE commit changed in components, and which recent commits changed the components of ONE viewed snapshot.
 *
 * Both answers are INFERENCE: the grouping is computed from import edges and the change is derived by comparing two mined
 * snapshots. The parsers never trust the shape they are given: unknown fields are dropped, numbers and strings are checked,
 * and every list is capped, so one odd response cannot break a page.
 */

export const IMPACT_LABEL = 'INFERENCE' as const;
/** The honest one-liner shown beside the data. */
export const IMPACT_NOTE = 'INFERENCE: computed by comparing mined snapshots.';

export const MAX_COMPONENTS = 200;
export const MAX_EDGES = 200;
export const MAX_PAIRS = 25;
export const MAX_FILES = 50;
export const MAX_COMMITS = 50;
const MAX_TEXT = 400;

export interface SnapshotRef { id: string; hash: string; title: string; date: string }
export interface FilePair { source: string; target: string }
/** All file pairs behind an entry (`total`) and the first few the server listed (`pairs`). */
export interface PairSample { total: number; pairs: FilePair[] }
export interface FileChanges { pairsAdded: number; pairsRemoved: number; filesAdded: number; filesRemoved: number }
export interface TouchedComponent { id: string; filesAdded: number; filesRemoved: number; pairsAdded: number; pairsRemoved: number }
export type ChangeKind = 'cross' | 'internal' | 'unmapped';
/** One changed dependency between components (`cross`), inside one (`internal`) or to files no component owns (`unmapped`). */
export interface ComponentChange { id: string; kind: ChangeKind; source: string | null; target: string | null; added: PairSample; removed: PairSample }

interface ImpactHead {
  label: typeof IMPACT_LABEL;
  note: string;
  evidence: { id: string; commit: string; title: string; date: string; type: string; depsAdded: number; depsRemoved: number };
  snapshot: SnapshotRef;
  baseline: SnapshotRef | null;
  hasBaseline: boolean;
  fileChanges: FileChanges;
}
export type EvidenceImpact = ImpactHead & (
  | { grouped: false; reason: string }
  | { grouped: true; mapping: { generator: string; createdAt: string; stale: boolean }; components: TouchedComponent[]; componentEdges: ComponentChange[]; unmappedFiles: { total: number; files: string[] }; unmappedPairs: number }
);

/** One commit in the list of commits that changed the components of a snapshot (counts only; the file pairs are in EvidenceImpact). */
export interface CommitImpact {
  commit: string;
  title: string;
  date: string;
  evidenceId: string;
  /** False when the commit's snapshot or the one before it could not be compared. */
  comparable: boolean;
  components: string[];
  componentEdges: { id: string; kind: ChangeKind; source: string | null; target: string | null; added: number; removed: number }[];
  unmappedCount: number;
}
export type CommitImpacts = {
  label: typeof IMPACT_LABEL;
  note: string;
  snapshot: SnapshotRef;
  limit: number;
} & (
  | { grouped: false; reason: string; commits: [] }
  | { grouped: true; mapping: { generator: string; createdAt: string }; commits: CommitImpact[]; skipped: number }
);

// ---- defensive parsing ------------------------------------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value.slice(0, MAX_TEXT) : fallback);
const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const list = (value: unknown, max: number): unknown[] => (Array.isArray(value) ? value.slice(0, max) : []);
/** A date as the server sends it (an ISO string). Anything that is not a parsable date becomes ''. */
const stamp = (value: unknown): string => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : '');
const side = (value: unknown): string | null => (typeof value === 'string' && value ? value.slice(0, MAX_TEXT) : null);

function snapshotRef(value: unknown): SnapshotRef | null {
  if (!isRec(value) || typeof value.id !== 'string' || !value.id) return null;
  return { id: value.id.slice(0, MAX_TEXT), hash: text(value.hash), title: text(value.title), date: stamp(value.date) };
}
function pair(value: unknown): FilePair | null {
  return isRec(value) && typeof value.source === 'string' && typeof value.target === 'string' ? { source: value.source.slice(0, MAX_TEXT), target: value.target.slice(0, MAX_TEXT) } : null;
}
function sample(value: unknown): PairSample {
  if (!isRec(value)) return { total: 0, pairs: [] };
  const pairs = list(value.filePairs, MAX_PAIRS).map(pair).filter((p): p is FilePair => p !== null);
  return { total: Math.max(count(value.totalFilePairs), pairs.length), pairs };
}
const kindOf = (value: unknown): ChangeKind | null => (value === 'cross' || value === 'internal' || value === 'unmapped' ? value : null);
function fileChanges(value: unknown): FileChanges {
  const v = isRec(value) ? value : {};
  return { pairsAdded: count(v.pairsAdded), pairsRemoved: count(v.pairsRemoved), filesAdded: count(v.filesAdded), filesRemoved: count(v.filesRemoved) };
}

/**
 * The answer of GET /projects/:id/evidences/:evidenceId/impact. Accepts the body with or without its { data } envelope and
 * returns null when it is not an impact answer at all. A grouped answer whose lists are missing is read as having none.
 */
export function parseEvidenceImpact(body: unknown): EvidenceImpact | null {
  const data = isRec(body) && isRec(body.data) ? body.data : body;
  if (!isRec(data) || typeof data.grouped !== 'boolean' || !isRec(data.evidence)) return null;
  const snapshot = snapshotRef(data.snapshot);
  const e = data.evidence;
  if (!snapshot || typeof e.commit !== 'string' || !e.commit) return null;
  const head: ImpactHead = {
    label: IMPACT_LABEL, note: text(data.note),
    evidence: { id: text(e.id), commit: e.commit.slice(0, MAX_TEXT), title: text(e.title), date: stamp(e.date), type: text(e.type), depsAdded: count(e.depsAdded), depsRemoved: count(e.depsRemoved) },
    snapshot, baseline: snapshotRef(data.baseline), hasBaseline: data.hasBaseline === true, fileChanges: fileChanges(data.fileChanges),
  };
  if (!data.grouped) return { ...head, grouped: false, reason: text(data.reason, 'This commit has not been grouped into components yet.') };

  const components = list(data.components, MAX_COMPONENTS).flatMap((c): TouchedComponent[] => isRec(c) && typeof c.id === 'string' && c.id
    ? [{ id: c.id.slice(0, MAX_TEXT), filesAdded: count(c.filesAdded), filesRemoved: count(c.filesRemoved), pairsAdded: count(c.pairsAdded), pairsRemoved: count(c.pairsRemoved) }] : []);
  const componentEdges = list(data.componentEdges, MAX_EDGES).flatMap((c): ComponentChange[] => {
    const kind = isRec(c) ? kindOf(c.kind) : null;
    return isRec(c) && kind && typeof c.id === 'string' && c.id
      ? [{ id: c.id.slice(0, MAX_TEXT), kind, source: side(c.source), target: side(c.target), added: sample(c.added), removed: sample(c.removed) }] : [];
  });
  const unmapped = isRec(data.unmappedFiles) ? data.unmappedFiles : {};
  const files = list(unmapped.files, MAX_FILES).filter((f): f is string => typeof f === 'string').map(f => f.slice(0, MAX_TEXT));
  const mapping = isRec(data.mapping) ? data.mapping : {};
  return {
    ...head, grouped: true,
    mapping: { generator: text(mapping.generator), createdAt: stamp(mapping.createdAt), stale: mapping.stale === true },
    components, componentEdges, unmappedFiles: { total: Math.max(count(unmapped.total), files.length), files }, unmappedPairs: count(data.unmappedPairs),
  };
}

/** The answer of GET /projects/:id/architecture/impact. Same rules as parseEvidenceImpact. */
export function parseCommitImpacts(body: unknown): CommitImpacts | null {
  const data = isRec(body) && isRec(body.data) ? body.data : body;
  if (!isRec(data) || typeof data.grouped !== 'boolean') return null;
  const snapshot = snapshotRef(data.snapshot);
  if (!snapshot) return null;
  const head = { label: IMPACT_LABEL, note: text(data.note), snapshot, limit: count(data.limit) };
  if (!data.grouped) return { ...head, grouped: false, reason: text(data.reason, 'This snapshot has not been grouped into components yet.'), commits: [] };

  const commits = list(data.commits, MAX_COMMITS).flatMap((c): CommitImpact[] => {
    if (!isRec(c) || typeof c.commit !== 'string' || !c.commit) return [];
    const components = list(c.components, MAX_COMPONENTS).filter((id): id is string => typeof id === 'string' && id !== '').map(id => id.slice(0, MAX_TEXT));
    const componentEdges = list(c.componentEdges, MAX_EDGES).flatMap((x): CommitImpact['componentEdges'] => {
      const kind = isRec(x) ? kindOf(x.kind) : null;
      return isRec(x) && kind && typeof x.id === 'string' && x.id
        ? [{ id: x.id.slice(0, MAX_TEXT), kind, source: side(x.source), target: side(x.target), added: count(x.added), removed: count(x.removed) }] : [];
    });
    return [{ commit: c.commit.slice(0, MAX_TEXT), title: text(c.title), date: stamp(c.date), evidenceId: text(c.evidenceId), comparable: c.comparable === true, components, componentEdges, unmappedCount: count(c.unmappedCount) }];
  });
  const mapping = isRec(data.mapping) ? data.mapping : {};
  return { ...head, grouped: true, mapping: { generator: text(mapping.generator), createdAt: stamp(mapping.createdAt) }, commits, skipped: count(data.skipped) };
}

// ---- requests ---------------------------------------------------------------------------------------------------------------

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;

/** What one commit's evidence changed, projected on the components of its snapshot. */
export async function getEvidenceImpact(projectId: string, evidenceId: string, signal?: AbortSignal): Promise<EvidenceImpact> {
  const impact = parseEvidenceImpact(await apiRequest<unknown>(`${base(projectId)}/evidences/${encodeURIComponent(evidenceId)}/impact`, { signal }));
  if (!impact) throw new Error('The server returned an invalid change summary.');
  return impact;
}

/** The recent commits that changed the components of one viewed snapshot (the latest when none is given). */
export async function getCommitImpacts(projectId: string, snapshotId?: string, limit?: number, signal?: AbortSignal): Promise<CommitImpacts> {
  const query = new URLSearchParams();
  if (snapshotId) query.set('snapshotId', snapshotId);
  if (limit !== undefined) query.set('limit', String(limit));
  const suffix = query.toString() ? `?${query}` : '';
  const impacts = parseCommitImpacts(await apiRequest<unknown>(`${base(projectId)}/architecture/impact${suffix}`, { signal }));
  if (!impacts) throw new Error('The server returned an invalid commit list.');
  return impacts;
}

// ---- view helpers -----------------------------------------------------------------------------------------------------------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The commits that changed one component, in the order given (newest first), at most `max`. Commits that could not be compared never count. */
export function commitsTouchingComponent(impacts: Pick<CommitImpacts, 'commits'> | null | undefined, componentId: string, max = Infinity): CommitImpact[] {
  if (!impacts || !Array.isArray(impacts.commits) || !componentId) return [];
  return impacts.commits
    .filter(c => c.comparable && (c.components.includes(componentId) || c.componentEdges.some(e => e.source === componentId || e.target === componentId)))
    .slice(0, Math.max(0, max));
}

/** Added and removed dependencies of one commit that start or end at the component (a dependency inside it counts once). */
export function componentDelta(commit: Pick<CommitImpact, 'componentEdges'>, componentId: string): { added: number; removed: number } {
  let added = 0, removed = 0;
  for (const e of commit.componentEdges) if (e.source === componentId || e.target === componentId) { added += e.added; removed += e.removed; }
  return { added, removed };
}

/** "+3 / -1 dependencies", or '' when the commit changed none of them. */
export function deltaText(delta: { added: number; removed: number }): string {
  return delta.added || delta.removed ? `+${delta.added} / -${delta.removed} ${delta.added + delta.removed === 1 ? 'dependency' : 'dependencies'}` : '';
}

/** One line for the head of an impact: "Changed 2 components · +3 / -1 dependencies". File-level dependency counts, as the server compares them. */
export function impactSummary(impact: EvidenceImpact): string {
  if (!impact.hasBaseline) return 'First mined commit: there is nothing earlier to compare with';
  const { pairsAdded, pairsRemoved } = impact.fileChanges;
  const deps = `+${pairsAdded} / -${pairsRemoved} ${pairsAdded + pairsRemoved === 1 ? 'dependency' : 'dependencies'}`;
  if (!impact.grouped) return `Not grouped into components yet · ${deps}`;
  return `${impact.components.length ? `Changed ${plural(impact.components.length, 'component')}` : 'No component changed'} · ${deps}`;
}

/** "and 3 more" when a list shows `shown` of `total`; '' otherwise. */
export function andMore(total: number, shown: number): string {
  const rest = Math.floor(total) - Math.floor(shown);
  return Number.isFinite(rest) && rest > 0 ? `and ${rest} more` : '';
}

/** A commit hash that is safe to print and to put in a link: letters, digits and a few separators only, at most `length` characters. */
export function shortHash(hash: unknown, length = 7): string {
  return typeof hash === 'string' ? hash.replace(/[^0-9A-Za-z._-]/g, '').slice(0, Math.max(1, length)) : '';
}

/** A date for lists: 2024-01-03, in UTC so it reads the same for everyone; '' when there is none. */
export function shortDate(value: unknown): string {
  const t = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}

/** Where one commit's evidence opens: the Evidence page of the workspace, with that commit's drawer. */
export function evidenceLink(projectId: string, commit: string): string {
  return `/evidence?projectId=${encodeURIComponent(projectId)}&commit=${encodeURIComponent(commit)}`;
}

/** The evidence a `?commit=` link points at, or null when there is no such link, nothing matches, or its drawer was already closed. */
export function linkedEvidence<T extends { commit?: unknown }>(list: readonly T[], commit: string | null, closed: string | null): T | null {
  if (!commit || commit === closed || !Array.isArray(list)) return null;
  return list.find(e => e.commit === commit) ?? null;
}

/** True when a ?commit= link names a commit that is not in the loaded (non-empty) evidence list, so the page can say so instead of opening nothing. */
export function linkedCommitMissing(list: readonly { commit?: unknown }[], commit: string | null): boolean {
  return !!commit && Array.isArray(list) && list.length > 0 && !list.some(e => e?.commit === commit);
}

/** What a changed dependency reads like: "Orders → Store", "Inside Orders", or "Orders → files in no component". */
export function changeLabel(change: Pick<ComponentChange, 'kind' | 'source' | 'target'>, nameOf: (id: string) => string): string {
  const none = 'files in no component';
  if (change.kind === 'internal') return `Inside ${change.source ? nameOf(change.source) : none}`;
  return `${change.source ? nameOf(change.source) : none} → ${change.target ? nameOf(change.target) : none}`;
}
