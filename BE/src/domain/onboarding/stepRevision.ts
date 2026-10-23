// Ties a piece of learning material (an onboarding step) to the revision it was written against, and tells whether it
// still holds. Pure: the facts about the repository are passed in, so this is unit-testable and the Onboarding Path
// module only stores a StepRevision with each step and asks assessStepRevision when it shows the step.

export interface StepRevision {
  /** Full hash of the commit the step was written against. */
  commit: string | null;
  snapshotId: string | null;
  /** Workspace (canonical map) revision at the time; the map the step explains. */
  workspaceRevision: number | null;
  pinnedAt: Date;
}

/**
 * current  – everything the step points to still exists and the canonical map has not changed since.
 * outdated – the commit still exists but the canonical map was edited since: the step may describe an old map.
 * missing  – the commit (or its snapshot) is gone, for example after a force-push: the step must be updated.
 */
export type StepRevisionStatus = "current" | "outdated" | "missing";

export interface StepRevisionIssue {
  code: "COMMIT_GONE" | "SNAPSHOT_GONE" | "MAP_CHANGED";
  message: string;
}

export interface StepRevisionAssessment {
  status: StepRevisionStatus;
  issues: StepRevisionIssue[];
}

/** What the repository and workspace look like now, for one pinned revision. */
export interface RevisionFacts {
  /** The pinned snapshot (by id, else by commit) still exists. */
  snapshotExists: boolean;
  /** The commit is no longer reachable from any branch or tag of the remote (set by the last scan or mine). */
  commitGone: boolean;
  /** When the commit was found missing. */
  goneSince?: Date | null;
  currentWorkspaceRevision: number | null;
}

export function assessStepRevision(revision: StepRevision, facts: RevisionFacts): StepRevisionAssessment {
  const issues: StepRevisionIssue[] = [];
  if (revision.commit && facts.commitGone) {
    const since = facts.goneSince ? ` since ${facts.goneSince.toISOString().slice(0, 10)}` : "";
    issues.push({ code: "COMMIT_GONE", message: `Commit ${revision.commit.slice(0, 7)} is no longer in the repository history${since} (force-push or deleted branch).` });
  }
  if ((revision.snapshotId || revision.commit) && !facts.snapshotExists) {
    issues.push({ code: "SNAPSHOT_GONE", message: "The snapshot this step points to was deleted or re-mined." });
  }
  if (
    revision.workspaceRevision !== null &&
    facts.currentWorkspaceRevision !== null &&
    facts.currentWorkspaceRevision !== revision.workspaceRevision
  ) {
    issues.push({
      code: "MAP_CHANGED",
      message: `The canonical map changed from revision ${revision.workspaceRevision} to ${facts.currentWorkspaceRevision} since this step was written.`,
    });
  }
  const status: StepRevisionStatus = issues.some(i => i.code !== "MAP_CHANGED")
    ? "missing"
    : issues.length ? "outdated" : "current";
  return { status, issues };
}
