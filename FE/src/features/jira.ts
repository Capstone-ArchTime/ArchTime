import { apiRequest } from '../api/client.ts';
import type { ImportResult } from './tasks.ts';

// The Jira Cloud connection of a workspace (F-13): tasks are read straight from Jira instead of an uploaded export.
// The server keeps the API token encrypted and never sends it back; the page shows its last 4 characters.

export interface JiraConnection {
  site: string;
  email: string;
  jql: string;
  tokenLast4: string;
  lastSyncAt: string | null;
  updatedAt: string;
}

export interface JiraConnectionInput { site: string; email: string; jql: string; token?: string }

export interface JiraSyncResult extends ImportResult { issues: number }

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/tasks/jira`;

/** The stored connection, or null when the workspace is not connected. */
export async function fetchJiraConnection(projectId: string, signal?: AbortSignal): Promise<JiraConnection | null> {
  const body = await apiRequest<{ data?: JiraConnection | null }>(base(projectId), { signal });
  const data = body?.data ?? null;
  if (data !== null && (typeof data.site !== 'string' || typeof data.jql !== 'string')) throw new Error('The server returned an invalid Jira connection.');
  return data;
}

/** Checked with Jira before it is stored; an empty token keeps the stored one. */
export async function saveJiraConnection(projectId: string, input: JiraConnectionInput): Promise<JiraConnection & { account: string }> {
  const { token, ...rest } = input;
  const body = await apiRequest<{ data?: JiraConnection & { account: string } }>(base(projectId), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rest, ...(token?.trim() ? { token: token.trim() } : {}) }),
  }, 30_000);
  if (!body?.data) throw new Error('The server did not confirm the Jira connection.');
  return body.data;
}

export async function removeJiraConnection(projectId: string): Promise<void> {
  await apiRequest(base(projectId), { method: 'DELETE' });
}

/** Reads every issue of the JQL from Jira and imports them; a large board takes a while. */
export async function syncJira(projectId: string): Promise<JiraSyncResult> {
  const body = await apiRequest<{ data?: JiraSyncResult }>(`${base(projectId)}/sync`, { method: 'POST' }, 180_000);
  if (!body?.data || typeof body.data.issues !== 'number') throw new Error('The server did not confirm the sync.');
  return body.data;
}

/** "archtime.atlassian.net" for "https://archtime.atlassian.net". */
export const siteLabel = (site: string) => site.replace(/^https:\/\//, '');
