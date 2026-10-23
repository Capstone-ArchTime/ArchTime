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
  /** A personal access token for a private repository; write-only, never returned by the repository. */
  token?: string;
  status: ProjectStatus;
  history?: IRepoHistory;
  userId: string;
  /** Set when the project belongs to an organization rather than to its owner's personal space. */
  organizationId?: string;
  /** Organization credential used to clone the repository, instead of a personal token. */
  credentialId?: string;
  createdAt: Date;
  updatedAt: Date;
}
