export enum ApprovalType {
  ARCHITECTURE_CHANGE = "architecture_change",
  RULE_EXCEPTION = "rule_exception",
  SNAPSHOT_BASELINE = "snapshot_baseline",
  MEMBER_INVITE = "member_invite",
}

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

export interface IApprovalRequest {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  type: ApprovalType;
  status: ApprovalStatus;
  requestedBy: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNote?: string;
  data?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
