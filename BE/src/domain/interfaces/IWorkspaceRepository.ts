import type { IWorkspace } from "../entities/Workspace.js";

export interface IWorkspaceRepository {
  findByProjectId(projectId: string): Promise<IWorkspace | null>;
  save(
    workspace: Omit<IWorkspace, "id" | "createdAt" | "updatedAt">,
    expectedRevision?: number,
  ): Promise<IWorkspace>;
  create(
    workspace: Omit<IWorkspace, "id" | "createdAt" | "updatedAt">,
  ): Promise<IWorkspace>;
}
