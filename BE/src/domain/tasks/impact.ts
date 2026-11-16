// The architectural impact of a task (F-13, WF-07 "each task's architectural impact visible", DS-07a): for every commit
// linked to the task, the dependencies it added and removed and the components of the confirmed diagram whose
// dependencies it changed, computed with bridge.ts exactly as the commit convention check does. Pure.

import { diffResolved, projectImpact, resolveGraph } from "../architecture/bridge.js";
import type { SnapshotGraph } from "../architecture/buildView.js";
import { componentOf, type ConformanceComponent } from "../architecture/conformance.js";

export interface CommitImpactInput { before: SnapshotGraph | null; after: SnapshotGraph; components: ConformanceComponent[] }

export interface CommitComponentImpact {
  /** Ids of the components that own a changed file or a changed dependency. */
  components: string[];
  /** Changed dependencies between two components, with the number of file imports added and removed. */
  edges: { source: string; target: string; added: number; removed: number }[];
  /** True when the commit added or removed a dependency between two components: an architecture change. */
  architectural: boolean;
}

export function commitComponentImpact({ before, after, components }: CommitImpactInput): CommitComponentImpact {
  const b = before ? resolveGraph(before) : null, a = resolveGraph(after);
  const owner = new Map<string, string>();
  for (const file of new Set([...(b?.files ?? []), ...a.files])) {
    const id = componentOf(file, components);
    if (id) owner.set(file, id);
  }
  const impact = projectImpact(diffResolved(b, a), owner, { pairCap: 0 });
  const edges = impact.componentEdges
    .filter(e => e.kind === "cross" && e.source && e.target)
    .map(e => ({ source: e.source!, target: e.target!, added: e.added.totalFilePairs, removed: e.removed.totalFilePairs }));
  return { components: impact.components.map(c => c.id), edges, architectural: edges.length > 0 };
}
