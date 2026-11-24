// Syntax coverage of the dependency extractor (DependencyExtractor.moduleSpecifiers / extractDependencies) and the
// extractor-evaluation helpers added for the research audit (labelAgreement, validateSheet, resultsJson).
// The default profile 'es-import' is the extractor the frozen test-set method was mined with: its behaviour is pinned
// here so that an accidental change to mining shows up as a failing test.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { extractDependencies, moduleSpecifiers } from "../src/infrastructure/services/DependencyExtractor.ts";
import { fileDependencies } from "../src/domain/architecture/buildView.ts";
import { labelAgreement, parseGroundTruth, prf, resultsJson, validateSheet } from "../src/domain/evaluation/extractor.ts";

const parse = (code, name = "x.ts") => ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true);
const COMMIT = "c".repeat(40);

const SOURCE = [
  "import def from './default';",            // default import
  "import { named } from './named';",       // named import
  "import * as ns from './namespace';",     // namespace import
  "import './side-effect';",                // side-effect import
  "import type { T } from './types-only';", // type-only import
  "export * from './reexport-all';",        // re-export
  "export { a } from './reexport-named';",  // named re-export
  "export type { U } from './reexport-type';",
  "import eq = require('./import-equals');",
  "const cjs = require('./commonjs');",
  "const tpl = require(`./template`);",
  "async function f() { await import('./dynamic'); }",
  "if (x) { const lazy = require('./nested-require'); }",
  "const computed = require(name);",        // computed: never guessed
  "const dyn = import(`./${name}`);",       // template with substitution: never guessed
  "const notRequire = load('./not-a-require');",
  "obj.require('./member-require');",       // a method named require is not CommonJS require
  "export const local = 1;",                // export without from: no edge
].join("\n");

test("es-import (frozen default) reads only top-level import declarations", () => {
  assert.deepEqual(moduleSpecifiers(parse(SOURCE)), ["./default", "./named", "./namespace", "./side-effect", "./types-only"]);
  assert.deepEqual(moduleSpecifiers(parse(SOURCE), "es-import"), moduleSpecifiers(parse(SOURCE)), "es-import is the default");
});

test("all-static adds re-exports, require(), import-equals and literal dynamic import(), never computed specifiers", () => {
  assert.deepEqual(moduleSpecifiers(parse(SOURCE), "all-static"), [
    "./default", "./named", "./namespace", "./side-effect", "./types-only",
    "./reexport-all", "./reexport-named", "./reexport-type",
    "./import-equals", "./commonjs", "./template", "./dynamic", "./nested-require",
  ]);
});

test("all-static reads plain JavaScript (CommonJS) files too", () => {
  const js = "const a = require('./a');\nmodule.exports = { b: require('../b/index.js') };\n";
  assert.deepEqual(moduleSpecifiers(parse(js, "x.js"), "all-static"), ["./a", "../b/index.js"]);
  assert.deepEqual(moduleSpecifiers(parse(js, "x.js")), [], "the frozen extractor sees no dependency in CommonJS");
});

function repo(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "extractor-syntax-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  return dir;
}

test("extension and index resolution, packages dropped, unresolved imports dropped (both profiles)", (t) => {
  const dir = repo(t, {
    "src/a.ts": [
      "import { b } from './b';",          // extension-less → b.ts
      "import { c } from './c.js';",       // .js written for a .ts file
      "import { d } from './lib';",        // folder → lib/index.tsx
      "import x from 'express';",          // npm package: not a file dependency
      "import y from './missing';",        // unresolved: no edge, no crash
      "export * from './e';",
    ].join("\n"),
    "src/b.ts": "export const b = 1;\n",
    "src/c.ts": "export const c = 1;\n",
    "src/lib/index.tsx": "export const d = 1;\n",
    "src/e.ts": "export const e = 1;\n",
    "src/f.cjs": "module.exports = require('./b');\n",
    "src/g.mjs": "export { b } from './b.js';\n",
  });
  const frozen = fileDependencies(extractDependencies(dir));
  assert.deepEqual(frozen.edges.map(e => `${e.source}>${e.target}`), ["src/a.ts>src/b.ts", "src/a.ts>src/c.ts", "src/a.ts>src/lib/index.tsx"]);
  assert.ok(!frozen.files.includes("src/f.cjs"), "the frozen extractor does not read .cjs/.mjs files");

  const extended = fileDependencies(extractDependencies(dir, { moduleSyntax: "all-static" }));
  assert.deepEqual(extended.edges.map(e => `${e.source}>${e.target}`), [
    "src/a.ts>src/b.ts", "src/a.ts>src/c.ts", "src/a.ts>src/e.ts", "src/a.ts>src/lib/index.tsx",
    "src/f.cjs>src/b.ts", "src/g.mjs>src/b.ts",
  ]);
});

test("labelAgreement: Jaccard over the files both labelled, with the disagreements listed", () => {
  const sheet = (files) => parseGroundTruth({ repo: "demo", commit: COMMIT, labeledBy: ["x"], files });
  const a = sheet({ "a.ts": ["b.ts", "c.ts"], "b.ts": [], "c.ts": ["a.ts"], "d.ts": null });
  const b = sheet({ "a.ts": ["b.ts"], "b.ts": [], "c.ts": ["a.ts", "d.ts"], "d.ts": ["a.ts"] });
  const r = labelAgreement(a, b);
  assert.equal(r.files, 3, "d.ts is unlabelled in A, so it is not compared");
  assert.deepEqual([r.both, r.onlyA, r.onlyB], [2, 1, 1]);
  assert.equal(r.jaccard, 0.5);
  assert.deepEqual(r.disagreements, [{ file: "a.ts", onlyA: ["c.ts"], onlyB: [] }, { file: "c.ts", onlyA: [], onlyB: ["d.ts"] }]);
  assert.equal(labelAgreement(sheet({ "a.ts": [] }), sheet({ "a.ts": [] })).jaccard, null, "no edge on either side: undefined, not 1");
  assert.throws(() => labelAgreement(a, parseGroundTruth({ repo: "other", commit: COMMIT, files: {} })), /different repositories/);
  assert.throws(() => labelAgreement(a, parseGroundTruth({ repo: "demo", commit: "d".repeat(40), files: {} })), /different commits/);
});

