import type { JiraConnectionView } from "../tasks/jiraConnection.js";

export interface JiraConnectionInput {
  site: string;
  email: string;
  jql: string;
  /** A new API token; absent to keep the stored one. */
  token?: string;
}

/** The Jira connection of each workspace (F-13). The token is stored encrypted and read back only to sync. */
export interface IJiraConnectionRepository {
  find(projectId: string): Promise<JiraConnectionView | null>;
  /** The decrypted API token; null when the workspace has no connection. */
  token(projectId: string): Promise<string | null>;
  save(projectId: string, input: JiraConnectionInput): Promise<JiraConnectionView>;
  /** False when there was nothing to remove. */
  remove(projectId: string): Promise<boolean>;
  markSynced(projectId: string, at: Date): Promise<void>;
}
