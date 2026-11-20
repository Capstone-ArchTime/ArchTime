// The kinds of architecture map a person meets, and whether a workspace has a canonical one. Kept out of the pages so it
// can be tested without them.
//
// - Clustered map: computed from file dependencies; components are named from folder names.
// - Refined map:   the clustered map, regrouped and named by an AI model (checked, but still a model's proposal).
// - Canonical map: the component diagram a maintainer confirmed as the reference architecture of the workspace.

import { defineMessages, message } from '../i18n/define.ts';
import { formatDate as formatLocalDate } from '../i18n/format.ts';

export type MapKind = 'clustered' | 'refined' | 'canonical';

const TEXT = defineMessages({
  clustered: 'Clustered map', clusteredHelp: 'Computed from file dependencies and named from folder names. A starting point, not the reference.',
  refined: 'Refined map', refinedHelp: 'The clustered map, regrouped and named by an AI model. Its arrows still come from file dependencies, but the grouping is a proposal, not the reference.',
  canonical: 'Canonical map', canonicalHelp: 'The component diagram a maintainer confirmed as the reference architecture of this workspace.',
  none: 'No canonical map yet: a maintainer has not confirmed the component diagram.', by: ' by {name}', revision: ' (revision {n})', confirmed: 'Confirmed{by} on {date}{revision}.',
}, {
  clustered: 'Bản đồ phân cụm', clusteredHelp: 'Tính từ phụ thuộc giữa các tệp và đặt tên theo thư mục. Là điểm khởi đầu, chưa phải tham chiếu.',
  refined: 'Bản đồ tinh chỉnh', refinedHelp: 'Bản đồ phân cụm được mô hình AI nhóm lại và đặt tên. Mũi tên vẫn lấy từ phụ thuộc giữa các tệp, nhưng cách nhóm chỉ là đề xuất, chưa phải tham chiếu.',
  canonical: 'Bản đồ chính thức', canonicalHelp: 'Sơ đồ thành phần mà người bảo trì đã xác nhận là kiến trúc tham chiếu của không gian làm việc này.',
  none: 'Chưa có bản đồ chính thức: người bảo trì chưa xác nhận sơ đồ thành phần.', by: ' bởi {name}', revision: ' (phiên bản {n})', confirmed: 'Được xác nhận{by} ngày {date}{revision}.',
});

// Labels are read when shown, so they follow the chosen language.
const kindOf = (kind: MapKind, color: string) => ({ color, get label() { return message(TEXT, kind); }, get description() { return message(TEXT, `${kind}Help`); } });
export const MAP_KIND: Record<MapKind, { readonly label: string; color: string; readonly description: string }> = {
  clustered: kindOf('clustered', 'default'),
  refined: kindOf('refined', 'gold'),
  canonical: kindOf('canonical', 'green'),
};

/** The kind of a computed map, from the generator the server reports; null for anything else (a sample, a manual view). */
export function computedMapKind(generator: string | null | undefined): Exclude<MapKind, 'canonical'> | null {
  if (generator === 'cluster-only') return 'clustered';
  if (generator === 'cluster+llm') return 'refined';
  return null;
}

export type CanonicalStatus = {
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedByName: string | null;
  confirmedRevision: number | null;
};

export const NOT_CONFIRMED: CanonicalStatus = { confirmed: false, confirmedAt: null, confirmedByName: null, confirmedRevision: null };

/** Reads the confirmation off a workspace diagram as the server sends it; anything malformed counts as not confirmed. */
export function canonicalStatus(diagram: unknown): CanonicalStatus {
  const d = (diagram && typeof diagram === 'object' ? diagram : {}) as Record<string, unknown>;
  const at = typeof d.confirmedAt === 'string' && !Number.isNaN(Date.parse(d.confirmedAt)) ? d.confirmedAt : null;
  if (!at) return NOT_CONFIRMED;
  const revision = Number(d.confirmedRevision);
  return {
    confirmed: true,
    confirmedAt: at,
    confirmedByName: typeof d.confirmedByName === 'string' && d.confirmedByName.trim() ? d.confirmedByName.trim() : null,
    confirmedRevision: Number.isInteger(revision) && revision > 0 ? revision : null,
  };
}

/** One line for people: who vouches for the reference architecture, when, and at which revision. */
export function canonicalSummary(status: CanonicalStatus, formatDate: (iso: string) => string = iso => formatLocalDate(iso)): string {
  if (!status.confirmed || !status.confirmedAt) return message(TEXT, 'none');
  const by = status.confirmedByName ? message(TEXT, 'by', { name: status.confirmedByName }) : '';
  const revision = status.confirmedRevision ? message(TEXT, 'revision', { n: status.confirmedRevision }) : '';
  return message(TEXT, 'confirmed', { by, date: formatDate(status.confirmedAt), revision });
}
