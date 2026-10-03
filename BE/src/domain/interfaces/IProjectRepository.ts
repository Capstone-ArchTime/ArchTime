import type { IProject } from "../entities/Project.js";

export interface AccessibleProjectsFilter {
  projectIds?: string[];
  userId?: string;
  matchAll?: boolean;
  search?: string;
  skip?: number;
  limit?: number;
}

export interface IProjectRepository {
  create(project: Omit<IProject, "id" | "createdAt" | "updatedAt">): Promise<IProject>;
  findById(id: string): Promise<IProject | null>;
  findByUserId(userId: string): Promise<IProject[]>;
  findByUserIdPaginated(
    userId: string,
    skip: number,
    limit: number,
  ): Promise<{ items: IProject[]; total: number }>;
  findAccessibleProjectsPaginated(
    filter: AccessibleProjectsFilter,
  ): Promise<{ items: IProject[]; total: number }>;
  delete(id: string, userId?: string): Promise<boolean>;
}
