export interface IWorkspaceComponent {
  id: string;
  name: string;
  kind: string;
  description: string;
}

export interface IWorkspaceDependency {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface IWorkspaceDiagram {
  components: IWorkspaceComponent[];
  dependencies: IWorkspaceDependency[];
  revision: number;
  confirmedAt?: Date | null;
  confirmedBy?: string | null;
}

export interface IWorkspaceRule {
  id: string;
  name: string;
  source: string;
  target: string;
  constraint: "forbidden" | "required";
  severity: "error" | "warning";
  rationale: string;
  enabled: boolean;
}

export interface IWorkspaceDecision {
  id: string;
  number: number;
  title: string;
  status: "Proposed" | "Accepted" | "Deprecated";
  context: string;
  decision: string;
  alternatives: string;
  consequences: string;
  componentIds: string[];
  /** Recorded: written when the decision was made. Reconstructed: written afterwards from the history. */
  origin: DecisionOrigin;
  /** What the ADR rests on; every entry was checked to exist in this project when it was attached. */
  sources: IDecisionSource[];
  statusHistory: IDecisionStatusChange[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type DecisionOrigin = "recorded" | "reconstructed";
export const DECISION_ORIGINS: readonly DecisionOrigin[] = ["recorded", "reconstructed"];

export type DecisionSourceKind = "commit" | "snapshot" | "evidence" | "approval";
export const DECISION_SOURCE_KINDS: readonly DecisionSourceKind[] = ["commit", "snapshot", "evidence", "approval"];

export interface IDecisionSource {
  kind: DecisionSourceKind;
  /** Full commit hash, or the id of the snapshot / evidence / approval request. */
  ref: string;
  /** What the source says, captured when it was attached (commit subject, evidence title, ...). */
  title: string;
  /** For commits, snapshots and evidence: when the change happened. */
  date?: Date;
  note?: string;
}

export interface IDecisionStatusChange {
  status: IWorkspaceDecision["status"];
  at: Date;
  by?: string;
}

export interface IWorkspace {
  id: string;
  projectId: string;
  revision: number;
  diagram: IWorkspaceDiagram;
  rules: IWorkspaceRule[];
  decisions: IWorkspaceDecision[];
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
