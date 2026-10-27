// Ties a piece of learning material (an onboarding step) to the revision it was written against, and tells whether it
// still holds. Pure: the facts about the repository are passed in, so this is unit-testable and the Onboarding Path
// module only stores a StepRevision with each step and asks assessStepRevision when it shows the step.

export interface StepRevision {
  /** Full hash of the commit the step was written against. */
  commit: string | null;
  snapshotId: string | null;
  /** Workspace (canonical map) revision at the time. Any workspace save raises it, so onboarding steps use `fingerprint`. */
  workspaceRevision: number | null;
  pinnedAt: Date;
  /**
   * Fingerprint of what the step is about (its component or design decision) when it was pinned; see stepReference.ts.
   * Absent on question and commit steps, and on steps pinned before fingerprints existed.
   */
  fingerprint?: string | null;
}

/**
 * current  – everything the step points to still exists and has not changed since.
 * outdated – the step's own component or design decision changed since: the step may describe it as it was.
 * missing  – the commit (or its snapshot), or the component or decision the step is about, is gone: the step must be updated.
 */
export type StepRevisionStatus = "current" | "outdated" | "missing";

export interface StepRevisionIssue {
  code: "COMMIT_GONE" | "SNAPSHOT_GONE" | "REF_GONE" | "MAP_CHANGED";
  message: string;
}

export interface StepRevisionAssessment {
  status: StepRevisionStatus;
  issues: StepRevisionIssue[];
}

/** What the step is about inside the workspace, as it is now (built by referenceFacts in stepReference.ts). */
export interface ReferenceFacts {
  /** null: the step is about nothing in the workspace (a question, a commit), so no workspace edit can outdate it. */
  kind: "component" | "adr" | null;
  exists: boolean;
  /** The reference's fingerprint now; null when it is gone. */
  fingerprint: string | null;
  /**
   * For steps pinned before fingerprints existed: when the reference may last have changed. For a component the time the
   * diagram was last confirmed, for a decision the time it was last edited; null when unknown.
   */
  changedAt: Date | null;
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
  /**
   * The step's own reference. When given, only a change to it outdates the step; when left out (material that does not
   * say what it is about, such as the generic revision check), any change of the canonical map does.
   */
  reference?: ReferenceFacts;
}

const time = (value: Date | string | null | undefined): number => (value ? new Date(value).getTime() : Number.NaN);

function referenceIssues(revision: StepRevision, reference: ReferenceFacts): StepRevisionIssue[] {
  if (!reference.kind) return [];
  const what = reference.kind === "component" ? "component" : "design decision";
  if (!reference.exists) {
    const where = reference.kind === "component" ? "the component diagram" : "the workspace";
    return [{ code: "REF_GONE", message: `The ${what} this step is about is no longer in ${where}.` }];
  }
  const changed = revision.fingerprint
    ? revision.fingerprint !== reference.fingerprint
    // Pinned before fingerprints: fall back to the time the reference may have changed, which can only over-report.
    : time(reference.changedAt) > time(revision.pinnedAt);
  if (!changed) return [];
  const message = reference.kind === "component"
    ? revision.fingerprint
      ? "This component changed since the step was written (its name, kind, description or dependencies)."
      : "The component diagram was confirmed again after this step was written, so this component may have changed."
    : "This design decision was edited since the step was written.";
  return [{ code: "MAP_CHANGED", message }];
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
  if (facts.reference) {
    issues.push(...referenceIssues(revision, facts.reference));
  } else if (
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
