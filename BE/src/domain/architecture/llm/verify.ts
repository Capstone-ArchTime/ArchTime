import { COMPONENT_ROLES } from '../types.js';
import type { ComponentRole } from '../types.js';
import type { RefineIssue, RefineOptions } from './types.js';

/**
 * Rule codes for a model's answer (stable):
 *  M001 malformed answer        M002 files missing, repeated or unknown
 *  M003 component count out of range   M004 too many files moved from the initial grouping
 *  M005 name missing, too long, or repeated   M006 role not allowed
 *  M007 description too long    M008 component too small
 * The model never contributes nodes or edges: it only chooses names, roles, descriptions and which files go together.
 */
export interface VerifiedComponent { name: string; role: ComponentRole; description: string; files: number[] }
export interface VerifyResult<T> { ok: boolean; issues: RefineIssue[]; value?: T; movedRatio?: number }

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const sample = (xs: number[], n = 6) => `${xs.slice(0, n).join(', ')}${xs.length > n ? `, … (${xs.length} in total)` : ''}`;

function checkText(items: { name: string; role: string; description: string }[], issues: RefineIssue[]) {
  const seen = new Map<string, number>();
  const badRoles = new Set<string>();
  let longDescriptions = 0;
  items.forEach(item => {
    const name = item.name.trim();
    if (name.length < 2 || name.length > 60) issues.push({ code: 'M005', message: `Name "${name.slice(0, 40)}" must be 2 to 60 characters.` });
    const key = name.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (!COMPONENT_ROLES.includes(item.role as ComponentRole)) badRoles.add(item.role);
    if (item.description.length > 300) longDescriptions++;
  });
  for (const [name, n] of seen) if (n > 1) issues.push({ code: 'M005', message: `The name "${name}" is used ${n} times; names must be unique.` });
  if (badRoles.size) issues.push({ code: 'M006', message: `Role must be one of ${COMPONENT_ROLES.join(', ')}; got ${[...badRoles].map(r => `"${r}"`).join(', ')}.` });
  if (longDescriptions) issues.push({ code: 'M007', message: `${longDescriptions} description(s) are longer than 300 characters; keep each to one sentence.` });
}

