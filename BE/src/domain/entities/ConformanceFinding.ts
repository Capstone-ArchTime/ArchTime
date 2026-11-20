import type { ConformanceFindingType, ImportRef } from "../architecture/conformance.js";

// A finding of the conformance check (UC-40, UC-41, SDD §3.15): one way the code of one mined snapshot departs from the
// confirmed component diagram. Identified by (project, snapshot, key) where key = type|rule|source|target, so checking a
// snapshot again updates its findings instead of adding copies; a decision and an explanation survive the re-check.

/**
 * What a maintainer decided (UC-41):
 * - fix:     a real departure; the code is to be changed.
 * - accept:  an intended change; the diagram is to follow (through an architecture change request).
 * - dismiss: not a real problem (a false positive, a generated file).
 * Accept and dismiss carry over to the same finding in later snapshots, so a decided question is not asked again.
 */
export type FindingDecisionKind = "fix" | "accept" | "dismiss";
export const FINDING_DECISIONS: readonly FindingDecisionKind[] = ["fix", "accept", "dismiss"];

export interface FindingDecision {
  kind: FindingDecisionKind;
  note: string;
  by: string;
  at: Date;
  /** Set when the decision was carried over from an earlier snapshot: that snapshot's short hash. */
  inheritedFrom?: string | null;
}

export interface FindingExplanation {
  text: string;
  model: string;
  at: Date;
}

export interface IConformanceFinding {
  id: string;
  projectId: string;
  snapshotId: string;
  snapshotHash: string;
  /** Commit date of the snapshot: findings are listed newest first, and decisions carry over forward in time. */
  commitDate: Date;
  key: string;
  type: ConformanceFindingType;
  ruleId: string | null;
  ruleName: string | null;
  severity: "error" | "warning";
  source: string;
  target: string;
  sourceName: string;
  targetName: string;
  /** The imports behind the finding, at most MAX_STORED_IMPORTS of them; importCount has the full number. */
  imports: ImportRef[];
  importCount: number;
  files: string[];
  decision: FindingDecision | null;
  explanation: FindingExplanation | null;
  /** When the maintainers were e-mailed about it (D6); never e-mailed twice. */
  notifiedAt: Date | null;
  /** The last check of its snapshot no longer found it (the diagram or the rules changed), but it had been decided. */
  outdated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** One check of one snapshot: what it was checked against and what it found, including "nothing". */
export interface IConformanceCheck {
  projectId: string;
  snapshotId: string;
  snapshotHash: string;
  commitDate: Date;
  /** Hash of the diagram, prefixes, rules and baseline the snapshot was checked against; an equal one needs no new check. */
  fingerprint: string;
  checkedAt: Date;
  counts: { findings: number; errors: number; warnings: number; unmappedFiles: number; files: number };
  unresolvedRules: string[];
}
