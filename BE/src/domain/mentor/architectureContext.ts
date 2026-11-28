// Mentor context protocol 1.3 (docs/rq2-protocol.md, docs/mentor-context-audit.md): the ARCHITECTURE block of the
// mentor's PROJECT DATA. The recovered components of the latest milestone (identity, role, generated description, file
// count, representative files), the dependencies between them, the evolution events between consecutive milestones,
// the milestones themselves, the largest dependency changes of the whole mined history and a folder summary of the
// latest snapshot. Used by mentorProjectData (ProjectChatUseCase.ts) for the app's mentor and for RQ2 conditions C1 and
// C2, which receive the same text. Test-set workspaces get it only when the test-set lock is off (testSet.ts).
//
// Design rules: everything is derived from mined data (imports, stored groupings, commits); names, roles and
// descriptions written by the AI are marked as generated; the reference architecture (the RQ1 ground truth) and
// annotators' labels are never inputs; every section has a size cap and says what it left out. Pure and deterministic.

import { EVIDENCE_RULE, matchComponents } from '../architecture/matching.js';

export interface ContextComponent { id: string; name: string; role?: string; description?: string; memberIds: string[] }
export interface ContextMilestone {
  hash: string;
  date: Date | string;
  version?: string;
  /** How the stored grouping was made: cluster-only, cluster+llm, ... */
  generator?: string;
  components: ContextComponent[];
  /** File-level import edges of the milestone (fileDependencies). */
  edges: { source: string; target: string }[];
}

export interface ArchitectureContextOptions {
  /** Total characters for the whole block. */
  maxChars: number;
  maxComponents: number;
  representativeFiles: number;
  maxComponentEdges: number;
  maxEvents: number;
  maxFolders: number;
  maxTopChanges: number;
}

/** A commit with its dependency change, for the whole-history ranking (largest first, chosen by the caller's query). */
export interface TopChange { hash: string; date: Date | string; author?: string; title?: string; depAdded: number; depRemoved: number; files?: number }

export const DEFAULT_ARCHITECTURE_CONTEXT: ArchitectureContextOptions = {
  maxChars: 9_000, maxComponents: 20, representativeFiles: 3, maxComponentEdges: 25, maxEvents: 30, maxFolders: 15, maxTopChanges: 10,
};

export interface ArchitectureContext {
  text: string;
  /** Short hashes the block names, so the citation check knows them. */
  knownCommits: string[];
  stats: { milestones: number; components: number; componentEdges: number; events: number; folders: number; truncated: boolean };
}

/** The bucket clustering puts unplaced files in; listed as such, never as a component. */
const UNASSIGNED = 'Unassigned Files';
const short = (h: string) => String(h ?? '').trim().toLowerCase().slice(0, 7);
const day = (v: Date | string) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? 'unknown date' : d.toISOString().slice(0, 10); };
const clip = (t: string | undefined, max: number) => { const f = String(t ?? '').replace(/\s+/g, ' ').trim(); return f.length > max ? `${f.slice(0, max - 1)}…` : f; };
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Folder (first one or two segments) -> number of files, largest first. */
export function folderSummary(files: string[], depth = 2): { folder: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const f of files) {
    const parts = f.split('/');
    const folder = parts.length > 1 ? parts.slice(0, Math.min(depth, parts.length - 1)).join('/') + '/' : '(root)';
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return [...counts].map(([folder, n]) => ({ folder, files: n })).sort((a, b) => b.files - a.files || byText(a.folder, b.folder));
}