test("validateSheet: pending files, missing paths and excluded targets are reported", () => {
  const truth = parseGroundTruth({ repo: "demo", commit: COMMIT, labeledBy: [], files: { "a.ts": ["b.ts", "a.test.ts", "gone.ts", "styles.css"], "b.ts": null } });
  const exists = (p) => p !== "gone.ts";
  const problems = validateSheet(truth, exists);
  const errors = problems.filter(p => p.severity === "error").map(p => p.message);
  const warnings = problems.filter(p => p.severity === "warning").map(p => p.message);
  assert.ok(errors.some(m => /1 of 2 files are not labelled/.test(m)));
  assert.ok(errors.some(m => /gone\.ts: the target does not exist/.test(m)));
  assert.ok(warnings.some(m => /a\.test\.ts: the labelling rules exclude/.test(m)));
  assert.ok(warnings.some(m => /styles\.css: the labelling rules exclude/.test(m)));
  assert.ok(warnings.some(m => /labeledBy is empty/.test(m)));
  assert.ok(warnings.some(m => /agreement is null/.test(m)));
});

test("resultsJson: machine-readable, not final while files are pending, null denominators kept null", () => {
  const rows = [
    { repo: "a", commit: COMMIT, files: 40, pending: 0, score: prf(30, 10, 10) },
    { repo: "b", commit: COMMIT, files: 39, pending: 1, score: prf(0, 0, 5) },
  ];
  const r = resultsJson({ generatedAt: new Date("2026-11-24T00:00:00Z"), extractor: "x", moduleSyntax: "es-import", backendCommit: null, rows });
  assert.equal(r.final, false);
  assert.equal(r.micro.tp, 30);
  assert.equal(r.repositories[1].score.precision, null);
  assert.equal(r.macro.precision, 0.75, "b has no precision, so it does not enter the macro mean");
  assert.equal(r.macro.recall, (0.75 + 0) / 2);
});

test("CLI: score --syntax both writes one folder per profile with results.json and summary.csv; agree and validate run", async (t) => {
  const { execFileSync } = await import("node:child_process");
  const dir = repo(t, { "src/a.ts": "import './b';\nexport * from './c';\n", "src/b.ts": "export {};\n", "src/c.ts": "export {};\n" });
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x.io", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x.io" };
  const git = (...a) => execFileSync("git", a, { cwd: dir, env, encoding: "utf8", stdio: "pipe" });
  git("init", "-q"); git("add", "."); git("commit", "-q", "-m", "init");
  const head = git("rev-parse", "HEAD").trim();
  const script = path.resolve(import.meta.dirname, "../scripts/extractor-eval.ts");
  const run = (...args) => {
    try { return { code: 0, out: execFileSync(process.execPath, ["--import", "tsx", script, ...args], { cwd: path.dirname(path.dirname(script)), encoding: "utf8", stdio: "pipe" }) }; }
    catch (e) { return { code: e.status, out: `${e.stdout}${e.stderr}` }; }
  };
  const sheet = (name, files) => { const f = path.join(dir, name); fs.writeFileSync(f, JSON.stringify({ repo: "demo", commit: head, labeledBy: ["A", "B"], agreement: 1, files })); return f; };
  // Labels written from the three files above (a imports b and re-exports c), not from the extractor.
  const truthFile = sheet("truth.json", { "src/a.ts": ["src/b.ts", "src/c.ts"], "src/b.ts": [], "src/c.ts": [] });
  const out = path.join(dir, "results");
  const scored = run("score", "--truth", truthFile, "--checkout", dir, "--out", out, "--syntax", "both");
  assert.equal(scored.code, 0, scored.out);
  const frozen = JSON.parse(fs.readFileSync(path.join(out, "es-import", "results.json"), "utf8"));
  const extended = JSON.parse(fs.readFileSync(path.join(out, "all-static", "results.json"), "utf8"));
  assert.deepEqual([frozen.micro.tp, frozen.micro.fn], [1, 1], "the frozen extractor misses the re-export");
  assert.deepEqual([extended.micro.tp, extended.micro.fn, extended.micro.fp], [2, 0, 0]);
  assert.equal(frozen.final, true);
  assert.match(fs.readFileSync(path.join(out, "es-import", "summary.csv"), "utf8"), /^scope,files,pending,tp,fp,fn,precision,recall,f1/);

  const other = sheet("b.json", { "src/a.ts": ["src/b.ts"], "src/b.ts": [], "src/c.ts": [] });
  const agreed = run("agree", "--a", truthFile, "--b", other, "--out", path.join(dir, "agree.json"));
  assert.equal(agreed.code, 0, agreed.out);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "agree.json"), "utf8")).jaccard, 0.5);
  assert.equal(run("validate", "--truth", truthFile, "--checkout", dir).code, 0);
  const pending = sheet("pending.json", { "src/a.ts": null });
  assert.equal(run("validate", "--truth", pending, "--checkout", dir).code, 1, "a sheet with unlabelled files is not ready to score");
});
