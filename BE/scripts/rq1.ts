/**
 * RQ1: evaluates the recovered architecture against the clustering-only grouping and the directory baseline (and,
 * with --anchored, the anchored variant: the method frozen for the test set) on the workspaces mined in the database,
 * and keeps the change-detection label sheets up to date. Reads the database; writes only files.
 * Protocol: docs/rq1-protocol.md. Test set: npm run rq1 -- --milestones --anchored --tolerance 0.02
 *
 *   npm run rq1                                every workspace that has stored components
 *   npm run rq1 -- --project <id>              one workspace (repeatable)
 *   npm run rq1 -- --milestones                only the milestones chosen by npm run rq1:milestones
 *   npm run rq1 -- --annotator <name>          also write / update that annotator's own label sheets
 *   npm run rq1 -- --reconcile                 merge the annotators' sheets into the reconciled sheets
 *   npm run rq1 -- --no-evidence               report every regrouping as a change (the rule before 14/11/2026)
 *   npm run rq1 -- --anchored [--tolerance x]  add the anchored variant (the frozen method; use 0.02 on the test set)
 *   npm run rq1 -- --no-clustering             leave out the clustering-only grouping
 *   npm run rq1 -- --out <dir>                 output folder (default rq1-results)
 *   npm run rq1 -- --allow-dropping-methods    rewrite keys and sheets even when this run lacks a grouping an earlier
 *                                              run had (by default the script stops: forgetting --anchored on the test
 *                                              set would remove the frozen method's changes from the annotation)
 *
 *   npm run rq1 -- --sensitivity 0.3,0.5,0.7   also re-match every step at these dominance thresholds (exploratory:
 *                                               the frozen method keeps 0.5; never used to choose a threshold)
 *
 * Output in <out>: report.md, recovery.csv, stability.csv, recovery-tests.csv (Wilcoxon per project with Holm),
 * detection.csv (RQ1-B per project and pooled), summary.json, labels-disagreements.csv (when two annotators have
 * sheets), sensitivity.csv (with --sensitivity); labels/<workspace>.json (reconciled sheet, scored),
 * labels/<workspace>.<annotator>.json (one per annotator), labels/keys/<workspace>.json (which grouping reported which
 * change; do not show it to annotators). Re-running keeps every label already written.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectDb } from "../src/config/db.js";
import { ArchitectureService } from "../src/infrastructure/services/ArchitectureService.js";
import { ArchitectureMappingModel } from "../src/infrastructure/database/models/ArchitectureMappingModel.js";
import { ProjectModel } from "../src/infrastructure/database/models/ProjectModel.js";
import { SnapshotModel } from "../src/infrastructure/database/models/SnapshotModel.js";
import {
  aggregateMeans, agreement, annotatorSlug, buildLabelSheet, droppedMethods, labelDisagreements, methodsOf, reconcile, recoveryRows, recoveryTests, renderReport, scoreByProject,
  scoreLabels, stabilityRows, toCsv, workspaceSlug,
} from "../src/domain/evaluation/rq1.js";
import type { Agreement, CommitContext, EvaluationInput, LabelDisagreement, LabelKey, LabelSheet, Method, RecoveryRow, StabilityRow } from "../src/domain/evaluation/rq1.js";
import { sensitivityRows, type SensitivityRow } from "../src/domain/evaluation/sensitivity.js";

interface Args { projects: string[]; out: string; annotator: string | null; reconcile: boolean; clustering: boolean; anchored: boolean; tolerance?: number; milestones: boolean; noEvidence: boolean; sensitivity: number[]; allowDrop: boolean }

function args(argv: string[]): Args {
  const a: Args = { projects: [], out: "rq1-results", annotator: null, reconcile: false, clustering: true, anchored: false, milestones: false, noEvidence: false, sensitivity: [], allowDrop: false };
  for (let i = 0; i < argv.length; i++) {
    const next = () => { if (!argv[i + 1]) throw new Error(`${argv[i]} needs a value`); return argv[++i]; };
    switch (argv[i]) {
      case "--project": a.projects.push(next()); break;
      case "--out": a.out = next(); break;
      case "--annotator": a.annotator = annotatorSlug(next()); if (!a.annotator) throw new Error("--annotator needs a name made of letters or digits"); break;
      case "--reconcile": a.reconcile = true; break;
      case "--no-clustering": a.clustering = false; break;
      case "--anchored": a.anchored = true; break;
      case "--tolerance": a.tolerance = Number(next()); if (!Number.isFinite(a.tolerance)) throw new Error("--tolerance needs a number, e.g. 0.02"); break;
      case "--milestones": a.milestones = true; break;
      case "--no-evidence": a.noEvidence = true; break;
      case "--allow-dropping-methods": a.allowDrop = true; break;
      case "--sensitivity": {
        a.sensitivity = next().split(",").map(Number);
        if (!a.sensitivity.length || a.sensitivity.some(x => !(x > 0 && x < 1))) throw new Error("--sensitivity takes dominance thresholds between 0 and 1, e.g. 0.3,0.5,0.7");
        break;
      }
      default: throw new Error(`Unknown argument: ${argv[i]}. See the header of scripts/rq1.ts.`);
    }
  }
  return a;
}

function gitHead(): string | null {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return null; }
}

const readJson = <T>(file: string): T | null => (fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : null);
const writeJson = (file: string, value: unknown) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");

/** The mined commits after each step's first snapshot up to its second one, oldest first (at most 60 per step). */
async function commitContext(projectId: string, evaluation: EvaluationInput): Promise<Record<string, CommitContext[]>> {
  const rows = await SnapshotModel.find({ projectId }, { hash: 1, title: 1, date: 1, depAdded: 1, depRemoved: 1 }).sort({ date: 1 }).lean();
  const dateOf = new Map(evaluation.snapshots.map(s => [s.snapshotId, new Date(s.snapshot.date).getTime()]));
  const out: Record<string, CommitContext[]> = {};
  for (const step of evaluation.steps) {
    const from = dateOf.get(step.from) ?? 0, to = dateOf.get(step.to) ?? 0;
    out[`${step.from}>${step.to}`] = rows
      .filter(r => { const t = new Date(r.date).getTime(); return t > from && t <= to; })
      .slice(-60)
      .map(r => ({ hash: r.hash, title: String(r.title ?? "").split("\n")[0], date: new Date(r.date).toISOString().slice(0, 10), depAdded: r.depAdded ?? 0, depRemoved: r.depRemoved ?? 0 }));
  }
  return out;
}

