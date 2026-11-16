// JiraExportParser (F-13, RF-07, BR-23, BR-25): reads a Jira JSON export into the tasks and sprints of a project.
//
// The format is the one Jira's issue search returns (GET /rest/api/{2,3}/search, or an exported search result):
//   { "issues": [ { "key": "ARCH-12", "fields": { "summary", "status", "assignee", <story points>, <sprint> } } ],
//     "names": { "customfield_10016": "Story point estimate", ... } }      // "names" only with expand=names
// A bare array of issues is accepted too. Story points and sprint are custom fields whose id differs between Jira sites:
// they are found by name through "names" when the export has it, else among the ids Jira Cloud and Server use by default.
//
// The whole file is accepted or the whole file is refused (BR-25): a task without a key is MSG22, any other malformed
// value names the task and the field. Nothing is ever dropped silently, so an import never quietly loses a task (which
// would then be marked removed). Pure: no I/O, no clock.

export const MSG22 = "MSG22";

export type TaskStatusCategory = "todo" | "in-progress" | "done";
export type SprintState = "active" | "future" | "closed";

export interface ParsedTask {
  /** Upper-cased, trimmed: ARCH-12, or a team id such as T22. */
  key: string;
  summary: string;
  /** The Jira status name as written ("In Review"); null when the export has none. */
  status: string | null;
  /** What sprint progress counts: only "done" tasks are done. */
  statusCategory: TaskStatusCategory;
  assignee: string | null;
  storyPoints: number | null;
  /** Id of the task's current sprint (see ParsedSprint.id); null for the backlog. */
  sprint: string | null;
}

export interface ParsedSprint {
  /** "jira:<id>" from the Jira sprint id, or "name:<name>" when the export has no id. */
  id: string;
  name: string;
  state: SprintState | null;
  startDate: Date | null;
  endDate: Date | null;
}

export interface ParsedJiraExport { tasks: ParsedTask[]; sprints: ParsedSprint[] }

export class JiraExportError extends Error {
  constructor(
    message: string,
    /** MSG22 for a task without a key; null for any other reason the file is refused. */
    public readonly messageId: typeof MSG22 | null = null,
    /** 1-based position of the offending task in the file, when one is to blame. */
    public readonly taskIndex: number | null = null,
    /** 1-based line of the file where that task starts (DS-07b: "refused with the line of the bad task"). */
    public readonly line: number | null = null,
  ) {
    super(message);
    this.name = "JiraExportError";
  }
}

/** A Jira issue key (ARCH-12) or a team task id (T22): letters first, then digits, with or without a dash. */
export const TASK_KEY_PATTERN = /^[A-Z][A-Z0-9_]*-?\d+$/;

const STORY_POINT_IDS = ["customfield_10016", "customfield_10026", "customfield_10028", "customfield_10002"];
const SPRINT_IDS = ["customfield_10020", "customfield_10010"];
const STORY_POINT_NAME = /^story\s*points?(\s+estimate)?$/i;
const SPRINT_NAME = /^sprints?$/i;
const REFUSED = "Nothing was imported.";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function refuse(message: string, index: number | null = null, line: number | null = null): never {
  throw new JiraExportError(`${message} ${REFUSED}`, null, index, line);
}

/**
 * The line on which each element of the export's issue list starts, in order: the "issues" array of the root object, or
 * the root array itself. A small scanner over the JSON text (strings and escapes respected); the text is already known
 * to be valid JSON when this runs.
 */
