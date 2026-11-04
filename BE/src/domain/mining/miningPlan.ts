// Pure helpers for batch mining: no database or git access, so they are unit-testable.

export interface CommitRef {
  hash: string;
  date: Date;
  author: string;
  ref: string;
  message: string;
  /** Full hashes of the parents, first parent first; empty for a root commit. */
  parents: string[];
}

/**
 * range:      commits in a date range.
 * remaining:  every commit not mined yet, oldest first.
 * milestones: the same commits as remaining, but the tagged ones (releases) first, so the architecture at each release
 *             is known early in a long history; the rest follows in the same job unless `milestonesOnly`.
 */
export type MineMode = "range" | "remaining" | "milestones";

export interface MineRequest {
  mode: MineMode;
  since?: Date;
  until?: Date;
  force: boolean;
  /** milestones mode: stop after the tagged commits. Continue later with "remaining". */
  milestonesOnly?: boolean;
}

/** Tag names by the full hash of the commit they point at (annotated tags are peeled to their commit). */
export type TagIndex = Map<string, string[]>;

/** The format parseTagRefs reads: name, object, and the commit an annotated tag points at. */
const TAG_FIELD = "\x1f";
export const TAG_REF_FORMAT = ["%(refname:short)", "%(objectname)", "%(*objectname)"].join(TAG_FIELD);

export function parseTagRefs(raw: string): TagIndex {
  const tags: TagIndex = new Map();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const [name, object, peeled] = line.split(TAG_FIELD);
    const commit = (peeled || object || "").trim().toLowerCase();
    if (!name?.trim() || !/^[0-9a-f]{40,64}$/.test(commit)) continue;
    const list = tags.get(commit) ?? [];
    list.push(name.trim());
    tags.set(commit, list);
  }
  for (const list of tags.values()) list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return tags;
}

/** What a snapshot is called: its tags when it has any (shown wherever snapshots are listed), else its short hash. */
export function snapshotLabel(hash: string, tags: TagIndex): string {
  const names = tags.get(hash.toLowerCase());
  return names?.length ? names.join(", ").slice(0, 120) : hash.slice(0, 7);
}

/**
 * The order to mine the pending commits in. In milestones mode the tagged commits come first (oldest first), then the
 * others (oldest first), or only the tagged ones when `milestonesOnly`. Other modes keep the given order. Nothing is
 * added or repeated: the result is a reordering (or, milestones-only, a subset) of `pending`.
 */
export function orderForMining(pending: CommitRef[], tags: TagIndex, request: Pick<MineRequest, "mode" | "milestonesOnly">): CommitRef[] {
  if (request.mode !== "milestones") return pending;
  const tagged = pending.filter(c => tags.has(c.hash.toLowerCase()));
  if (request.milestonesOnly) return tagged;
  return [...tagged, ...pending.filter(c => !tags.has(c.hash.toLowerCase()))];
}

export interface MonthBucket {
  month: string; // YYYY-MM (UTC)
  commits: number;
}

export const DEFAULT_BATCH_SIZE = 50;
const FIELD = "\x1f";
export const GIT_LOG_FORMAT = ["%H", "%aI", "%ae", "%S", "%P", "%s"].join(FIELD);

export function parseCommitLog(raw: string): CommitRef[] {
  const commits: CommitRef[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const [hash, iso, author, source, parents, ...subject] = line.split(FIELD);
    const date = new Date(iso);
    if (!/^[0-9a-f]{7,64}$/i.test(hash ?? "") || Number.isNaN(date.getTime())) continue;
    commits.push({
      hash,
      date,
      author: author ?? "",
      ref: (source ?? "").replace(/^refs\/(remotes\/origin|heads|tags)\//, ""),
      message: subject.join(FIELD),
      parents: (parents ?? "").split(" ").filter(p => /^[0-9a-f]{7,64}$/i.test(p)),
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
  if (mode !== "range" && mode !== "remaining" && mode !== "milestones") throw new Error('mode must be "range", "remaining" or "milestones"');
  const since = mode === "range" ? parseBound(input.since, "since", false) : undefined;
  const until = mode === "range" ? parseBound(input.until, "until", true) : undefined;
  if (mode === "range" && !since && !until) throw new Error("A range needs since and/or until");
  if (since && until && since > until) throw new Error("since must not be after until");
  return {
    mode, since, until, force: mode === "range" && input.force === true,
    ...(mode === "milestones" ? { milestonesOnly: input.milestonesOnly === true } : {}),
  };
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
