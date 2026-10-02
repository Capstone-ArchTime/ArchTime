// Typed intermediate representation (IR) for a reconstructed architecture view.
// Every component edge must be derivable from class-level dependencies (see derive.ts and validate.ts);
// nothing in a view is allowed to exist only because a model said so.

export type Provenance = 'FACT' | 'INFERENCE' | 'UNKNOWN';
export type ComponentRole = 'controller' | 'service' | 'repository' | 'entity' | 'gateway' | 'config' | 'util' | 'external' | 'other';
export type DependencyKind = 'imports' | 'injects' | 'extends' | 'implements' | 'calls';
export type ViewGenerator = 'cluster+llm' | 'cluster-only' | 'manual' | 'fixture';

export const COMPONENT_ROLES: readonly ComponentRole[] = ['controller', 'service', 'repository', 'entity', 'gateway', 'config', 'util', 'external', 'other'];
export const DEPENDENCY_KINDS: readonly DependencyKind[] = ['imports', 'injects', 'extends', 'implements', 'calls'];
export const PROVENANCES: readonly Provenance[] = ['FACT', 'INFERENCE', 'UNKNOWN'];

export interface ArchClass {
  id: string;
  name: string;
  componentId: string;
  path: string;
  kind?: 'class' | 'interface' | 'enum' | 'record';
}

export interface ClassEdge {
  source: string;
  target: string;
  kind: DependencyKind;
  path: string;
  line?: number;
}

export interface Evidence {
  fromClass: string;
  toClass: string;
  kind: DependencyKind;
  path: string;
  line?: number;
}

export interface ArchComponent {
  id: string;
  name: string;
  role: ComponentRole;
  label: Provenance;
  description: string;
  memberIds: string[];
  /** Optional vertical tier hint (0 = top). Computed from dependencies when absent. */
  layer?: number;
}

export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  /** Number of class-level dependencies backing this edge. */
  weight: number;
  kinds: Partial<Record<DependencyKind, number>>;
  evidence: Evidence[];
}

export interface ArchitectureView {
  schemaVersion: 1;
  projectId: string;
  snapshotId: string;
  title: string;
  generator: ViewGenerator;
  components: ArchComponent[];
  edges: ArchEdge[];
  classes: ArchClass[];
  classEdges: ClassEdge[];
}

export type IssueSeverity = 'error' | 'warning';
export interface ValidationIssue {
  code: string;
  severity: IssueSeverity;
  subject: string;
  message: string;
  evidence?: Record<string, string | number | boolean>;
}
export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}
