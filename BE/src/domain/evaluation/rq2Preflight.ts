// RQ2 execution readiness (2026-11-24): what must hold before the RQ2 script asks a model, checked without asking it.
// Pure; scripts/rq2.ts gathers the inputs from the database, the environment and the output folder.

import { answerFileName, answerIdOf, CONDITIONS, promptVersionOf, type Question, type RecordedAnswer } from "./rq2.js";

/**
 * The protocol version a run must be approved for. `rq2 run` refuses to ask the model unless --approve-protocol names
 * this version: RQ2 may only start once the team has settled the mentor-context question (docs/mentor-context-audit.md)
 * and recorded the decision in docs/rq2-protocol.md. Raise it together with the protocol document.
 */
export const RQ2_PROTOCOL_VERSION = "1.3";
/** The mentor context version protocol 1.3 prescribes for C1 and C2 (ProjectChatContext.ts MENTOR_CONTEXT_VERSION). */
export const RQ2_CONTEXT_VERSION = "1.3";

/**
 * The mined commits C2's citation check accepts: those still in the repository, exactly as the mentor in the app looks
 * them up (ProjectChatUseCase: `missingSince: null`). Before 2026-11-24 the RQ2 script also accepted vanished commits.
 */
export const minedCommitFilter = (projectId: string) => ({ projectId, missingSince: null });

/** What the PROJECT DATA held, recorded with each answer (the text itself is in contexts/<repo>.<sha>.txt). */
export interface ContextStats { chars: number; truncated: boolean; snapshotsShown: number; evidencesShown: number; hasStructure: boolean }

export function contextStatsOf(text: string, snapshotsShown: number, evidencesShown: number): ContextStats {
  return { chars: text.length, truncated: text.includes("(project data truncated)"), snapshotsShown, evidencesShown, hasStructure: text.includes("LATEST STRUCTURE") };
}

export interface PreflightProblem { severity: "error" | "warning"; check: string; message: string }

export interface PreflightInput {
  repo: string;
  /** docs/rq2/questions.json as read. */
  questionsFile: unknown;
  runs: number;
  /** The model the run would use (provider/model), or why it could not be resolved. Resolved without calling the provider. */
  model: { id: string } | { error: string };
  project: { found: boolean; snapshots: number; evidences: number };
  /** The PROJECT DATA C1 and C2 would receive, its fingerprint, version, and whether the test-set lock withheld its architecture. */
  context: { text: string; sha: string; version?: string; withheld?: boolean } | null;
  /** Answers already in the output folder, with their file names. */
  existing: { file: string; answer: RecordedAnswer }[];
  mentorPrompt: string;
  /** The value given to --approve-protocol, if any. */
  approvedProtocol: string | null;
}

/** The questions of one repository in the question file; [] when it has none. */
export function questionsOf(file: unknown, repo: string): Question[] {
  const f = file as { repos?: { repo: string; questions: unknown }[]; standard?: Question[] } | null;
  const entry = f?.repos?.find(r => r.repo === repo);
  if (!entry) return [];
  return entry.questions === "standard" ? f?.standard ?? [] : Array.isArray(entry.questions) ? (entry.questions as Question[]) : [];
}

/**
 * Everything that must hold before RQ2 asks a model: an approved protocol, a configured model, a complete and
 * well-formed question set, a mined workspace with evidence, complete project data, and answers already collected that
 * are consistent with this run (same prompt versions, model and project data; no duplicate or misnamed answer ids).
 * Errors block the run; warnings are reported.
 */
