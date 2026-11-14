import type { IAgentToken } from "../entities/AgentToken.js";

export interface IAgentTokenRepository {
  create(token: Omit<IAgentToken, "id">): Promise<IAgentToken>;
  listByProject(projectId: string): Promise<IAgentToken[]>;
  findByHash(tokenHash: string): Promise<IAgentToken | null>;
  /** Revokes a token of the project that is not revoked yet; null when there is no such token. */
  revoke(projectId: string, tokenId: string, by: string, at: Date): Promise<IAgentToken | null>;
  touch(tokenId: string, at: Date): Promise<void>;
  countActive(projectId: string, now: Date): Promise<number>;
}
