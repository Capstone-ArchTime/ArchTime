import { BadRequestError } from "../../../shared/errors/AppError.js";

export const CHAT_LIMITS = {
  maxMessages: 10,
  maxMessageChars: 4000,
  maxContextChars: 24_000,
  snapshots: 15,
  evidences: 25,
  nodes: 60,
} as const;

export interface ChatTurn { role: "user" | "assistant"; content: string }

export interface ChatProject { name: string; description?: string; repoUrl: string }
export interface ChatSnapshot {
  hash: string; fullHash?: string; version?: string; title: string; author: string; date: Date | string;
  files: number; archChanges: number; depAdded: number; depRemoved: number;
}
export interface ChatEvidence {
  commit: string; changeTitle: string; type: string; date: Date | string; files: number; summary: string;
  depsAdded: number; depsRemoved: number; sourceFiles: string[];
}
export interface ChatStructure { hash: string; title: string; nodeCount: number; edgeCount: number; nodes: { name: string; type: string }[] }
export interface ChatContextInput {
  project: ChatProject;
  snapshots: ChatSnapshot[]; snapshotTotal: number;
  evidences: ChatEvidence[]; evidenceTotal: number;
  structure: ChatStructure | null;
}
export interface ChatCitations { commits: string[]; files: number; dependencies: { added: number; removed: number } }

/** Validates what the browser sent and keeps the most recent turns, starting and ending with the user. */
export function parseChatMessages(input: unknown): ChatTurn[] {
  if (!Array.isArray(input) || input.length === 0) throw new BadRequestError("messages must be a non-empty array.");
  const turns: ChatTurn[] = [];
  for (const item of input) {
    const role = (item as { role?: unknown } | null)?.role;
    const content = (item as { content?: unknown } | null)?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      throw new BadRequestError("Each message needs a role (user or assistant) and text content.");
    }
    const text = content.trim();
    if (!text) continue;
    if (text.length > CHAT_LIMITS.maxMessageChars) {
      throw new BadRequestError(`A message is longer than ${CHAT_LIMITS.maxMessageChars} characters.`);
    }
    turns.push({ role, content: text });
  }
  const recent = turns.slice(-CHAT_LIMITS.maxMessages);
  while (recent.length > 0 && recent[0].role !== "user") recent.shift();
  if (recent.length === 0 || recent[recent.length - 1].role !== "user") {
    throw new BadRequestError("The last message must come from the user.");
  }
  return recent;
}

const clip = (text: string, max: number) => {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
const day = (value: Date | string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "unknown date" : d.toISOString().slice(0, 10);
};
export const shortHash = (hash: string) => String(hash ?? "").trim().toLowerCase().slice(0, 7);

/** The repository address without any credentials that may be embedded in it. */
function publicRepoUrl(repoUrl: string): string {
  try {
    const url = new URL(repoUrl);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return clip(repoUrl, 200);
  }
}

/** Plain-text project data for the prompt. Never includes the project's access token. */
export function buildProjectContext(input: ChatContextInput): { text: string; knownCommits: string[] } {
  const { project, snapshots, evidences, structure } = input;
  const known = new Set<string>();
  const lines: string[] = [];

  lines.push(`PROJECT: ${clip(project.name, 120)}`);
  lines.push(`Repository: ${publicRepoUrl(project.repoUrl)}`);
  if (project.description) lines.push(`Description: ${clip(project.description, 400)}`);

  lines.push("", `SNAPSHOTS (newest first; showing ${snapshots.length} of ${input.snapshotTotal}):`);
  if (snapshots.length === 0) lines.push("- none recorded yet");
  for (const s of snapshots) {
    if (shortHash(s.hash)) known.add(shortHash(s.hash));
    const version = s.version ? ` ${clip(s.version, 30)}` : "";
    lines.push(`- \`${shortHash(s.hash)}\`${version} ${day(s.date)} "${clip(s.title, 120)}" by ${clip(s.author, 60)}: ${s.files} files, ${s.archChanges} architectural changes, +${s.depAdded}/-${s.depRemoved} dependencies`);
  }

  lines.push("", `CHANGE EVIDENCE (newest first; showing ${evidences.length} of ${input.evidenceTotal}):`);
  if (evidences.length === 0) lines.push("- none recorded yet");
  for (const e of evidences) {
    if (shortHash(e.commit)) known.add(shortHash(e.commit));
    const files = (e.sourceFiles ?? []).slice(0, 6).map(f => clip(f, 80)).join(", ");
    lines.push(`- [${clip(e.type, 40)}] \`${shortHash(e.commit)}\` ${day(e.date)} "${clip(e.changeTitle, 120)}": ${clip(e.summary, 300)} (${e.files} files, +${e.depsAdded}/-${e.depsRemoved} dependencies${files ? `; files: ${files}` : ""})`);
  }

  if (structure) {
    lines.push("", `LATEST STRUCTURE (snapshot \`${shortHash(structure.hash)}\` "${clip(structure.title, 80)}"): ${structure.nodeCount} nodes, ${structure.edgeCount} edges.`);
    const byType = new Map<string, string[]>();
    for (const n of structure.nodes.slice(0, CHAT_LIMITS.nodes)) {
      const list = byType.get(n.type || "node") ?? [];
      list.push(clip(n.name, 60));
      byType.set(n.type || "node", list);
    }
    for (const [type, names] of byType) lines.push(`- ${clip(type, 30)}: ${names.join(", ")}`);
    if (structure.nodeCount > CHAT_LIMITS.nodes) lines.push(`(${structure.nodeCount - CHAT_LIMITS.nodes} more nodes not listed)`);
  }

  let text = lines.join("\n");
  if (text.length > CHAT_LIMITS.maxContextChars) text = `${text.slice(0, CHAT_LIMITS.maxContextChars)}\n(project data truncated)`;
  return { text, knownCommits: [...known] };
}

/** Commits the answer names that exist in the project data, with the size of the changes they belong to. */
export function citedEvidence(answer: string, evidences: ChatEvidence[], snapshots: ChatSnapshot[]): ChatCitations | null {
  const tokens = new Set((answer.toLowerCase().match(/\b[0-9a-f]{7,40}\b/g) ?? []));
  if (tokens.size === 0) return null;
  const matches = (hash: string) => {
    const full = String(hash ?? "").trim().toLowerCase();
    if (full.length < 7) return false;
    for (const token of tokens) if (full.startsWith(token) || token.startsWith(full)) return true;
    return false;
  };
  const commits = new Set<string>();
  let files = 0, added = 0, removed = 0;
  for (const s of snapshots) if (matches(s.fullHash || s.hash) || matches(s.hash)) commits.add(shortHash(s.hash));
  const counted = new Set<string>();
  for (const e of evidences) {
    if (!matches(e.commit)) continue;
    commits.add(shortHash(e.commit));
    if (counted.has(shortHash(e.commit))) continue;
    counted.add(shortHash(e.commit));
    files += e.files; added += e.depsAdded; removed += e.depsRemoved;
  }
  if (commits.size === 0) return null;
  return { commits: [...commits], files, dependencies: { added, removed } };
}
