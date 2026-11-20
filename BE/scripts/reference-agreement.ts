/**
 * T1 / T6 (RF-24): agreement between two independently written reference architectures of one repository.
 *
 *   npm run reference-agreement -- --checkout <dir> --a <refA.json> --b <refB.json> [--out <report.md>]
 *
 * The checkout must be at the commit both references name. The files compared are the repository's source files that
 * ArchTime analyses (git ls-files, JS/TS, without tests, build output and declarations), assigned to components as the
 * RQ1 report assigns them, and compared with the same MoJoFM. Reads only; writes the report (default: print it).
 * Reference format and rules: docs/architecture-references/README.md.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isAnalyzable } from "../src/domain/architecture/buildView.js";
import { compareReferences, parseReferenceFile, renderAgreement } from "../src/domain/evaluation/referenceAgreement.js";

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i;

function args(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) throw new Error(`Unexpected argument: ${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

function main() {
  const o = args(process.argv.slice(2));
  if (!o.checkout || !o.a || !o.b) throw new Error("Usage: npm run reference-agreement -- --checkout <dir> --a <refA.json> --b <refB.json> [--out <report.md>]");
  const a = parseReferenceFile(JSON.parse(fs.readFileSync(o.a, "utf8")), o.a);
  const b = parseReferenceFile(JSON.parse(fs.readFileSync(o.b, "utf8")), o.b);
  const head = execFileSync("git", ["-C", o.checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  if (!head.startsWith(a.commit) && !a.commit.startsWith(head)) {
    throw new Error(`The checkout is at ${head.slice(0, 7)} but the references describe ${a.commit.slice(0, 7)}. Check out that commit first.`);
  }
  const files = execFileSync("git", ["-C", o.checkout, "ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n").map(f => f.trim()).filter(f => SOURCE.test(f) && isAnalyzable(f));
  const report = renderAgreement(compareReferences(a, b, files));
  if (o.out) {
    fs.mkdirSync(path.dirname(o.out), { recursive: true });
    fs.writeFileSync(o.out, report);
    console.log(`Wrote ${o.out}`);
  } else {
    console.log(report);
  }
}

try { main(); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }
