// Path prefixes map the files of the repository to the components of the confirmed diagram (RF-08, BR-27). A file
// belongs to the component with the longest prefix that contains it (domain/architecture/conformance.ts), so nested
// prefixes on different components are fine; the very same prefix on two components is not (MSG24). Pure, so unit-testable.

export const MAX_PREFIXES_PER_COMPONENT = 50;
export const MAX_PREFIX_LENGTH = 200;

/**
 * The prefix written one way: forward slashes, no leading "./" or "/", no trailing "/", no doubled "/". Null when it
 * cannot name a place inside the repository: empty, absolute (a drive letter), climbing out ("..") or holding "." segments,
 * glob characters or control characters, or longer than MAX_PREFIX_LENGTH.
 */
export function normalizePathPrefix(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f*?[\]]/.test(raw)) return null;
  const value = raw.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!value || value.length > MAX_PREFIX_LENGTH || /^[A-Za-z]:/.test(value)) return null;
  if (value.split("/").some(segment => segment === "." || segment === "..")) return null;
  return value;
}

/** The prefixes, normalized and without repeats, in the order given; or the first value that is refused. */
export function normalizePathPrefixes(values: unknown): { prefixes: string[] } | { invalid: string } {
  if (!Array.isArray(values)) return { invalid: String(values) };
  if (values.length > MAX_PREFIXES_PER_COMPONENT) return { invalid: `more than ${MAX_PREFIXES_PER_COMPONENT} prefixes` };
  const prefixes: string[] = [];
  for (const value of values) {
    const prefix = normalizePathPrefix(value);
    if (prefix === null) return { invalid: String(value) };
    if (!prefixes.includes(prefix)) prefixes.push(prefix);
  }
  return { prefixes };
}

export interface PrefixOverlap {
  prefix: string;
  first: { id: string; name: string };
  second: { id: string; name: string };
}

/** The first prefix two components share, in diagram order; null when every prefix belongs to one component. */
export function findPrefixOverlap(components: { id: string; name: string; pathPrefixes?: string[] }[]): PrefixOverlap | null {
  const owner = new Map<string, { id: string; name: string }>();
  for (const component of components) {
    for (const prefix of component.pathPrefixes ?? []) {
      const first = owner.get(prefix);
      if (first && first.id !== component.id) return { prefix, first, second: { id: component.id, name: component.name } };
      owner.set(prefix, { id: component.id, name: component.name });
    }
  }
  return null;
}

/** MSG24. */
export function overlapMessage(overlap: PrefixOverlap): string {
  return `Path prefix "${overlap.prefix}" is already mapped to component "${overlap.first.name}"; it cannot also be mapped to "${overlap.second.name}". Each path prefix belongs to one component.`;
}
