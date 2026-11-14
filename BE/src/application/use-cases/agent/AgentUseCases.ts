import { agentContextFor, buildAgentsMd, hashAgentToken, newAgentToken, tokenDays, AGENT_TOKEN_PREFIX, MAX_TOKEN_DAYS } from "../../../domain/agent/context.js";
import type { AgentContext } from "../../../domain/agent/context.js";
import { viewOf } from "../../../domain/entities/AgentToken.js";
import type { AgentTokenView } from "../../../domain/entities/AgentToken.js";
import type { IAgentTokenRepository } from "../../../domain/interfaces/IAgentTokenRepository.js";
import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from "../../../shared/errors/AppError.js";

// Agent access (RF-09, UC-42 create a project token, UC-43 revoke it, UC-44 read the architecture context).

/** At most this many usable tokens per project, so forgotten ones do not pile up. */
export const MAX_ACTIVE_TOKENS = 10;

export type AuditLog = (entry: { action: string; userId: string; targetId: string; details: Record<string, unknown> }) => Promise<void>;

export class AgentTokenUseCases {
  constructor(
    private readonly tokens: IAgentTokenRepository,
    private readonly projects: Pick<IProjectRepository, "findById">,
    private readonly audit: AuditLog = async () => {},
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** UC-42. The token is in the answer this once; afterwards only its prefix is shown. */
  async create(input: { projectId: string; userId: string; name: unknown; expiresInDays?: unknown }): Promise<{ token: string; record: AgentTokenView }> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 80) throw new BadRequestError("Give the token a name of 1 to 80 characters, for example the agent or machine that uses it.");
    const days = tokenDays(input.expiresInDays);
    if (days === null) throw new BadRequestError(`A token expires after 1 to ${MAX_TOKEN_DAYS} days.`);
    if (!(await this.projects.findById(input.projectId))) throw new NotFoundError("Workspace not found.");
    const now = this.now();
    if ((await this.tokens.countActive(input.projectId, now)) >= MAX_ACTIVE_TOKENS) {
      throw new ConflictError(`This workspace already has ${MAX_ACTIVE_TOKENS} active tokens. Revoke one you no longer use first.`, "CONFLICT");
    }
    const { token, hash, prefix } = newAgentToken();
    const saved = await this.tokens.create({
      projectId: input.projectId, name, tokenHash: hash, prefix, createdBy: input.userId, createdAt: now,
      expiresAt: new Date(now.getTime() + days * 86_400_000), revokedAt: null, revokedBy: null, lastUsedAt: null,
    });
    await this.audit({ action: "AGENT_TOKEN_CREATE", userId: input.userId, targetId: input.projectId, details: { tokenId: saved.id, name, prefix, expiresAt: saved.expiresAt } });
    return { token, record: viewOf(saved, now) };
  }

  async list(projectId: string): Promise<AgentTokenView[]> {
    const now = this.now();
    return (await this.tokens.listByProject(projectId)).map(t => viewOf(t, now));
  }

  /** UC-43. Takes effect on the agent's next request. */
  async revoke(projectId: string, tokenId: string, userId: string): Promise<AgentTokenView> {
    const revoked = await this.tokens.revoke(projectId, tokenId, userId, this.now());
    if (!revoked) throw new NotFoundError("No active token with this id in this workspace.");
    await this.audit({ action: "AGENT_TOKEN_REVOKE", userId, targetId: projectId, details: { tokenId, name: revoked.name, prefix: revoked.prefix } });
    return viewOf(revoked, this.now());
  }

  /** The project a token gives access to; 401 for anything but a known, unexpired, unrevoked token. */
  async authenticate(header: string | undefined): Promise<{ tokenId: string; projectId: string }> {
    const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
    const token = match?.[1];
    if (!token || !token.startsWith(AGENT_TOKEN_PREFIX)) throw new UnauthorizedError("Send a project token from ArchTime: Authorization: Bearer atk_...");
    const found = await this.tokens.findByHash(hashAgentToken(token));
    const now = this.now();
    if (!found) throw new UnauthorizedError("This project token is not known.");
    if (found.revokedAt) throw new UnauthorizedError("This project token was revoked. Ask a maintainer for a new one.");
    if (found.expiresAt <= now) throw new UnauthorizedError("This project token has expired. Ask a maintainer for a new one.");
    if (!(await this.projects.findById(found.projectId))) throw new UnauthorizedError("The workspace of this token no longer exists.");
    // When it was last used, for the maintainers' list; never in the way of the request.
    void this.tokens.touch(found.id, now).catch(() => undefined);
    return { tokenId: found.id, projectId: found.projectId };
  }
}

export class AgentContextUseCases {
  constructor(
    private readonly workspaces: Pick<IWorkspaceRepository, "findByProjectId">,
    private readonly projects: Pick<IProjectRepository, "findById">,
    private readonly apiBase: string,
  ) {}

  /** Only a confirmed diagram is a reference an agent may follow. */
  private async confirmedWorkspace(projectId: string) {
    const workspace = await this.workspaces.findByProjectId(projectId);
    if (!workspace?.diagram?.confirmedAt) throw new ConflictError("The component diagram of this workspace is not confirmed yet, so there is no architecture to follow. Ask a maintainer to confirm it.", "CONFLICT");
    return workspace;
  }

  /** UC-44. */
  async context(projectId: string, file: unknown): Promise<AgentContext> {
    if (typeof file !== "string" || !file.trim()) throw new BadRequestError("Ask about one file: ?file=path/in/the/repository");
    const workspace = await this.confirmedWorkspace(projectId);
    const context = agentContextFor(file, workspace);
    if (!context) throw new BadRequestError(`"${file}" is not a path inside the repository.`);
    return context;
  }

  async agentsMd(projectId: string): Promise<{ filename: string; content: string }> {
    const [workspace, project] = await Promise.all([this.confirmedWorkspace(projectId), this.projects.findById(projectId)]);
    if (!project) throw new NotFoundError("Workspace not found.");
    return { filename: "AGENTS.md", content: buildAgentsMd(project.name, workspace, this.apiBase) };
  }
}
