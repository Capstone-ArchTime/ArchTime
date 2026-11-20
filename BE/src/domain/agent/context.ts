// What a coding agent is told about the architecture (RF-09, UC-44, BR-31): for one file, the component it belongs to,
// which components it may and may not depend on, the design decisions about it and the commit convention, all taken
// from the confirmed component diagram. Names, paths and decisions only: never any source code. Pure, so unit-testable.

import { createHash, randomBytes } from "node:crypto";
import type { IWorkspace, IWorkspaceComponent } from "../entities/Workspace.js";
import { componentOf } from "../architecture/conformance.js";
import { normalizePathPrefix } from "../architecture/paths.js";

/** The team's convention (SEP490 task list): what an agent should write in a commit message. */
export const COMMIT_CONVENTION = {
  format: "type(scope): summary",
  types: ["feat", "fix", "refactor", "test", "docs", "chore"],
  trailers: [
    { name: "Task", meaning: "The task id the commit belongs to." },
    { name: "Arch-Change", meaning: "none, or the components whose dependencies the commit changes (they need an architecture change request)." },
  ],
  example: "fix(billing): stop reading orders directly\n\nTask: D6\nArch-Change: none",
};

export interface ComponentRef { id: string; name: string; kind: string; description: string; pathPrefixes: string[] }
export interface RuleRef { rule: string; severity: "error" | "warning"; rationale: string }

export interface AgentContext {
  file: string;
  /** Null when no path prefix of the diagram covers the file. */
  component: ComponentRef | null;
  /** Components this one may depend on: the diagram declares the dependency, or a rule requires it. */
  allowedDependencies: (Omit<ComponentRef, "pathPrefixes" | "description"> & { reason: "declared" | "required"; rule?: string })[];
  /** Components this one must not depend on: an enabled forbidden rule. */
  forbiddenDependencies: (Omit<ComponentRef, "pathPrefixes" | "description"> & RuleRef)[];
  /** Components that must not depend on this one: why changes here should not add callers from there. */
  forbiddenCallers: (Omit<ComponentRef, "pathPrefixes" | "description"> & RuleRef)[];
  /** Accepted and proposed ADRs about this component, newest first. */
  decisions: { number: number; title: string; status: string; decision: string; consequences: string }[];
  commitConvention: typeof COMMIT_CONVENTION;
  diagram: { confirmedAt: string | null; baselineCommit: string | null; revision: number | null };
  guidance: string[];
}

const ref = (c: IWorkspaceComponent): ComponentRef => ({ id: c.id, name: c.name, kind: c.kind, description: c.description ?? "", pathPrefixes: c.pathPrefixes ?? [] });
const short = (c: IWorkspaceComponent) => ({ id: c.id, name: c.name, kind: c.kind });
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

/** The component a rule end names: its id, else its name ignoring case (as the rules page stores it). */
function resolve(value: string, components: IWorkspaceComponent[]): IWorkspaceComponent | undefined {
  const wanted = value.trim();
  return components.find(c => c.id === wanted) ?? components.find(c => c.name.trim().toLowerCase() === wanted.toLowerCase());
}

/** Null for a path the diagram cannot speak about (empty, absolute, climbing out with ".."). */
export function agentContextFor(rawFile: unknown, workspace: Pick<IWorkspace, "diagram" | "rules" | "decisions" | "revision">): AgentContext | null {
  const file = normalizePathPrefix(rawFile);
  if (!file) return null;
  const components = workspace.diagram?.components ?? [];
  const rules = (workspace.rules ?? []).filter(r => r.enabled);
  const id = componentOf(file, components);
  const own = id ? components.find(c => c.id === id) ?? null : null;
  const context: AgentContext = {
    file,
    component: own ? ref(own) : null,
    allowedDependencies: [],
    forbiddenDependencies: [],
    forbiddenCallers: [],
    decisions: [],
    commitConvention: COMMIT_CONVENTION,
    diagram: {
      confirmedAt: workspace.diagram?.confirmedAt ? new Date(workspace.diagram.confirmedAt).toISOString() : null,
      baselineCommit: workspace.diagram?.baselineCommit ?? null,
      revision: workspace.revision ?? null,
    },
    guidance: [],
  };
  if (!own) {
    context.guidance.push("No component of the confirmed diagram covers this file. Ask a maintainer which component it belongs to before adding dependencies from it.");
    return context;
  }

  const allowed = new Map<string, AgentContext["allowedDependencies"][number]>();
  for (const d of workspace.diagram.dependencies ?? []) {
    const target = d.source === own.id ? components.find(c => c.id === d.target) : undefined;
    if (target && target.id !== own.id) allowed.set(target.id, { ...short(target), reason: "declared" });
  }
  for (const r of rules) {
    const source = resolve(r.source, components), target = resolve(r.target, components);
    if (!source || !target) continue;
    const why = { rule: r.name, severity: r.severity, rationale: r.rationale ?? "" };
    if (r.constraint === "required" && source.id === own.id && !allowed.has(target.id)) allowed.set(target.id, { ...short(target), reason: "required", rule: r.name });
    if (r.constraint === "forbidden" && source.id === own.id) context.forbiddenDependencies.push({ ...short(target), ...why });
    if (r.constraint === "forbidden" && target.id === own.id) context.forbiddenCallers.push({ ...short(source), ...why });
  }
  // A forbidden rule wins over a declared dependency: the diagram and the rules disagree, and the rule is the stricter.
  for (const f of context.forbiddenDependencies) allowed.delete(f.id);
  context.allowedDependencies = [...allowed.values()].sort(byName);
  context.forbiddenDependencies.sort(byName);
  context.forbiddenCallers.sort(byName);

  context.decisions = (workspace.decisions ?? [])
    .filter(d => d.status !== "Deprecated" && (d.componentIds ?? []).includes(own.id))
    .sort((a, b) => b.number - a.number)
    .map(d => ({ number: d.number, title: d.title, status: d.status, decision: d.decision ?? "", consequences: d.consequences ?? "" }));

  context.guidance.push(
    `Keep changes to ${own.name} inside its responsibility${own.description ? `: ${own.description}` : "."}`,
    "Only add imports to components listed in allowedDependencies. Any other dependency departs from the confirmed diagram and will be reported by the conformance check.",
    "If the change needs a new dependency, say so in the commit (Arch-Change trailer) so a maintainer can raise an architecture change request.",
  );
  return context;
}

