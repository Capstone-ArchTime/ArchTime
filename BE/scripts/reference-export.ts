/**
 * T6: prepares a (final) reference architecture for import into the repository's workspace (Công, before C11).
 *
 *   npx tsx scripts/reference-export.ts --checkout <dir> --ref <repo>.final.json [--out <payload.json>]
 *
 * Compresses file-by-file prefixes into folder prefixes without changing any assignment (checked file by file), checks
 * the workspace's limits (≤ 40 components, ≤ 50 prefixes each), and writes:
 *   <out>      the body of PUT /api/projects/:id/architecture/reference ({ components: [{ name, prefixes }] })
 *   <out>.txt  the same in the Quality panel's text format ("Name: prefix, prefix" per line)
 * Exits with code 1 when the reference cannot be imported as it is.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { isAnalyzable } from "../src/domain/architecture/buildView.js";
import { parseReferenceFile } from "../src/domain/evaluation/referenceAgreement.js";
import { exportReference, panelText } from "../src/domain/evaluation/referenceExport.js";

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i;
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
try {
  const checkout = arg("checkout"), file = arg("ref");
  if (!checkout || !file) throw new Error("Usage: npx tsx scripts/reference-export.ts --checkout <dir> --ref <file.json> [--out <payload.json>]");
  const ref = parseReferenceFile(JSON.parse(fs.readFileSync(file, "utf8")), file);
  const head = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  if (!head.startsWith(ref.commit) && !ref.commit.startsWith(head)) throw new Error(`The checkout is at ${head.slice(0, 7)}, the reference describes ${ref.commit.slice(0, 7)}.`);
  const files = execFileSync("git", ["-C", checkout, "ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n").map(f => f.trim()).filter(f => SOURCE.test(f) && isAnalyzable(f));
  const result = exportReference(ref.components, files);
  const before = ref.components.reduce((n, c) => n + c.prefixes.length, 0), after = result.components.reduce((n, c) => n + c.prefixes.length, 0);
  console.log(`${ref.repo} @ ${ref.commit.slice(0, 7)}: ${result.components.length} components, ${before} prefixes -> ${after}; ${result.assigned} files assigned; same assignment: ${result.identical ? "yes" : "NO"}`);
  for (const c of result.components) console.log(`  ${String(c.prefixes.length).padStart(3)} prefixes  ${c.name}`);
  const out = arg("out") ?? file.replace(/\.json$/i, ".import.json");
  fs.writeFileSync(out, `${JSON.stringify({ components: result.components }, null, 2)}\n`);
  fs.writeFileSync(`${out}.txt`, `${panelText(result.components)}\n`);
  console.log(`Wrote ${out} (API body) and ${out}.txt (Quality panel text).`);
  if (result.problems.length) {
    console.log(`Cannot be imported as it is:\n- ${result.problems.join("\n- ")}`);
    process.exitCode = 1;
  }
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
