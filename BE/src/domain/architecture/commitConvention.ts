// The commit convention (RF-30, BM03 #11, BR-33; T5): every commit message is
//
//   type(scope): summary
//
//   Task: <task id, e.g. ARCH-12 or T22>
//   Arch-Change: none | <the components whose dependencies the commit changes>
//
// as COMMIT_CONVENTION (domain/agent/context.ts) tells people and coding agents. This module checks one commit:
//   1. the header format (type from COMMIT_CONVENTION.types, a scope, a summary); merges and reverts git writes itself
//      are exempt;
//   2. the declared architectural intent (Arch-Change) against what the commit really changed: the dependencies between
//      components that differ between the commit's snapshot and its base, measured by bridge.ts and projected onto the
//      confirmed diagram's components by their path prefixes (conformance.ts componentOf, BR-27);
//   3. a commit that changes the architecture names its task (Task:).
// Every problem is a finding of type "convention" in the shape of the conformance findings (D5), so the existing
// findings list, decisions, e-mail and unread counts carry them. Their key holds the commit hash: a decision on one
// commit's message is never carried over to another commit.
//
// Pure and deterministic (N-07): same input, same findings, in the same order.

import { COMMIT_CONVENTION } from "../agent/context.js";
import type { SnapshotGraph } from "./buildView.js";
import { diffResolved, projectImpact, resolveGraph, type FilePair } from "./bridge.js";
import { componentOf, type ConformanceComponent, type ConformanceFinding, type ImportRef } from "./conformance.js";

export type ConventionCode =
  | "invalid-header" | "unknown-type" | "missing-scope" | "missing-summary"
  | "missing-task" | "unknown-component" | "undeclared-change" | "declared-change-not-found";

export interface FormatProblem { code: ConventionCode; message: string }

export type ArchChange = { kind: "missing" } | { kind: "none" } | { kind: "components"; names: string[] };

export interface ParsedCommitMessage {
  /** Null when the subject is not "type(scope): summary" at all (or is a merge / revert). */
  header: { type: string; scope: string; summary: string; breaking: boolean } | null;
  problems: FormatProblem[];
  /** Ids from "Task:" trailers, in order, each once (upper-cased). */
  tasks: string[];
  archChange: ArchChange;
}

