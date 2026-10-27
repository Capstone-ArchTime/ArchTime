import { ProjectReportModel } from "../../../infrastructure/database/models/ProjectReportModel.js";
import {
  ReportStatus,
  ReportType,
  type IProjectReport,
} from "../../../domain/entities/ProjectReport.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IWorkspaceRepository } from "../../../domain/interfaces/IWorkspaceRepository.js";
import { SnapshotModel } from "../../../infrastructure/database/models/SnapshotModel.js";
import { NotFoundError } from "../../../shared/errors/AppError.js";

export interface GenerateReportInput {
  projectId: string;
  type?: ReportType;
  title?: string;
  userId: string;
}

export class GetProjectReportsUseCase {
  constructor(private readonly projectRepository: IProjectRepository) {}

  async execute(projectId: string): Promise<IProjectReport[]> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError("Workspace not found.");

    const docs = await ProjectReportModel.find({ projectId }).sort({ createdAt: -1 });
    return docs.map((d) => d.toJSON() as IProjectReport);
  }
}

export class GenerateProjectReportUseCase {
  constructor(
    private readonly projectRepository: IProjectRepository,
    private readonly workspaceRepository: IWorkspaceRepository,
  ) {}

  async execute(input: GenerateReportInput): Promise<IProjectReport> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) throw new NotFoundError("Workspace not found.");

    const type = input.type ?? ReportType.ARCHITECTURE_SUMMARY;
    const ws = await this.workspaceRepository.findByProjectId(input.projectId);
    const snapshotCount = await SnapshotModel.countDocuments({ projectId: input.projectId });
    // The oldest and newest mined commits: the stretch of history the report covers.
    const [first, latest] = await Promise.all([1, -1].map(order =>
      SnapshotModel.findOne({ projectId: input.projectId }).sort({ date: order as 1 | -1 }).select("hash title date").lean()));
    const commit = (s: { hash?: string; title?: string; date?: Date } | null) =>
      s ? { hash: s.hash ?? "", title: (s.title ?? "").split("\n")[0].slice(0, 200), date: s.date ?? null } : null;

    const components = ws?.diagram?.components ?? [];
    const dependencies = ws?.diagram?.dependencies ?? [];
    const rules = ws?.rules ?? [];
    const decisions = ws?.decisions ?? [];

    // Lists are stored as they are now, so the report (and its PDF) stays the same when the map changes later.
    const nameOf = new Map(components.map((c) => [c.id, c.name]));
    const named = (id: string) => nameOf.get(id) ?? id;
    const acceptedDecisions = decisions.filter((d) => d.status === "Accepted").length;

    const reportData = {
      project: {
        id: project.id,
        name: project.name,
        repoUrl: project.repoUrl,
        visibility: project.visibility,
        status: project.status,
      },
      architecture: {
        revision: ws?.revision ?? 1,
        componentCount: components.length,
        dependencyCount: dependencies.length,
        components: components.map((c) => ({ id: c.id, name: c.name, kind: c.kind, description: c.description ?? "" })),
        dependencies: dependencies.map((d) => ({ source: named(d.source), target: named(d.target), label: d.label ?? "" })),
      },
      rules: {
        total: rules.length,
        active: rules.filter((r) => r.enabled).length,
        forbiddenCount: rules.filter((r) => r.constraint === "forbidden").length,
        requiredCount: rules.filter((r) => r.constraint === "required").length,
        items: rules.map((r) => ({ name: r.name, source: named(r.source), target: named(r.target), constraint: r.constraint, severity: r.severity, enabled: r.enabled })),
      },
      decisions: {
        total: decisions.length,
        accepted: acceptedDecisions,
        proposed: decisions.filter((d) => d.status === "Proposed").length,
        items: [...decisions].sort((a, b) => a.number - b.number).map((d) => ({ number: d.number, title: d.title, status: d.status })),
      },
      snapshots: {
        total: snapshotCount,
        first: commit(first),
        latest: commit(latest),
      },
      generatedAt: new Date(),
    };

    const title =
      (typeof input.title === "string" ? input.title.trim().slice(0, 200) : "") ||
      `${project.name} architecture report`;

    const summary = `Architecture report for ${project.name}: contains ${components.length} components, ${dependencies.length} dependencies, ${rules.length} architecture rules, and ${decisions.length} design decisions across ${snapshotCount} mined snapshots.`;

    const report = await ProjectReportModel.create({
      projectId: input.projectId,
      title,
      type,
      generatedBy: input.userId,
      status: ReportStatus.READY,
      summary,
      data: reportData,
    });

    return report.toJSON() as IProjectReport;
  }
}

export class GetProjectReportDetailUseCase {
  async execute(projectId: string, reportId: string): Promise<IProjectReport> {
    const report = await ProjectReportModel.findOne({
      _id: reportId,
      projectId,
    });
    if (!report) throw new NotFoundError("Report not found.");

    return report.toJSON() as IProjectReport;
  }
}
