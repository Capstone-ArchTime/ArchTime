// Agreement between two independently written reference architectures of one repository (T1, T6; RQ1 protocol §2.3,
// BM04 RF-24). Each reference is a list of components with path prefixes (a prefix may be a whole file path). Files are
// assigned exactly as ArchTime assigns them when it scores against a reference (quality.ts referenceGrouping: the most
// specific matching prefix wins), and the two groupings are compared with the MoJoFM implementation the RQ1 report uses
// (mojo.ts, checked against brute force in tests/mojo.test.mjs). Pure: the caller lists the repository's files.

import { mojoFM, type MojoFmResult } from "../architecture/mojo.js";
import { referenceGrouping, type ReferenceComponent } from "../architecture/quality.js";

export interface ReferenceFile {
  repo: string;
  /** The commit the reference describes; the files it is compared on are listed at this commit. */
  commit: string;
  /** Who wrote it. Two references of a repository must have different authors (independence). */
  author: string;
  writtenAt?: string;
  /** Documents read while writing it (ARCHITECTURE.md, ADRs, docs pages). */
  sources?: string[];
  components: (ReferenceComponent & { responsibility?: string; evidence?: string[] })[];
}

export class ReferenceFileError extends Error {}

const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Checks the shape of a reference file; throws ReferenceFileError naming what is wrong. */
export function parseReferenceFile(raw: unknown, label = "reference"): ReferenceFile {
  if (!raw || typeof raw !== "object") throw new ReferenceFileError(`${label}: not a JSON object.`);
  const r = raw as Record<string, unknown>;
  for (const field of ["repo", "commit", "author"] as const) if (!isText(r[field])) throw new ReferenceFileError(`${label}: "${field}" is required.`);
  if (!Array.isArray(r.components) || r.components.length < 2) throw new ReferenceFileError(`${label}: "components" needs at least two components.`);
  const names = new Set<string>();
  const components = r.components.map((c, i) => {
    const comp = c as Record<string, unknown>;
    if (!isText(comp?.name)) throw new ReferenceFileError(`${label}: component ${i + 1} has no name.`);
    const name = comp.name.trim();
    if (names.has(name)) throw new ReferenceFileError(`${label}: component "${name}" appears twice.`);
    names.add(name);
    if (!Array.isArray(comp.prefixes) || !comp.prefixes.length || !comp.prefixes.every(isText)) throw new ReferenceFileError(`${label}: component "${name}" needs at least one path prefix.`);
    return {
      name,
      prefixes: (comp.prefixes as string[]).map(p => p.trim().replace(/^\.?\/+/, "")),
      ...(isText(comp.responsibility) ? { responsibility: comp.responsibility.trim() } : {}),
      ...(Array.isArray(comp.evidence) ? { evidence: comp.evidence.filter(isText) } : {}),
    };
  });
  return {
    repo: (r.repo as string).trim(), commit: (r.commit as string).trim().toLowerCase(), author: (r.author as string).trim(),
    ...(isText(r.writtenAt) ? { writtenAt: r.writtenAt } : {}),
    ...(Array.isArray(r.sources) ? { sources: r.sources.filter(isText) } : {}),
    components,
  };
}

export interface CoverageReport {
  components: number;
  /** Files of the repository the reference assigns to a component. */
  covered: number;
  total: number;
  /** Prefixes that match no file at the commit: typos, or paths from another version. */
  deadPrefixes: string[];
}

export interface AgreementReport {
  repo: string;
  commit: string;
  authors: [string, string];
  a: CoverageReport;
  b: CoverageReport;
  /** Files both references assign. MoJoFM is computed on these only. */
  common: number;
  /** MoJoFM(A → B): how much of B is reached from A (B taken as right), and the reverse. Null below two common files. */
  aToB: MojoFmResult | null;
  bToA: MojoFmResult | null;
  /** The lower of the two directions: the figure to report, as MoJoFM is not symmetric. */
  agreement: number | null;
  /** Components of one reference whose files are split over several components of the other (largest share first). */
  splits: { from: "A" | "B"; component: string; into: { component: string; files: number }[] }[];
}

function coverage(ref: ReferenceFile, files: string[], grouping: Map<string, string>): CoverageReport {
  const deadPrefixes = ref.components.flatMap(c => c.prefixes).filter(p => !files.some(f => f.startsWith(p))).sort();
  return { components: ref.components.length, covered: grouping.size, total: files.length, deadPrefixes };
}