/** The marker used as source and target of findings about the message rather than about two components. */
export const COMMIT_SIDE = "(commit)";
const HEADER = /^([A-Za-z][A-Za-z-]*)(?:\(([^)]*)\))?(!)?:(.*)$/;
const GIT_WRITTEN = /^(Merge (branch|pull request|remote-tracking branch|tag|commit|[0-9a-f]{7,40})\b|Revert ")/;
const NONE = /^(none|no|n\/a|-)$/i;

function trailerValues(trailers: readonly string[] | null | undefined, name: string): string[] {
  const out: string[] = [];
  for (const line of trailers ?? []) {
    const m = /^\s*([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*?)\s*$/.exec(line);
    if (m && m[1].toLowerCase() === name.toLowerCase()) out.push(m[2]);
  }
  return out;
}

export function parseCommitMessage(title: string, trailers: readonly string[] | null = []): ParsedCommitMessage {
  const subject = (title ?? "").trim();
  const problems: FormatProblem[] = [];
  let header: ParsedCommitMessage["header"] = null;
  if (!GIT_WRITTEN.test(subject)) {
    const m = HEADER.exec(subject);
    if (!m) {
      problems.push({ code: "invalid-header", message: `The subject "${subject.slice(0, 80)}" is not "type(scope): summary".` });
    } else {
      const [, type, scope = "", bang, rest] = m;
      header = { type: type.toLowerCase(), scope: scope.trim(), summary: rest.trim(), breaking: !!bang };
      if (!COMMIT_CONVENTION.types.includes(header.type)) problems.push({ code: "unknown-type", message: `"${type}" is not a commit type; use one of ${COMMIT_CONVENTION.types.join(", ")}.` });
      if (!header.scope) problems.push({ code: "missing-scope", message: "The subject has no scope: write type(scope): summary." });
      if (!header.summary) problems.push({ code: "missing-summary", message: "The subject has no summary after the colon." });
    }
  }

  const tasks = [...new Set(trailerValues(trailers, "Task").flatMap(v => v.split(/[,;\s]+/)).map(t => t.trim().toUpperCase()).filter(Boolean))];

  const declared = trailerValues(trailers, "Arch-Change").map(v => v.trim()).filter(Boolean);
  let archChange: ArchChange = { kind: "missing" };
  if (declared.length) {
    const names = declared.flatMap(v => v.split(/\s*(?:,|;|->|→|=>)\s*/)).map(n => n.trim()).filter(Boolean);
    archChange = names.length && names.every(n => NONE.test(n)) ? { kind: "none" } : { kind: "components", names: names.filter(n => !NONE.test(n)) };
  }
  return { header, problems, tasks, archChange };
}

export interface ConventionInput {
  /** Short hash of the commit (part of every finding key). */
  hash: string;
  title: string;
  trailers?: readonly string[] | null;
  /** Graph of the commit's base snapshot; null for the first mined commit (nothing to compare with). */
  before: SnapshotGraph | null;
  after: SnapshotGraph;
  /** Components of the confirmed diagram, with their path prefixes. */
  components: ConformanceComponent[];
}

export type ConventionFinding = ConformanceFinding & { type: "convention" };

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The components a declared name means: an id, else a name, ignoring case. */
function resolveName(name: string, components: ConformanceComponent[]): ConformanceComponent | undefined {
  const wanted = name.trim().toLowerCase();
  return components.find(c => c.id.toLowerCase() === wanted) ?? components.find(c => c.name.trim().toLowerCase() === wanted);
}

/** Checks one commit against the convention. Returns its findings (empty when the commit follows it). */
export function checkCommitConvention(input: ConventionInput): ConventionFinding[] {
  const { hash, components } = input;
  const message = parseCommitMessage(input.title, input.trailers ?? []);
  const names = new Map(components.map(c => [c.id, c.name]));
  const findings: ConventionFinding[] = [];
  const add = (code: ConventionCode, text: string, source = COMMIT_SIDE, target = COMMIT_SIDE, imports: ImportRef[] = [], files: string[] = []) => {
    findings.push({
      key: `convention|${code}|${hash}|${source}|${target}`, type: "convention", ruleId: `convention:${code}`, ruleName: text,
      severity: "warning", source, target, imports, files,
    });
  };
  for (const p of message.problems) add(p.code, p.message);

  // What really changed between components (cross dependencies only: a change inside one component, or to files no
  // component owns, is not an architecture change of the diagram).
  const before = input.before ? resolveGraph(input.before) : null;
  const after = resolveGraph(input.after);
  const diff = diffResolved(before, after);
  const owner = new Map<string, string>();
  for (const file of new Set([...(before?.files ?? []), ...after.files])) {
    const id = componentOf(file, components);
    if (id) owner.set(file, id);
  }
  const impact = projectImpact(diff, owner, { pairCap: 200 });
  const changed = impact.componentEdges.filter(e => e.kind === "cross" && e.source && e.target);

  const declared = new Set<string>();
  const unknown: string[] = [];
  if (message.archChange.kind === "components") {
    for (const name of message.archChange.names) {
      const c = resolveName(name, components);
      if (c) declared.add(c.id); else unknown.push(name);
    }
  }

  if (changed.length && !message.tasks.length) {
    add("missing-task", "The commit changes dependencies between components but names no task: add a \"Task:\" trailer.");
  }
  if (unknown.length) {
    add("unknown-component", `Arch-Change names ${unknown.map(n => `"${n}"`).join(", ")}, which the confirmed diagram does not have.`);
  }

  const touched = new Set<string>();
  for (const edge of changed) {
    touched.add(edge.source!); touched.add(edge.target!);
    if (declared.has(edge.source!) || declared.has(edge.target!)) continue;
    const pairs: FilePair[] = [...edge.added.filePairs, ...edge.removed.filePairs];
    const imports = pairs.map(p => ({ from: p.source, to: p.target }));
    const files = [...new Set(pairs.map(p => p.source))].sort(byText);
    const sides = [edge.added.totalFilePairs ? `adds ${edge.added.totalFilePairs}` : "", edge.removed.totalFilePairs ? `removes ${edge.removed.totalFilePairs}` : ""].filter(Boolean).join(" and ");
    const said = message.archChange.kind === "none" ? 'declares "Arch-Change: none"' : message.archChange.kind === "missing" ? "has no Arch-Change trailer" : "does not name either component in Arch-Change";
    add("undeclared-change", `${names.get(edge.source!) ?? edge.source} → ${names.get(edge.target!) ?? edge.target}: the commit ${sides} import${edge.added.totalFilePairs + edge.removed.totalFilePairs === 1 ? "" : "s"} between these components but ${said}.`,
      edge.source!, edge.target!, imports, files);
  }
  for (const id of [...declared].sort(byText)) {
    if (touched.has(id) || !impact.hasBaseline) continue;
    add("declared-change-not-found", `Arch-Change names ${names.get(id) ?? id}, but no dependency between ${names.get(id) ?? id} and another component changed in this commit.`, id, id);
  }
  return findings;
}
