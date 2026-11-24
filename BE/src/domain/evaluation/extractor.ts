// T33: how accurately the dependency extractor finds the file-to-file dependencies of a repository.
// The extractor's answer (infrastructure/services/DependencyExtractor.ts, resolved by fileDependencies) is compared
// with a ground truth written by people who read the source files. Only people write the ground truth: no output of the
// extractor, of clustering or of an AI model is used for it. Pure functions; scripts/extractor-eval.ts does the I/O.
// Protocol: docs/evaluation-protocol.md, section "Extractor accuracy".

export interface Edge { source: string; target: string }

/**
 * A labelled sample of one repository at one commit. `files` maps each sampled source file to the repository files it
 * depends on; `null` means "not labelled yet" (the file is left out of the score), `[]` means "depends on no file".
 */
export interface GroundTruth {
  repo: string;
  commit: string;
  labeledBy: string[];
  /** Agreement between two labellers before they reconciled, if measured (0..1). */
  agreement: number | null;
  files: Record<string, string[] | null>;
}

export const LABEL_RULES = [
  "For each file under `files`, list every file of this repository it depends on at module level: import, import type,",
  "export ... from, require(), and import() with a literal path. Write repository-relative paths with forward slashes,",
  "as they appear in the tree (src/a/b.ts). Count only source files of the JavaScript/TypeScript family that are not",
  "tests, build output or dependencies (node_modules). Leave out npm packages and Node built-ins. A file that depends",
  "on nothing gets []. Do not look at ArchTime's output while labelling.",
].join(" ");

const HASH = /^[0-9a-f]{7,64}$/i;
const norm = (p: string) => p.trim().replace(/\\/g, "/").replace(/^\.\//, "");

/** Reads a ground-truth file, rejecting anything that would make the score meaningless. */
export function parseGroundTruth(raw: unknown, origin = "ground truth"): GroundTruth {
  const o = raw as Record<string, unknown> | null;
  const fail = (why: string): never => { throw new Error(`${origin}: ${why}`); };
  if (!o || typeof o !== "object") fail("not a JSON object");
  if (typeof o!.repo !== "string" || !o!.repo.trim()) fail("repo is required");
  if (typeof o!.commit !== "string" || !HASH.test(o!.commit)) fail("commit must be the commit hash the files were labelled at");
  const labeledBy = Array.isArray(o!.labeledBy) ? o!.labeledBy.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
  const agreement = o!.agreement === null || o!.agreement === undefined ? null : Number(o!.agreement);
  if (agreement !== null && !(agreement >= 0 && agreement <= 1)) fail("agreement must be between 0 and 1, or null");
  if (!o!.files || typeof o!.files !== "object" || Array.isArray(o!.files)) fail("files must map each sampled file to its dependencies");
  const files: Record<string, string[] | null> = {};
  for (const [file, deps] of Object.entries(o!.files as Record<string, unknown>)) {
    if (deps === null) { files[norm(file)] = null; continue; }
    if (!Array.isArray(deps) || deps.some(d => typeof d !== "string")) fail(`files["${file}"] must be a list of paths, [] or null`);
    files[norm(file)] = [...new Set((deps as string[]).map(norm).filter(d => d && d !== norm(file)))].sort();
  }
  return { repo: (o!.repo as string).trim(), commit: (o!.commit as string).toLowerCase(), labeledBy, agreement, files };
}

/** The files that count: labelled ones. */
export const labelledFiles = (truth: GroundTruth) => Object.keys(truth.files).filter(f => truth.files[f] !== null).sort();

export interface Comparison { tp: Edge[]; fp: Edge[]; fn: Edge[]; pending: string[] }

const key = (e: Edge) => `${e.source}\u0000${e.target}`;
const byKey = (a: Edge, b: Edge) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target);

/** The extractor's edges from the labelled files against the labelled edges. Edges from files outside the sample are ignored. */
export function compareEdges(predicted: Edge[], truth: GroundTruth): Comparison {
  const scope = new Set(labelledFiles(truth));
  const truthEdges = new Map<string, Edge>();
  for (const source of scope) for (const target of truth.files[source] ?? []) truthEdges.set(key({ source, target }), { source, target });
  const predictedEdges = new Map<string, Edge>();
  for (const e of predicted) {
    const edge = { source: norm(e.source), target: norm(e.target) };
    if (scope.has(edge.source) && edge.source !== edge.target) predictedEdges.set(key(edge), edge);
  }
  const tp = [...predictedEdges.values()].filter(e => truthEdges.has(key(e))).sort(byKey);
  const fp = [...predictedEdges.values()].filter(e => !truthEdges.has(key(e))).sort(byKey);
  const fn = [...truthEdges.values()].filter(e => !predictedEdges.has(key(e))).sort(byKey);
  const pending = Object.keys(truth.files).filter(f => truth.files[f] === null).sort();
  return { tp, fp, fn, pending };
}

