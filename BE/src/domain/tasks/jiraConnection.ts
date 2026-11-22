// Jira connection (F-13): a workspace reads its tasks straight from Jira Cloud instead of an uploaded export. The issues
// Jira returns go through the same parser and import as a file (jiraExport.ts, ImportTasksUseCase). Pure: no I/O.

/** What a stored connection shows; the API token itself never leaves the server, only its last 4 characters. */
export interface JiraConnectionView {
  site: string;
  email: string;
  jql: string;
  tokenLast4: string;
  lastSyncAt: Date | null;
  updatedAt: Date;
}

export interface JiraCredentials { site: string; email: string; token: string }

/** Issues as the export parser reads them. */
export interface JiraIssues { issues: unknown[]; names: Record<string, string> }

/** Jira Cloud as the use cases need it (implemented by infrastructure/jira/JiraCloudClient). Fails with JiraClientError. */
export interface IJiraClient {
  /** Checks the site, e-mail and token; resolves to the account's display name. */
  myself(c: JiraCredentials): Promise<string>;
  /** Every issue the JQL matches. */
  searchIssues(c: JiraCredentials, jql: string): Promise<JiraIssues>;
}

/** Why a call to Jira failed, so the caller can word it and pick the HTTP status. */
export type JiraFailure = "auth" | "forbidden" | "jql" | "not-found" | "rate-limited" | "unreachable" | "too-many" | "other";

export class JiraClientError extends Error {
  constructor(message: string, public readonly kind: JiraFailure) {
    super(message);
    this.name = "JiraClientError";
  }
}

const SITE_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net$/;

/**
 * The Jira Cloud site as "https://<name>.atlassian.net", from "archtime", "archtime.atlassian.net" or a URL of any page
 * of the site; null for anything else. Only Atlassian Cloud hosts are accepted: the server calls this address with the
 * stored token, so it must never be an internal or arbitrary host.
 */
export function normalizeJiraSite(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let text = raw.trim().toLowerCase();
  if (!text || text.length > 300) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(text)) text = text.includes(".") ? `https://${text}` : `https://${text}.atlassian.net`;
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== "https:" || url.port || url.username || url.password || !SITE_HOST.test(url.hostname)) return null;
  return `https://${url.hostname}`;
}

export const isJiraEmail = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export const MAX_JQL_CHARS = 2000;

/** The JQL as sent to Jira: trimmed, not empty, at most 2000 characters; null otherwise. */
export function normalizeJql(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const jql = raw.trim();
  return jql && jql.length <= MAX_JQL_CHARS ? jql : null;
}

/** Story points and sprint are custom fields whose ids differ between sites: found by name, as the export parser does. */
const STORY_POINT_NAME = /^story\s*points?(\s+estimate)?$/i;
const SPRINT_SCHEMA = "com.pyxis.greenhopper.jira:gh-sprint";

export interface JiraField { id: string; name?: string; schema?: { custom?: string } }

/**
 * From Jira's field list: the fields to ask for, and the "names" map the export parser reads story points and sprint by.
 * The sprint field is recognised by its type, so a site that renamed or translated it is still read.
 */
export function issueFields(fields: readonly JiraField[]): { fields: string[]; names: Record<string, string> } {
  const names: Record<string, string> = {};
  for (const f of fields) {
    if (!f || typeof f.id !== "string") continue;
    if (f.schema?.custom === SPRINT_SCHEMA) names[f.id] = "Sprint";
    else if (typeof f.name === "string" && STORY_POINT_NAME.test(f.name.trim())) names[f.id] = f.name.trim();
  }
  return { fields: ["summary", "status", "assignee", ...Object.keys(names)], names };
}
