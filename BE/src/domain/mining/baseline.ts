// What a commit's dependency diff is measured against.
// Commits are mined in date order across every branch, so "the previous snapshot in time" is often a commit on another
// branch: two commits a minute apart on different branches then show hundreds of dependencies added and, at the next
// commit, the same hundreds removed. The baseline is instead the nearest mined commit on the commit's first-parent line:
// its parent on the same branch, or for a merge, the branch it was merged into. Commits that were not mined (a mined
// date range, unreadable commits) are walked past, so a diff always spans exactly the commits between the two snapshots.

/** Full hash -> parents, first parent first, as `git log --format=%P` lists them. */
export type ParentIndex = ReadonlyMap<string, readonly string[]>;

/** Stops a corrupt or cyclic index from walking forever; far deeper than any first-parent chain mined in one project. */
const MAX_STEPS = 1_000_000;

/** The nearest mined commit on `hash`'s first-parent line, excluding `hash` itself; null when there is none. */
export function firstParentBase(hash: string, parents: ParentIndex, isMined: (hash: string) => boolean): string | null {
  let current = parents.get(hash)?.[0];
  for (let steps = 0; current && steps < MAX_STEPS; steps++) {
    if (isMined(current)) return current;
    current = parents.get(current)?.[0];
  }
  return null;
}