/** Component -> component import counts, derived from file edges (the same rule as the Architecture Map). */
export function componentEdges(components: ContextComponent[], edges: { source: string; target: string }[]): { from: string; to: string; imports: number }[] {
  const owner = new Map<string, string>();
  for (const c of components) for (const f of c.memberIds) if (!owner.has(f)) owner.set(f, c.name);
  const counts = new Map<string, number>();
  for (const e of edges) {
    const a = owner.get(e.source), b = owner.get(e.target);
    if (!a || !b || a === b || a === UNASSIGNED || b === UNASSIGNED) continue;
    const k = `${a}\u0000${b}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].map(([k, imports]) => { const [from, to] = k.split('\u0000'); return { from, to, imports }; })
    .sort((x, y) => y.imports - x.imports || byText(x.from, y.from) || byText(x.to, y.to));
}

/** Share of the character budget each section may use, so that every section appears even on a large repository. */
const SHARE = { folders: 0.08, components: 0.3, dependencies: 0.12, events: 0.22, milestones: 0.13, topChanges: 0.15 } as const;

/** A section: header, as many lines as fit both the line cap and the character budget, and a note of what did not fit. */
function section(header: string, lines: string[], max: number, what: string, maxChars = Infinity): { text: string; shown: number; truncated: boolean } {
  const shown: string[] = [];
  let used = header.length;
  for (const line of lines.slice(0, max)) {
    if (used + line.length + 1 > maxChars - 40) break;
    shown.push(line);
    used += line.length + 1;
  }
  const rest = lines.length - shown.length;
  return { text: [header, ...shown, ...(rest > 0 ? [`(${rest} more ${what} not listed)`] : [])].join('\n'), shown: shown.length, truncated: rest > 0 };
}

/**
 * The block for milestones given oldest first (at least one). The latest milestone's grouping is described; events come
 * from matching each consecutive pair with the evidence rule (the rule ArchTime itself uses).
 */
export function buildArchitectureContext(milestones: ContextMilestone[], latestFiles: string[], options: Partial<ArchitectureContextOptions> = {}, topChanges: TopChange[] = []): ArchitectureContext {
  const o = { ...DEFAULT_ARCHITECTURE_CONTEXT, ...options };
  const known = new Set<string>();
  if (!milestones.length) return { text: '', knownCommits: [], stats: { milestones: 0, components: 0, componentEdges: 0, events: 0, folders: 0, truncated: false } };
  const latest = milestones[milestones.length - 1];
  for (const m of milestones) known.add(short(m.hash));

  const fanIn = new Map<string, number>();
  for (const e of latest.edges) fanIn.set(e.target, (fanIn.get(e.target) ?? 0) + 1);
  const comps = latest.components.filter(c => c.memberIds.length && c.name !== UNASSIGNED)
    .sort((a, b) => b.memberIds.length - a.memberIds.length || byText(a.name, b.name));
  const unassigned = latest.components.find(c => c.name === UNASSIGNED)?.memberIds.length ?? 0;
  const compLines = comps.map(c => {
    const reps = [...c.memberIds].sort((a, b) => (fanIn.get(b) ?? 0) - (fanIn.get(a) ?? 0) || byText(a, b)).slice(0, o.representativeFiles);
    const desc = c.description ? `; description (generated): ${clip(c.description, 160)}` : '';
    return `- ${clip(c.name, 60)}${c.role ? ` [${c.role}]` : ''}: ${c.memberIds.length} files; e.g. ${reps.map(r => clip(r, 90)).join(', ')}${desc}`;
  });
  const deps = componentEdges(latest.components, latest.edges).map(d => `- ${clip(d.from, 60)} -> ${clip(d.to, 60)} (${d.imports} imports)`);

  const events: string[] = [];
  let renames = 0;
  for (let i = 1; i < milestones.length; i++) {
    const a = milestones[i - 1], b = milestones[i];
    const name = (list: ContextComponent[]) => new Map(list.map(c => [c.id, c.name]));
    const na = name(a.components), nb = name(b.components);
    const follow = (list: ContextComponent[]) => list.filter(c => c.name !== UNASSIGNED);
    const m = matchComponents(follow(a.components), follow(b.components), { evidence: EVIDENCE_RULE });
    for (const c of m.changes) {
      // Kept and renamed are not architectural changes (RQ1 judges split, merged, restructured, added and removed); a
      // rename only reflects another generated name, so it is counted, not listed.
      if (c.kind === 'kept') continue;
      if (c.kind === 'renamed') { renames++; continue; }
      const before = c.before.map(id => na.get(id) ?? id).join(' + '), after = c.after.map(id => nb.get(id) ?? id).join(' + ');
      events.push(`- ${c.kind}${c.reason ? ` (${c.reason})` : ''}: ${before || '—'} -> ${after || '—'} between \`${short(a.hash)}\` ${day(a.date)} and \`${short(b.hash)}\` ${day(b.date)} (files in this step: +${m.files.added} -${m.files.removed}, ${m.files.moved} moved)`);
    }
  }
  // Snapshots without a release tag store their hash as version; it is not repeated.
  const msLines = milestones.map(m => `- \`${short(m.hash)}\`${m.version && short(m.version) !== short(m.hash) ? ` ${clip(m.version, 30)}` : ''} ${day(m.date)}: ${new Set(m.components.flatMap(c => c.memberIds)).size} files, ${m.components.filter(c => c.name !== UNASSIGNED && c.memberIds.length).length} components${m.generator ? `, grouping ${m.generator}` : ''}`);
  const folders = folderSummary(latestFiles).map(f => `- ${clip(f.folder, 80)}: ${f.files} files`);
  for (const c of topChanges) known.add(short(c.hash));
  const topLines = topChanges.map(c => `- \`${short(c.hash)}\` ${day(c.date)}${c.author ? ` by ${clip(c.author, 40)}` : ''}: +${c.depAdded}/-${c.depRemoved} dependencies${c.files === undefined ? '' : `, ${c.files} files`}${c.title ? ` "${clip(c.title, 80)}"` : ''}`);

  const parts = [
    'ARCHITECTURE (computed by ArchTime from the mined imports. Component membership and dependencies are derived from imports; component names, roles and descriptions were written by an AI model and are not facts about the project. Evolution events compare the stored groupings of consecutive milestones.)',
    section(`FOLDERS of the latest snapshot \`${short(latest.hash)}\` (${latestFiles.length} files):`, folders, o.maxFolders, 'folders', o.maxChars * SHARE.folders),
    section(`COMPONENTS at milestone \`${short(latest.hash)}\` ${day(latest.date)} (${comps.length} components${unassigned ? `, ${unassigned} files unassigned` : ''}):`, compLines, o.maxComponents, 'components', o.maxChars * SHARE.components),
    section('COMPONENT DEPENDENCIES (imports between components):', deps.length ? deps : ['- none'], o.maxComponentEdges, 'dependencies', o.maxChars * SHARE.dependencies),
    section(`EVOLUTION EVENTS between consecutive milestones (${events.length}; ${renames} renames not listed):`, events.length ? events : ['- none reported'], o.maxEvents, 'events', o.maxChars * SHARE.events),
    section(`MILESTONES (oldest first, ${milestones.length}):`, msLines, milestones.length, 'milestones', o.maxChars * SHARE.milestones),
    ...(topChanges.length ? [section('LARGEST DEPENDENCY CHANGES over the whole mined history (added + removed):', topLines, o.maxTopChanges, 'commits', o.maxChars * SHARE.topChanges)] : []),
  ];
  const sections = parts.slice(1) as ReturnType<typeof section>[];
  let text = [parts[0] as string, ...sections.map(s => s.text)].join('\n\n');
  let truncated = sections.some(s => s.truncated);
  if (text.length > o.maxChars) { text = `${text.slice(0, o.maxChars)}\n(architecture data truncated)`; truncated = true; }
  return {
    // Only commits still named after truncation count as known to the model.
    text, knownCommits: [...known].filter(h => text.includes(`\`${h}\``)).sort(),
    stats: { milestones: milestones.length, components: comps.length, componentEdges: deps.length, events: events.length, folders: folders.length, truncated },
  };
}

