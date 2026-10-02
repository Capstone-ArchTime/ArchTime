import type { ComponentRole, Provenance } from './types.js';

// Names, roles and descriptions for file groups, derived only from paths. This is the deterministic fallback;
// the roles it assigns are INFERENCE at best because folder names are a hint, not proof.

export interface NamedGroup {
  name: string;
  description: string;
  role: ComponentRole;
  label: Provenance;
  layer?: number;
  members: string[];
}

const GENERIC = new Set(['src', 'lib', 'app', 'main', 'java', 'kotlin', 'scala', 'com', 'org', 'net', 'io', 'www', 'source', 'sources', 'packages', 'pkg', 'internal', 'index']);
const ACRONYMS = new Set(['api', 'ui', 'db', 'be', 'fe', 'dto', 'jwt', 'sql', 'url', 'id', 'ai', 'llm', 'ast', 'io', 'http', 'css', 'html']);

// First match wins, so more specific folders come first (infrastructure/services is a gateway, not a service).
const ROLE_RULES: [ComponentRole, RegExp][] = [
  ['config', /(^|\/)(config|configs|configuration|settings|env)(\/|$)/],
  ['repository', /(^|\/)(repositor(y|ies)|dao|daos|database|databases|persistence|models?|schemas?|migrations?)(\/|$)|repository\./],
  ['gateway', /(^|\/)(infrastructure|adapters?|clients?|integrations?|gateways?|messaging|queues?|providers?)(\/|$)/],
  ['controller', /(^|\/)(controllers?|routes?|routers?|handlers?|presentation|pages?|views?|screens?|endpoints?|api)(\/|$)|controller\./],
  ['service', /(^|\/)(services?|use-?cases?|usecases?|application|workflows?|interactors?)(\/|$)|service\./],
  ['entity', /(^|\/)(entities|entity|domain|dtos?|aggregates?)(\/|$)/],
  ['util', /(^|\/)(utils?|helpers?|shared|common|lib|libs|hooks)(\/|$)/],
];
const LAYER: Partial<Record<ComponentRole, number>> = { controller: 0, service: 1, entity: 2, repository: 3, gateway: 3, config: 3, util: 3 };

export const layerForRole = (role: ComponentRole): number | undefined => LAYER[role];

export const roleOfFile = (path: string): ComponentRole | null => {
  const p = path.toLowerCase();
  for (const [role, re] of ROLE_RULES) if (re.test(p)) return role;
  return null;
};

function words(segment: string): string[] {
  return segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[-_.\s]+/).filter(Boolean);
}
export const titleCase = (segment: string) =>
  words(segment).map(w => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join(' ');

const dirsOf = (path: string) => path.split('/').slice(0, -1);

function commonPrefix(paths: string[]): string[] {
  const all = paths.map(dirsOf);
  const first = all[0] ?? [];
  let n = 0;
  while (n < first.length && all.every(d => d[n] === first[n])) n++;
  return first.slice(0, n);
}
const meaningful = (segments: string[]) => segments.filter(s => !GENERIC.has(s.toLowerCase()));

function baseName(paths: string[]): string {
  const prefix = meaningful(commonPrefix(paths));
  const folders = new Set(paths.map(p => dirsOf(p).join('/')));
  // One folder, or a deep shared folder: the folder says what it is.
  if (prefix.length >= 2 || (prefix.length === 1 && folders.size === 1)) return prefix.slice(-2).map(titleCase).join(' / ');
  // Mixed folders: name it after the folder that holds the most files, qualified by its parent when that is informative.
  const counts = new Map<string, { n: number; label: string }>();
  for (const p of paths) {
    const segs = meaningful(dirsOf(p));
    const last = segs[segs.length - 1];
    if (!last) continue;
    const label = segs.length >= 2 ? `${titleCase(segs[segs.length - 2])} / ${titleCase(last)}` : titleCase(last);
    const key = segs.slice(-2).join('/');
    counts.set(key, { n: (counts.get(key)?.n ?? 0) + 1, label });
  }
  const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1))[0];
  if (top) return top[1].label;
  return prefix.length ? prefix.map(titleCase).join(' / ') : 'Root Files';
}

export function describeGroups(groups: string[][], importance: ReadonlyMap<string, number> = new Map()): NamedGroup[] {
  const used = new Map<string, number>();
  return groups.map(members => {
    let name = baseName(members);
    const seen = used.get(name) ?? 0;
    used.set(name, seen + 1);
    if (seen > 0) name = `${name} ${seen + 1}`;

    const tally = new Map<ComponentRole, number>();
    for (const m of members) { const r = roleOfFile(m); if (r) tally.set(r, (tally.get(r) ?? 0) + 1); }
    const [topRole, topCount] = [...tally.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] ?? [null, 0];
    const confident = topRole !== null && topCount / members.length >= 0.5;
    const role: ComponentRole = confident ? topRole : 'other';

    const prefix = commonPrefix(members);
    const place = prefix.length ? prefix.join('/') : 'several folders';
    const best = [...members].sort((a, b) => (importance.get(b) ?? 0) - (importance.get(a) ?? 0) || (a < b ? -1 : 1)).slice(0, 3).map(m => m.split('/').pop()!);
    return {
      name,
      description: `${members.length} files in ${place}. Most depended on: ${best.join(', ')}.${confident ? '' : ' No folder naming convention identifies a role.'}`,
      role,
      label: confident ? 'INFERENCE' : 'UNKNOWN',
      ...(confident && LAYER[role] !== undefined ? { layer: LAYER[role] } : {}),
      members,
    };
  });
}