export function issueLines(text: string): number[] {
  const lines: number[] = [];
  const stack: ("object" | "array")[] = [];
  let line = 1, inString = false, escaped = false, stringStart = -1;
  let lastKey: string | null = null, issuesDepth = -1, expectElement = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") line++;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') { inString = false; if (stack.length === 1 && stack[0] === "object") lastKey = text.slice(stringStart + 1, i); }
      continue;
    }
    if (/\s/.test(c) || c === ":") continue;
    if (expectElement && c !== "]") { lines.push(line); expectElement = false; }
    if (c === '"') { inString = true; stringStart = i; continue; }
    if (c === "{" || c === "[") {
      stack.push(c === "{" ? "object" : "array");
      const isIssues = c === "[" && ((stack.length === 1) || (stack.length === 2 && stack[0] === "object" && lastKey === "issues"));
      if (isIssues && issuesDepth < 0) { issuesDepth = stack.length; expectElement = true; }
    } else if (c === "}" || c === "]") {
      if (stack.length === issuesDepth && c === "]") { issuesDepth = -2; expectElement = false; }
      stack.pop();
    } else if (c === "," && stack.length === issuesDepth) {
      expectElement = true;
    }
  }
  return lines;
}

/** The field ids holding story points and the sprint: by name when the export says, else the usual defaults. */
function fieldIds(names: unknown): { storyPoints: string[]; sprint: string[] } {
  const byName = (pattern: RegExp) => isObject(names) ? Object.entries(names).filter(([, n]) => typeof n === "string" && pattern.test(n.trim())).map(([id]) => id) : [];
  const storyPoints = byName(STORY_POINT_NAME), sprint = byName(SPRINT_NAME);
  return {
    storyPoints: storyPoints.length ? storyPoints : ["storyPoints", ...STORY_POINT_IDS],
    sprint: sprint.length ? sprint : ["sprint", ...SPRINT_IDS],
  };
}

const firstPresent = (fields: Record<string, unknown>, ids: string[]) => {
  for (const id of ids) if (fields[id] !== undefined && fields[id] !== null) return fields[id];
  return null;
};

function categoryOf(status: unknown, name: string | null): TaskStatusCategory {
  const key = isObject(status) && isObject(status.statusCategory) ? status.statusCategory.key : undefined;
  if (key === "done") return "done";
  if (key === "indeterminate") return "in-progress";
  if (key === "new") return "todo";
  if (!name) return "todo";
  if (/^(done|closed|resolved|complete|completed)$/i.test(name.trim())) return "done";
  if (/(progress|review|testing|qa)/i.test(name)) return "in-progress";
  return "todo";
}

const toDate = (v: unknown): Date | null => {
  if (typeof v !== "string" || !v.trim() || v === "<null>") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toState = (v: unknown): SprintState | null => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s === "active" || s === "future" || s === "closed" ? s : null;
};

/** Jira Server / Data Center writes a sprint as "com.atlassian.greenhopper.service.sprint.Sprint@1a[id=1,state=ACTIVE,name=…]". */
function legacySprint(text: string): Record<string, string> | null {
  const body = /\[(.*)\]\s*$/s.exec(text)?.[1];
  if (!body) return null;
  const out: Record<string, string> = {};
  for (const part of body.split(/,(?=[A-Za-z]+=)/)) {
    const at = part.indexOf("=");
    if (at > 0) out[part.slice(0, at)] = part.slice(at + 1);
  }
  return out;
}

function parseSprint(raw: unknown, where: string, index: number): ParsedSprint {
  const value = typeof raw === "string" ? legacySprint(raw) : isObject(raw) ? raw : null;
  const name = value && typeof value.name === "string" ? value.name.trim() : "";
  if (!value || !name) refuse(`Task ${index} (${where}): a sprint has no name.`, index);
  const rawId = value.id;
  const id = typeof rawId === "number" || (typeof rawId === "string" && rawId.trim()) ? `jira:${String(rawId).trim()}` : `name:${name}`;
  return { id, name, state: toState(value.state), startDate: toDate(value.startDate), endDate: toDate(value.endDate) };
}

