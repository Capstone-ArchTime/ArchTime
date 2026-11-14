export enum ProjectStatus {
  PENDING = "PENDING",
  ANALYZING = "ANALYZING", // a mining job is running; cloning is a stage of that job, not a status of its own
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

/**
 * What signed-in people outside a public personal workspace may do (BR-17). Viewing is on by default, asking the mentor
 * off; viewers' questions are charged to the owner, so the owner sets a daily limit per viewer.
 */
export interface IProjectViewerAccess {
  publicRead: boolean;
  allowChat: boolean;
  dailyLimit: number;
}

export const DEFAULT_VIEWER_ACCESS: IProjectViewerAccess = { publicRead: true, allowChat: false, dailyLimit: 10 };
export const MAX_VIEWER_DAILY_LIMIT = 200;

export function viewerAccessOf(project: Pick<IProject, "viewerAccess">): IProjectViewerAccess {
  return { ...DEFAULT_VIEWER_ACCESS, ...(project.viewerAccess ?? {}) };
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
  /** Personal public workspaces only; see IProjectViewerAccess. */
  viewerAccess?: Partial<IProjectViewerAccess>;
  createdAt: Date;
  updatedAt: Date;
}
