import type { ConformanceFinding } from "../architecture/conformance.js";
import type { FindingDecision, FindingExplanation, IConformanceCheck, IConformanceFinding } from "../entities/ConformanceFinding.js";

export interface SnapshotRef { id: string; hash: string; date: Date }

/** The mined snapshots the check reads. */
export interface IConformanceSnapshots {
  /** The commit date of the project's snapshot with this short or full hash; null when it is not (or no longer) mined. */
  dateOf(projectId: string, hash: string): Promise<Date | null>;
  /** Snapshots still in the history, committed after `after` (all of them when null), oldest first. */
  after(projectId: string, after: Date | null): Promise<SnapshotRef[]>;
  /** The file graph of one snapshot. */
  graph(snapshotId: string): Promise<{ nodes: { id: string }[]; edges: { source: string; target: string }[] } | null>;
}

export interface FindingQuery {
  snapshotId?: string;
  /** open: no decision yet; decided: has one. */
  status?: "open" | "decided";
  type?: string;
  limit?: number;
}

export interface IConformanceRepository {
  /**
   * Stores the result of checking one snapshot: findings are upserted by (project, snapshot, key) keeping their decision,
   * explanation and notifiedAt; findings the check no longer produces are removed if undecided, else marked outdated.
   * `inherited` gives the decision to start a new finding with, by key (carried over from an earlier snapshot).
   */
  recordCheck(input: {
    check: IConformanceCheck;
    findings: (ConformanceFinding & { sourceName: string; targetName: string; importCount: number })[];
    inherited: ReadonlyMap<string, FindingDecision>;
  }): Promise<void>;
  checksOf(projectId: string, limit?: number): Promise<IConformanceCheck[]>;
  checkOf(projectId: string, snapshotId: string): Promise<IConformanceCheck | null>;
  /** The latest accept / dismiss decision per key, from findings of snapshots committed before `before`. */
  carriedDecisions(projectId: string, keys: string[], before: Date): Promise<Map<string, FindingDecision & { snapshotHash: string }>>;
  findings(projectId: string, query?: FindingQuery): Promise<IConformanceFinding[]>;
  findById(projectId: string, findingId: string): Promise<IConformanceFinding | null>;
  setDecision(projectId: string, findingId: string, decision: FindingDecision | null): Promise<IConformanceFinding | null>;
  /**
   * Takes the open findings of a project nobody was told about yet, by setting their notifiedAt to `at` in one write, so
   * two runs never e-mail the same finding (BR-34). Returns the findings taken.
   */
  claimUnnotified(projectId: string, at: Date): Promise<IConformanceFinding[]>;
  /** Gives findings taken by claimUnnotified back (the e-mail could not be sent), to be tried again next time. */
  releaseClaim(projectId: string, at: Date): Promise<void>;
  /** Records that the user has looked at the project's findings now (MSG26). */
  markSeen(projectId: string, userId: string, at: Date): Promise<void>;
  /** Open findings found since the user last looked, per project; projects with none are left out. */
  unreadCounts(userId: string, projectIds: string[]): Promise<Map<string, number>>;
  /** Gives `decision` to the open findings with this key in snapshots committed after `after`; returns how many. */
  carryForward(projectId: string, key: string, after: Date, decision: FindingDecision): Promise<number>;
  setExplanation(projectId: string, findingId: string, explanation: FindingExplanation): Promise<IConformanceFinding | null>;
}
