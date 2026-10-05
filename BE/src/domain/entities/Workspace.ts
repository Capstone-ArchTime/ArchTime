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
  createdAt: Date;
  updatedAt: Date;
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