async function main() {
  const opt = args(process.argv.slice(2));
  await connectDb();
  const mapped = (await ArchitectureMappingModel.distinct("projectId")).map(String);
  const ids = opt.projects.length ? opt.projects : mapped;
  const missing = opt.projects.filter(id => !mapped.includes(id));
  if (missing.length) console.warn(`No stored components for: ${missing.join(", ")}. Build their milestones first (npm run rq1:milestones).`);

  const labelsDir = path.join(opt.out, "labels"), keysDir = path.join(labelsDir, "keys");
  fs.mkdirSync(keysDir, { recursive: true });
  const projects: { name: string; snapshots: number; baselineDepth: number; hasReference: boolean; generators: string[] }[] = [];
  const recovery: RecoveryRow[] = [];
  const stability: StabilityRow[] = [];
  const scored: { sheet: LabelSheet; key: LabelKey }[] = [];
  const agreements: { project: string; annotators: [string, string]; result: Agreement }[] = [];
  const disagreements: LabelDisagreement[] = [];
  const sensitivity: SensitivityRow[] = [];
  const methods = new Set<Method>();

  const found = await ProjectModel.find({ _id: { $in: ids.filter(i => mapped.includes(i)) } }, { name: 1 }).lean();
  const deleted = ids.filter(i => mapped.includes(i) && !found.some(p => String(p._id) === i));
  if (deleted.length) console.warn(`Skipped components left by deleted workspaces: ${deleted.join(", ")}.`);
  // Workspaces may share a name; the report needs to tell them apart.
  const shared = new Set(found.map(p => p.name).filter((n, i, all) => all.indexOf(n) !== i));
  const label = (p: { _id: unknown; name: string }) => (shared.has(p.name) ? `${p.name} (${String(p._id).slice(-6)})` : p.name);

  for (const project of found) {
    const id = String(project._id);
    const name = label(project);
    const slug = workspaceSlug(project.name, id);
    let snapshotIds: string[] | undefined;
    if (opt.milestones) {
      const chosen = readJson<{ snapshotIds: string[] }>(path.join(opt.out, "milestones", `${slug}.json`));
      if (!chosen) { console.warn(`${name}: no milestones file (npm run rq1:milestones -- --project ${id}); skipped`); continue; }
      snapshotIds = chosen.snapshotIds;
    }
    const evaluationOptions = {
      snapshotIds, clustering: opt.clustering, anchored: opt.anchored ? (opt.tolerance === undefined ? true : { tolerance: opt.tolerance }) : false, withFiles: true, noEvidence: opt.noEvidence,
    } as const;
    const evaluation = (await ArchitectureService.evaluation(id, evaluationOptions)) as unknown as EvaluationInput;
    methodsOf(evaluation).forEach(m => methods.add(m));
    const generators = [...new Set(evaluation.snapshots.map(s => s.generator ?? "").filter(Boolean))];
    projects.push({ name, snapshots: evaluation.snapshots.length, baselineDepth: evaluation.baselineDepth, hasReference: evaluation.hasReference, generators });
    recovery.push(...recoveryRows(name, evaluation));
    stability.push(...stabilityRows(name, evaluation));
    if (evaluation.steps.length === 0) {
      console.log(`${name}: ${evaluation.snapshots.length} snapshot(s), nothing to label`);
      continue;
    }
    const dropped = droppedMethods(readJson<LabelKey>(path.join(keysDir, `${slug}.json`)), methodsOf(evaluation));
    if (dropped.length && !opt.allowDrop) {
      throw new Error(`${name}: the label key of an earlier run includes ${dropped.join(", ")}, which this run does not compute. Re-run with the same groupings (test set: --anchored --tolerance 0.02), or pass --allow-dropping-methods to rewrite the sheets without them. Nothing was written for this workspace.`);
    }
    const commits = await commitContext(id, evaluation);
    const build = (previous: LabelSheet | null, annotator?: string) => buildLabelSheet({ id, name }, evaluation, previous, { commits, ...(annotator ? { annotator } : {}) });

    // The annotators' own sheets: the one named on the command line is created or refreshed; the others are only
    // refreshed when reconciling, so that a sheet someone is editing is never rewritten behind their back.
    const annotatorFiles = fs.readdirSync(labelsDir).filter(f => f.startsWith(`${slug}.`) && f.endsWith(".json"));
    // <slug>.json is the reconciled sheet itself, not an annotator's.
    const annotators = new Map(annotatorFiles.map(f => [f.slice(slug.length + 1, -".json".length), path.join(labelsDir, f)] as [string, string]).filter(([who]) => who));
    if (opt.annotator && !annotators.has(opt.annotator)) annotators.set(opt.annotator, path.join(labelsDir, `${slug}.${opt.annotator}.json`));
    const sheets = new Map<string, LabelSheet>();
    for (const [who, file] of [...annotators].sort((x, y) => x[0].localeCompare(y[0]))) {
      const previous = readJson<LabelSheet>(file);
      if (who === opt.annotator || opt.reconcile) {
        const { sheet } = build(previous, who);
        writeJson(file, sheet);
        sheets.set(who, sheet);
      } else if (previous) {
        sheets.set(who, previous);
      }
    }

    const reconciledFile = path.join(labelsDir, `${slug}.json`);
    let { sheet: reconciled, key } = build(readJson<LabelSheet>(reconciledFile));
    if (opt.reconcile && sheets.size) {
      const merged = reconcile([...sheets.values()], reconciled);
      reconciled = merged.sheet;
      console.log(`${name}: reconciled ${sheets.size} annotator sheet(s), ${merged.conflicts} disagreement(s) to settle in ${reconciledFile}`);
    }
    writeJson(reconciledFile, reconciled);
    writeJson(path.join(keysDir, `${slug}.json`), key);
    scored.push({ sheet: reconciled, key });
    const names = [...sheets.keys()];
    if (names.length >= 2) {
      agreements.push({ project: name, annotators: [names[0], names[1]], result: agreement(sheets.get(names[0])!, sheets.get(names[1])!) });
      disagreements.push(...labelDisagreements(sheets.get(names[0])!, sheets.get(names[1])!));
    }
    if (opt.sensitivity.length) {
      // Exploratory: the same snapshots re-matched at other dominance thresholds. Verdicts are reused only for changes
      // identical to a labelled change of the frozen run (same pair, grouping, kind and components); others stay unlabelled.
      const runs = [];
      for (const dominance of opt.sensitivity) {
        runs.push({ dominance, evaluation: (await ArchitectureService.evaluation(id, { ...evaluationOptions, dominance })) as unknown as EvaluationInput });
      }
      sensitivity.push(...sensitivityRows(name, runs, { sheet: reconciled, key }));
    }
    console.log(`${name}: ${evaluation.snapshots.length} snapshots, ${reconciled.pairs.length} pairs -> ${reconciledFile}${opt.annotator ? ` (+ ${slug}.${opt.annotator}.json)` : ""}`);
  }

  const detection = scoreLabels(scored);
  const detectionByProject = scoreByProject(scored);
  const methodList = [...methods];
  const withRef = recovery.filter(r => methodList.some(m => typeof r[`${m}VsReference`] === "number"));
  const primaries: Method[] = methodList.includes("anchored") ? ["anchored", "recovered"] : ["recovered"];
  const tests = primaries.flatMap(primary => recoveryTests(withRef, methodList, primary));
  fs.writeFileSync(path.join(opt.out, "recovery.csv"), toCsv(recovery));
  fs.writeFileSync(path.join(opt.out, "stability.csv"), toCsv(stability));
  fs.writeFileSync(path.join(opt.out, "recovery-tests.csv"), toCsv(tests.map(t => ({
    project: t.project, primary: t.primary, against: t.against, n: t.result?.n ?? null, wPlus: t.result?.wPlus ?? null, wMinus: t.result?.wMinus ?? null,
    p: t.result?.p ?? null, exact: t.result?.exact ?? null, rankBiserial: t.result?.effect ?? null, pHolm: t.pHolm,
  }))));
  const detectionRows = [...detectionByProject.map(d => ({ project: d.project, score: d.score })), { project: "ALL (pooled)", score: detection }]
    .flatMap(({ project, score }) => Object.entries(score.methods).map(([method, s]) => ({ project, method, labelledPairs: score.labelledPairs, pendingPairs: score.pendingPairs, ...s })));
  fs.writeFileSync(path.join(opt.out, "detection.csv"), toCsv(detectionRows));
  if (disagreements.length) fs.writeFileSync(path.join(opt.out, "labels-disagreements.csv"), toCsv(disagreements));
  if (sensitivity.length) fs.writeFileSync(path.join(opt.out, "sensitivity.csv"), toCsv(sensitivity));
  fs.writeFileSync(path.join(opt.out, "summary.json"), JSON.stringify({
    generatedAt: new Date().toISOString(), backendCommit: gitHead(), options: opt, projects,
    means: Object.fromEntries(methodList.map(m => [m, aggregateMeans(withRef, m)])),
    tests, detection, detectionByProject, agreement: agreements.map(a => ({ project: a.project, annotators: a.annotators, result: { ...a.result, pooledVerdicts: undefined } })),
  }, null, 2) + "\n");
  fs.writeFileSync(path.join(opt.out, "report.md"), renderReport({
    generatedAt: new Date().toISOString(), projects, methods: methodList, recovery, stability, detection, detectionByProject, agreement: agreements,
  }));
  console.log(`\nReport: ${path.join(opt.out, "report.md")} (${detection.labelledPairs} pairs labelled, ${detection.pendingPairs} to label)`);
  for (const p of detection.problems) console.warn(`Label problem: ${p}`);
}

main()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
