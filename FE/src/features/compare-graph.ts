// The Compare page's two drawings. A real repository has hundreds of files, far too many to draw one box each, so files
// are grouped by folder (as deep as keeps the drawing readable) and folders are joined by the imports between their
// files. Both revisions are laid out together, so a folder sits in the same place on both sides.

export type RawNode = { id?: unknown };
export type RawEdge = { source?: unknown; target?: unknown };
export type RawSnapshot = { nodes?: RawNode[] | null; edges?: RawEdge[] | null } | null | undefined;

export type GroupStatus = 'same' | 'changed' | 'added' | 'removed';
export type CompareGroup = {
  id: string; label: string;
  /** Files of this folder in each revision. */
  inBase: number; inTarget: number;
  /** Files that appeared in the newer revision, and files gone from it. */
  added: number; removed: number;
  status: GroupStatus;
};
export type LinkStatus = 'same' | 'changed' | 'added' | 'removed';
export type CompareLink = { id: string; source: string; target: string; base: number; target2: number; status: LinkStatus };
export type CompareGraph = {
  depth: number; groups: CompareGroup[]; links: CompareLink[];
  /** Folders folded into "Other folders" to keep the drawing readable. */
  folded: number;
  totals: { baseFiles: number; targetFiles: number };
};

export const OTHER = '(other folders)';
const ROOT = '(root)';
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.java', '.kt', '.py', '.go', '.cs', '.rb', '.php', '.vue', '.svelte'];

const filesOf = (s: RawSnapshot) => [...new Set((s?.nodes ?? []).map(n => n?.id).filter((id): id is string => typeof id === 'string' && id.length > 0))];

/** An import as mined (the path joined with the importer's folder, often without extension) to a file of the revision. */
export function resolveImport(files: ReadonlySet<string>, target: string): string | null {
  const base = target.replace(/\/+$/, '');
  if (files.has(base)) return base;
  const stem = base.replace(/\.(js|jsx|mjs|cjs)$/, '');
  for (const ext of EXTENSIONS) if (files.has(stem + ext)) return stem + ext;
  for (const ext of EXTENSIONS) if (files.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
  return null;
}

/** File-to-file dependencies of a revision, imports that point outside it (packages) left out. */
export function fileEdges(s: RawSnapshot): [string, string][] {
  const files = new Set(filesOf(s));
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const e of s?.edges ?? []) {
    if (typeof e?.source !== 'string' || typeof e?.target !== 'string' || !files.has(e.source)) continue;
    const target = resolveImport(files, e.target);
    if (!target || target === e.source) continue;
    const key = `${e.source}\u0000${target}`;
    if (!seen.has(key)) { seen.add(key); out.push([e.source, target]); }
  }
  return out;
}

export function folderOf(path: string, depth: number): string {
  const dirs = path.split('/').slice(0, -1);
  return dirs.length ? dirs.slice(0, depth).join('/') : ROOT;
}

/** The deepest folder level that still gives at most `maxGroups` folders (at least 1). */
export function chooseDepth(paths: string[], maxGroups: number): number {
  let best = 1;
  let previous = -1;
  for (let depth = 1; depth <= 8; depth++) {
    const count = new Set(paths.map(p => folderOf(p, depth))).size;
    // Too many folders, or no folder splits any further: the level before is the one to draw.
    if (count > maxGroups || count === previous) break;
    best = depth;
    previous = count;
  }
  return best;
}

export function buildCompareGraph(base: RawSnapshot, target: RawSnapshot, maxGroups = 16): CompareGraph {
  const baseFiles = filesOf(base), targetFiles = filesOf(target);
  const inBase = new Set(baseFiles), inTarget = new Set(targetFiles);
  const all = [...new Set([...baseFiles, ...targetFiles])];
  const depth = chooseDepth(all, maxGroups);

  // Keep the largest folders; the rest share one box so the drawing never turns into a ring of unreadable boxes.
  const sizes = new Map<string, number>();
  for (const f of all) sizes.set(folderOf(f, depth), (sizes.get(folderOf(f, depth)) ?? 0) + 1);
  const ranked = [...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  const kept = new Set(ranked.length > maxGroups ? ranked.slice(0, maxGroups - 1) : ranked);
  const groupOf = (file: string) => (kept.has(folderOf(file, depth)) ? folderOf(file, depth) : OTHER);

  const groups = new Map<string, CompareGroup>();
  const group = (id: string) => {
    let g = groups.get(id);
    if (!g) { g = { id, label: id, inBase: 0, inTarget: 0, added: 0, removed: 0, status: 'same' }; groups.set(id, g); }
    return g;
  };
  for (const f of all) {
    const g = group(groupOf(f));
    if (inBase.has(f)) g.inBase++;
    if (inTarget.has(f)) g.inTarget++;
    if (inTarget.has(f) && !inBase.has(f)) g.added++;
    if (inBase.has(f) && !inTarget.has(f)) g.removed++;
  }

  const links = new Map<string, CompareLink>();
  const count = (edges: [string, string][], side: 'base' | 'target2') => {
    for (const [from, to] of edges) {
      const a = groupOf(from), b = groupOf(to);
      if (a === b) continue;
      const id = `${a}→${b}`;
      const link = links.get(id) ?? { id, source: a, target: b, base: 0, target2: 0, status: 'same' as LinkStatus };
      link[side]++;
      links.set(id, link);
    }
  };
  count(fileEdges(base), 'base');
  count(fileEdges(target), 'target2');

  const linkList = [...links.values()].map(l => ({ ...l, status: (l.base === 0 ? 'added' : l.target2 === 0 ? 'removed' : l.base !== l.target2 ? 'changed' : 'same') as LinkStatus }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const touched = new Set(linkList.filter(l => l.status !== 'same').flatMap(l => [l.source, l.target]));
  const groupList = [...groups.values()].map(g => ({
    ...g,
    status: (g.inBase === 0 ? 'added' : g.inTarget === 0 ? 'removed' : g.added || g.removed || touched.has(g.id) ? 'changed' : 'same') as GroupStatus,
  })).sort((a, b) => (a.id === OTHER ? 1 : b.id === OTHER ? -1 : a.id.localeCompare(b.id)));

  return { depth, groups: groupList, links: linkList, folded: Math.max(0, ranked.length - kept.size), totals: { baseFiles: baseFiles.length, targetFiles: targetFiles.length } };
}

/** "src/web/controllers" shown as "…/web/controllers" when it does not fit. */
export function shortLabel(label: string, max = 22): string {
  if (label.length <= max) return label;
  const parts = label.split('/');
  for (let i = 1; i < parts.length; i++) {
    const tail = `…/${parts.slice(i).join('/')}`;
    if (tail.length <= max) return tail;
  }
  return `…${label.slice(-(max - 1))}`;
}
