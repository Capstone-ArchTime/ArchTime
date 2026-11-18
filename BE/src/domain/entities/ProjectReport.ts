export enum ReportType {
  ARCHITECTURE_SUMMARY = "architecture_summary",
  RULES_COMPLIANCE = "rules_compliance",
  EVOLUTION_HISTORY = "evolution_history",
  FULL_AUDIT = "full_audit",
}

/** A report is built in the request that asks for it, so it is stored only once it is ready. */
export enum ReportStatus {
  READY = "ready",
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
