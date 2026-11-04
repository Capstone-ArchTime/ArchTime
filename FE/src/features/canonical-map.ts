// The kinds of architecture map a person meets, and whether a workspace has a canonical one. Kept out of the pages so it
// can be tested without them.
//
// - Clustered map: computed from file dependencies; components are named from folder names.
// - Refined map:   the clustered map, regrouped and named by an AI model (checked, but still a model's proposal).
// - Canonical map: the component diagram a maintainer confirmed as the reference architecture of the workspace.

export type MapKind = 'clustered' | 'refined' | 'canonical';

export const MAP_KIND: Record<MapKind, { label: string; color: string; description: string }> = {
  clustered: {
    label: 'Clustered map', color: 'default',
    description: 'Computed from file dependencies and named from folder names. A starting point, not the reference.',
  },
  refined: {
    label: 'Refined map', color: 'gold',
    description: 'The clustered map, regrouped and named by an AI model. Its arrows still come from file dependencies, but the grouping is a proposal, not the reference.',
  },
  canonical: {
    label: 'Canonical map', color: 'green',
    description: 'The component diagram a maintainer confirmed as the reference architecture of this workspace.',
  },
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
export function canonicalSummary(status: CanonicalStatus, formatDate: (iso: string) => string = iso => new Date(iso).toLocaleDateString()): string {
  if (!status.confirmed || !status.confirmedAt) return 'No canonical map yet: a maintainer has not confirmed the component diagram.';
  const by = status.confirmedByName ? ` by ${status.confirmedByName}` : '';
  const revision = status.confirmedRevision ? ` (revision ${status.confirmedRevision})` : '';
  return `Confirmed${by} on ${formatDate(status.confirmedAt)}${revision}.`;
}