function splits(from: "A" | "B", x: Map<string, string>, y: Map<string, string>): AgreementReport["splits"] {
  const byComponent = new Map<string, Map<string, number>>();
  for (const [file, cx] of x) {
    const cy = y.get(file);
    if (!cy) continue;
    const row = byComponent.get(cx) ?? new Map<string, number>();
    row.set(cy, (row.get(cy) ?? 0) + 1);
    byComponent.set(cx, row);
  }
  return [...byComponent.entries()]
    .filter(([, row]) => row.size > 1)
    .map(([component, row]) => ({ from, component, into: [...row.entries()].map(([c, files]) => ({ component: c, files })).sort((p, q) => q.files - p.files || p.component.localeCompare(q.component)) }))
    .sort((p, q) => p.component.localeCompare(q.component));
}

/** Compares two references of the same repository and commit over `files` (the repository's source files there). */
export function compareReferences(a: ReferenceFile, b: ReferenceFile, files: readonly string[]): AgreementReport {
  if (a.repo !== b.repo) throw new ReferenceFileError(`The references describe different repositories (${a.repo}, ${b.repo}).`);
  if (a.commit !== b.commit) throw new ReferenceFileError(`The references describe different commits (${a.commit.slice(0, 7)}, ${b.commit.slice(0, 7)}).`);
  if (a.author.toLowerCase() === b.author.toLowerCase()) throw new ReferenceFileError(`Both references are by ${a.author}: the protocol needs two independent authors.`);
  const list = [...new Set(files)].sort();
  const ga = referenceGrouping(list, a.components), gb = referenceGrouping(list, b.components);
  const aToB = mojoFM(ga, gb), bToA = mojoFM(gb, ga);
  return {
    repo: a.repo, commit: a.commit, authors: [a.author, b.author],
    a: coverage(a, list, ga), b: coverage(b, list, gb),
    common: aToB?.common ?? [...ga.keys()].filter(f => gb.has(f)).length,
    aToB, bToA,
    agreement: aToB && bToA ? Math.min(aToB.score, bToA.score) : null,
    splits: [...splits("A", ga, gb), ...splits("B", gb, ga)],
  };
}

const pct = (x: number, n: number) => (n ? `${((100 * x) / n).toFixed(1)} %` : "n/a");

export function renderAgreement(r: AgreementReport): string {
  const lines = [
    `# Reference agreement: ${r.repo} @ ${r.commit.slice(0, 7)}`,
    "",
    `| | Reference A (${r.authors[0]}) | Reference B (${r.authors[1]}) |`,
    "|---|---|---|",
    `| Components | ${r.a.components} | ${r.b.components} |`,
    `| Files assigned | ${r.a.covered} / ${r.a.total} (${pct(r.a.covered, r.a.total)}) | ${r.b.covered} / ${r.b.total} (${pct(r.b.covered, r.b.total)}) |`,
    `| Prefixes matching no file | ${r.a.deadPrefixes.length ? r.a.deadPrefixes.join(", ") : "none"} | ${r.b.deadPrefixes.length ? r.b.deadPrefixes.join(", ") : "none"} |`,
    "",
    `Files assigned by both: **${r.common}**.`,
    "",
    "| Direction | MoJoFM | Moves + joins | Common files |",
    "|---|---|---|---|",
    `| A → B (B as right) | ${r.aToB ? r.aToB.score.toFixed(2) : "n/a"} | ${r.aToB?.distance ?? "n/a"} | ${r.aToB?.common ?? r.common} |`,
    `| B → A (A as right) | ${r.bToA ? r.bToA.score.toFixed(2) : "n/a"} | ${r.bToA?.distance ?? "n/a"} | ${r.bToA?.common ?? r.common} |`,
    "",
    `**Agreement (lower direction): ${r.agreement === null ? "n/a (fewer than two common files)" : r.agreement.toFixed(2)}**`,
    "",
    "## Components split by the other reference (start reconciliation here)",
    "",
    ...(r.splits.length ? r.splits.map(s => `- ${s.from} "${s.component}" → ${s.into.map(i => `${i.component} (${i.files})`).join(", ")}`) : ["None."]),
    "",
  ];
  return lines.join("\n");
}

// ── Completeness of one reference, and file-level disagreements of two ────────────────────────────────────────────

export interface ReferenceProblem { severity: "error" | "warning"; message: string }

const PLACEHOLDER = /<[^>]*>/;

/**
 * What makes a reference unusable or hard to defend, checked before it is compared or imported: template placeholders
 * left in, components without a responsibility or evidence (the protocol asks for both), a component count outside the
 * 5-15 range of the protocol, a prefix shared by two components, prefixes that match no file, a component that ends up
 * with no file (every prefix of it is shadowed by a more specific one), and folder prefixes written without a trailing
 * "/" that also match a sibling folder (referenceGrouping matches strings, so "app/component" takes "app/components/x").
 */