export function verifyRefine(raw: unknown, ctx: { fileCount: number; initialCluster: number[]; options: RefineOptions }): VerifyResult<VerifiedComponent[]> {
  const issues: RefineIssue[] = [];
  const list = isRec(raw) ? raw.components : undefined;
  if (!Array.isArray(list)) return { ok: false, issues: [{ code: 'M001', message: 'The answer must be an object with a "components" array.' }] };
  const parsed: VerifiedComponent[] = [];
  list.forEach((c, i) => {
    if (!isRec(c) || typeof c.name !== 'string' || typeof c.role !== 'string' || typeof c.description !== 'string' || !Array.isArray(c.files) || !c.files.every(f => typeof f === 'number')) {
      issues.push({ code: 'M001', message: `components[${i}] needs a string name, role and description and a "files" array of numbers.` });
      return;
    }
    parsed.push({ name: c.name, role: c.role as ComponentRole, description: c.description, files: c.files as number[] });
  });
  if (issues.length) return { ok: false, issues };

  const count = new Array<number>(ctx.fileCount).fill(0);
  const unknown: number[] = [];
  for (const c of parsed) for (const f of c.files) { if (!Number.isInteger(f) || f < 0 || f >= ctx.fileCount) unknown.push(f); else count[f]++; }
  const missing = count.flatMap((n, i) => (n === 0 ? [i] : []));
  const repeated = count.flatMap((n, i) => (n > 1 ? [i] : []));
  if (unknown.length) issues.push({ code: 'M002', message: `Unknown file numbers: ${sample(unknown)}. Valid numbers are 0 to ${ctx.fileCount - 1}.` });
  if (missing.length) issues.push({ code: 'M002', message: `${missing.length} files are in no component, for example ${sample(missing)}. Every file must be placed once.` });
  if (repeated.length) issues.push({ code: 'M002', message: `${repeated.length} files are in more than one component, for example ${sample(repeated)}.` });

  const { minComponents, maxComponents, minSize } = ctx.options;
  if (parsed.length < minComponents || parsed.length > maxComponents) issues.push({ code: 'M003', message: `Return between ${minComponents} and ${maxComponents} components; you returned ${parsed.length}.` });
  const small = parsed.filter(c => new Set(c.files).size < minSize);
  if (small.length) issues.push({ code: 'M008', message: `Components need at least ${minSize} files: ${small.slice(0, 5).map(c => `"${c.name}" has ${new Set(c.files).size}`).join(', ')}.` });
  checkText(parsed, issues);

  // How much of the initial grouping survived: a file counts as moved when it is not in the component that holds most of its original cluster.
  let moved = 0;
  if (!issues.some(i => i.code === 'M002')) {
    const home = new Map<number, number>();
    parsed.forEach((c, ci) => {
      const tally = new Map<number, number>();
      for (const f of c.files) tally.set(ctx.initialCluster[f], (tally.get(ctx.initialCluster[f]) ?? 0) + 1);
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      if (top) home.set(ci, top[0]);
    });
    parsed.forEach((c, ci) => { for (const f of c.files) if (ctx.initialCluster[f] !== home.get(ci)) moved++; });
  }
  const movedRatio = ctx.fileCount ? moved / ctx.fileCount : 0;
  if (movedRatio > ctx.options.maxMoveRatio) issues.push({ code: 'M004', message: `${Math.round(movedRatio * 100)}% of the files were moved away from the initial clusters; at most ${Math.round(ctx.options.maxMoveRatio * 100)}% may move. Keep the initial grouping where it is reasonable.` });

  return issues.length ? { ok: false, issues, movedRatio } : { ok: true, issues, value: parsed, movedRatio };
}

export interface NamedCluster { cluster: string; name: string; role: ComponentRole; description: string }

