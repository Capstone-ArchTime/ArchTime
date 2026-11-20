import { hx } from './helper-messages.ts';
// Path prefixes map repository files to the components of the diagram (RF-08, BR-27). The server has the final word
// (BE domain/architecture/paths.ts); these copies let the component form answer at once, with the same wording (MSG24).

export const MAX_PREFIXES_PER_COMPONENT = 50;
export const MAX_PREFIX_LENGTH = 200;

/** The prefix written one way (forward slashes, no leading "./" or "/", no trailing "/"); null when it is refused. */
export function normalizePathPrefix(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f*?[\]]/.test(raw)) return null;
  const value = raw.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!value || value.length > MAX_PREFIX_LENGTH || /^[A-Za-z]:/.test(value)) return null;
  if (value.split('/').some(segment => segment === '.' || segment === '..')) return null;
  return value;
}

/** The prefixes normalized and without repeats, or the first refused value with the reason to show. */
export function checkPathPrefixes(values: string[]): { prefixes: string[] } | { error: string } {
  if (values.length > MAX_PREFIXES_PER_COMPONENT) return { error: hx('maxPrefixes', { max: MAX_PREFIXES_PER_COMPONENT }) };
  const prefixes: string[] = [];
  for (const value of values) {
    const prefix = normalizePathPrefix(value);
    if (prefix === null) return { error: hx('badPrefix', { value }) };
    if (!prefixes.includes(prefix)) prefixes.push(prefix);
  }
  return { prefixes };
}

/** MSG24 when one of `prefixes` is already mapped to another component; null otherwise. */
export function prefixOverlap(componentId: string | undefined, componentName: string, prefixes: string[], others: { id: string; name: string; pathPrefixes?: string[] }[]): string | null {
  for (const other of others) {
    if (other.id === componentId) continue;
    const shared = prefixes.find(prefix => other.pathPrefixes?.includes(prefix));
    if (shared) return hx('prefixTaken', { prefix: shared, other: other.name, name: componentName });
  }
  return null;
}

type Content = { components: { id: string; name: string; kind: string; description: string }[]; dependencies: { source: string; target: string; label: string }[] };

/**
 * Whether two diagrams have the same confirmed content: components and dependencies, ignoring order and path prefixes
 * (as the server's diagramContentKey does). Mapping files to components keeps a confirmed diagram confirmed.
 */
export function sameConfirmedContent(a: Content, b: Content): boolean {
  const key = (d: Content) => JSON.stringify([
    d.components.map(c => [c.id, c.name, c.kind, c.description]).sort((x, y) => x[0].localeCompare(y[0])),
    d.dependencies.map(e => [e.source, e.target, e.label]).sort((x, y) => x.join('\u0001').localeCompare(y.join('\u0001'))),
  ]);
  return key(a) === key(b);
}
