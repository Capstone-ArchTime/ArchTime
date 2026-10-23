import type { IWorkspace } from "../../domain/entities/Workspace.js";
import type { IWorkspaceRepository } from "../../domain/interfaces/IWorkspaceRepository.js";
import { WorkspaceModel } from "../database/models/WorkspaceModel.js";

const DUPLICATE_KEY = 11000;
const MAX_UNCONDITIONAL_ATTEMPTS = 5;

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

  /**
   * Writes the workspace only if it still holds `expectedRevision`; the check and the write are one conditional
   * update, so two saves made from the same revision cannot both succeed. Without `expectedRevision` the save applies
   * to whatever revision is current, retrying when another save lands in between. Either way the revision goes up by one.
   */
  async save(
    workspace: Omit<IWorkspace, "id" | "createdAt" | "updatedAt">,
    expectedRevision?: number,
  ): Promise<IWorkspace> {
    const { projectId } = workspace;
    if (expectedRevision !== undefined) {
      return (await this.saveAt(workspace, expectedRevision)) ?? this.conflict(projectId, expectedRevision);
    }
    for (let attempt = 0; attempt < MAX_UNCONDITIONAL_ATTEMPTS; attempt++) {
      const current = await WorkspaceModel.findOne({ projectId }, { revision: 1 }).lean();
      const saved = await this.saveAt(workspace, current ? Number(current.revision) : 1);
      if (saved) return saved;
    }
    throw new Error(`Workspace ${projectId} is being saved too often to apply this change; please retry.`);
  }

  /** The saved workspace, or null when the stored revision is no longer `revision`. */
  private async saveAt(
    workspace: Omit<IWorkspace, "id" | "createdAt" | "updatedAt">,
    revision: number,
  ): Promise<IWorkspace | null> {
    const nextRevision = revision + 1;
    const fields = {
      revision: nextRevision,
      diagram: { ...workspace.diagram, revision: nextRevision },
      rules: workspace.rules ?? [],
      decisions: workspace.decisions ?? [],
      ...(workspace.updatedBy ? { updatedBy: workspace.updatedBy } : {}),
    };

    const updated = await WorkspaceModel.findOneAndUpdate(
      { projectId: workspace.projectId, revision },
      { $set: fields },
      { new: true, runValidators: true },
    ).lean();
    if (updated) return this.toEntity(updated as Record<string, unknown>);

    // Nothing stored yet: the first save starts from revision 1. The unique projectId index lets only one of two
    // simultaneous first saves through.
    if (revision !== 1) return null;
    try {
      const doc = await WorkspaceModel.create({ projectId: workspace.projectId, ...fields });
      return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
    } catch (err) {
      if ((err as { code?: number }).code === DUPLICATE_KEY) return null;
      throw err;
    }
  }

  private async conflict(projectId: string, expectedRevision: number): Promise<never> {
    const current = await WorkspaceModel.findOne({ projectId }, { revision: 1 }).lean();
    const currentRevision = current ? Number(current.revision) : 1;
    const err = new Error(`Revision conflict: expected ${expectedRevision} but found ${currentRevision}`);
    Object.assign(err, { isConflict: true, expectedRevision, currentRevision });
    throw err;
  }
}
