/**
 * RQ2: the AI mentor under three conditions (C0 no data, C1 data without labels or citation check, C2 the ArchTime
 * mentor), blind annotation and metrics. Reads the database; writes only files under the output folder.
 * Protocol: docs/rq2-protocol.md. Questions: docs/rq2/questions.json.
 *
 *   npm run rq2 -- list                                         workspaces with mined snapshots (id, name, snapshots)
 *   npm run rq2 -- run --project <id> --repo <react-router|docusaurus|actual> [--questions Q1,Q2] [--conditions C0,C1,C2]
 *                      [--runs 3] [--model <registry id>] [--force]   asks the model each question --runs times per condition
 *                                                                     (default 3); an answer already saved is not asked again
 *   npm run rq2 -- sheet [--seed <text>]                         blind sheets for the annotators + the keys
 *   npm run rq2 -- score --a <name> --b <name>                   agreement, adjudication list, report.md, metrics.csv
 *                                                                (rates with 95% CI and C0-C1, C1-C2 differences, Holm)
 *   any command: --out <dir>                                     output folder (default rq2-results)
 *
 * Output in <out>: answers/<repo>.<question>.<condition>.json (run 1) and <repo>.<question>.<condition>.r<n>.json (runs
 * 2 and later), each with its answer id, model, prompt version, context fingerprint, questions version, raw and checked
 * text, citations, token usage and time; contexts/<repo>.<sha>.txt (the project data C1 and C2 received, saved once);
 * errors/<answer id>.<time>.json (failed requests: kept, never scored, asked again on the next run);
 * answers/superseded/ (an answer replaced with --force is moved here, never deleted); run-log.jsonl (one line per
 * request); sheets/claims.csv and sheets/answers.csv (templates:
 * each annotator copies them to claims.<name>.csv / answers.<name>.csv and fills verdict, refusal, coverage);
 * keys/*.json (which condition each row came from: never show to annotators); sheets/claims.adjudicate.csv (claims the
 * two annotators disagree on; fill the verdict together and save as claims.adjudicated.csv); report.md, metrics.csv.
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectDb } from "../src/config/db.js";
import { ProjectModel } from "../src/infrastructure/database/models/ProjectModel.js";
import { SnapshotModel } from "../src/infrastructure/database/models/SnapshotModel.js";
import { LlmModelRegistry } from "../src/infrastructure/llm/registry.js";
import { mentorProjectData, SYSTEM_PROMPT } from "../src/application/use-cases/llm/ProjectChatUseCase.js";
import { citedHashes, minedCommitMatcher } from "../src/domain/mentor/claimLabels.js";
import {
  agreementOf, answerFileName, answerIdOf, buildSheets, comparisonsOf, CONDITIONS, finalVerdicts, fingerprint, messagesFor, metricsOf, mixedRuns, parseCsv,
  postProcess, promptVersionOf, renderReport, toCsv,
  type AnswerKey, type ClaimKey, type Condition, type FailedAnswer, type Question, type RecordedAnswer,
} from "../src/domain/evaluation/rq2.js";

const QUESTIONS_FILE = path.resolve(import.meta.dirname, "../../docs/rq2/questions.json");

interface Args { command: string; out: string; project?: string; repo?: string; questions?: string[]; conditions: Condition[]; runs: number; model?: string; force: boolean; seed: string; a?: string; b?: string }

function args(argv: string[]): Args {
  const [command = "", ...rest] = argv;
  const a: Args = { command, out: "rq2-results", conditions: [...CONDITIONS], runs: 3, force: false, seed: "archtime-rq2" };
  for (let i = 0; i < rest.length; i++) {
    const next = () => { if (!rest[i + 1]) throw new Error(`${rest[i]} needs a value`); return rest[++i]; };
    switch (rest[i]) {
      case "--out": a.out = next(); break;
      case "--project": a.project = next(); break;
      case "--repo": a.repo = next().toLowerCase(); break;
      case "--questions": a.questions = next().split(",").map(s => s.trim().toUpperCase()).filter(Boolean); break;
      case "--conditions": {
        const list = next().split(",").map(s => s.trim().toUpperCase());
        if (list.some(c => !CONDITIONS.includes(c as Condition))) throw new Error("--conditions takes C0, C1, C2");
        a.conditions = list as Condition[];
        break;
      }
      case "--runs": a.runs = Number(next()); if (!Number.isInteger(a.runs) || a.runs < 1 || a.runs > 10) throw new Error("--runs takes a whole number from 1 to 10"); break;
      case "--model": a.model = next(); break;
      case "--force": a.force = true; break;
      case "--seed": a.seed = next(); break;
      case "--a": a.a = slug(next()); break;
      case "--b": a.b = slug(next()); break;
      default: throw new Error(`Unknown argument: ${rest[i]}. See the header of scripts/rq2.ts.`);
    }
  }
  return a;
}

const slug = (s: string) => { const v = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); if (!v) throw new Error("A name needs letters or digits"); return v; };
const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;
const writeJson = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n"); };
const writeText = (file: string, text: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const readCsv = (file: string) => (fs.existsSync(file) ? parseCsv(fs.readFileSync(file, "utf8")) : null);

function questionsVersion(): string {
  return readJson<{ version?: string }>(QUESTIONS_FILE).version ?? "unversioned";
}

function questionsFor(repo: string): Question[] {
  const file = readJson<{ repos: { repo: string; questions: string | Question[] }[]; standard: Question[] }>(QUESTIONS_FILE);
  const entry = file.repos.find(r => r.repo === repo);
  if (!entry) throw new Error(`No questions for "${repo}" in docs/rq2/questions.json (repos: ${file.repos.map(r => r.repo).join(", ")})`);
  const list = entry.questions === "standard" ? file.standard : (entry.questions as Question[]);
  return list.map(q => ({ ...q, text: q.text.replaceAll("{repo}", repo) }));
}

async function list() {
  const projects = await ProjectModel.find({}).select("name repoUrl").lean<{ _id: unknown; name: string; repoUrl: string }[]>();
  for (const p of projects) {
    const n = await SnapshotModel.countDocuments({ projectId: String(p._id) });
    if (n) console.log(`${String(p._id)}  ${n} snapshots  ${p.name}  (${p.repoUrl})`);
  }
}

async function run(a: Args) {
  if (!a.project || !a.repo) throw new Error("run needs --project <id> and --repo <name>");
  const doc = await ProjectModel.findById(a.project).lean<{ _id: unknown; name: string; description?: string; repoUrl: string }>();
  if (!doc) throw new Error(`No workspace ${a.project}`);
  const project = { id: String(doc._id), name: doc.name, description: doc.description, repoUrl: doc.repoUrl };
  const questions = questionsFor(a.repo).filter(q => !a.questions || a.questions.includes(q.id));
  if (!questions.length) throw new Error("No question selected");
  const { context } = await mentorProjectData(project);
  const mined = await SnapshotModel.find({ projectId: project.id }).select("hash fullHash").lean<{ hash: string; fullHash?: string }[]>();
  const isMined = minedCommitMatcher(mined);
  const model = await LlmModelRegistry.resolve(a.model ?? null);
  console.log(`Model: ${model.client.info.provider} ${model.client.info.model} (${model.client.info.external ? "external" : "local"}). ${questions.length} questions x ${a.conditions.length} conditions x ${a.runs} runs.`);

  // The project data C1 and C2 receive, saved once per distinct content: an answer names it by fingerprint, so what the
  // model saw can be read back later even if the database has changed since.
  const contextSha256 = fingerprint(context.text);
  const contextFile = path.join(a.out, "contexts", `${a.repo}.${contextSha256}.txt`);
  if (!fs.existsSync(contextFile)) writeText(contextFile, context.text);
  const qVersion = questionsVersion();
  const modelId = `${model.client.info.provider}/${model.client.info.model}`;
  const settings = { maxTokens: 2000, plain: true };
  const log = (entry: Record<string, unknown>) => { fs.mkdirSync(a.out, { recursive: true }); fs.appendFileSync(path.join(a.out, "run-log.jsonl"), JSON.stringify(entry) + "\n"); };
  let failures = 0;

  for (const q of questions) {
    for (const condition of a.conditions) for (let run = 1; run <= a.runs; run++) {
      const slot = { repo: a.repo, questionId: q.id, condition, run };
      const answerId = answerIdOf(slot);
      const file = path.join(a.out, "answers", answerFileName(slot));
      if (fs.existsSync(file) && !a.force) { console.log(`  ${answerId}: already answered, kept (use --force to ask again)`); continue; }
      const promptVersion = promptVersionOf(condition, SYSTEM_PROMPT);
      const ctx = condition === "C0" ? null : contextSha256;
      const usage = { inputTokens: 0, outputTokens: 0 };
      let seen = false;
      const askedAt = new Date().toISOString();
      const started = performance.now();
      let raw: string;
      try {
        raw = await model.client.complete(
          messagesFor(condition, { project, context: context.text, question: q.text, mentorPrompt: SYSTEM_PROMPT }),
          { ...settings, onUsage: u => { seen = true; usage.inputTokens += u.inputTokens; usage.outputTokens += u.outputTokens; } },
        );
      } catch (error) {
        // A failed request is recorded and skipped, never stored as an answer: the next run asks it again.
        failures++;
        const failed: FailedAnswer = {
          answerId, repo: a.repo, questionId: q.id, condition, run, model: modelId, promptVersion, contextSha256: ctx, status: "error",
          error: { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) },
          askedAt, latencyMs: Math.round(performance.now() - started),
        };
        writeJson(path.join(a.out, "errors", `${answerId}.${askedAt.replace(/[:.]/g, "-")}.json`), failed);
        log({ answerId, status: "error", askedAt, model: modelId, error: failed.error.message });
        console.log(`  ${answerId}: FAILED (${failed.error.message}); recorded in errors/, will be asked again on the next run`);
        continue;
      }
      const { text, check } = postProcess(condition, raw, isMined);
      const answer: RecordedAnswer = {
        answerId, repo: a.repo, questionId: q.id, question: q.text, answerable: q.answerable, expected: q.expected, condition, run,
        model: modelId, modelInfo: { ...model.client.info }, promptVersion, contextSha256: ctx, questionsVersion: qVersion, settings,
        text, raw: raw.trim(), check, validCitations: citedHashes(text).filter(isMined), usage: seen ? usage : null,
        latencyMs: Math.round(performance.now() - started), askedAt, status: "ok",
      };
      if (fs.existsSync(file)) {
        // --force never destroys an earlier answer: it is moved aside with the time it was replaced.
        const superseded = path.join(a.out, "answers", "superseded", `${path.basename(file, ".json")}.${askedAt.replace(/[:.]/g, "-")}.json`);
        fs.mkdirSync(path.dirname(superseded), { recursive: true });
        fs.renameSync(file, superseded);
      }
      writeJson(file, answer);
      log({ answerId, status: "ok", askedAt, model: modelId, promptVersion, contextSha256: ctx, usage: answer.usage, latencyMs: answer.latencyMs });
      console.log(`  ${answerId}: ${text.length} chars, ${answer.validCitations.length} valid citations${check ? `, ${check.downgraded} FACT downgraded, ${check.removedCitations.length} citations removed` : ""}`);
    }
  }
  if (failures) {
    console.log(`${failures} request(s) failed; see ${path.join(a.out, "errors")}. Run the same command again to ask only the missing answers.`);
    process.exitCode = 1;
  }
}

function loadAnswers(out: string): RecordedAnswer[] {
  const dir = path.join(out, "answers");
  if (!fs.existsSync(dir)) throw new Error(`No answers in ${dir}: run first`);
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort().map(f => readJson<RecordedAnswer>(path.join(dir, f)));
}

function sheet(a: Args) {
  const answers = loadAnswers(a.out);
  const s = buildSheets(answers, a.seed);
  writeText(path.join(a.out, "sheets", "claims.csv"), toCsv(s.claimSheet, ["claim_id", "repo", "question", "claim", "citations", "verdict", "note"]));
  writeText(path.join(a.out, "sheets", "answers.csv"), toCsv(s.answerSheet, ["answer_id", "repo", "question", "answerable", "expected", "answer", "refusal", "coverage", "note"]));
  writeJson(path.join(a.out, "keys", "claims.json"), s.claimKey);
  writeJson(path.join(a.out, "keys", "answers.json"), s.answerKey);
  console.log(`${answers.length} answers -> ${s.claimSheet.length} claims. Each annotator copies sheets/claims.csv and sheets/answers.csv to claims.<name>.csv / answers.<name>.csv.`);
}

function score(a: Args) {
  if (!a.a || !a.b) throw new Error("score needs --a <name> --b <name>");
  const dir = path.join(a.out, "sheets");
  const need = (name: string) => { const rows = readCsv(path.join(dir, name)); if (!rows) throw new Error(`Missing ${path.join(dir, name)}`); return rows; };
  const claimsA = need(`claims.${a.a}.csv`), claimsB = need(`claims.${a.b}.csv`);
  const answersA = need(`answers.${a.a}.csv`), answersB = need(`answers.${a.b}.csv`);
  const adjudicated = readCsv(path.join(dir, "claims.adjudicated.csv")) ?? [];
  const claimKey = readJson<ClaimKey[]>(path.join(a.out, "keys", "claims.json"));
  const answerKey = readJson<AnswerKey[]>(path.join(a.out, "keys", "answers.json"));

  const agreement = agreementOf(claimsA, claimsB, answersA, answersB);
  const verdicts = finalVerdicts(claimsA, claimsB, adjudicated);
  const pending = agreement.disagreements.filter(id => !verdicts.has(id));
  if (pending.length) {
    const byId = new Map(claimsA.map(r => [r.claim_id, r]));
    const bById = new Map(claimsB.map(r => [r.claim_id, r]));
    writeText(path.join(dir, "claims.adjudicate.csv"), toCsv(pending.map(id => ({
      claim_id: id, claim: byId.get(id)?.claim ?? "", citations: byId.get(id)?.citations ?? "", [`verdict_${a.a}`]: byId.get(id)?.verdict ?? "", [`verdict_${a.b}`]: bById.get(id)?.verdict ?? "", verdict: "",
    })), ["claim_id", "claim", "citations", `verdict_${a.a}`, `verdict_${a.b}`, "verdict"]));
  }
  const metrics = metricsOf({ claimKey, verdicts, answerKey, answerSheets: [answersA, answersB] });
  const comparisons = comparisonsOf({ claimKey, verdicts });
  const answers = loadAnswers(a.out);
  const report = renderReport({ metrics, agreement, pending: pending.length, models: [...new Set(answers.map(x => x.model))], repos: [...new Set(answers.map(x => x.repo))], comparisons, warnings: mixedRuns(answers) });
  writeText(path.join(a.out, "comparisons.csv"), toCsv(comparisons.map(c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v === null ? "" : String(v)]))) as Record<string, string>[],
    Object.keys(comparisons[0]) as string[]));
  writeText(path.join(a.out, "report.md"), report);
  writeText(path.join(a.out, "metrics.csv"), toCsv(metrics.map(m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v === null ? "" : String(v)]))) as Record<string, string>[],
    Object.keys(metrics[0]) as string[]));
  console.log(report);
  if (pending.length) console.log(`${pending.length} claims need adjudication: fill sheets/claims.adjudicate.csv and save it as claims.adjudicated.csv, then score again.`);
}

async function main() {
  const a = args(process.argv.slice(2));
  if (a.command === "sheet") return sheet(a);
  if (a.command === "score") return score(a);
  if (a.command !== "list" && a.command !== "run") throw new Error("Commands: list, run, sheet, score. See the header of scripts/rq2.ts.");
  await connectDb();
  try { await (a.command === "list" ? list() : run(a)); } finally { await mongoose.disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
