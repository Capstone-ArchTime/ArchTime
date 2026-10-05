import { randomUUID } from "node:crypto";
import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IWorkspaceRule } from "../../../domain/entities/Workspace.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";

export interface FilterRulesInput {
  projectId: string;
  search?: string;
  enabled?: boolean;
  constraint?: "forbidden" | "required";
  severity?: "error" | "warning";
}

export interface CreateRuleInput {
  projectId: string;
  name: string;
  source: string;
  target: string;
  constraint: "forbidden" | "required";
  severity?: "error" | "warning";
  rationale?: string;
  enabled?: boolean;
  userId?: string;
}

export interface UpdateRuleInput {
  projectId: string;
  ruleId: string;
  name?: string;
  source?: string;
  target?: string;
  constraint?: "forbidden" | "required";
  severity?: "error" | "warning";
  rationale?: string;
  enabled?: boolean;
  userId?: string;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  source: string;
  target: string;
  constraint: "forbidden" | "required";
  severity: "error" | "warning";
  status: "satisfied" | "violation";
  message: string;
}

export interface EvaluationSummary {
  totalRules: number;
  evaluatedRules: number;
  satisfiedCount: number;
  violationCount: number;
  errorCount: number;
  warningCount: number;
  compliancePercent: number;
  results: RuleEvaluationResult[];
}

export class GetProjectRulesUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(input: FilterRulesInput): Promise<{ rules: IWorkspaceRule[]; total: number }> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new NotFoundError("Project not found.");

    const ws = await this.workspaceRepository.findByProjectId(input.projectId);
    let rules = ws?.rules ?? [];

    if (input.search && input.search.trim()) {
      const q = input.search.trim().toLowerCase();
      rules = rules.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.source.toLowerCase().includes(q) ||
          r.target.toLowerCase().includes(q) ||
          r.rationale.toLowerCase().includes(q),
      );
    }

    if (input.enabled !== undefined) {
      rules = rules.filter((r) => r.enabled === input.enabled);
    }

    if (input.constraint) {
      rules = rules.filter((r) => r.constraint === input.constraint);
    }

    if (input.severity) {
      rules = rules.filter((r) => r.severity === input.severity);
    }

    return { rules, total: rules.length };
  }
}

export class CreateProjectRuleUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(input: CreateRuleInput): Promise<IWorkspaceRule> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new NotFoundError("Project not found.");

    if (!input.name?.trim() || !input.source?.trim() || !input.target?.trim()) {
      throw new BadRequestError("Rule name, source, and target are required.");
    }

    if (!["forbidden", "required"].includes(input.constraint)) {
      throw new BadRequestError("Constraint must be 'forbidden' or 'required'.");
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

    const newRule: IWorkspaceRule = {
      id: `rule-${randomUUID().slice(0, 8)}`,
      name: input.name.trim(),
      source: input.source.trim(),
      target: input.target.trim(),
      constraint: input.constraint,
      severity: input.severity ?? "error",
      rationale: input.rationale?.trim() ?? "",
      enabled: input.enabled ?? true,
    };

    const rules = [...ws.rules, newRule];
    await this.workspaceRepository.save(
      {
        projectId: input.projectId,
        revision: ws.revision,
        diagram: ws.diagram,
        rules,
        decisions: ws.decisions,
        updatedBy: input.userId,
      },
      ws.revision,
    );

    return newRule;
  }
}

export class UpdateProjectRuleUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(input: UpdateRuleInput): Promise<IWorkspaceRule> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new NotFoundError("Project not found.");

    const ws = await this.workspaceRepository.findByProjectId(input.projectId);
    if (!ws) throw new NotFoundError("Rule not found.");

    const index = ws.rules.findIndex((r) => r.id === input.ruleId);
    if (index === -1) throw new NotFoundError("Rule not found.");

    const existing = ws.rules[index];
    const updated: IWorkspaceRule = {
      ...existing,
      name: input.name?.trim() ?? existing.name,
      source: input.source?.trim() ?? existing.source,
      target: input.target?.trim() ?? existing.target,
      constraint: input.constraint ?? existing.constraint,
      severity: input.severity ?? existing.severity,
      rationale: input.rationale !== undefined ? input.rationale.trim() : existing.rationale,
      enabled: input.enabled !== undefined ? input.enabled : existing.enabled,
    };

    const newRules = [...ws.rules];
    newRules[index] = updated;

    await this.workspaceRepository.save(
      {
        projectId: input.projectId,
        revision: ws.revision,
        diagram: ws.diagram,
        rules: newRules,
        decisions: ws.decisions,
        updatedBy: input.userId,
      },
      ws.revision,
    );

    return updated;
  }
}

