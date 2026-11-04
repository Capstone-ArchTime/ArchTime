import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  compareEdges, labelSheet, labelledFiles, parseGroundTruth, prf, renderReport, sampleFiles, summarize,
} from "../src/domain/evaluation/extractor.ts";
import { extractDependencies } from "../src/infrastructure/services/DependencyExtractor.ts";
import { fileDependencies } from "../src/domain/architecture/buildView.ts";

const COMMIT = "a".repeat(40);
const truth = (files, extra = {}) => parseGroundTruth({ repo: "demo", commit: COMMIT, labeledBy: ["A"], files, ...extra });

test("Extractor eval: precision, recall and F1, with n/a instead of a made-up 0", () => {
  assert.deepEqual(prf(8, 2, 2), { tp: 8, fp: 2, fn: 2, precision: 0.8, recall: 0.8, f1: 0.8000000000000002 });
  assert.deepEqual(prf(0, 0, 0), { tp: 0, fp: 0, fn: 0, precision: null, recall: null, f1: null });
  assert.equal(prf(0, 3, 2).f1, 0, "measured and all wrong is 0");
  assert.equal(prf(0, 0, 4).precision, null, "nothing predicted: precision is undefined");
});

test("Extractor eval: only labelled files are scored, and only their outgoing edges", () => {
  const gt = truth({ "src/a.ts": ["src/b.ts", "src/c.ts"], "src/b.ts": [], "src/d.ts": null });
  const result = compareEdges([
    { source: "src/a.ts", target: "src/b.ts" }, // right
    { source: "src/a.ts", target: "src/z.ts" }, // wrong
    { source: "src/b.ts", target: "src/a.ts" }, // wrong: b depends on nothing
    { source: "src/d.ts", target: "src/a.ts" }, // d is not labelled yet: ignored
    { source: "src/x.ts", target: "src/a.ts" }, // outside the sample: ignored
  ], gt);
  assert.deepEqual(result.tp, [{ source: "src/a.ts", target: "src/b.ts" }]);
  assert.deepEqual(result.fp, [{ source: "src/a.ts", target: "src/z.ts" }, { source: "src/b.ts", target: "src/a.ts" }]);
  assert.deepEqual(result.fn, [{ source: "src/a.ts", target: "src/c.ts" }]);
  assert.deepEqual(result.pending, ["src/d.ts"]);
  assert.deepEqual(labelledFiles(gt), ["src/a.ts", "src/b.ts"]);
});

test("Extractor eval: micro pools the counts, macro averages the repositories", () => {
  const rows = [
    { repo: "big", commit: COMMIT, files: 10, pending: 0, score: prf(90, 10, 0) },
    { repo: "small", commit: COMMIT, files: 10, pending: 0, score: prf(1, 1, 0) },
  ];
  const { micro, macro } = summarize(rows);
  assert.equal(micro.precision, 91 / 102);
  assert.equal(macro.precision, (0.9 + 0.5) / 2);
});

test("Extractor eval: a ground truth is validated and normalised", () => {
  const gt = truth({ ".\\src\\a.ts": ["./src/b.ts", "src/b.ts", "src/a.ts"] }, { agreement: 0.85 });
  assert.deepEqual(gt.files, { "src/a.ts": ["src/b.ts"] }, "slashes, ./, duplicates and self-references");
  assert.equal(gt.agreement, 0.85);
  assert.throws(() => parseGroundTruth({ repo: "x", commit: "HEAD", files: {} }), /commit/);
  assert.throws(() => parseGroundTruth({ repo: "x", commit: COMMIT, files: { "a.ts": "b.ts" } }), /list of paths/);
  assert.throws(() => parseGroundTruth({ repo: "x", commit: COMMIT, files: {}, agreement: 2 }), /agreement/);
});

test("Extractor eval: the sample is reproducible and the sheet starts unlabelled", () => {
  const files = Array.from({ length: 30 }, (_, i) => `src/f${i}.ts`);
  const a = sampleFiles(files, 5, 42);
  assert.deepEqual(a, sampleFiles([...files].reverse(), 5, 42), "same seed, same files, whatever the input order");
  assert.notDeepEqual(a, sampleFiles(files, 5, 43));
  assert.equal(sampleFiles(files, 99, 1).length, 30);
  const sheet = labelSheet("demo", COMMIT.toUpperCase(), a);
  assert.ok(Object.values(sheet.files).every((v) => v === null), "never pre-filled with the extractor's answer");
  assert.equal(sheet.commit, COMMIT);
});