export function referenceProblems(ref: ReferenceFile, files: readonly string[]): ReferenceProblem[] {
  const problems: ReferenceProblem[] = [];
  const err = (message: string) => problems.push({ severity: "error", message });
  const warn = (message: string) => problems.push({ severity: "warning", message });
  if (PLACEHOLDER.test(ref.author)) err(`author is still a placeholder (${ref.author}).`);
  if (!ref.writtenAt || PLACEHOLDER.test(ref.writtenAt)) warn("writtenAt is missing: record the date the reference was written (it must precede any look at ArchTime output).");
  if (!ref.sources?.length || ref.sources.some(s => PLACEHOLDER.test(s))) warn("sources lists no document read, or still holds template text.");
  if (ref.components.length < 5 || ref.components.length > 15) warn(`${ref.components.length} components: the protocol asks for 5-15 functional components.`);
  const owner = new Map<string, string>();
  for (const c of ref.components) {
    if (PLACEHOLDER.test(c.name)) err(`Component name "${c.name}" is a template placeholder.`);
    if (!c.responsibility || PLACEHOLDER.test(c.responsibility)) err(`Component "${c.name}" has no responsibility sentence.`);
    if (!c.evidence?.length || c.evidence.some(e => PLACEHOLDER.test(e))) err(`Component "${c.name}" lists no evidence (document and section, or code location).`);
    for (const p of c.prefixes) {
      if (PLACEHOLDER.test(p)) err(`Component "${c.name}": prefix "${p}" is a template placeholder.`);
      const first = owner.get(p);
      if (first && first !== c.name) err(`Prefix "${p}" belongs to both "${first}" and "${c.name}".`);
      owner.set(p, c.name);
      const matched = files.filter(f => f.startsWith(p));
      if (!matched.length) warn(`Component "${c.name}": prefix "${p}" matches no file at this commit.`);
      else if (!p.endsWith("/") && !files.includes(p)) {
        const folders = new Set(matched.map(f => f.slice(0, f.indexOf("/", p.length) + 1 || undefined)).filter(x => x.endsWith("/")));
        if (folders.size > 1 || [...folders].some(x => x !== `${p}/`)) warn(`Component "${c.name}": prefix "${p}" has no trailing "/" and matches ${[...folders].slice(0, 3).join(", ")}; end folder prefixes with "/".`);
      }
    }
  }
  const grouping = referenceGrouping([...files], ref.components);
  const used = new Set(grouping.values());
  for (const c of ref.components) if (!used.has(c.name)) warn(`Component "${c.name}" receives no file (no prefix matches, or every match goes to a more specific prefix).`);
  return problems;
}

export interface FileDisagreement {
  file: string;
  /** Component in reference A / B; "" when that reference leaves the file out. */
  a: string;
  b: string;
  kind: "only-in-A" | "only-in-B" | "different-component";
}

/**
 * Files the two references treat differently, for reconciliation: files only one of them covers (unmatched files), and
 * files both cover whose components are not each other's best match (the component of B that holds most of the A
 * component's common files, and vice versa). A file is listed as "different-component" only when the two components
 * are not mutual best matches, so a renamed but identical component produces no rows.
 */
export function fileDisagreements(a: ReferenceFile, b: ReferenceFile, files: readonly string[]): FileDisagreement[] {
  const list = [...new Set(files)].sort();
  const ga = referenceGrouping(list, a.components), gb = referenceGrouping(list, b.components);
  const best = (x: Map<string, string>, y: Map<string, string>) => {
    const tally = new Map<string, Map<string, number>>();
    for (const [f, cx] of x) { const cy = y.get(f); if (!cy) continue; const row = tally.get(cx) ?? new Map<string, number>(); row.set(cy, (row.get(cy) ?? 0) + 1); tally.set(cx, row); }
    return new Map([...tally].map(([cx, row]) => [cx, [...row].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0]))[0][0]]));
  };
  const aToB = best(ga, gb), bToA = best(gb, ga);
  const out: FileDisagreement[] = [];
  for (const f of list) {
    const ca = ga.get(f) ?? "", cb = gb.get(f) ?? "";
    if (!ca && !cb) continue;
    if (!cb) out.push({ file: f, a: ca, b: "", kind: "only-in-A" });
    else if (!ca) out.push({ file: f, a: "", b: cb, kind: "only-in-B" });
    else if (aToB.get(ca) !== cb || bToA.get(cb) !== ca) out.push({ file: f, a: ca, b: cb, kind: "different-component" });
  }
  return out;
}
