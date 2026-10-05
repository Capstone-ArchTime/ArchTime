export enum ProjectStatus {
  PENDING = "PENDING",
  CLONING = "CLONING",
  ANALYZING = "ANALYZING",
  PARTIAL = "PARTIAL", // some, but not all, commits have been mined
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export enum RepoVisibility {
  PUBLIC = "public",
  PRIVATE = "private",
}

export interface IRepoHistory {
  totalCommits: number;
  firstCommitDate?: Date;
  lastCommitDate?: Date;
  monthly: { month: string; commits: number }[];
  scannedAt: Date;
}

export interface IProject {
  id: string;
  name: string;
  description?: string;
  repoUrl: string;
  visibility: RepoVisibility;
  token?: string;
  status: ProjectStatus;
  history?: IRepoHistory;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
