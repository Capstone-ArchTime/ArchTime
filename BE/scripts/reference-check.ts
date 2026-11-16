/**
 * T1 / T6: checks ONE reference file against a checkout before it is compared: the file parses, every prefix matches a
 * file, and how many analysed source files each component and the whole reference cover.
 *
 *   npm run reference-check -- --checkout <dir> --ref <repo>.<author>.json
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { isAnalyzable } from "../src/domain/architecture/buildView.js";
import { referenceGrouping } from "../src/domain/architecture/quality.js";
import { parseReferenceFile } from "../src/domain/evaluation/referenceAgreement.js";

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i;
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
try {
  const checkout = arg("checkout"), file = arg("ref");
  if (!checkout || !file) throw new Error("Usage: npm run reference-check -- --checkout <dir> --ref <file.json>");
  const ref = parseReferenceFile(JSON.parse(fs.readFileSync(file, "utf8")), file);
  const head = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  if (!head.startsWith(ref.commit) && !ref.commit.startsWith(head)) throw new Error(`The checkout is at ${head.slice(0, 7)}, the reference describes ${ref.commit.slice(0, 7)}.`);
  const files = execFileSync("git", ["-C", checkout, "ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n").map(f => f.trim()).filter(f => SOURCE.test(f) && isAnalyzable(f));
  const grouping = referenceGrouping(files, ref.components);
  const dead = ref.components.flatMap(c => c.prefixes).filter(p => !files.some(f => f.startsWith(p)));
  console.log(`${ref.repo} @ ${ref.commit.slice(0, 7)} by ${ref.author}`);
  console.log(`Components: ${ref.components.length}; files assigned: ${grouping.size} / ${files.length} (${((100 * grouping.size) / files.length).toFixed(1)} %)`);
  for (const c of ref.components) console.log(`  ${String([...grouping.values()].filter(v => v === c.name).length).padStart(5)}  ${c.name}`);
  console.log(dead.length ? `Prefixes matching no file: ${dead.join(", ")}` : "Every prefix matches at least one file.");
  if (dead.length) process.exitCode = 1;
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