// ── Protocol 1.3: assembling the mentor's PROJECT DATA ─────────────────────────────────────────────────────────────

/** Milestones the block describes: every stored grouping when there are few, otherwise `max` spread evenly (first and last kept). */
export const MAX_CONTEXT_MILESTONES = 12;
export function pickMilestones<T>(items: T[], max = MAX_CONTEXT_MILESTONES): T[] {
  if (items.length <= max) return items;
  const picked = new Set<number>();
  for (let k = 0; k < max; k++) picked.add(Math.round((k * (items.length - 1)) / (max - 1)));
  return [...picked].sort((a, b) => a - b).map(i => items[i]);
}

export interface MentorContext {
  text: string;
  knownCommits: string[];
  version: '1.2' | '1.3';
  /** True when the ARCHITECTURE block was withheld by the test-set lock (testSet.ts). */
  withheld: boolean;
  /** Sizes of the block, or null without one (1.2, withheld, or no stored grouping). */
  architecture: ArchitectureContext['stats'] | null;
}

export const WITHHELD_NOTE = 'ARCHITECTURE: withheld for this workspace (test-set lock while RQ1-B is annotated).';
export const NO_ARCHITECTURE_NOTE = 'ARCHITECTURE: none recorded yet (no stored component grouping for this workspace).';

/**
 * The PROJECT DATA of one version: the snapshot/evidence part, then (1.3) the ARCHITECTURE block, a note that it was
 * withheld, or a note that none exists. C1 and C2 receive exactly this text (rq2.ts messagesFor).
 */
export function assembleMentorContext(input: {
  version: '1.2' | '1.3'; base: { text: string; knownCommits: string[] }; architecture: ArchitectureContext | null; withheld: boolean;
}): MentorContext {
  if (input.version === '1.2') return { text: input.base.text, knownCommits: input.base.knownCommits, version: '1.2', withheld: false, architecture: null };
  const block = input.withheld ? WITHHELD_NOTE : input.architecture?.text ? input.architecture.text : NO_ARCHITECTURE_NOTE;
  const known = new Set([...input.base.knownCommits, ...(input.withheld ? [] : input.architecture?.knownCommits ?? [])]);
  return {
    text: `${input.base.text}\n\n${block}`, knownCommits: [...known].sort(), version: '1.3', withheld: input.withheld,
    architecture: input.withheld || !input.architecture?.text ? null : input.architecture.stats,
  };
}
