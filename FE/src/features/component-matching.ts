import { apiRequest } from '../api/client.ts';
import { defineMessages, message } from '../i18n/define.ts';
import type { Params } from '../i18n/index.ts';

const TEXT = defineMessages({
  kept: 'Kept', renamed: 'Renamed', split: 'Split', merged: 'Merged', restructured: 'Restructured', removed: 'Removed', added: 'Added',
  deleted: 'Its files were deleted.', dissolved: 'Its files were spread over other components; none of them took most of it.',
  newFiles: 'Made of files that did not exist before.', assembled: 'Gathered from files that no earlier component held most of.',
  same: 'Same component: {n} shared files.', newName: 'Same files, new name: "{before}" is now "{after}" ({n} shared files).', splitInto: '{before} was split into {after}.',
  mergedInto: '{before} were merged into {after}.', regrouped: 'Files of {before} were regrouped into {after}.',
  strength: '{forward} of the remaining files of {before} · {backward} of the files of {after}',
}, {
  kept: 'Giữ nguyên', renamed: 'Đổi tên', split: 'Tách', merged: 'Gộp', restructured: 'Tái cấu trúc', removed: 'Xoá', added: 'Thêm',
  deleted: 'Các tệp của nó đã bị xoá.', dissolved: 'Các tệp của nó bị chia sang các thành phần khác; không thành phần nào nhận phần lớn.',
  newFiles: 'Gồm các tệp trước đây chưa có.', assembled: 'Gom từ các tệp mà trước đây không thành phần nào chứa phần lớn.',
  same: 'Cùng thành phần: {n} tệp dùng chung.', newName: 'Cùng tệp, tên mới: "{before}" giờ là "{after}" ({n} tệp dùng chung).', splitInto: '{before} được tách thành {after}.',
  mergedInto: '{before} được gộp vào {after}.', regrouped: 'Các tệp của {before} được nhóm lại thành {after}.',
  strength: '{forward} số tệp còn lại của {before} · {backward} số tệp của {after}',
});
const tx = (key: Parameters<typeof message<typeof TEXT.en>>[1], params?: Params) => message(TEXT, key, params);

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

// Read when shown, so they follow the chosen language.
export const CHANGE_LABELS: Record<ChangeKind, string> = Object.defineProperties({} as Record<ChangeKind, string>,
  Object.fromEntries((['kept', 'renamed', 'split', 'merged', 'restructured', 'removed', 'added'] as const).map(k => [k, { enumerable: true, get: () => tx(k) }])));

const REASON_KEY: Record<NonNullable<ComponentChange['reason']>, 'deleted' | 'dissolved' | 'newFiles' | 'assembled'> = {
  deleted: 'deleted', dissolved: 'dissolved', 'new-files': 'newFiles', assembled: 'assembled',
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
    case 'kept': return tx('same', { n: shared });
    case 'renamed': return tx('newName', { before: before[0]?.name ?? '', after: after[0]?.name ?? '', n: shared });
    case 'split': return tx('splitInto', { before: before[0]?.name ?? '', after: names(after) });
    case 'merged': return tx('mergedInto', { before: names(before), after: after[0]?.name ?? '' });
    case 'restructured': return tx('regrouped', { before: names(before), after: names(after) });
    case 'removed':
    case 'added': return change.reason ? tx(REASON_KEY[change.reason]) : '';
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
  tx('strength', { forward: percent(l.forward), before: l.beforeName, backward: percent(l.backward), after: l.afterName });

/** Whether anything changed structurally between the two snapshots. */
export const hasStructuralChange = (summary: Record<ChangeKind, number>) =>
  CHANGE_KINDS.some(k => k !== 'kept' && summary[k] > 0);
