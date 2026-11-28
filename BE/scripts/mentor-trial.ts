/**
 * Development-set trial of the mentor context (protocol 1.3, docs/mentor-context-trial-report.md). Never runs on one of
 * the five test-set repositories: the script refuses them, with no override.
 *
 *   npx tsx scripts/mentor-trial.ts --project <development workspace id> [--out mentor-trial-results] [--ask] [--runs 1] [--model <id>]
 *
 * Without --ask: builds the PROJECT DATA in versions 1.2 and 1.3, saves both texts, and reports their sizes, an
 * approximate token count (characters / 4), the sections present, truncation, and the commits each names; plus facts
 * read from the database that a correct answer must match (largest dependency change of the whole history, newest
 * dependency change, oldest snapshot, milestones).
 * With --ask: also asks the RQ2 questions (C0 once; C1 and C2 with both context versions) and records every answer
 * with automatic spot checks: citation validity and whether the answer names the commit the database says is right.
 * These checks are indicators for the trial, not RQ2 results and not human judgements.
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectDb } from "../src/config/db.js";
import { ProjectModel } from "../src/infrastructure/database/models/ProjectModel.js";
import { SnapshotModel } from "../src/infrastructure/database/models/SnapshotModel.js";
import { LlmModelRegistry } from "../src/infrastructure/llm/registry.js";
import { mentorProjectData, SYSTEM_PROMPT } from "../src/application/use-cases/llm/ProjectChatUseCase.js";
import type { MentorContextVersion } from "../src/application/use-cases/llm/ProjectChatContext.js";
import { citedHashes, minedCommitMatcher } from "../src/domain/mentor/claimLabels.js";
import { fingerprint, messagesFor, postProcess, type Condition, type Question } from "../src/domain/evaluation/rq2.js";
import { minedCommitFilter } from "../src/domain/evaluation/rq2Preflight.js";
import { isTestSetRepo } from "../src/domain/evaluation/testSet.js";
import { trialChecks, type TrialFacts } from "../src/domain/mentor/trial.js";

const QUESTIONS_FILE = path.resolve(import.meta.dirname, "../../docs/rq2/questions.json");

function args(argv: string[]) {
  const o: { project?: string; out: string; ask: boolean; runs: number; model?: string } = { out: "mentor-trial-results", ask: false, runs: 1 };
  for (let i = 0; i < argv.length; i++) {
    const next = () => { if (!argv[i + 1]) throw new Error(`${argv[i]} needs a value`); return argv[++i]; };
    switch (argv[i]) {
      case "--project": o.project = next(); break;
      case "--out": o.out = next(); break;
      case "--ask": o.ask = true; break;
      case "--runs": o.runs = Number(next()); if (!Number.isInteger(o.runs) || o.runs < 1 || o.runs > 3) throw new Error("--runs takes 1 to 3"); break;
      case "--model": o.model = next(); break;
      default: throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  if (!o.project) throw new Error("--project <development workspace id> is required");
  return o;
}

const SECTIONS = ["SNAPSHOTS", "CHANGE EVIDENCE", "LATEST STRUCTURE", "ARCHITECTURE", "FOLDERS of the latest snapshot", "COMPONENTS at milestone", "COMPONENT DEPENDENCIES", "EVOLUTION EVENTS", "MILESTONES", "LARGEST DEPENDENCY CHANGES"];
const write = (file: string, text: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

async function main() {
  const o = args(process.argv.slice(2));
  await connectDb();
  try {
    const doc = await ProjectModel.findById(o.project).lean<{ _id: unknown; name: string; description?: string; repoUrl: string }>();
    if (!doc) throw new Error(`No workspace ${o.project}`);
    if (isTestSetRepo(doc.repoUrl)) throw new Error(`${doc.name} is a frozen test-set repository; the trial runs on development workspaces only. Nothing was read.`);
    const project = { id: String(doc._id), name: doc.name, description: doc.description, repoUrl: doc.repoUrl };
    const slug = `${doc.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${project.id.slice(-6)}`;

    // Facts a correct answer must match, straight from the database.
    const filter = minedCommitFilter(project.id);
    const [top] = await SnapshotModel.aggregate<{ hash: string; depAdded: number; depRemoved: number; date: Date }>([
      { $match: filter }, { $addFields: { total: { $add: [{ $ifNull: ["$depAdded", 0] }, { $ifNull: ["$depRemoved", 0] }] } } },
      { $sort: { total: -1, date: -1 } }, { $limit: 1 }, { $project: { _id: 0, hash: 1, depAdded: 1, depRemoved: 1, date: 1 } },
    ]);
    const newestChange = await SnapshotModel.findOne({ ...filter, archChanges: { $gt: 0 } }).sort({ date: -1 }).select("hash date author").lean<{ hash: string; date: Date; author: string }>();
    const oldest = await SnapshotModel.findOne(filter).sort({ date: 1 }).select("hash date files").lean<{ hash: string; date: Date; files: number }>();
    const removal = await SnapshotModel.findOne({ ...filter, depRemoved: { $gt: 0 } }).sort({ depRemoved: -1 }).select("hash depRemoved").lean<{ hash: string; depRemoved: number }>();
    const facts: TrialFacts = {
      topChange: top ? { hash: top.hash, added: top.depAdded, removed: top.depRemoved } : null,
      newestChange: newestChange ? { hash: newestChange.hash, author: newestChange.author } : null,
      oldest: oldest ? { hash: oldest.hash, files: oldest.files } : null,
      largestRemoval: removal ? { hash: removal.hash, removed: removal.depRemoved } : null,
    };
    const mined = await SnapshotModel.find(filter).select("hash fullHash").lean<{ hash: string; fullHash?: string }[]>();
    const isMined = minedCommitMatcher(mined);

    const contexts: Record<string, { text: string; sha: string; knownCommits: string[]; withheld: boolean; stats: unknown }> = {};
    for (const version of ["1.2", "1.3"] as MentorContextVersion[]) {
      const { context } = await mentorProjectData(project, { version });
      const sha = fingerprint(context.text);
      write(path.join(o.out, "contexts", `${slug}.${version}.${sha}.txt`), context.text);
      contexts[version] = { text: context.text, sha, knownCommits: context.knownCommits, withheld: context.withheld, stats: context.architecture };
    }
    const summary = Object.fromEntries(Object.entries(contexts).map(([v, c]) => [v, {
      chars: c.text.length, approxTokens: Math.round(c.text.length / 4), fingerprint: c.sha, knownCommits: c.knownCommits.length,
      sections: SECTIONS.filter(s => c.text.includes(s)), truncated: { base: c.text.includes("(project data truncated)"), architecture: c.text.includes("(architecture data truncated)") },
      namesTopChange: !!facts.topChange && c.text.includes(`\`${facts.topChange.hash.slice(0, 7)}\``), architecture: c.stats,
    }]));
    console.log(JSON.stringify({ workspace: doc.name, facts, contexts: summary }, null, 2));

    const answers: Record<string, unknown>[] = [];
    if (o.ask) {
      const model = await LlmModelRegistry.resolve(o.model ?? null);
      const modelId = `${model.client.info.provider}/${model.client.info.model}`;
      const questions = (JSON.parse(fs.readFileSync(QUESTIONS_FILE, "utf8")).standard as Question[]).map(q => ({ ...q, text: q.text.replaceAll("{repo}", doc.name) }));
      const plan: { condition: Condition; version: MentorContextVersion | null }[] = [
        { condition: "C0", version: null }, { condition: "C1", version: "1.2" }, { condition: "C2", version: "1.2" }, { condition: "C1", version: "1.3" }, { condition: "C2", version: "1.3" },
      ];
      for (const q of questions) for (const { condition, version } of plan) for (let run = 1; run <= o.runs; run++) {
        const ctx = contexts[version ?? "1.3"];
        const usage = { inputTokens: 0, outputTokens: 0 };
        const started = performance.now();
        let raw = "", error: string | null = null;
        try {
          raw = await model.client.complete(messagesFor(condition, { project, context: ctx.text, question: q.text, mentorPrompt: SYSTEM_PROMPT }),
            { maxTokens: 2000, plain: true, onUsage: u => { usage.inputTokens += u.inputTokens; usage.outputTokens += u.outputTokens; } });
        } catch (e) { error = e instanceof Error ? e.message : String(e); }
        const { text, check } = postProcess(condition, raw, isMined);
        const cited = citedHashes(text);
        const record = {
          workspace: doc.name, questionId: q.id, condition, contextVersion: version, contextSha256: version ? ctx.sha : null, run, model: modelId,
          askedAt: new Date().toISOString(), latencyMs: Math.round(performance.now() - started), usage, error, raw: raw.trim(), text, check,
          citations: cited, validCitations: cited.filter(isMined), checks: error ? null : trialChecks(q.id, text, facts),
        };
        answers.push(record);
        write(path.join(o.out, "answers", `${slug}.${q.id}.${condition}.${version ?? "none"}.r${run}.json`), JSON.stringify(record, null, 2) + "\n");
        console.log(`${q.id} ${condition} ${version ?? "-"} r${run}: ${error ? `ERROR ${error}` : `${text.length} chars, ${cited.length} citations (${record.validCitations.length} valid)`}`);
      }
    }
    write(path.join(o.out, `${slug}.summary.json`), JSON.stringify({ workspace: doc.name, generatedAt: new Date().toISOString(), facts, contexts: summary,
      answers: answers.map(a => ({ questionId: a.questionId, condition: a.condition, contextVersion: a.contextVersion, run: a.run, error: a.error, usage: a.usage, citations: (a.citations as string[]).length, validCitations: (a.validCitations as string[]).length, checks: a.checks, check: a.check })) }, null, 2) + "\n");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
