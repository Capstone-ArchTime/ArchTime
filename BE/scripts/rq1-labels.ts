/**
 * RQ1-B label sheets without the database: independent workspaces for annotators, completeness and consistency checks,
 * and the agreement of two annotators before reconciliation (Cohen's kappa and Gwet's AC1 on verdicts, trueChanges
 * agreement), with every disagreement exported for the reconciliation meeting. Reads files; writes only where stated.
 *
 *   npm run rq1:labels -- export --annotator <name> --to <folder> [--labels rq1-results/labels]
 *       copies ONLY that annotator's own sheets (<workspace>.<name>.json) and the labelling guide into a folder of their
 *       own: no key, no other annotator's sheet, no report. Create the sheets first with
 *       npm run rq1 -- --milestones --anchored --tolerance 0.02 --annotator <name>.
 *
 *   npm run rq1:labels -- import --annotator <name> --from <folder> [--labels rq1-results/labels] [--force]
 *       copies the annotator's labelled sheets back after checking them (annotator name, structure of this run, no
 *       labels lost against the sheet already there unless --force). Never touches another annotator's sheet.
 *
 *   npm run rq1:labels -- check [--labels rq1-results/labels] [--annotator <name>]
 *       every <workspace>.<annotator>.json (or only that annotator's) and every reconciled <workspace>.json: complete,
 *       valid values, no duplicates, same pairs, snapshots and changes as this run; exit 1 when a sheet has an error.
 *       Annotator sheets are checked without any grouping information.
 *
 *   npm run rq1:labels -- agree --a <name> --b <name> [--labels rq1-results/labels] [--out rq1-results/agreement]
 *       agreement.json (per workspace and pooled) and disagreements.csv. Run it BEFORE reconciling, and report it.
 *
 * Do not open labels/keys/ yourself while labelling (docs/rq1-protocol.md §4).
 */
import fs from "node:fs";
import path from "node:path";
import {
  agreement, annotatorSlug, identicalLabels, labelDisagreements, labelLoss, sheetStructureProblems, toCsv, validateLabelSheet,
  type LabelKey, type LabelSheet, type SheetProblem, type Verdict,
} from "../src/domain/evaluation/rq1.js";
import { cohenKappa, gwetAC1 } from "../src/domain/evaluation/stats.js";

const GUIDE = path.resolve(import.meta.dirname, "../../docs/rq1-labelling-guide.md");

function options(argv: string[]) {
  const o: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--force") { o.force = "yes"; continue; }
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) throw new Error(`Unexpected argument: ${argv[i]}`);
    o[argv[i].slice(2)] = argv[++i];
  }
  return o;
}

const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;

/** Workspace slug -> { reconciled?, annotators: name -> file } from the files of the labels folder. */
function sheetsIn(dir: string) {
  if (!fs.existsSync(dir)) throw new Error(`${dir} does not exist: run npm run rq1 -- --milestones --anchored --tolerance 0.02 first.`);
  const keys = new Set(fs.existsSync(path.join(dir, "keys")) ? fs.readdirSync(path.join(dir, "keys")).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)) : []);
  const out = new Map<string, { reconciled?: string; annotators: Map<string, string> }>();
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort()) {
    const stem = f.slice(0, -5);
    const slug = keys.has(stem) ? stem : [...keys].find(k => stem.startsWith(`${k}.`));
    if (!slug) { console.warn(`${f}: no key file matches it; skipped.`); continue; }
    const entry = out.get(slug) ?? { annotators: new Map<string, string>() };
    if (stem === slug) entry.reconciled = path.join(dir, f);
    else entry.annotators.set(stem.slice(slug.length + 1), path.join(dir, f));
    out.set(slug, entry);
  }
  return out;
}

/** Problems of one annotator's sheet: values and duplicates (no grouping information), structure, and its owner. */
function annotatorProblems(sheet: LabelSheet, who: string, key: LabelKey, reference: LabelSheet | null): SheetProblem[] {
  const problems = validateLabelSheet(sheet, key, { methodChecks: false });
  if (reference) problems.push(...sheetStructureProblems(sheet, reference));
  else problems.push({ severity: "warning", message: "No reconciled sheet of this run to compare the structure with." });
  if (sheet.annotator !== who) problems.push({ severity: "error", message: `The sheet says annotator "${sheet.annotator ?? "(none)"}" but belongs to "${who}" (a copied or misnamed file).` });
  return problems;
}

function print(file: string, problems: SheetProblem[]): number {
  const e = problems.filter(p => p.severity === "error").length;
  console.log(`${file}: ${e} error(s), ${problems.length - e} warning(s)`);
  for (const p of problems) console.log(`  ${p.severity.toUpperCase()}: ${p.message}`);
  return e;
}

function check(o: Record<string, string>) {
  const dir = o.labels ?? path.join("rq1-results", "labels");
  let errors = 0;
  for (const [slug, entry] of sheetsIn(dir)) {
    const key = read<LabelKey>(path.join(dir, "keys", `${slug}.json`));
    const reference = entry.reconciled ? read<LabelSheet>(entry.reconciled) : null;
    for (const [who, file] of entry.annotators) {
      if (o.annotator && who !== o.annotator) continue;
      errors += print(file, annotatorProblems(read<LabelSheet>(file), who, key, reference));
    }
    if (!o.annotator && entry.reconciled) errors += print(entry.reconciled, validateLabelSheet(reference!, key));
  }
  if (errors) process.exitCode = 1;
}

