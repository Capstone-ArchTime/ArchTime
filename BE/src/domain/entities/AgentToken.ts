/**
 * A project token a coding agent uses to read the architecture context of one project (RF-09, UC-42–44, BR-30).
 * Only the SHA-256 hash of the token is stored; the token itself is shown once, when it is created. It expires at most
 * 90 days after creation and can be revoked at any time.
 */
export interface IAgentToken {
  id: string;
  projectId: string;
  name: string;
  tokenHash: string;
  /** The first characters of the token, so people can tell tokens apart without seeing them. */
  prefix: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
  lastUsedAt: Date | null;
}

/** What is ever shown about a token: never its hash. */
export type AgentTokenView = Omit<IAgentToken, "tokenHash"> & { status: "active" | "expired" | "revoked" };

export function viewOf(token: IAgentToken, now: Date): AgentTokenView {
  const { tokenHash: _hash, ...rest } = token;
  const status = token.revokedAt ? "revoked" : token.expiresAt <= now ? "expired" : "active";
  return { ...rest, status };
}
