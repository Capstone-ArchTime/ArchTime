/**
 * RQ1: evaluates the recovered architecture against the directory baseline on the workspaces already mined in the
 * database, and keeps the change-detection label sheets up to date. Reads the database; writes only files.
 *
 *   npm run rq1                       every workspace that has stored components
 *   npm run rq1 -- --project <id>     one workspace (repeatable)
 *   npm run rq1 -- --out <dir>        output folder (default rq1-results)
 *
 * Output: report.md, recovery.csv, stability.csv, and labels/<workspace>.json to fill in (see docs/rq1-protocol.md).
 * Re-running keeps every label already written.
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectDb } from "../src/config/db.js";
import { ArchitectureService } from "../src/infrastructure/services/ArchitectureService.js";
import { ArchitectureMappingModel } from "../src/infrastructure/database/models/ArchitectureMappingModel.js";
import { ProjectModel } from "../src/infrastructure/database/models/ProjectModel.js";
import { buildLabelSheet, recoveryRows, renderReport, scoreLabels, stabilityRows, toCsv } from "../src/domain/evaluation/rq1.js";
import type { EvaluationInput, LabelSheet, RecoveryRow, StabilityRow } from "../src/domain/evaluation/rq1.js";

function args(argv: string[]) {
  const projects: string[] = [];
  let out = "rq1-results";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project" && argv[i + 1]) projects.push(argv[++i]);
    else if (argv[i] === "--out" && argv[i + 1]) out = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}. Use --project <id> and --out <dir>.`);
  }
  return { projects, out };
}

const slug = (name: string, id: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace"}-${id.slice(-6)}`;

async function main() {
  const { projects: wanted, out } = args(process.argv.slice(2));
  await connectDb();
  const mapped = (await ArchitectureMappingModel.distinct("projectId")).map(String);
  const ids = wanted.length ? wanted : mapped;
  const missing = wanted.filter(id => !mapped.includes(id));
  if (missing.length) console.warn(`No stored components for: ${missing.join(", ")}. Generate their architecture first.`);

  fs.mkdirSync(path.join(out, "labels"), { recursive: true });
  const projects: { name: string; snapshots: number; baselineDepth: number; hasReference: boolean }[] = [];
  const recovery: RecoveryRow[] = [];
  const stability: StabilityRow[] = [];
  const sheets: LabelSheet[] = [];

  const found = await ProjectModel.find({ _id: { $in: ids.filter(i => mapped.includes(i)) } }, { name: 1 }).lean();
  const deleted = ids.filter(i => mapped.includes(i) && !found.some(p => String(p._id) === i));
  if (deleted.length) console.warn(`Skipped components left by deleted workspaces: ${deleted.join(", ")}.`);
  // Workspaces may share a name; the report needs to tell them apart.
  const shared = new Set(found.map(p => p.name).filter((n, i, all) => all.indexOf(n) !== i));
  const label = (p: { _id: unknown; name: string }) => (shared.has(p.name) ? `${p.name} (${String(p._id).slice(-6)})` : p.name);

  for (const project of found) {
    const id = String(project._id);
    const name = label(project);
    const evaluation = (await ArchitectureService.evaluation(id)) as unknown as EvaluationInput;
    projects.push({ name, snapshots: evaluation.snapshots.length, baselineDepth: evaluation.baselineDepth, hasReference: evaluation.hasReference });
    recovery.push(...recoveryRows(name, evaluation));
    stability.push(...stabilityRows(name, evaluation));
    if (evaluation.steps.length === 0) {
      console.log(`${name}: ${evaluation.snapshots.length} snapshot(s), nothing to label`);
      continue;
    }
    const file = path.join(out, "labels", `${slug(project.name, id)}.json`);
    const previous = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as LabelSheet) : null;
    const sheet = buildLabelSheet({ id, name }, evaluation, previous);
    fs.writeFileSync(file, JSON.stringify(sheet, null, 2) + "\n");
    sheets.push(sheet);
    console.log(`${name}: ${evaluation.snapshots.length} snapshots, ${sheet.pairs.length} pairs -> ${file}`);
  }

  const detection = scoreLabels(sheets);
  fs.writeFileSync(path.join(out, "recovery.csv"), toCsv(recovery));
  fs.writeFileSync(path.join(out, "stability.csv"), toCsv(stability));
  fs.writeFileSync(path.join(out, "report.md"), renderReport({ generatedAt: new Date().toISOString(), projects, recovery, stability, detection }));
  console.log(`\nReport: ${path.join(out, "report.md")} (${detection.labelledPairs} pairs labelled, ${detection.pendingPairs} to label)`);
  for (const p of detection.problems) console.warn(`Label problem: ${p}`);
}

main()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
