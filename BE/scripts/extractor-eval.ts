/**
 * T33: accuracy of the dependency extractor against people's labels. Reads checkouts and JSON files; writes only files.
 *
 *   npm run extractor-eval -- sample --checkout <dir> --repo <name> [--n 40] [--seed 1] [--out <file.json>]
 *       Draws a reproducible sample of source files from the checkout (at its current commit) and writes an empty
 *       labelling sheet: every file is null until a person lists its dependencies (rules inside the sheet).
 *
 *   npm run extractor-eval -- score --truth <file.json> --checkout <dir> [--truth ... --checkout ...] [--out <dir>]
 *       Runs the extractor mining uses on each checkout, which must be at the commit the sheet was labelled at, and
 *       writes report.md (TP/FP/FN, precision, recall, F1 per repository, micro and macro) and edges.csv.
 *
 * Protocol and threats: docs/evaluation-protocol.md, section "Extractor accuracy".
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { extractDependencies } from "../src/infrastructure/services/DependencyExtractor.js";
import { fileDependencies, isAnalyzable } from "../src/domain/architecture/buildView.js";
import {
  compareEdges, labelSheet, labelledFiles, parseGroundTruth, prf, renderReport, sampleFiles,
  type Comparison, type RepoScore,
} from "../src/domain/evaluation/extractor.js";
import { toCsv } from "../src/domain/evaluation/rq1.js";

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i;

function headOf(dir: string): string {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  } catch {
    throw new Error(`${dir} is not a git checkout.`);
  }
}

function options(argv: string[]) {
  const values: Record<string, string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (!name.startsWith("--") || argv[i + 1] === undefined) throw new Error(`Unexpected argument: ${name}`);
    (values[name.slice(2)] ??= []).push(argv[++i]);
  }
  return values;
}

function sample(argv: string[]) {
  const o = options(argv);
  const checkout = o.checkout?.[0];
  const repo = o.repo?.[0];
  if (!checkout || !repo) throw new Error("sample needs --checkout <dir> and --repo <name>.");
  const n = Number(o.n?.[0] ?? 40);
  const seed = Number(o.seed?.[0] ?? 1);
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(seed)) throw new Error("--n and --seed must be whole numbers.");
  const commit = headOf(checkout);
  // The pool is what the extractor itself considers analyzable source, plus the JS/TS file kinds it may miss
  // (.mjs, .cjs, ...), so a gap in what it reads shows up as missed dependencies instead of being sampled away.
  const { files: analyzable } = fileDependencies(extractDependencies(checkout));
  const listed = execFileSync("git", ["-C", checkout, "ls-files"], { encoding: "utf8" }).split("\n").filter(f => SOURCE.test(f));
  const pool = [...new Set([...analyzable, ...listed.filter(isAnalyzable)])];
  const files = sampleFiles(pool, n, seed);
  const out = o.out?.[0] ?? path.join("eval", "extractor", `${repo.replace(/[^a-z0-9._-]+/gi, "-")}.json`);
  if (fs.existsSync(out)) throw new Error(`${out} exists; it may hold labels. Choose another --out or move it first.`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify({ ...labelSheet(repo, commit, files), sample: { n, seed, pool: pool.length } }, null, 2)}\n`);
  console.log(`Wrote ${out}: ${files.length} of ${pool.length} source files at ${commit.slice(0, 7)} (seed ${seed}). Fill in each file's dependencies.`);
}

function score(argv: string[]) {
  const o = options(argv);
  const truths = o.truth ?? [];
  const checkouts = o.checkout ?? [];
  if (!truths.length || truths.length !== checkouts.length) throw new Error("score needs one --checkout for each --truth, in the same order.");
  const out = o.out?.[0] ?? "extractor-results";
  const rows: RepoScore[] = [];
  const details: { repo: string; comparison: Comparison }[] = [];
  const csv: { repo: string; source: string; target: string; verdict: string }[] = [];

  truths.forEach((file, i) => {
    const truth = parseGroundTruth(JSON.parse(fs.readFileSync(file, "utf8")), file);
    const checkout = checkouts[i];
    const head = headOf(checkout);
    if (!head.startsWith(truth.commit) && !truth.commit.startsWith(head)) {
      throw new Error(`${checkout} is at ${head.slice(0, 7)}, but ${file} was labelled at ${truth.commit.slice(0, 7)}. Check that commit out first.`);
    }
    for (const f of labelledFiles(truth)) {
      for (const p of [f, ...(truth.files[f] ?? [])]) {
        if (!fs.existsSync(path.join(checkout, p))) console.warn(`${file}: ${p} does not exist in the checkout; check the label.`);
      }
    }
    const { edges } = fileDependencies(extractDependencies(checkout));
    const comparison = compareEdges(edges, truth);
    rows.push({ repo: truth.repo, commit: truth.commit, files: labelledFiles(truth).length, pending: comparison.pending.length, score: prf(comparison.tp.length, comparison.fp.length, comparison.fn.length) });
    details.push({ repo: truth.repo, comparison });
    for (const [verdict, list] of [["TP", comparison.tp], ["FP", comparison.fp], ["FN", comparison.fn]] as const) {
      for (const e of list) csv.push({ repo: truth.repo, source: e.source, target: e.target, verdict });
    }
  });

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "report.md"), renderReport({ generatedAt: new Date(), extractor: "DependencyExtractor + fileDependencies", rows, details }));
  fs.writeFileSync(path.join(out, "edges.csv"), toCsv(csv));
  console.log(`Wrote ${path.join(out, "report.md")} and edges.csv for ${rows.length} repositor${rows.length === 1 ? "y" : "ies"}.`);
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "sample") sample(rest);
  else if (command === "score") score(rest);
  else throw new Error('Use "sample" or "score" (see the comment at the top of scripts/extractor-eval.ts).');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
