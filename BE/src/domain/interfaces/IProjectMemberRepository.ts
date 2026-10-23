import type {
  IProjectMember,
  ProjectMemberRole,
} from "../entities/ProjectMember.js";

export interface IProjectMemberRepository {
  addMember(
    member: Omit<IProjectMember, "id" | "createdAt" | "updatedAt">,
  ): Promise<IProjectMember>;
  findByProjectAndEmail(
    projectId: string,
    email: string,
  ): Promise<IProjectMember | null>;
  findByProjectAndUserId(
    projectId: string,
    userId: string,
  ): Promise<IProjectMember | null>;
  findByProjectId(projectId: string): Promise<IProjectMember[]>;
  findByUserId(userId: string): Promise<IProjectMember[]>;
  findAll(filter?: {
    projectId?: string;
    query?: string;
  }): Promise<IProjectMember[]>;
  updateRole(
    id: string,
    role: ProjectMemberRole,
  ): Promise<IProjectMember | null>;
  delete(id: string): Promise<boolean>;
  deleteByProjectAndId(projectId: string, memberId: string): Promise<boolean>;
  /** Removes the user from each of the given projects; returns how many memberships were removed. */
  deleteByUserInProjects(userId: string, projectIds: string[]): Promise<number>;
}
