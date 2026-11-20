import { apiDownload, apiRequest } from '../api/client.ts';
import { API_BASE_URL } from '../auth/session.ts';

// Agent access (RF-09, UC-42 – UC-44): project tokens a coding agent uses to ask ArchTime about the architecture, and
// the AGENTS.md generated from the confirmed diagram. The server keeps only a hash of each token.

export interface AgentToken {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  status: 'active' | 'expired' | 'revoked';
}

export const EXPIRY_CHOICES = [7, 30, 60, 90] as const;
export const DEFAULT_EXPIRY = 30;

export const STATUS_LABEL: Record<AgentToken['status'], { label: string; color: string }> = {
  active: { label: 'Active', color: 'green' },
  expired: { label: 'Expired', color: 'default' },
  revoked: { label: 'Revoked', color: 'red' },
};

/** How an agent asks about one file, with the token in an environment variable rather than on the command line. */
export function contextCommand(apiBase: string = API_BASE_URL, file = 'path/in/repo.ts'): string {
  return `curl -H "Authorization: Bearer $ARCHTIME_AGENT_TOKEN" "${apiBase.replace(/\/+$/, '')}/agent/context?file=${encodeURIComponent(file).replace(/%2F/gi, '/')}"`;
}

/** Active tokens first, then newest first: what a maintainer looks for when revoking. */
export function sortTokens(tokens: AgentToken[]): AgentToken[] {
  const rank = { active: 0, expired: 1, revoked: 2 } as const;
  return [...tokens].sort((a, b) => rank[a.status] - rank[b.status] || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;

export async function listTokens(projectId: string, signal?: AbortSignal): Promise<AgentToken[]> {
  return (await apiRequest<{ data: { tokens: AgentToken[] } }>(`${base(projectId)}/agent-tokens`, { signal })).data.tokens;
}

export async function createToken(projectId: string, name: string, expiresInDays: number): Promise<{ token: string; record: AgentToken }> {
  return (await apiRequest<{ data: { token: string; record: AgentToken } }>(`${base(projectId)}/agent-tokens`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, expiresInDays }),
  })).data;
}

export async function revokeToken(projectId: string, tokenId: string): Promise<AgentToken> {
  return (await apiRequest<{ data: { token: AgentToken } }>(`${base(projectId)}/agent-tokens/${encodeURIComponent(tokenId)}`, { method: 'DELETE' })).data.token;
}

export async function downloadAgentsMd(projectId: string): Promise<{ blob: Blob; filename: string }> {
  const { blob, filename } = await apiDownload(`${base(projectId)}/agents-md`);
  return { blob, filename: filename ?? 'AGENTS.md' };
}