function exportSheets(o: Record<string, string>) {
  const who = annotatorSlug(o.annotator ?? "");
  if (!who || !o.to) throw new Error("export needs --annotator <name> and --to <folder>.");
  const dir = o.labels ?? path.join("rq1-results", "labels");
  const to = path.resolve(o.to);
  if (to.startsWith(path.resolve(dir))) throw new Error("--to must be outside the labels folder (it holds the keys and the other sheets).");
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const [, entry] of sheetsIn(dir)) {
    const file = entry.annotators.get(who);
    if (!file) continue;
    const target = path.join(to, path.basename(file));
    if (fs.existsSync(target) && !o.force) throw new Error(`${target} exists; it may hold work in progress. Use --force to replace it.`);
    fs.copyFileSync(file, target);
    n++;
  }
  if (!n) throw new Error(`No sheet of "${who}" in ${dir}. Create them with npm run rq1 -- --milestones --anchored --tolerance 0.02 --annotator ${who}.`);
  if (fs.existsSync(GUIDE)) fs.copyFileSync(GUIDE, path.join(to, "rq1-labelling-guide.md"));
  console.log(`Copied ${n} sheet(s) of ${who} and the labelling guide to ${to}. Nothing else (no key, no other annotator) was copied.`);
}

function importSheets(o: Record<string, string>) {
  const who = annotatorSlug(o.annotator ?? "");
  if (!who || !o.from) throw new Error("import needs --annotator <name> and --from <folder>.");
  const dir = o.labels ?? path.join("rq1-results", "labels");
  const workspaces = sheetsIn(dir);
  const incoming = fs.readdirSync(o.from).filter(f => f.endsWith(`.${who}.json`));
  if (!incoming.length) throw new Error(`No <workspace>.${who}.json in ${o.from}.`);
  // Check everything first, then copy: a partly applied import would be hard to see.
  const plan: { from: string; to: string }[] = [];
  let errors = 0;
  for (const f of incoming) {
    const slug = f.slice(0, -`.${who}.json`.length);
    const entry = workspaces.get(slug);
    if (!entry) { console.log(`${f}: no workspace ${slug} in ${dir}.`); errors++; continue; }
    const sheet = read<LabelSheet>(path.join(o.from, f));
    const key = read<LabelKey>(path.join(dir, "keys", `${slug}.json`));
    const problems = annotatorProblems(sheet, who, key, entry.reconciled ? read<LabelSheet>(entry.reconciled) : null);
    const current = path.join(dir, f);
    if (fs.existsSync(current)) {
      const lost = labelLoss(read<LabelSheet>(current), sheet);
      if (lost.length && !o.force) problems.push({ severity: "error", message: `Importing would erase ${lost.length} label(s) already in ${current} (e.g. ${lost.slice(0, 3).join("; ")}). Use --force only if that is intended.` });
    }
    const e = print(f, problems.filter(p => p.severity === "error"));
    errors += e;
    plan.push({ from: path.join(o.from, f), to: current });
  }
  if (errors) { process.exitCode = 1; console.log("Nothing was imported."); return; }
  for (const p of plan) fs.copyFileSync(p.from, p.to);
  console.log(`Imported ${plan.length} sheet(s) of ${who}. Run npm run rq1:labels -- check --annotator ${who}.`);
}

function agree(o: Record<string, string>) {
  if (!o.a || !o.b) throw new Error("agree needs --a <name> --b <name>.");
  const dir = o.labels ?? path.join("rq1-results", "labels");
  const out = o.out ?? path.join("rq1-results", "agreement");
  const perWorkspace = [];
  const disagreements = [];
  const pooled: [Verdict, Verdict][] = [];
  const warnings: string[] = [];
  for (const [slug, entry] of sheetsIn(dir)) {
    const fa = entry.annotators.get(o.a), fb = entry.annotators.get(o.b);
    if (!fa || !fb) { console.warn(`${slug}: missing the sheet of ${!fa ? o.a : o.b}; skipped.`); continue; }
    const a = read<LabelSheet>(fa), b = read<LabelSheet>(fb);
    if (identicalLabels(a, b)) warnings.push(`${slug}: the two sheets have exactly the same labels; confirm they were made independently.`);
    const result = agreement(a, b);
    pooled.push(...(result.pooledVerdicts ?? []));
    perWorkspace.push({ workspace: slug, project: a.projectName, ...result, pooledVerdicts: undefined });
    disagreements.push(...labelDisagreements(a, b));
  }
  const summary = {
    annotators: [o.a, o.b],
    workspaces: perWorkspace,
    pooled: { verdicts: cohenKappa(pooled), verdictsAC1: gwetAC1(pooled, ["correct", "wrong"] as Verdict[]) },
    disagreements: disagreements.length,
    warnings,
  };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "agreement.json"), JSON.stringify(summary, null, 2) + "\n");
  fs.writeFileSync(path.join(out, "disagreements.csv"), toCsv(disagreements));
  for (const w of warnings) console.warn(`WARNING: ${w}`);
  for (const w of perWorkspace) console.log(`${w.project}: ${w.pairs} pairs, trueChanges identical ${w.trueChangesExact ?? "n/a"}, kappa ${w.verdicts?.kappa ?? "n/a"}, AC1 ${w.verdictsAC1?.ac1 ?? "n/a"}`);
  console.log(`Pooled: ${pooled.length} verdict pairs, kappa ${summary.pooled.verdicts?.kappa ?? "n/a"}, AC1 ${summary.pooled.verdictsAC1?.ac1 ?? "n/a"}. ${disagreements.length} disagreements -> ${path.join(out, "disagreements.csv")}`);
}

const [command, ...rest] = process.argv.slice(2);
try {
  const o = options(rest);
  if (command === "check") check(o);
  else if (command === "agree") agree(o);
  else if (command === "export") exportSheets(o);
  else if (command === "import") importSheets(o);
  else throw new Error('Use "export", "import", "check" or "agree" (see the header of scripts/rq1-labels.ts).');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
