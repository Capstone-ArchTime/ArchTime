import type { IWorkspace } from "../../domain/entities/Workspace.js";
import type { IWorkspaceRepository } from "../../domain/interfaces/IWorkspaceRepository.js";
import { WorkspaceModel } from "../database/models/WorkspaceModel.js";

export class MongoWorkspaceRepository implements IWorkspaceRepository {
  private toEntity(doc: Record<string, unknown>): IWorkspace {
    return {
      id: String(doc._id ?? doc.id),
      projectId: String(doc.projectId),
      revision: Number(doc.revision ?? 1),
      diagram: doc.diagram as IWorkspace["diagram"],
      rules: (doc.rules as IWorkspace["rules"]) ?? [],
      decisions: (doc.decisions as IWorkspace["decisions"]) ?? [],
      updatedBy: doc.updatedBy ? String(doc.updatedBy) : undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }

  async findByProjectId(projectId: string): Promise<IWorkspace | null> {
    const doc = await WorkspaceModel.findOne({ projectId }).lean();
    if (!doc) return null;
    return this.toEntity(doc as Record<string, unknown>);
  }

  async create(
    workspace: Omit<IWorkspace, "id" | "createdAt" | "updatedAt">,
  ): Promise<IWorkspace> {
    const doc = await WorkspaceModel.create({
      ...workspace,
      revision: workspace.revision ?? 1,
    });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async save(
    workspace: Omit<IWorkspace, "id" | "createdAt" | "updatedAt">,
    expectedRevision?: number,
  ): Promise<IWorkspace> {
    const current = await WorkspaceModel.findOne({
      projectId: workspace.projectId,
    });

    if (!current) {
      // First time saving workspace for this project
      if (expectedRevision !== undefined && expectedRevision !== 1) {
        const err = new Error(
          `Revision conflict: expected ${expectedRevision} but workspace has not been initialized (initial revision is 1)`,
        );
        (err as any).currentRevision = 1;
        (err as any).expectedRevision = expectedRevision;
        (err as any).isConflict = true;
        throw err;
      }

      const nextRevision = (expectedRevision ?? 1) + 1;
      const doc = await WorkspaceModel.create({
        ...workspace,
        revision: nextRevision,
        diagram: {
          ...workspace.diagram,
          revision: nextRevision,
        },
      });
      return this.toEntity(
        doc.toObject() as unknown as Record<string, unknown>,
      );
    }

    // Check revision conflict
    if (
      expectedRevision !== undefined &&
      current.revision !== expectedRevision
    ) {
      const err = new Error(
        `Revision conflict: expected ${expectedRevision} but found ${current.revision}`,
      );
      (err as any).currentRevision = current.revision;
      (err as any).expectedRevision = expectedRevision;
      (err as any).isConflict = true;
      throw err;
    }

    const nextRevision = current.revision + 1;
    current.revision = nextRevision;
    current.diagram = {
      ...workspace.diagram,
      revision: nextRevision,
    };
    current.rules = workspace.rules as any;
    current.decisions = workspace.decisions as any;
    if (workspace.updatedBy) {
      current.updatedBy = workspace.updatedBy;
    }

    const saved = await current.save();
    return this.toEntity(
      saved.toObject() as unknown as Record<string, unknown>,
    );
  }
}
