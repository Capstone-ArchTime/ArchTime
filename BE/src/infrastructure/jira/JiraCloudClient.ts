import { issueFields, JiraClientError, type IJiraClient, type JiraCredentials, type JiraField, type JiraIssues } from "../../domain/tasks/jiraConnection.js";

// Jira Cloud REST API v3 (F-13): who the token belongs to, and every issue a JQL matches, in the shape the export parser
// reads ({ issues, names }). Basic auth with the account e-mail and an API token (id.atlassian.com → Security → API tokens).

/** Larger than any capstone board; a JQL matching more is refused rather than read for minutes. */
export const MAX_SYNC_ISSUES = 20_000;
const PAGE_SIZE = 100;
const TIMEOUT_MS = 30_000;

type Fetch = typeof fetch;

export class JiraCloudClient implements IJiraClient {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  async myself(c: JiraCredentials): Promise<string> {
    const me = await this.call<{ displayName?: string; emailAddress?: string }>(c, "GET", "/rest/api/3/myself");
    return me.displayName || me.emailAddress || c.email;
  }

  async searchIssues(c: JiraCredentials, jql: string): Promise<JiraIssues> {
    const { fields, names } = issueFields(await this.call<JiraField[]>(c, "GET", "/rest/api/3/field"));
    const issues: unknown[] = [];
    let nextPageToken: string | undefined;
    do {
      const page = await this.call<{ issues?: unknown[]; nextPageToken?: string; isLast?: boolean }>(c, "POST", "/rest/api/3/search/jql", {
        jql, fields, maxResults: PAGE_SIZE, ...(nextPageToken ? { nextPageToken } : {}),
      });
      issues.push(...(page.issues ?? []));
      if (issues.length > MAX_SYNC_ISSUES) throw new JiraClientError(`The JQL matches more than ${MAX_SYNC_ISSUES} issues. Narrow it down.`, "too-many");
      // A repeated token would loop for ever: stop rather than read the same page again.
      const next = page.isLast ? undefined : page.nextPageToken;
      nextPageToken = next && next !== nextPageToken ? next : undefined;
    } while (nextPageToken);
    return { issues, names };
  }

  private async call<T>(c: JiraCredentials, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${c.site}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${c.email}:${c.token}`).toString("base64")}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new JiraClientError(`Could not reach Jira at ${c.site}.`, "unreachable");
    }
    if (res.ok) {
      try { return (await res.json()) as T; } catch { throw new JiraClientError("Jira answered with something that is not JSON.", "other"); }
    }
    const detail = await errorText(res);
    if (res.status === 401) throw new JiraClientError("Jira refused the e-mail or API token.", "auth");
    if (res.status === 403) throw new JiraClientError("This Jira account is not allowed to do this. Check its permissions on the site.", "forbidden");
    if (res.status === 404) throw new JiraClientError(`No Jira site answers at ${c.site}.`, "not-found");
    if (res.status === 429) throw new JiraClientError("Jira is limiting requests. Try again in a minute.", "rate-limited");
    if (res.status === 400 && path.includes("/search")) throw new JiraClientError(`Jira refused the JQL${detail ? `: ${detail}` : "."}`, "jql");
    throw new JiraClientError(`Jira answered ${res.status}${detail ? `: ${detail}` : "."}`, "other");
  }
}

/** Jira's own error sentences ({ errorMessages, errors }), shortened. */
async function errorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { errorMessages?: unknown; errors?: unknown };
    const messages = [
      ...(Array.isArray(body.errorMessages) ? body.errorMessages : []),
      ...(body.errors && typeof body.errors === "object" ? Object.values(body.errors as Record<string, unknown>) : []),
    ].filter((m): m is string => typeof m === "string");
    return messages.join(" ").slice(0, 300);
  } catch {
    return "";
  }
}
