/**
 * Where a page was opened from, carried in the router's location state, so the page can offer a way back (a workspace's
 * Compare tab opens /compare, which then shows "← Back to <workspace>"). Only a same-site path is accepted.
 */
export type BackLink = { to: string; label: string };

/** The `state` of a <Link> whose target should offer a way back to `to`. */
export function backTo(to: string, label: string): { back: BackLink } {
  return { back: { to, label } };
}

/** The way back in a location state, or null when there is none or it is not a same-site path. */
export function readBack(state: unknown): BackLink | null {
  const back = (state as { back?: Partial<BackLink> } | null)?.back;
  if (!back || typeof back.to !== 'string' || typeof back.label !== 'string') return null;
  if (!back.to.startsWith('/') || back.to.startsWith('//')) return null;
  return { to: back.to, label: back.label.slice(0, 80) };
}
