import { randomUUID } from "node:crypto";
import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IWorkspaceDecision } from "../../../domain/entities/Workspace.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";

export interface FilterDecisionsInput {
  projectId: string;
  search?: string;
  status?: "Proposed" | "Accepted" | "Deprecated";
  page?: number;
  limit?: number;
}

export interface CreateDecisionInput {
  projectId: string;
  title: string;
  context: string;
  decision: string;
  alternatives?: string;
  consequences?: string;
  status?: "Proposed" | "Accepted" | "Deprecated";
  componentIds?: string[];
  userId?: string;
}

export interface UpdateDecisionInput {
  projectId: string;
  decisionId: string;
  title?: string;
  context?: string;
  decision?: string;
  alternatives?: string;
  consequences?: string;
  status?: "Proposed" | "Accepted" | "Deprecated";
  componentIds?: string[];
  userId?: string;
}

export class GetProjectDecisionsUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(input: FilterDecisionsInput): Promise<{
    decisions: IWorkspaceDecision[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new NotFoundError("Project not found.");

    const ws = await this.workspaceRepository.findByProjectId(input.projectId);
    let decisions = ws?.decisions ?? [];

    if (input.search && input.search.trim()) {
      const q = input.search.trim().toLowerCase();
      decisions = decisions.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.context.toLowerCase().includes(q) ||
          d.decision.toLowerCase().includes(q),
      );
    }

    if (input.status) {
      decisions = decisions.filter((d) => d.status === input.status);
    }

    // Sort by ADR number ascending (or newest first)
    decisions.sort((a, b) => b.number - a.number);

    const page = Math.max(1, input.page ? Number(input.page) : 1);
    const limit = Math.max(1, Math.min(100, input.limit ? Number(input.limit) : 10));
    const total = decisions.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginated = decisions.slice((page - 1) * limit, page * limit);

    return {
      decisions: paginated,
      meta: { page, limit, total, totalPages },
    };
  }
}

export class CreateProjectDecisionUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(input: CreateDecisionInput): Promise<IWorkspaceDecision> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new NotFoundError("Project not found.");

    if (!input.title?.trim() || !input.decision?.trim() || !input.context?.trim()) {
      throw new BadRequestError("ADR title, context, and decision are required.");
    }

    let ws = await this.workspaceRepository.findByProjectId(input.projectId);
    if (!ws) {
      ws = await this.workspaceRepository.create({
        projectId: input.projectId,
        revision: 1,
        diagram: { components: [], dependencies: [], revision: 1 },
        rules: [],
        decisions: [],
      });
    }

    const currentDecisions = ws.decisions ?? [];
    const maxNum = currentDecisions.reduce((max, d) => Math.max(max, d.number ?? 0), 0);

    const newDecision: IWorkspaceDecision = {
      id: `adr-${randomUUID().slice(0, 8)}`,
      number: maxNum + 1,
      title: input.title.trim(),
      status: input.status ?? "Proposed",
      context: input.context.trim(),
      decision: input.decision.trim(),
      alternatives: input.alternatives?.trim() ?? "",
      consequences: input.consequences?.trim() ?? "",
      componentIds: input.componentIds ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const decisions = [...currentDecisions, newDecision];
    await this.workspaceRepository.save(
      {
        projectId: input.projectId,
        revision: ws.revision,
        diagram: ws.diagram,
        rules: ws.rules,
        decisions,
        updatedBy: input.userId,
      },
      ws.revision,
    );

    return newDecision;
  }
}

export class GetProjectDecisionDetailUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(projectId: string, decisionId: string): Promise<IWorkspaceDecision> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError("Project not found.");

    const ws = await this.workspaceRepository.findByProjectId(projectId);
    const found = ws?.decisions.find((d) => d.id === decisionId);
    if (!found) throw new NotFoundError("Design decision not found.");

    return found;
  }
}

export class UpdateProjectDecisionUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(input: UpdateDecisionInput): Promise<IWorkspaceDecision> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new NotFoundError("Project not found.");

    const ws = await this.workspaceRepository.findByProjectId(input.projectId);
    if (!ws) throw new NotFoundError("Design decision not found.");

    const index = ws.decisions.findIndex((d) => d.id === input.decisionId);
    if (index === -1) throw new NotFoundError("Design decision not found.");

    const existing = ws.decisions[index];
    const updated: IWorkspaceDecision = {
      ...existing,
      title: input.title?.trim() ?? existing.title,
      context: input.context?.trim() ?? existing.context,
      decision: input.decision?.trim() ?? existing.decision,
      alternatives: input.alternatives !== undefined ? input.alternatives.trim() : existing.alternatives,
      consequences: input.consequences !== undefined ? input.consequences.trim() : existing.consequences,
      status: input.status ?? existing.status,
      componentIds: input.componentIds ?? existing.componentIds,
      updatedAt: new Date(),
    };

    const newDecisions = [...ws.decisions];
    newDecisions[index] = updated;

    await this.workspaceRepository.save(
      {
        projectId: input.projectId,
        revision: ws.revision,
        diagram: ws.diagram,
        rules: ws.rules,
        decisions: newDecisions,
        updatedBy: input.userId,
      },
      ws.revision,
    );

    return updated;
  }
}

export class DeleteProjectDecisionUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(projectId: string, decisionId: string, userId?: string): Promise<void> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError("Project not found.");

    const ws = await this.workspaceRepository.findByProjectId(projectId);
    if (!ws) throw new NotFoundError("Design decision not found.");

    const exists = ws.decisions.some((d) => d.id === decisionId);
    if (!exists) throw new NotFoundError("Design decision not found.");

    const newDecisions = ws.decisions.filter((d) => d.id !== decisionId);

    await this.workspaceRepository.save(
      {
        projectId,
        revision: ws.revision,
        diagram: ws.diagram,
        rules: ws.rules,
        decisions: newDecisions,
        updatedBy: userId,
      },
      ws.revision,
    );
  }
}
