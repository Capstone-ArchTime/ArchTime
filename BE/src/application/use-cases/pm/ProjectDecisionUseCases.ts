import { randomUUID } from "node:crypto";
import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import {
  DECISION_ORIGINS,
  DECISION_SOURCE_KINDS,
  type DecisionOrigin,
  type DecisionSourceKind,
  type IDecisionSource,
  type IWorkspaceDecision,
} from "../../../domain/entities/Workspace.js";
import type { IDecisionSourceVerifier } from "../../../domain/interfaces/IDecisionSourceVerifier.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";

export interface FilterDecisionsInput {
  projectId: string;
  search?: string;
  status?: "Proposed" | "Accepted" | "Deprecated";
  origin?: DecisionOrigin;
  page?: number;
  limit?: number;
}

const MAX_SOURCES = 20;
const NOTE_MAX = 300;

export function parseDecisionOrigin(value: unknown): DecisionOrigin | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (!DECISION_ORIGINS.includes(value as DecisionOrigin)) {
    throw new BadRequestError(`origin must be one of: ${DECISION_ORIGINS.join(", ")}.`, "VALIDATION_ERROR");
  }
  return value as DecisionOrigin;
}

/**
 * Checks what an ADR cites: each source must exist in this project (a mined commit, a snapshot, change evidence or an
 * approval request). Stores the canonical reference and what the source said at the time.
 */
export async function resolveDecisionSources(
  verifier: IDecisionSourceVerifier | undefined,
  projectId: string,
  value: unknown,
): Promise<IDecisionSource[]> {
  if (!Array.isArray(value)) throw new BadRequestError("sources must be an array of { kind, ref, note? }.", "VALIDATION_ERROR");
  if (value.length > MAX_SOURCES) throw new BadRequestError(`An ADR can cite at most ${MAX_SOURCES} sources.`, "VALIDATION_ERROR");
  if (value.length > 0 && !verifier) throw new BadRequestError("Sources cannot be checked right now.");

  const seen = new Set<string>();
  const resolved: IDecisionSource[] = [];
  const missing: string[] = [];
  for (const item of value) {
    const kind = item?.kind as DecisionSourceKind;
    const ref = typeof item?.ref === "string" ? item.ref.trim() : "";
    if (!DECISION_SOURCE_KINDS.includes(kind) || !ref) {
      throw new BadRequestError(`Each source needs kind (${DECISION_SOURCE_KINDS.join(", ")}) and ref.`, "VALIDATION_ERROR");
    }
    if (item.note !== undefined && (typeof item.note !== "string" || item.note.length > NOTE_MAX)) {
      throw new BadRequestError(`A source note must be text of at most ${NOTE_MAX} characters.`, "VALIDATION_ERROR");
    }
    const found = await verifier!.resolve(projectId, kind, ref);
    if (!found) { missing.push(`${kind} ${ref}`); continue; }
    const key = `${found.kind}:${found.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push({ ...found, ...(item.note?.trim() ? { note: item.note.trim() } : {}) });
  }
  if (missing.length) {
    throw new BadRequestError(`These sources do not exist in this workspace: ${missing.join(", ")}.`, "VALIDATION_ERROR");
  }
  return resolved;
}

/** ADRs written before provenance existed have no origin, sources or history; read them with neutral defaults. */
export function withProvenance(d: IWorkspaceDecision): IWorkspaceDecision {
  return {
    ...d,
    origin: d.origin ?? "recorded",
    sources: d.sources ?? [],
    statusHistory: d.statusHistory?.length ? d.statusHistory : [{ status: d.status, at: d.createdAt }],
  };
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
  origin?: unknown;
  sources?: unknown;
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
  origin?: unknown;
  /** Replaces the list when given. */
  sources?: unknown;
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
    if (!project) throw new NotFoundError("Workspace not found.");

    const ws = await this.workspaceRepository.findByProjectId(input.projectId);
    let decisions = (ws?.decisions ?? []).map(withProvenance);

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

    const origin = parseDecisionOrigin(input.origin);
    if (origin) {
      decisions = decisions.filter((d) => d.origin === origin);
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
    private readonly sourceVerifier?: IDecisionSourceVerifier,
  ) {}

  async execute(input: CreateDecisionInput): Promise<IWorkspaceDecision> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new NotFoundError("Workspace not found.");

    if (!input.title?.trim() || !input.decision?.trim() || !input.context?.trim()) {
      throw new BadRequestError("ADR title, context, and decision are required.");
    }
    const origin = parseDecisionOrigin(input.origin) ?? "recorded";
    const sources = input.sources === undefined ? [] : await resolveDecisionSources(this.sourceVerifier, input.projectId, input.sources);

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

    const now = new Date();
    const status = input.status ?? "Proposed";
    const newDecision: IWorkspaceDecision = {
      id: `adr-${randomUUID().slice(0, 8)}`,
      number: maxNum + 1,
      title: input.title.trim(),
      status,
      context: input.context.trim(),
      decision: input.decision.trim(),
      alternatives: input.alternatives?.trim() ?? "",
      consequences: input.consequences?.trim() ?? "",
      componentIds: input.componentIds ?? [],
      origin,
      sources,
      statusHistory: [{ status, at: now, by: input.userId }],
      createdBy: input.userId,
      updatedBy: input.userId,
      createdAt: now,
      updatedAt: now,
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
    if (!project) throw new NotFoundError("Workspace not found.");

    const ws = await this.workspaceRepository.findByProjectId(projectId);
    const found = ws?.decisions.find((d) => d.id === decisionId);
    if (!found) throw new NotFoundError("Design decision not found.");

    return withProvenance(found);
  }
}

export class UpdateProjectDecisionUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
    private readonly sourceVerifier?: IDecisionSourceVerifier,
  ) {}

  async execute(input: UpdateDecisionInput): Promise<IWorkspaceDecision> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new NotFoundError("Workspace not found.");

    const ws = await this.workspaceRepository.findByProjectId(input.projectId);
    if (!ws) throw new NotFoundError("Design decision not found.");

    const index = ws.decisions.findIndex((d) => d.id === input.decisionId);
    if (index === -1) throw new NotFoundError("Design decision not found.");

    const existing = withProvenance(ws.decisions[index]);
    const origin = parseDecisionOrigin(input.origin) ?? existing.origin;
    const sources = input.sources === undefined
      ? existing.sources
      : await resolveDecisionSources(this.sourceVerifier, input.projectId, input.sources);
    const now = new Date();
    const status = input.status ?? existing.status;
    const updated: IWorkspaceDecision = {
      ...existing,
      title: input.title?.trim() ?? existing.title,
      context: input.context?.trim() ?? existing.context,
      decision: input.decision?.trim() ?? existing.decision,
      alternatives: input.alternatives !== undefined ? input.alternatives.trim() : existing.alternatives,
      consequences: input.consequences !== undefined ? input.consequences.trim() : existing.consequences,
      status,
      componentIds: input.componentIds ?? existing.componentIds,
      origin,
      sources,
      statusHistory: status === existing.status
        ? existing.statusHistory
        : [...existing.statusHistory, { status, at: now, by: input.userId }],
      updatedBy: input.userId ?? existing.updatedBy,
      updatedAt: now,
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
    if (!project) throw new NotFoundError("Workspace not found.");

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
