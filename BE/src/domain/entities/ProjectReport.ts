export enum ReportType {
  ARCHITECTURE_SUMMARY = "architecture_summary",
  RULES_COMPLIANCE = "rules_compliance",
  EVOLUTION_HISTORY = "evolution_history",
  FULL_AUDIT = "full_audit",
}

export enum ReportStatus {
  READY = "ready",
  GENERATING = "generating",
  FAILED = "failed",
}

export interface IProjectReport {
  id: string;
  projectId: string;
  title: string;
  type: ReportType;
  generatedBy: string;
  status: ReportStatus;
  summary: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