export function verifyNaming(raw: unknown, ctx: { clusterIds: string[] }): VerifyResult<NamedCluster[]> {
  const issues: RefineIssue[] = [];
  const list = isRec(raw) ? raw.components : undefined;
  if (!Array.isArray(list)) return { ok: false, issues: [{ code: 'M001', message: 'The answer must be an object with a "components" array.' }] };
  const parsed: NamedCluster[] = [];
  list.forEach((c, i) => {
    if (!isRec(c) || typeof c.cluster !== 'string' || typeof c.name !== 'string' || typeof c.role !== 'string' || typeof c.description !== 'string') {
      issues.push({ code: 'M001', message: `components[${i}] needs a string cluster, name, role and description.` });
      return;
    }
    parsed.push({ cluster: c.cluster, name: c.name, role: c.role as ComponentRole, description: c.description });
  });
  if (issues.length) return { ok: false, issues };
  const wanted = new Set(ctx.clusterIds);
  const got = new Map<string, number>();
  for (const c of parsed) got.set(c.cluster, (got.get(c.cluster) ?? 0) + 1);
  const unknown = [...got.keys()].filter(id => !wanted.has(id));
  const missing = ctx.clusterIds.filter(id => !got.has(id));
  const repeated = [...got.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (unknown.length) issues.push({ code: 'M002', message: `Unknown cluster ids: ${unknown.slice(0, 6).join(', ')}.` });
  if (missing.length) issues.push({ code: 'M002', message: `No entry for clusters: ${missing.slice(0, 8).join(', ')}.` });
  if (repeated.length) issues.push({ code: 'M002', message: `Clusters named more than once: ${repeated.slice(0, 6).join(', ')}.` });
  checkText(parsed, issues);
  return issues.length ? { ok: false, issues } : { ok: true, issues, value: parsed };
}

/**
 * Rebuilds the full grouping from a refine answer that lists only names and moves ({ clusters, newClusters, moves }), so
 * the same rules (verifyRefine) judge it. Reports what cannot be rebuilt: unknown files or clusters, files moved twice,
 * clusters left with files but no name.
 */
export function expandDelta(raw: unknown, ctx: { fileCount: number; clusters: { id: string; files: number[] }[] }): VerifyResult<{ components: { name: string; role: string; description: string; files: number[] }[] }> {
  const issues: RefineIssue[] = [];
  // A model that lists every component with all its files (the older, longer format) is judged as it is.
  if (isRec(raw) && Array.isArray(raw.components) && !Array.isArray(raw.clusters)) return { ok: true, issues, value: { components: raw.components as never } };
  if (!isRec(raw) || !Array.isArray(raw.clusters)) return { ok: false, issues: [{ code: 'M001', message: 'The answer must be an object with "clusters", "newClusters" and "moves" arrays.' }] };
  const moves = Array.isArray(raw.moves) ? raw.moves : [];
  const created = Array.isArray(raw.newClusters) ? raw.newClusters : [];
  const known = new Set(ctx.clusters.map(c => c.id));
  const names = new Map<string, { name: string; role: string; description: string }>();
  const take = (list: unknown[], where: string, isNew: boolean) => list.forEach((c, i) => {
    if (!isRec(c) || typeof c.cluster !== 'string' || typeof c.name !== 'string' || typeof c.role !== 'string' || typeof c.description !== 'string') {
      issues.push({ code: 'M001', message: `${where}[${i}] needs a string cluster, name, role and description.` });
      return;
    }
    if (isNew ? known.has(c.cluster) : !known.has(c.cluster)) issues.push({ code: 'M002', message: isNew ? `New cluster id "${c.cluster}" is already used by an existing cluster; use "n1", "n2", ….` : `Unknown cluster id "${c.cluster}".` });
    else if (names.has(c.cluster)) issues.push({ code: 'M005', message: `Cluster "${c.cluster}" is named more than once.` });
    else names.set(c.cluster, { name: c.name, role: c.role, description: c.description });
  });
  take(raw.clusters, 'clusters', false);
  take(created, 'newClusters', true);
  const home = new Array<string | undefined>(ctx.fileCount);
  ctx.clusters.forEach(c => c.files.forEach(f => { home[f] = c.id; }));
  const moved = new Set<number>();
  const targets = new Set([...known, ...names.keys()]);
  moves.forEach((m, i) => {
    if (!isRec(m) || typeof m.file !== 'number' || typeof m.to !== 'string') { issues.push({ code: 'M001', message: `moves[${i}] needs a number "file" and a string "to".` }); return; }
    if (!Number.isInteger(m.file) || m.file < 0 || m.file >= ctx.fileCount) { issues.push({ code: 'M002', message: `moves[${i}]: unknown file number ${m.file}. Valid numbers are 0 to ${ctx.fileCount - 1}.` }); return; }
    if (!targets.has(m.to)) { issues.push({ code: 'M002', message: `moves[${i}]: unknown cluster "${m.to}". Declare new clusters in "newClusters".` }); return; }
    if (moved.has(m.file)) { issues.push({ code: 'M002', message: `File ${m.file} is moved more than once.` }); return; }
    moved.add(m.file);
    home[m.file] = m.to;
  });
  if (issues.length) return { ok: false, issues };
  const groups = new Map<string, number[]>();
  home.forEach((c, f) => { if (c !== undefined) { if (!groups.has(c)) groups.set(c, []); groups.get(c)!.push(f); } });
  const unnamed = [...groups.keys()].filter(c => !names.has(c));
  if (unnamed.length) return { ok: false, issues: [{ code: 'M005', message: `These clusters keep files but have no entry in "clusters" or "newClusters": ${unnamed.slice(0, 8).join(', ')}.` }] };
  return { ok: true, issues, value: { components: [...groups].map(([c, files]) => ({ ...names.get(c)!, files })) } };
}
