import type { IJiraConnectionRepository } from "../../../domain/interfaces/IJiraConnectionRepository.js";
import {
  isJiraEmail, JiraClientError, MAX_JQL_CHARS, normalizeJiraSite, normalizeJql, type IJiraClient, type JiraConnectionView,
} from "../../../domain/tasks/jiraConnection.js";
import { AppError, BadRequestError, NotFoundError, ValidationError } from "../../../shared/errors/AppError.js";
import type { ImportSummary, ImportTasksUseCase } from "./TaskUseCases.js";

// Jira connection of a workspace (F-13): instead of uploading an export, a maintainer stores the site, an account
// e-mail with an API token, and a JQL; a sync reads the matching issues from Jira and imports them exactly as a file
// would be (same parser, same rules: update by key, never duplicate, mark missing tasks removed).

const MAX_TOKEN_CHARS = 1000;

/** Jira's refusals are the request's fault (400), never a 401: that would sign the ArchTime user out. */
function fromJira(error: unknown): never {
  if (error instanceof JiraClientError) {
    if (error.kind === "unreachable" || error.kind === "rate-limited") throw new AppError(503, "SERVICE_UNAVAILABLE", error.message);
    throw new BadRequestError(error.message);
  }
  throw error;
}

export interface SaveJiraConnectionInput { site?: unknown; email?: unknown; token?: unknown; jql?: unknown }

export interface JiraSyncSummary extends ImportSummary {
  /** How many issues Jira returned for the JQL. */
  issues: number;
}

export class JiraConnectionUseCases {
  constructor(
    private readonly connections: IJiraConnectionRepository,
    private readonly client: IJiraClient,
    private readonly importTasks: Pick<ImportTasksUseCase, "execute">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The connection without its token (only the last 4 characters); null when the workspace has none. */
  get(projectId: string): Promise<JiraConnectionView | null> {
    return this.connections.find(projectId);
  }

  /**
   * Creates or changes the connection after checking it with Jira: nothing is stored when Jira refuses the site, e-mail
   * or token. Leaving the token out keeps the stored one (the page never has it to send back).
   */
  async save(projectId: string, input: SaveJiraConnectionInput): Promise<JiraConnectionView & { account: string }> {
    const fields: Record<string, string> = {};
    const site = normalizeJiraSite(input.site);
    if (!site) fields.site = "Enter the Jira Cloud site, such as your-team.atlassian.net.";
    if (!isJiraEmail(input.email)) fields.email = "Enter the e-mail of the Jira account.";
    const jql = normalizeJql(input.jql);
    if (!jql) fields.jql = `Enter a JQL of at most ${MAX_JQL_CHARS} characters, such as project = SCRUM.`;
    const newToken = typeof input.token === "string" ? input.token.trim() : "";
    if (newToken.length > MAX_TOKEN_CHARS) fields.token = "The API token is too long.";
    if (Object.keys(fields).length) throw new ValidationError("Check the Jira connection.", fields);

    const token = newToken || (await this.connections.token(projectId));
    if (!token) throw new ValidationError("Enter the API token of the Jira account.", { token: "required" });
    const email = (input.email as string).trim();
    let account: string;
    try { account = await this.client.myself({ site: site!, email, token }); } catch (error) { fromJira(error); }
    const saved = await this.connections.save(projectId, { site: site!, email, jql: jql!, ...(newToken ? { token: newToken } : {}) });
    return { ...saved, account };
  }

  async remove(projectId: string): Promise<void> {
    if (!(await this.connections.remove(projectId))) throw new NotFoundError("This workspace is not connected to Jira.");
  }

  /** Reads every issue the JQL matches and imports them; the file rules apply (BR-25: refused whole, nothing written). */
  async sync(projectId: string): Promise<JiraSyncSummary> {
    const connection = await this.connections.find(projectId);
    const token = connection ? await this.connections.token(projectId) : null;
    if (!connection || !token) throw new NotFoundError("This workspace is not connected to Jira.");
    let result;
    try { result = await this.client.searchIssues({ site: connection.site, email: connection.email, token }, connection.jql); } catch (error) { fromJira(error); }
    // An empty result would mark every task removed; that is almost always a wrong JQL, so nothing is changed.
    if (!result.issues.length) throw new BadRequestError("The JQL matches no issue in Jira. Nothing was changed.");
    const summary = await this.importTasks.execute(projectId, result);
    await this.connections.markSynced(projectId, this.now());
    return { ...summary, issues: result.issues.length };
  }
}
