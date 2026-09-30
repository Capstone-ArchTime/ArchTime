export enum ProjectStatus {
  PENDING = "PENDING",
  CLONING = "CLONING",
  ANALYZING = "ANALYZING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export enum RepoVisibility {
  PUBLIC = "public",
  PRIVATE = "private",
}

export interface IProject {
  id: string;
  name: string;
  description?: string;
  repoUrl: string;
  visibility: RepoVisibility;
  token?: string;
  status: ProjectStatus;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
