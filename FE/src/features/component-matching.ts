import { apiRequest } from '../api/client.ts';

// Which component of one snapshot became which of another (BE: GET /projects/:id/architecture/match).
// Components are matched through the files they share, not by id: every snapshot is grouped on its own.

export type ChangeKind = 'kept' | 'renamed' | 'split' | 'merged' | 'restructured' | 'removed' | 'added';

export interface ComponentLink { before: string; after: string; shared: string[]; forward: number; backward: number }
export interface ComponentChange { kind: ChangeKind; before: string[]; after: string[]; reason?: 'deleted' | 'dissolved' | 'new-files' | 'assembled' }
export interface MatchedComponent { id: string; name: string; role: string; files: number }
export interface MatchedSide { snapshot: { id: string; hash: string; title: string; date: string }; stale: boolean; components: MatchedComponent[] }

export interface ComponentMatchResult {
  before: MatchedSide;
  after: MatchedSide;
  matching: {
    links: ComponentLink[];
    changes: ComponentChange[];
    successor: Record<string, string | null>;
    moves: { from: string; to: string }[];
    files: { common: number; added: number; removed: number; moved: number };
    summary: Record<ChangeKind, number>;
  };
}

export async function getComponentMatch(projectId: string, baseId: string, targetId: string, signal?: AbortSignal): Promise<ComponentMatchResult> {
  const qs = new URLSearchParams({ baseId, targetId });
  const body = await apiRequest<{ data?: ComponentMatchResult }>(`/projects/${encodeURIComponent(projectId)}/architecture/match?${qs}`, { signal });
  const data = body?.data;
  if (!data?.matching || !Array.isArray(data.matching.changes) || !data.before || !data.after) throw new Error('The server returned an invalid component matching.');
  return data;
}

export const CHANGE_KINDS: readonly ChangeKind[] = ['split', 'merged', 'restructured', 'added', 'removed', 'renamed', 'kept'];

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  kept: 'Kept', renamed: 'Renamed', split: 'Split', merged: 'Merged', restructured: 'Restructured', removed: 'Removed', added: 'Added',
};

const REASONS: Record<NonNullable<ComponentChange['reason']>, string> = {
  deleted: 'Its files were deleted.',
  dissolved: 'Its files were spread over other components; none of them took most of it.',
  'new-files': 'Made of files that did not exist before.',
  assembled: 'Gathered from files that no earlier component held most of.',
};

export interface ChangeRow {
  key: string;
  kind: ChangeKind;
  before: MatchedComponent[];
  after: MatchedComponent[];
  /** The links behind this change, strongest first: the files each pair shares are the evidence. */
  links: (ComponentLink & { beforeName: string; afterName: string })[];
  explanation: string;
  /** Structural changes (anything but kept) come first. */
  structural: boolean;
}

const percent = (x: number) => `${Math.round(x * 100)}%`;

function explain(change: ComponentChange, before: MatchedComponent[], after: MatchedComponent[], links: ChangeRow['links']): string {
  const names = (list: MatchedComponent[]) => list.map(c => c.name).join(', ');
  const shared = links.reduce((n, l) => n + l.shared.length, 0);
  switch (change.kind) {
    case 'kept': return `Same component: ${shared} shared files.`;
    case 'renamed': return `Same files, new name: "${before[0]?.name}" is now "${after[0]?.name}" (${shared} shared files).`;
    case 'split': return `${before[0]?.name} was split into ${names(after)}.`;
    case 'merged': return `${names(before)} were merged into ${after[0]?.name}.`;
    case 'restructured': return `Files of ${names(before)} were regrouped into ${names(after)}.`;
    case 'removed':
    case 'added': return change.reason ? REASONS[change.reason] : '';
  }
}

/** One row per change, with component names and the evidence for it; structural changes first, then by size. */
export function changeRows(result: ComponentMatchResult): ChangeRow[] {
  const before = new Map(result.before.components.map(c => [c.id, c]));
  const after = new Map(result.after.components.map(c => [c.id, c]));
  const unknown = (id: string): MatchedComponent => ({ id, name: id, role: 'other', files: 0 });
  const rows = result.matching.changes.map((change, i): ChangeRow => {
    const b = change.before.map(id => before.get(id) ?? unknown(id));
    const a = change.after.map(id => after.get(id) ?? unknown(id));
    const links = result.matching.links
      .filter(l => change.before.includes(l.before) && change.after.includes(l.after))
      .map(l => ({ ...l, beforeName: before.get(l.before)?.name ?? l.before, afterName: after.get(l.after)?.name ?? l.after }))
      .sort((x, y) => y.shared.length - x.shared.length);
    return { key: `${i}:${change.kind}:${change.before.join('+')}>${change.after.join('+')}`, kind: change.kind, before: b, after: a, links, explanation: explain(change, b, a, links), structural: change.kind !== 'kept' };
  });
  const size = (r: ChangeRow) => [...r.before, ...r.after].reduce((n, c) => n + c.files, 0);
  return rows.sort((x, y) => CHANGE_KINDS.indexOf(x.kind) - CHANGE_KINDS.indexOf(y.kind) || size(y) - size(x));
}

/** How strongly a link holds, from both ends: the share of each component that the shared files make up. */
export const linkStrength = (l: { forward: number; backward: number; beforeName: string; afterName: string }) =>
  `${percent(l.forward)} of the remaining files of ${l.beforeName} · ${percent(l.backward)} of the files of ${l.afterName}`;

/** Whether anything changed structurally between the two snapshots. */
export const hasStructuralChange = (summary: Record<ChangeKind, number>) =>
  CHANGE_KINDS.some(k => k !== 'kept' && summary[k] > 0);