/** Parses the text of a Jira JSON export (or the already parsed value). Throws JiraExportError when the file is refused. */
export function parseJiraExport(input: unknown): ParsedJiraExport {
  let data: unknown = input;
  if (typeof input === "string") {
    if (!input.trim()) refuse("The file is empty.");
    try { data = JSON.parse(input); } catch { refuse("The file is not valid JSON."); }
  }
  const issues = Array.isArray(data) ? data : isObject(data) && Array.isArray(data.issues) ? data.issues : null;
  const lines = typeof input === "string" ? issueLines(input) : [];
  if (!issues) refuse('This is not a Jira JSON export: it has no "issues" list.');
  if (!issues.length) refuse("The export has no tasks.");

  const ids = fieldIds(isObject(data) ? data.names : undefined);
  const tasks: ParsedTask[] = [];
  const sprints = new Map<string, ParsedSprint>();
  const seen = new Set<string>();

  issues.forEach((issue: unknown, i: number) => {
    const n = i + 1;
    const line = lines[i] ?? null;
    const at = line ? ` (line ${line})` : "";
    if (!isObject(issue)) refuse(`Task ${n}${at} is not a Jira issue object.`, n, line);

    // BR-25 / MSG22: a task without a key cannot be matched on the next import, so the file is refused as a whole.
    const rawKey = issue.key;
    if (rawKey === undefined || rawKey === null || (typeof rawKey === "string" && !rawKey.trim())) {
      throw new JiraExportError(`MSG22: task ${n}${at} in the file has no key. Every task of a Jira export needs its key. ${REFUSED}`, MSG22, n, line);
    }
    if (typeof rawKey !== "string") refuse(`Task ${n}${at}: the key must be text.`, n, line);
    const key = rawKey.trim().toUpperCase();
    if (!TASK_KEY_PATTERN.test(key)) refuse(`Task ${n}${at}: "${rawKey}" is not a valid task key.`, n, line);
    if (seen.has(key)) refuse(`Task ${key} appears twice in the file.`, n);
    seen.add(key);

    const fields = issue.fields === undefined || issue.fields === null ? {} : issue.fields;
    if (!isObject(fields)) refuse(`Task ${key}: "fields" must be an object.`, n);

    const summary = fields.summary ?? "";
    if (typeof summary !== "string") refuse(`Task ${key}: the summary must be text.`, n);

    const rawStatus = fields.status ?? null;
    let status: string | null = null;
    if (typeof rawStatus === "string") status = rawStatus.trim() || null;
    else if (isObject(rawStatus) && (rawStatus.name === undefined || typeof rawStatus.name === "string")) status = (rawStatus.name as string | undefined)?.trim() || null;
    else if (rawStatus !== null) refuse(`Task ${key}: the status must be text or a Jira status object.`, n);

    const rawAssignee = fields.assignee ?? null;
    let assignee: string | null = null;
    if (typeof rawAssignee === "string") assignee = rawAssignee.trim() || null;
    else if (isObject(rawAssignee)) {
      const name = rawAssignee.displayName ?? rawAssignee.name ?? rawAssignee.emailAddress ?? null;
      if (name !== null && typeof name !== "string") refuse(`Task ${key}: the assignee has no readable name.`, n);
      assignee = name?.trim() || null;
    } else if (rawAssignee !== null) refuse(`Task ${key}: the assignee must be text or a Jira user object.`, n);

    const rawPoints = firstPresent(fields, ids.storyPoints);
    if (rawPoints !== null && (typeof rawPoints !== "number" || !Number.isFinite(rawPoints) || rawPoints < 0)) {
      refuse(`Task ${key}: story points must be a number of 0 or more.`, n);
    }

    const rawSprint = firstPresent(fields, ids.sprint);
    let sprint: string | null = null;
    if (rawSprint !== null) {
      const list = Array.isArray(rawSprint) ? rawSprint : [rawSprint];
      const parsed = list.map(s => parseSprint(s, key, n));
      for (const s of parsed) if (!sprints.has(s.id)) sprints.set(s.id, s);
      // A task carried over keeps its earlier sprints in the list; it is worked on in the active one, else the last.
      const current = parsed.find(s => s.state === "active") ?? parsed[parsed.length - 1];
      sprint = current?.id ?? null;
    }

    tasks.push({ key, summary, status, statusCategory: categoryOf(rawStatus, status), assignee, storyPoints: rawPoints as number | null, sprint });
  });

  return { tasks, sprints: [...sprints.values()] };
}
