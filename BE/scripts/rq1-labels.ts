/**
 * RQ1-B label sheets without the database: check that sheets are complete and consistent with their keys, and measure
 * the agreement of two annotators before reconciliation (Cohen's kappa and Gwet's AC1 on verdicts, trueChanges
 * agreement), with every disagreement exported for the reconciliation meeting. Reads files only; writes only into --out.
 *
 *   npm run rq1:labels -- check [--labels rq1-results/labels] [--annotator <name>]
 *       every <workspace>.<annotator>.json (or only that annotator's) and every reconciled <workspace>.json against
 *       keys/<workspace>.json; exit 1 when a sheet has an error.
 *
 *   npm run rq1:labels -- agree --a <name> --b <name> [--labels rq1-results/labels] [--out rq1-results/agreement]
 *       agreement.json (per workspace and pooled) and disagreements.csv. Run it BEFORE reconciling, and report it.
 *
 * Do not open labels/keys/ yourself while labelling: this script reads the keys only to check the sheets' structure and
 * prints no grouping names (docs/rq1-protocol.md §4).
 */
import fs from "node:fs";
import path from "node:path";
import { agreement, labelDisagreements, toCsv, validateLabelSheet, type LabelKey, type LabelSheet, type Verdict } from "../src/domain/evaluation/rq1.js";
import { cohenKappa, gwetAC1 } from "../src/domain/evaluation/stats.js";

function options(argv: string[]) {
  const o: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) throw new Error(`Unexpected argument: ${argv[i]}`);
    o[argv[i].slice(2)] = argv[i + 1];
  }
  return o;
}

const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;

/** Workspace slug -> { reconciled?, annotators: name -> file } from the files of the labels folder. */
function sheetsIn(dir: string) {
  if (!fs.existsSync(dir)) throw new Error(`${dir} does not exist: run npm run rq1 -- --milestones first.`);
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

function check(o: Record<string, string>) {
  const dir = o.labels ?? path.join("rq1-results", "labels");
  let errors = 0;
  for (const [slug, entry] of sheetsIn(dir)) {
    const key = read<LabelKey>(path.join(dir, "keys", `${slug}.json`));
    const files = [...entry.annotators].filter(([who]) => !o.annotator || who === o.annotator).map(([, f]) => f);
    if (!o.annotator && entry.reconciled) files.push(entry.reconciled);
    for (const file of files) {
      const problems = validateLabelSheet(read<LabelSheet>(file), key);
      const e = problems.filter(p => p.severity === "error").length;
      errors += e;
      console.log(`${file}: ${e} error(s), ${problems.length - e} warning(s)`);
      for (const p of problems) console.log(`  ${p.severity.toUpperCase()}: ${p.message}`);
    }
  }
  if (errors) process.exitCode = 1;
}

function agree(o: Record<string, string>) {
  if (!o.a || !o.b) throw new Error("agree needs --a <name> --b <name>.");
  const dir = o.labels ?? path.join("rq1-results", "labels");
  const out = o.out ?? path.join("rq1-results", "agreement");
  const perWorkspace = [];
  const disagreements = [];
  const pooled: [Verdict, Verdict][] = [];
  for (const [slug, entry] of sheetsIn(dir)) {
    const fa = entry.annotators.get(o.a), fb = entry.annotators.get(o.b);
    if (!fa || !fb) { console.warn(`${slug}: missing the sheet of ${!fa ? o.a : o.b}; skipped.`); continue; }
    const a = read<LabelSheet>(fa), b = read<LabelSheet>(fb);
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
  };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "agreement.json"), JSON.stringify(summary, null, 2) + "\n");
  fs.writeFileSync(path.join(out, "disagreements.csv"), toCsv(disagreements));
  for (const w of perWorkspace) console.log(`${w.project}: ${w.pairs} pairs, trueChanges identical ${w.trueChangesExact ?? "n/a"}, kappa ${w.verdicts?.kappa ?? "n/a"}, AC1 ${w.verdictsAC1?.ac1 ?? "n/a"}`);
  console.log(`Pooled: ${pooled.length} verdict pairs, kappa ${summary.pooled.verdicts?.kappa ?? "n/a"}, AC1 ${summary.pooled.verdictsAC1?.ac1 ?? "n/a"}. ${disagreements.length} disagreements -> ${path.join(out, "disagreements.csv")}`);
}

const [command, ...rest] = process.argv.slice(2);
try {
  const o = options(rest);
  if (command === "check") check(o);
  else if (command === "agree") agree(o);
  else throw new Error('Use "check" or "agree" (see the header of scripts/rq1-labels.ts).');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
