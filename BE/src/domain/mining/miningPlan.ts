// Pure helpers for batch mining: no database or git access, so they are unit-testable.

export interface CommitRef {
  hash: string;
  date: Date;
  author: string;
  ref: string;
  message: string;
}

export type MineMode = "range" | "remaining";

export interface MineRequest {
  mode: MineMode;
  since?: Date;
  until?: Date;
  force: boolean;
}

export interface MonthBucket {
  month: string; // YYYY-MM (UTC)
  commits: number;
}

export const DEFAULT_BATCH_SIZE = 50;
const FIELD = "\x1f";
export const GIT_LOG_FORMAT = ["%H", "%aI", "%ae", "%S", "%s"].join(FIELD);

export function parseCommitLog(raw: string): CommitRef[] {
  const commits: CommitRef[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const [hash, iso, author, source, ...subject] = line.split(FIELD);
    const date = new Date(iso);
    if (!/^[0-9a-f]{7,64}$/i.test(hash ?? "") || Number.isNaN(date.getTime())) continue;
    commits.push({
      hash,
      date,
      author: author ?? "",
      ref: (source ?? "").replace(/^refs\/(remotes\/origin|heads|tags)\//, ""),
      message: subject.join(FIELD),
    });
  }
  return commits;
}

function parseBound(value: unknown, field: string, endOfDay: boolean): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be an ISO date string`);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} is not a valid date`);
  return date;
}

export function parseMineRequest(body: unknown): MineRequest {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const mode = input.mode ?? "remaining";
  if (mode !== "range" && mode !== "remaining") throw new Error('mode must be "range" or "remaining"');
  const since = mode === "range" ? parseBound(input.since, "since", false) : undefined;
  const until = mode === "range" ? parseBound(input.until, "until", true) : undefined;
  if (mode === "range" && !since && !until) throw new Error("A range needs since and/or until");
  if (since && until && since > until) throw new Error("since must not be after until");
  return { mode, since, until, force: mode === "range" && input.force === true };
}

export interface MinedIndex {
  full: Set<string>;
  short: Set<string>; // legacy snapshots stored only 7 characters
}

export function selectPending(commits: CommitRef[], mined: MinedIndex, request: MineRequest): CommitRef[] {
  const seen = new Set<string>();
  return commits.filter((c) => {
    if (seen.has(c.hash)) return false;
    seen.add(c.hash);
    if (request.since && c.date < request.since) return false;
    if (request.until && c.date > request.until) return false;
    if (request.force) return true;
    return !(mined.full.has(c.hash) || mined.short.has(c.hash.slice(0, 7)));
  });
}

export function chunk<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

export function monthlyHistogram(commits: Pick<CommitRef, "date">[]): MonthBucket[] {
  const counts = new Map<string, number>();
  for (const { date } of commits) {
    const month = date.toISOString().slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, commits]) => ({ month, commits }));
}

// Clone/fetch/scan occupy 0-10%, commit analysis 10-100%.
export function analysisProgress(processed: number, total: number): number {
  if (total <= 0) return 100;
  return Math.min(100, 10 + Math.round((Math.min(processed, total) / total) * 90));
}

export function redactSecret(text: string, secret?: string): string {
  let out = text.replace(/(https?:\/\/)[^/\s@]+@/gi, "$1***@");
  if (secret) out = out.split(secret).join("***");
  return out;
}
