#!/usr/bin/env node
// Lists the committed tests (BM04 §6, §8) that exist in the code, by the ID their name starts with, so the team can see
// how many of the 101 committed tests run in CI (at least 52 must). A committed test is found when its name contains an
// ID such as FE-08-TC01, SM-05, DS-04a, N-04 or "WF-04 end to end". Every test file under BE/tests and FE/tests runs in CI
// (.github/workflows/ci.yml runs `npm test` in both, with a MongoDB service for the back end).
//
//   node scripts/committed-tests.mjs            Markdown table of every committed test found
//   node scripts/committed-tests.mjs --summary  Counts per ID prefix only
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ID = /\b(FE-\d{2}-TC\d{2}|SM-\d{2}|DS-\d{2}[a-z]?|N-\d{2}|WF-\d{2} end to end)\b/g;
const TEST = /^\s*(?:test|it)\(\s*(["'`])((?:\\.|(?!\1).)*)\1/gm;

const rows = [];
for (const side of ["BE", "FE"]) {
  const dir = path.join(root, side, "tests");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".test.mjs")).sort()) {
    const source = readFileSync(path.join(dir, file), "utf8");
    for (const match of source.matchAll(TEST)) {
      const name = match[2];
      const ids = [...new Set(name.match(ID) ?? [])];
      if (ids.length) rows.push({ ids, file: `${side}/tests/${file}`, name });
    }
  }
}

const prefixOf = (id) => (id.startsWith("FE-") ? id.slice(0, 5) : id.startsWith("WF-") ? "E2E" : id.replace(/-.*/, ""));
if (process.argv.includes("--summary")) {
  const counts = new Map();
  for (const r of rows) for (const id of r.ids) counts.set(prefixOf(id), (counts.get(prefixOf(id)) ?? 0) + 1);
  for (const [prefix, n] of [...counts].sort()) console.log(`${prefix.padEnd(6)} ${n}`);
  console.log(`tests   ${rows.length} (all in CI)`);
} else {
  console.log("| ID | Test | File | In CI |");
  console.log("| --- | --- | --- | --- |");
  for (const r of rows) console.log(`| ${r.ids.join(", ")} | ${r.name.replace(/\|/g, "\\|")} | \`${r.file}\` | yes |`);
  console.log(`\n${rows.length} committed tests found.`);
}