export class DeleteProjectRuleUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(projectId: string, ruleId: string, userId?: string): Promise<void> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError("Project not found.");

    const ws = await this.workspaceRepository.findByProjectId(projectId);
    if (!ws) throw new NotFoundError("Rule not found.");

    const exists = ws.rules.some((r) => r.id === ruleId);
    if (!exists) throw new NotFoundError("Rule not found.");

    const newRules = ws.rules.filter((r) => r.id !== ruleId);

    await this.workspaceRepository.save(
      {
        projectId,
        revision: ws.revision,
        diagram: ws.diagram,
        rules: newRules,
        decisions: ws.decisions,
        updatedBy: userId,
      },
      ws.revision,
    );
  }
}

export class ToggleProjectRuleUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(projectId: string, ruleId: string, userId?: string): Promise<IWorkspaceRule> {
    const ws = await this.workspaceRepository.findByProjectId(projectId);
    if (!ws) throw new NotFoundError("Rule not found.");

    const index = ws.rules.findIndex((r) => r.id === ruleId);
    if (index === -1) throw new NotFoundError("Rule not found.");

    const targetRule = ws.rules[index];
    targetRule.enabled = !targetRule.enabled;

    await this.workspaceRepository.save(
      {
        projectId,
        revision: ws.revision,
        diagram: ws.diagram,
        rules: ws.rules,
        decisions: ws.decisions,
        updatedBy: userId,
      },
      ws.revision,
    );

    return targetRule;
  }
}

export class EvaluateProjectRulesUseCase {
  constructor(
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly projectRepository: IProjectRepository,
  ) {}

  async execute(projectId: string): Promise<EvaluationSummary> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError("Project not found.");

    const ws = await this.workspaceRepository.findByProjectId(projectId);
    const rules = ws?.rules ?? [];
    const diagram = ws?.diagram ?? { components: [], dependencies: [] };

    // Build lookup for components and dependencies
    const componentMap = new Map(
      diagram.components.map((c) => [c.id.toLowerCase(), c.name.toLowerCase()]),
    );

    const matchesComponent = (needle: string, compId: string): boolean => {
      const n = needle.trim().toLowerCase();
      const id = compId.trim().toLowerCase();
      const name = componentMap.get(id);
      return id === n || (name !== undefined && name === n);
    };

    const hasDependency = (source: string, target: string): boolean => {
      return diagram.dependencies.some(
        (dep) =>
          matchesComponent(source, dep.source) && matchesComponent(target, dep.target),
      );
    };

    const results: RuleEvaluationResult[] = [];
    let satisfiedCount = 0;
    let violationCount = 0;
    let errorCount = 0;
    let warningCount = 0;

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const depExists = hasDependency(rule.source, rule.target);
      let isViolation = false;
      let message = "";

      if (rule.constraint === "forbidden") {
        if (depExists) {
          isViolation = true;
          message = `Forbidden dependency detected from "${rule.source}" to "${rule.target}".`;
        } else {
          message = `No forbidden dependency found between "${rule.source}" and "${rule.target}".`;
        }
      } else {
        // required
        if (!depExists) {
          isViolation = true;
          message = `Missing required dependency from "${rule.source}" to "${rule.target}".`;
        } else {
          message = `Required dependency exists from "${rule.source}" to "${rule.target}".`;
        }
      }

      if (isViolation) {
        violationCount++;
        if (rule.severity === "error") errorCount++;
        else warningCount++;
      } else {
        satisfiedCount++;
      }

      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        source: rule.source,
        target: rule.target,
        constraint: rule.constraint,
        severity: rule.severity,
        status: isViolation ? "violation" : "satisfied",
        message,
      });
    }

    const evaluatedRules = results.length;
    const compliancePercent =
      evaluatedRules > 0 ? Math.round((satisfiedCount / evaluatedRules) * 100) : 100;

    return {
      totalRules: rules.length,
      evaluatedRules,
      satisfiedCount,
      violationCount,
      errorCount,
      warningCount,
      compliancePercent,
      results,
    };
  }
}