export function preflightProblems(input: PreflightInput): PreflightProblem[] {
  const out: PreflightProblem[] = [];
  const err = (check: string, message: string) => out.push({ severity: "error", check, message });
  const warn = (check: string, message: string) => out.push({ severity: "warning", check, message });

  if (input.approvedProtocol !== RQ2_PROTOCOL_VERSION) {
    err("protocol", `RQ2 protocol ${RQ2_PROTOCOL_VERSION} is not approved for this run (--approve-protocol ${input.approvedProtocol ?? "is missing"}). Settle and record the mentor-context decision first (docs/mentor-context-audit.md).`);
  }
  if ("error" in input.model) err("model", `No usable model: ${input.model.error}`);

  const file = input.questionsFile as { version?: unknown; repos?: { repo: string }[] } | null;
  const questions = questionsOf(input.questionsFile, input.repo);
  if (!file || typeof file !== "object") err("questions", "docs/rq2/questions.json is missing or not an object.");
  else {
    if (typeof file.version !== "string" || !file.version) err("questions", "The question set has no version.");
    if (!file.repos?.some(r => r.repo === input.repo)) err("questions", `No questions for repository "${input.repo}".`);
    else {
      if (questions.length !== 10) err("questions", `${questions.length} questions for ${input.repo}; the protocol has 10.`);
      const ids = questions.map(q => q?.id);
      if (new Set(ids).size !== ids.length) err("questions", "Question ids are not unique.");
      for (const q of questions) {
        if (!q || typeof q.id !== "string" || typeof q.text !== "string" || !q.text.trim() || typeof q.expected !== "string" || !q.expected.trim() || typeof q.answerable !== "boolean") {
          err("questions", `Question ${q?.id ?? "?"} needs id, text, expected and answerable.`);
        } else if (/\{(?!repo\})[a-z]+\}/i.test(q.text)) err("questions", `Question ${q.id} has an unknown placeholder.`);
      }
      if (questions.length === 10 && questions.filter(q => q?.answerable === false).length !== 2) err("questions", "The protocol has 8 answerable and 2 unanswerable questions per repository.");
    }
  }

  if (!input.project.found) err("project", "The workspace does not exist.");
  else {
    if (!input.project.snapshots) err("project", "The workspace has no mined snapshot.");
    if (!input.project.evidences) err("project", "The workspace has no change evidence: Q3, Q4 and Q7 cannot be answered from it.");
  }
  if (!input.context || !input.context.text.trim()) err("context", "The project data is empty.");
  else {
    const version = input.context.version ?? "1.2";
    if (version !== RQ2_CONTEXT_VERSION) err("context", `The project data is version ${version}; protocol ${RQ2_PROTOCOL_VERSION} prescribes ${RQ2_CONTEXT_VERSION}.`);
    if (input.context.withheld) err("context", "The ARCHITECTURE block is withheld by the test-set lock. Lift it (ARCHTIME_TEST_SET_LOCK=off) only after both RQ1-B annotators have submitted.");
    const sections = version === "1.3" ? ["SNAPSHOTS", "CHANGE EVIDENCE", "COMPONENTS at milestone", "COMPONENT DEPENDENCIES", "EVOLUTION EVENTS", "MILESTONES", "LARGEST DEPENDENCY CHANGES", "FOLDERS of the latest snapshot"] : ["SNAPSHOTS", "CHANGE EVIDENCE", "LATEST STRUCTURE"];
    if (!input.context.withheld) for (const s of sections) if (!input.context.text.includes(s)) err("context", `The project data has no ${s} section.`);
    if (input.context.text.includes("(project data truncated)")) warn("context", "The snapshot/evidence part was cut at its character budget.");
    if (input.context.text.includes("(architecture data truncated)")) warn("context", "The ARCHITECTURE block was cut at its character budget (sections cap themselves first; this means the block as a whole overflowed).");
  }

  const ids = new Map<string, string[]>();
  for (const { file: name, answer } of input.existing) {
    if (answer.repo !== input.repo) continue;
    const id = answerIdOf(answer);
    ids.set(id, [...(ids.get(id) ?? []), name]);
    if (answer.answerId && answer.answerId !== id) err("answers", `${name} says ${answer.answerId} but holds ${id}.`);
    if (name !== answerFileName(answer)) err("answers", `${name} holds ${id}; its file name should be ${answerFileName(answer)}.`);
    if (!CONDITIONS.includes(answer.condition)) err("answers", `${name}: unknown condition ${String(answer.condition)}.`);
    if ((answer.run ?? 1) > input.runs) warn("answers", `${name}: run ${answer.run} is beyond --runs ${input.runs}.`);
    if (questions.length && !questions.some(q => q.id === answer.questionId)) err("answers", `${name}: question ${answer.questionId} is not in the question set.`);
    const expected = promptVersionOf(answer.condition, input.mentorPrompt);
    if (!answer.promptVersion) warn("answers", `${name} has no prompt version (recorded before 2026-11-24); it cannot be checked against this run.`);
    else if (answer.promptVersion !== expected) err("answers", `${name} was produced with prompt ${answer.promptVersion}; this run would use ${expected}. Do not mix them.`);
    if ("id" in input.model && answer.model !== input.model.id) err("answers", `${name} was produced by ${answer.model}; this run would use ${input.model.id}.`);
    if (answer.contextVersion && input.context?.version && answer.contextVersion !== input.context.version) err("answers", `${name} used context version ${answer.contextVersion}; this run would use ${input.context.version}.`);
    if (input.context && answer.condition !== "C0" && answer.contextSha256 && answer.contextSha256 !== input.context.sha) {
      err("answers", `${name} saw project data ${answer.contextSha256}; the workspace now gives ${input.context.sha} (the data changed since).`);
    }
  }
  for (const [id, files] of ids) if (files.length > 1) err("answers", `Answer id ${id} appears in ${files.length} files: ${files.join(", ")}.`);
  return out;
}

/** How many answer slots of a repository are filled: questions × conditions × runs. */
export function answerSlots(repo: string, questionIds: string[], runs: number, existing: RecordedAnswer[]): { expected: number; present: number; missing: string[] } {
  const have = new Set(existing.filter(a => a.repo === repo).map(a => answerIdOf(a)));
  const all = questionIds.flatMap(q => CONDITIONS.flatMap(c => Array.from({ length: runs }, (_, i) => answerIdOf({ repo, questionId: q, condition: c, run: i + 1 }))));
  return { expected: all.length, present: all.filter(id => have.has(id)).length, missing: all.filter(id => !have.has(id)) };
}