export interface Prf { tp: number; fp: number; fn: number; precision: number | null; recall: number | null; f1: number | null }

/** Precision, recall and F1; null where the denominator is zero (not 0, which would read as a measured failure). */
export function prf(tp: number, fp: number, fn: number): Prf {
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : precision !== null && recall !== null ? 0 : null;
  return { tp, fp, fn, precision, recall, f1 };
}

export interface RepoScore { repo: string; commit: string; files: number; pending: number; score: Prf }

/** Micro: the counts of every repository pooled. Macro: the mean of each repository's value, over those that have one. */
export function summarize(rows: RepoScore[]): { micro: Prf; macro: { precision: number | null; recall: number | null; f1: number | null } } {
  const sum = (k: "tp" | "fp" | "fn") => rows.reduce((s, r) => s + r.score[k], 0);
  const mean = (k: "precision" | "recall" | "f1") => {
    const xs = rows.map(r => r.score[k]).filter((x): x is number => x !== null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  return { micro: prf(sum("tp"), sum("fp"), sum("fn")), macro: { precision: mean("precision"), recall: mean("recall"), f1: mean("f1") } };
}

/** A seeded pseudo-random generator (mulberry32), so a sample can be drawn again exactly. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` files drawn without replacement; the same files and seed always give the same sample. */
export function sampleFiles(files: string[], n: number, seed: number): string[] {
  const pool = [...new Set(files.map(norm))].sort();
  const next = random(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, Math.min(n, pool.length))).sort();
}

/** An empty sheet for people to fill in: every file starts as null (not labelled), never with the extractor's answer. */
export function labelSheet(repo: string, commit: string, files: string[]): GroundTruth & { rules: string } {
  return { repo, commit: commit.toLowerCase(), labeledBy: [], agreement: null, rules: LABEL_RULES, files: Object.fromEntries(files.map(f => [norm(f), null])) };
}

// ── Two labellers, before they reconcile ──────────────────────────────────────────────────────────────────────────

export interface LabelAgreement {
  /** Files both labellers labelled (non-null in both sheets); only these are compared. */
  files: number;
  /** Edges both listed, only the first listed, only the second listed. */
  both: number; onlyA: number; onlyB: number;
  /** |A ∩ B| / |A ∪ B| over the edges of the compared files; null when neither listed any edge. */
  jaccard: number | null;
  /** Files whose dependency lists differ, with the edges each side alone listed (to reconcile). */
  disagreements: { file: string; onlyA: string[]; onlyB: string[] }[];
}

/** Agreement of two labellers' sheets of the same sample, before reconciliation (docs/extractor-evaluation-report.md §3.4). */
export function labelAgreement(a: GroundTruth, b: GroundTruth): LabelAgreement {
  if (a.repo !== b.repo) throw new Error(`The two sheets are for different repositories (${a.repo}, ${b.repo}).`);
  if (!a.commit.startsWith(b.commit) && !b.commit.startsWith(a.commit)) throw new Error(`The two sheets were labelled at different commits (${a.commit.slice(0, 7)}, ${b.commit.slice(0, 7)}).`);
  const files = Object.keys(a.files).filter(f => a.files[f] !== null && b.files[f] !== null && b.files[f] !== undefined).sort();
  let both = 0, onlyA = 0, onlyB = 0;
  const disagreements: LabelAgreement["disagreements"] = [];
  for (const f of files) {
    const x = new Set(a.files[f]!), y = new Set(b.files[f]!);
    const ax = [...x].filter(d => !y.has(d)).sort(), by = [...y].filter(d => !x.has(d)).sort();
    both += [...x].filter(d => y.has(d)).length;
    onlyA += ax.length; onlyB += by.length;
    if (ax.length || by.length) disagreements.push({ file: f, onlyA: ax, onlyB: by });
  }
  const union = both + onlyA + onlyB;
  return { files: files.length, both, onlyA, onlyB, jaccard: union ? Math.round((both / union) * 10_000) / 10_000 : null, disagreements };
}

export interface SheetProblem { severity: "error" | "warning"; message: string }

/**
 * Completeness and consistency of a labelled sheet before it is scored: every file labelled, every path present in the
 * checkout (`exists`), no labelled dependency that the rules exclude (tests, build output, node_modules, non-JS/TS files).
 */
export function validateSheet(truth: GroundTruth, exists: (path: string) => boolean): SheetProblem[] {
  const problems: SheetProblem[] = [];
  const pending = Object.keys(truth.files).filter(f => truth.files[f] === null);
  if (pending.length) problems.push({ severity: "error", message: `${pending.length} of ${Object.keys(truth.files).length} files are not labelled yet (null).` });
  if (!truth.labeledBy.length) problems.push({ severity: "warning", message: "labeledBy is empty: record who labelled (and reconciled) the sheet." });
  if (truth.agreement === null) problems.push({ severity: "warning", message: "agreement is null: measure the two labellers' agreement before reconciling (extractor-eval agree)." });
  const excluded = /(^|\/)(node_modules|dist|build)\/|\.(test|spec)\.[a-z]+$|\.d\.ts$/i;
  const source = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i;
  for (const [file, deps] of Object.entries(truth.files)) {
    if (!exists(file)) problems.push({ severity: "error", message: `Sampled file ${file} does not exist in the checkout.` });
    for (const d of deps ?? []) {
      if (!exists(d)) problems.push({ severity: "error", message: `${file} → ${d}: the target does not exist in the checkout.` });
      else if (!source.test(d) || excluded.test(d)) problems.push({ severity: "warning", message: `${file} → ${d}: the labelling rules exclude this target (not JS/TS source, a test, build output or a declaration file).` });
    }
  }
  return problems;
}

/** Machine-readable results (results.json): every number in report.md, plus the counts behind it. */
export function resultsJson(input: { generatedAt: Date; extractor: string; moduleSyntax: string; backendCommit: string | null; rows: RepoScore[] }) {
  const { micro, macro } = summarize(input.rows);
  return {
    generatedAt: input.generatedAt.toISOString(),
    extractor: input.extractor,
    moduleSyntax: input.moduleSyntax,
    backendCommit: input.backendCommit,
    conventions: "precision/recall/F1 are null when their denominator is 0; unlabelled (null) files are not scored; macro averages only repositories with a value",
    final: input.rows.every(r => r.pending === 0),
    repositories: input.rows,
    micro,
    macro,
  };
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

export function renderReport(input: { generatedAt: Date; extractor: string; rows: RepoScore[]; details: { repo: string; comparison: Comparison }[] }): string {
  const { micro, macro } = summarize(input.rows);
  const lines: string[] = [
    "# Extractor accuracy (T33)", "",
    `Generated ${input.generatedAt.toISOString()} with ${input.extractor}. Ground truth: people's labels only (docs/evaluation-protocol.md).`, "",
    "| Repository | Commit | Files labelled | Pending | TP | FP | FN | Precision | Recall | F1 |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...input.rows.map(r => `| ${r.repo} | \`${r.commit.slice(0, 7)}\` | ${r.files} | ${r.pending} | ${r.score.tp} | ${r.score.fp} | ${r.score.fn} | ${pct(r.score.precision)} | ${pct(r.score.recall)} | ${pct(r.score.f1)} |`),
    `| **All (micro)** | | ${input.rows.reduce((s, r) => s + r.files, 0)} | ${input.rows.reduce((s, r) => s + r.pending, 0)} | ${micro.tp} | ${micro.fp} | ${micro.fn} | ${pct(micro.precision)} | ${pct(micro.recall)} | ${pct(micro.f1)} |`,
    `| **All (macro)** | | | | | | | ${pct(macro.precision)} | ${pct(macro.recall)} | ${pct(macro.f1)} |`,
    "",
  ];
  if (input.rows.some(r => r.pending)) lines.push("Files still `null` in a ground-truth sheet are not scored; the score is final only when Pending is 0 everywhere.", "");
  for (const { repo, comparison } of input.details) {
    lines.push(`## ${repo}`, "");
    lines.push(`### Missed (false negatives, ${comparison.fn.length})`, "", ...(comparison.fn.length ? comparison.fn.map(e => `- \`${e.source}\` → \`${e.target}\``) : ["- none"]), "");
    lines.push(`### Wrong (false positives, ${comparison.fp.length})`, "", ...(comparison.fp.length ? comparison.fp.map(e => `- \`${e.source}\` → \`${e.target}\``) : ["- none"]), "");
  }
  return lines.join("\n");
}