// ── AGENTS.md ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const cell = (s: string) => (s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

/** AGENTS.md for a project, from its confirmed diagram (RF-09). */
export function buildAgentsMd(projectName: string, workspace: Pick<IWorkspace, "diagram" | "rules" | "decisions" | "revision">, apiBase: string): string {
  const d = workspace.diagram;
  const components = [...(d?.components ?? [])].sort(byName);
  const name = (id: string) => components.find(c => c.id === id)?.name ?? id;
  const rules = (workspace.rules ?? []).filter(r => r.enabled);
  const confirmed = d?.confirmedAt ? new Date(d.confirmedAt).toISOString().slice(0, 10) : null;
  const lines: string[] = [
    `# AGENTS.md — ${projectName}`,
    "",
    `Architecture rules for coding agents, generated by ArchTime from the confirmed component diagram${confirmed ? ` (confirmed ${confirmed}, revision ${workspace.revision}${d?.baselineCommit ? `, baseline commit ${d.baselineCommit.slice(0, 7)}` : ""})` : ""}.`,
    "Regenerate it after the diagram changes. It holds no source code.",
    "",
    "## Components",
    "",
    "| Component | Kind | Paths | Responsibility |",
    "|---|---|---|---|",
    ...components.map(c => `| ${cell(c.name)} | ${cell(c.kind)} | ${(c.pathPrefixes ?? []).map(p => `\`${p}\``).join(", ") || "_not mapped_"} | ${cell(c.description)} |`),
    "",
    "A file belongs to the component with the longest path prefix that contains it.",
    "",
    "## Allowed dependencies",
    "",
    ...((d?.dependencies ?? []).length
      ? [...(d?.dependencies ?? [])].map(e => `- ${name(e.source)} → ${name(e.target)}${e.label ? ` (${cell(e.label)})` : ""}`).sort()
      : ["- None declared."]),
    "",
    "Any other dependency between components departs from the diagram and is reported by the conformance check.",
    "",
    "## Rules",
    "",
    ...(rules.length
      ? rules.map(r => `- **${r.constraint === "forbidden" ? "Forbidden" : "Required"}** (${r.severity}): ${name(resolve(r.source, components)?.id ?? r.source)} → ${name(resolve(r.target, components)?.id ?? r.target)} — ${cell(r.name)}${r.rationale ? `. ${cell(r.rationale)}` : ""}`).sort()
      : ["- None."]),
    "",
    "## Design decisions",
    "",
  ];
  const decisions = (workspace.decisions ?? []).filter(x => x.status !== "Deprecated").sort((a, b) => a.number - b.number);
  if (!decisions.length) lines.push("- None recorded.");
  for (const x of decisions) {
    const about = (x.componentIds ?? []).map(name).join(", ");
    lines.push(`- **ADR-${x.number} ${cell(x.title)}** (${x.status}${about ? `; ${about}` : ""}): ${cell(x.decision)}`);
  }
  lines.push(
    "",
    "## Commits",
    "",
    `Format: \`${COMMIT_CONVENTION.format}\` with types ${COMMIT_CONVENTION.types.map(t => `\`${t}\``).join(", ")}. Trailers:`,
    ...COMMIT_CONVENTION.trailers.map(t => `- \`${t.name}:\` ${t.meaning}`),
    "",
    "```",
    COMMIT_CONVENTION.example,
    "```",
    "",
    "## Ask before you change a file",
    "",
    "With a project token from ArchTime (Agent Access page):",
    "",
    "```",
    `curl -H "Authorization: Bearer $ARCHTIME_AGENT_TOKEN" "${apiBase.replace(/\/+$/, "")}/agent/context?file=<path/in/repo>"`,
    "```",
    "",
    "The answer names the file's component, the components it may and may not depend on, the design decisions about it and this commit convention.",
    "",
  );
  return lines.join("\n");
}

// ── Tokens (BR-30) ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const AGENT_TOKEN_PREFIX = "atk_";
export const MAX_TOKEN_DAYS = 90;
export const DEFAULT_TOKEN_DAYS = 30;

/** A new token: shown once; only its hash is stored, with a short prefix so people can tell tokens apart. */
export function newAgentToken(): { token: string; hash: string; prefix: string } {
  const token = AGENT_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashAgentToken(token), prefix: token.slice(0, AGENT_TOKEN_PREFIX.length + 6) };
}

export const hashAgentToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Days until expiry, between 1 and MAX_TOKEN_DAYS; null when the value is not a whole number in that range. */
export function tokenDays(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return DEFAULT_TOKEN_DAYS;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_TOKEN_DAYS ? n : null;
}