test("Extractor eval: end to end on a small repository with known dependencies", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "extractor-eval-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); };
  write("src/a.ts", "import { b } from './b';\nimport type { C } from './c';\nexport * from './d';\nimport express from 'express';\n");
  write("src/b.ts", "const e = require('./e');\nexport const b = 1;\n");
  write("src/c.ts", "export type C = number;\n");
  write("src/d.ts", "export const d = 1;\n");
  write("src/e.ts", "module.exports = 1;\n");

  const { edges } = fileDependencies(extractDependencies(dir));
  // Written by reading the files above, per LABEL_RULES; the extractor's output was not used.
  const gt = truth({ "src/a.ts": ["src/b.ts", "src/c.ts", "src/d.ts"], "src/b.ts": ["src/e.ts"] });
  const result = compareEdges(edges, gt);
  assert.deepEqual(result.tp.map((e) => e.target), ["src/b.ts", "src/c.ts"], "import and import type are found");
  assert.deepEqual(result.fn, [{ source: "src/a.ts", target: "src/d.ts" }, { source: "src/b.ts", target: "src/e.ts" }],
    "export-from and require() are missed by the current extractor: the evaluation shows it");
  assert.deepEqual(result.fp, [], "npm packages never count as file dependencies");

  const report = renderReport({ generatedAt: new Date("2026-11-05T00:00:00Z"), extractor: "test", rows: [{ repo: "demo", commit: COMMIT, files: 2, pending: 0, score: prf(2, 0, 2) }], details: [{ repo: "demo", comparison: result }] });
  assert.match(report, /\| demo \| `aaaaaaa` \| 2 \| 0 \| 2 \| 0 \| 2 \| 100\.0% \| 50\.0% \| 66\.7% \|/);
  assert.match(report, /`src\/b\.ts` → `src\/e\.ts`/);
});

test("Extractor eval: the script refuses a checkout at another commit than the labels", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "extractor-cli-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x.io", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x.io" };
  const git = (...a) => execFileSync("git", a, { cwd: dir, env, encoding: "utf8" });
  git("init", "-q");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "a.ts"), "import './b';\n");
  fs.writeFileSync(path.join(dir, "src", "b.ts"), "export {};\n");
  git("add", ".");
  git("commit", "-q", "-m", "init");

  const script = path.resolve(import.meta.dirname, "../scripts/extractor-eval.ts");
  const run = (...args) => {
    try { return { code: 0, out: execFileSync(process.execPath, ["--import", "tsx", script, ...args], { cwd: path.dirname(path.dirname(script)), encoding: "utf8", stdio: "pipe" }) }; }
    catch (e) { return { code: e.status, out: `${e.stdout}${e.stderr}` }; }
  };
  const sheetFile = path.join(dir, "sheet.json");
  const sampled = run("sample", "--checkout", dir, "--repo", "demo", "--n", "5", "--out", sheetFile);
  assert.equal(sampled.code, 0, sampled.out);
  const sheet = JSON.parse(fs.readFileSync(sheetFile, "utf8"));
  assert.deepEqual(Object.keys(sheet.files), ["src/a.ts", "src/b.ts"]);
  assert.equal(run("sample", "--checkout", dir, "--repo", "demo", "--out", sheetFile).code, 1, "never overwrites a sheet that may hold labels");

  sheet.files = { "src/a.ts": ["src/b.ts"], "src/b.ts": [] };
  fs.writeFileSync(sheetFile, JSON.stringify(sheet));
  const scored = run("score", "--truth", sheetFile, "--checkout", dir, "--out", path.join(dir, "results"));
  assert.equal(scored.code, 0, scored.out);
  assert.match(fs.readFileSync(path.join(dir, "results", "report.md"), "utf8"), /\| demo \| .* \| 1 \| 0 \| 0 \| 100\.0% \| 100\.0% \| 100\.0% \|/);

  sheet.commit = "b".repeat(40);
  fs.writeFileSync(sheetFile, JSON.stringify(sheet));
  const wrongCommit = run("score", "--truth", sheetFile, "--checkout", dir, "--out", path.join(dir, "results"));
  assert.equal(wrongCommit.code, 1);
  assert.match(wrongCommit.out, /labelled at bbbbbbb/);
});
