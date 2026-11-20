// Turns a reference architecture into what the workspace accepts (PUT /api/projects/:id/architecture/reference, the
// Quality panel): at most 40 components, names of 1–60 characters, 1–50 path prefixes of at most 200 characters each
// (ArchitectureUseCase.saveReference). A reference written file by file (outline) has hundreds of prefixes per component,
// so it is compressed WITHOUT changing a single assignment: where every analysed file under a folder belongs to one
// component, the folder replaces its files; where most do, the folder goes to that component and the others override it
// with longer prefixes (the most specific prefix wins, as in quality.ts referenceGrouping). The result is checked by
// grouping the files again and comparing file by file. Pure.

import { referenceGrouping, type ReferenceComponent } from "../architecture/quality.js";

/**
 * What a workspace accepts as its reference architecture. Up to 50 prefixes per component was enough for folder-shaped
 * references, but the RQ1 protocol asks for functional references assigned file by file where folders mix functions
 * (outline: 633 prefixes after compression, up to 110 in one component), so a component may have up to 1,000 prefixes,
 * and the whole reference at most 5,000.
 */
export const IMPORT_LIMITS = { components: 40, nameLength: 60, prefixes: 1000, totalPrefixes: 5000, prefixLength: 200 } as const;

export class ReferenceBodyError extends Error {}

/** Validates the body of PUT /architecture/reference: { components: [{ name, prefixes }] }. An empty list removes the reference. */
export function parseReferenceBody(body: unknown): ReferenceComponent[] {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>).components : undefined;
  if (!Array.isArray(raw) || raw.length > IMPORT_LIMITS.components) throw new ReferenceBodyError(`components must be a list of at most ${IMPORT_LIMITS.components} entries.`);
  const seen = new Set<string>();
  let total = 0;
  return raw.map((c, i) => {
    const item = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name || name.length > IMPORT_LIMITS.nameLength) throw new ReferenceBodyError(`components[${i}].name must be 1 to ${IMPORT_LIMITS.nameLength} characters.`);
    if (seen.has(name.toLowerCase())) throw new ReferenceBodyError(`The name "${name}" is used twice.`);
    seen.add(name.toLowerCase());
    const prefixes = Array.isArray(item.prefixes) ? item.prefixes.filter((p): p is string => typeof p === "string").map(p => p.trim()).filter(Boolean) : [];
    if (!prefixes.length || prefixes.length > IMPORT_LIMITS.prefixes || prefixes.some(p => p.length > IMPORT_LIMITS.prefixLength)) {
      throw new ReferenceBodyError(`components[${i}] needs 1 to ${IMPORT_LIMITS.prefixes} path prefixes of at most ${IMPORT_LIMITS.prefixLength} characters.`);
    }
    total += prefixes.length;
    if (total > IMPORT_LIMITS.totalPrefixes) throw new ReferenceBodyError(`A reference may have at most ${IMPORT_LIMITS.totalPrefixes} path prefixes in all.`);
    return { name, prefixes: [...new Set(prefixes)] };
  });
}

interface Node { dirs: Map<string, Node>; files: string[] }

function tree(files: readonly string[]): Node {
  const root: Node = { dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.split("/");
    let node = root;
    for (const dir of parts.slice(0, -1)) {
      let next = node.dirs.get(dir);
      if (!next) { next = { dirs: new Map(), files: [] }; node.dirs.set(dir, next); }
      node = next;
    }
    node.files.push(f);
  }
  return root;
}

/** Components (or null = unassigned) of every file under a node, with counts. */
function census(node: Node, owner: ReadonlyMap<string, string>, out = new Map<string | null, number>()) {
  for (const f of node.files) { const c = owner.get(f) ?? null; out.set(c, (out.get(c) ?? 0) + 1); }
  for (const child of node.dirs.values()) census(child, owner, out);
  return out;
}

/**
 * Prefixes reproducing `owner` on `files`. `inherited` is the component a shorter prefix already gives this folder
 * (undefined: none, files here would stay unassigned).
 */
function emit(node: Node, path: string, owner: ReadonlyMap<string, string>, inherited: string | undefined, out: Map<string, string[]>) {
  const counts = census(node, owner);
  const add = (component: string, prefix: string) => { const list = out.get(component) ?? []; list.push(prefix); out.set(component, list); };
  // A folder prefix may only be used where no file under it is unassigned: it would assign them.
  let here = inherited;
  if (path && !counts.has(null)) {
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    if (top && top[0] !== inherited) { here = top[0]!; add(here, `${path}/`); }
  }
  for (const f of node.files) {
    const c = owner.get(f);
    if (c && c !== here) add(c, f);
  }
  for (const [name, child] of [...node.dirs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    emit(child, path ? `${path}/${name}` : name, owner, here, out);
  }
}

export interface ExportResult {
  components: ReferenceComponent[];
  /** Files the reference assigns among those given, and whether the compressed form assigns each one identically. */
  assigned: number;
  identical: boolean;
  /** Ways the result breaks the import limits; empty when it can be imported. */
  problems: string[];
}

export function exportReference(reference: readonly ReferenceComponent[], files: readonly string[]): ExportResult {
  const list = [...new Set(files)].sort();
  const owner = referenceGrouping(list, [...reference]);
  const out = new Map<string, string[]>();
  emit(tree(list), "", owner, undefined, out);
  const components = reference
    .map(c => ({ name: c.name, prefixes: (out.get(c.name) ?? []).sort() }))
    .filter(c => c.prefixes.length);
  const again = referenceGrouping(list, components);
  const identical = again.size === owner.size && [...owner].every(([f, c]) => again.get(f) === c);
  const problems: string[] = [];
  if (components.length > IMPORT_LIMITS.components) problems.push(`${components.length} components; the workspace accepts at most ${IMPORT_LIMITS.components}.`);
  for (const c of components) {
    if (c.name.length > IMPORT_LIMITS.nameLength) problems.push(`"${c.name}": the name is longer than ${IMPORT_LIMITS.nameLength} characters.`);
    if (c.prefixes.length > IMPORT_LIMITS.prefixes) problems.push(`"${c.name}": ${c.prefixes.length} prefixes after compression; the workspace accepts at most ${IMPORT_LIMITS.prefixes}.`);
    if (c.prefixes.length === 0) problems.push(`"${c.name}": no prefix.`);
    const long = c.prefixes.filter(p => p.length > IMPORT_LIMITS.prefixLength);
    if (long.length) problems.push(`"${c.name}": ${long.length} prefix(es) longer than ${IMPORT_LIMITS.prefixLength} characters.`);
  }
  const total = components.reduce((n, c) => n + c.prefixes.length, 0);
  if (total > IMPORT_LIMITS.totalPrefixes) problems.push(`${total} prefixes in all; the workspace accepts at most ${IMPORT_LIMITS.totalPrefixes}.`);
  if (!identical) problems.push("The compressed reference does not assign every file as the original does.");
  return { components, assigned: owner.size, identical, problems };
}

/** The Quality panel's text format: "Name: prefix, prefix" per line. */
export const panelText = (components: readonly ReferenceComponent[]) => components.map(c => `${c.name}: ${c.prefixes.join(", ")}`).join("\n");
