// The directory baseline: every folder (at a chosen depth) is a component. It is what a reader gets with no analysis at
// all, so a recovered architecture is only worth something where it does better than this.
//
// Chains of folders that hold nothing but one sub-folder (src/main/java/com/acme) are collapsed first, so depth counts
// folders that actually split the code. Files above the chosen depth stay in the folder that holds them.

import type { MatchComponent } from './matching.js';

export interface BaselineOptions {
  /** Folder levels below the collapsed root that make a component. Chosen automatically when absent. */
  depth?: number;
  /** Automatic depth aims for a component count in this range (the clustering's default range). */
  minComponents: number;
  maxComponents: number;
  /** Deepest level tried by the automatic choice. */
  maxDepth: number;
}

export const DEFAULT_BASELINE_OPTIONS: BaselineOptions = { minComponents: 8, maxComponents: 15, maxDepth: 6 };

interface Folder { files: number; children: Map<string, Folder> }

function tree(files: string[]): Folder {
  const root: Folder = { files: 0, children: new Map() };
  for (const f of files) {
    let node = root;
    for (const part of f.split('/').slice(0, -1)) {
      if (!node.children.has(part)) node.children.set(part, { files: 0, children: new Map() });
      node = node.children.get(part)!;
    }
    node.files++;
  }
  return root;
}

/**
 * The folder of `file` that names its component at `depth`: walk down from the root, where a folder that has no files
 * and a single sub-folder does not count as a level.
 */
function componentFolder(root: Folder, file: string, depth: number): string {
  const parts = file.split('/').slice(0, -1);
  let node = root, level = 0, i = 0;
  const taken: string[] = [];
  while (i < parts.length && level < depth) {
    node = node.children.get(parts[i])!;
    taken.push(parts[i++]);
    // A pass-through folder (one sub-folder, no files) is merged with the next one.
    while (i < parts.length && node.files === 0 && node.children.size === 1) {
      node = node.children.get(parts[i])!;
      taken.push(parts[i++]);
    }
    level++;
  }
  return taken.join('/');
}

export function groupByDirectory(files: string[], depth: number): MatchComponent[] {
  const root = tree(files);
  // When the whole repository sits under one chain of folders (src/main/java/com/acme), that chain is the root, not a level.
  const rootIsChain = root.files === 0 && root.children.size === 1;
  const groups = new Map<string, string[]>();
  for (const f of [...new Set(files)].sort()) {
    const folder = componentFolder(root, f, depth + (rootIsChain ? 1 : 0));
    groups.set(folder, [...(groups.get(folder) ?? []), f]);
  }
  return [...groups].map(([folder, memberIds]) => ({ id: folder || '(root)', name: folder.split('/').pop() || '(root)', memberIds }));
}

/**
 * Groups files by folder. Without an explicit depth, the depth whose component count is closest to the target range is
 * used (the shallower one on a tie).
 */
export function directoryBaseline(files: string[], options: Partial<BaselineOptions> = {}): { depth: number; components: MatchComponent[] } {
  const o = { ...DEFAULT_BASELINE_OPTIONS, ...options };
  if (o.depth !== undefined) return { depth: o.depth, components: groupByDirectory(files, o.depth) };
  let best: { depth: number; components: MatchComponent[]; miss: number } | null = null;
  for (let depth = 1; depth <= o.maxDepth; depth++) {
    const components = groupByDirectory(files, depth);
    const n = components.length;
    const miss = n < o.minComponents ? o.minComponents - n : n > o.maxComponents ? n - o.maxComponents : 0;
    if (!best || miss < best.miss) best = { depth, components, miss };
    if (miss === 0 || n >= new Set(files).size) break;
  }
  return { depth: best!.depth, components: best!.components };
}
