import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../../shared/errors/AppError.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";
import type { GetProjectDashboardUseCase } from "../../application/use-cases/pm/GetProjectDashboardUseCase.js";
import type { GetProjectDiagramUseCase } from "../../application/use-cases/pm/GetProjectDiagramUseCase.js";
import type {
  SaveProjectDiagramUseCase,
  ConfirmProjectDiagramUseCase,
} from "../../application/use-cases/pm/SaveProjectDiagramUseCase.js";
import type {
  GetProjectRulesUseCase,
  CreateProjectRuleUseCase,
  UpdateProjectRuleUseCase,
  DeleteProjectRuleUseCase,
  ToggleProjectRuleUseCase,
  EvaluateProjectRulesUseCase,
} from "../../application/use-cases/pm/ProjectRulesUseCases.js";
import type {
  GetProjectDecisionsUseCase,
  CreateProjectDecisionUseCase,
  GetProjectDecisionDetailUseCase,
  UpdateProjectDecisionUseCase,
  DeleteProjectDecisionUseCase,
} from "../../application/use-cases/pm/ProjectDecisionUseCases.js";
import type {
  GetProjectApprovalsUseCase,
  CreateApprovalRequestUseCase,
  GetApprovalDetailUseCase,
  ApproveRequestUseCase,
  RejectRequestUseCase,
} from "../../application/use-cases/pm/ApprovalQueueUseCases.js";
import type {
  InviteProjectMemberTokenUseCase,
  GetProjectInvitationsUseCase,
  CancelProjectInvitationUseCase,
  AcceptProjectInvitationUseCase,
  DeclineProjectInvitationUseCase,
} from "../../application/use-cases/pm/ProjectInvitationUseCases.js";
import type {
  GetProjectReportsUseCase,
  GenerateProjectReportUseCase,
  GetProjectReportDetailUseCase,
} from "../../application/use-cases/pm/ProjectReportUseCases.js";
import type { ApprovalStatus, ApprovalType } from "../../domain/entities/ApprovalRequest.js";

export interface ProjectMaintainerUseCases {
  dashboardUseCase: GetProjectDashboardUseCase;
  getDiagramUseCase: GetProjectDiagramUseCase;
  saveDiagramUseCase: SaveProjectDiagramUseCase;
  confirmDiagramUseCase: ConfirmProjectDiagramUseCase;
  getRulesUseCase: GetProjectRulesUseCase;
  createRuleUseCase: CreateProjectRuleUseCase;
  updateRuleUseCase: UpdateProjectRuleUseCase;
  deleteRuleUseCase: DeleteProjectRuleUseCase;
  toggleRuleUseCase: ToggleProjectRuleUseCase;
  evaluateRulesUseCase: EvaluateProjectRulesUseCase;
  getDecisionsUseCase: GetProjectDecisionsUseCase;
  createDecisionUseCase: CreateProjectDecisionUseCase;
  getDecisionDetailUseCase: GetProjectDecisionDetailUseCase;
  updateDecisionUseCase: UpdateProjectDecisionUseCase;
  deleteDecisionUseCase: DeleteProjectDecisionUseCase;
  getApprovalsUseCase: GetProjectApprovalsUseCase;
  createApprovalUseCase: CreateApprovalRequestUseCase;
  getApprovalDetailUseCase: GetApprovalDetailUseCase;
  approveRequestUseCase: ApproveRequestUseCase;
  rejectRequestUseCase: RejectRequestUseCase;
  inviteMemberTokenUseCase: InviteProjectMemberTokenUseCase;
  getInvitationsUseCase: GetProjectInvitationsUseCase;
  cancelInvitationUseCase: CancelProjectInvitationUseCase;
  acceptInvitationUseCase: AcceptProjectInvitationUseCase;
  declineInvitationUseCase: DeclineProjectInvitationUseCase;
  getReportsUseCase: GetProjectReportsUseCase;
  generateReportUseCase: GenerateProjectReportUseCase;
  getReportDetailUseCase: GetProjectReportDetailUseCase;
}

export class ProjectMaintainerController {
  constructor(private readonly uc: ProjectMaintainerUseCases) {}

  // ── PM-01: Dashboard ────────────────────────────────────────────────────────
  public getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const data = await this.uc.dashboardUseCase.execute(projectId);
      sendSuccess(res, { dashboard: data });
    } catch (err) {
      next(err);
    }
  };

  // ── PM-02: Diagram ──────────────────────────────────────────────────────────
  public getDiagram = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const data = await this.uc.getDiagramUseCase.execute(projectId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  public saveDiagram = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const { diagram, expectedRevision } = req.body;
      const userId = req.user?.userId;

      const data = await this.uc.saveDiagramUseCase.execute({
        projectId,
        diagram,
        expectedRevision,
        userId,
      });
      sendSuccess(res, data, { message: "Diagram saved successfully." });
    } catch (err) {
      next(err);
    }
  };

  public confirmDiagram = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required.");

      const data = await this.uc.confirmDiagramUseCase.execute(projectId, userId);
      sendSuccess(res, data, { message: "Diagram confirmed successfully." });
    } catch (err) {
      next(err);
    }
  };

  // ── PM-03: Architecture Rules ───────────────────────────────────────────────
  public getRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const enabled =
        req.query.enabled !== undefined ? req.query.enabled === "true" : undefined;
      const constraint =
        req.query.constraint === "forbidden" || req.query.constraint === "required"
          ? req.query.constraint
          : undefined;
      const severity =
        req.query.severity === "error" || req.query.severity === "warning"
          ? req.query.severity
          : undefined;

      const data = await this.uc.getRulesUseCase.execute({
        projectId,
        search,
        enabled,
        constraint,
        severity,
      });
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  public createRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const { name, source, target, constraint, severity, rationale, enabled } = req.body;
      const userId = req.user?.userId;

      const rule = await this.uc.createRuleUseCase.execute({
        projectId,
        name,
        source,
        target,
        constraint,
        severity,
        rationale,
        enabled,
        userId,
      });
      sendSuccess(res, { rule }, { statusCode: 201, message: "Rule created successfully." });
    } catch (err) {
      next(err);
    }
  };

  public updateRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId, ruleId } = req.params;
      const { name, source, target, constraint, severity, rationale, enabled } = req.body;
      const userId = req.user?.userId;

      const rule = await this.uc.updateRuleUseCase.execute({
        projectId,
        ruleId,
        name,
        source,
        target,
        constraint,
        severity,
        rationale,
        enabled,
        userId,
      });
      sendSuccess(res, { rule }, { message: "Rule updated successfully." });
    } catch (err) {
      next(err);
    }
  };

  public deleteRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId, ruleId } = req.params;
      const userId = req.user?.userId;

      await this.uc.deleteRuleUseCase.execute(projectId, ruleId, userId);
      sendSuccess(res, null, { message: "Rule deleted successfully." });
    } catch (err) {
      next(err);
    }
  };

  public toggleRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId, ruleId } = req.params;
      const userId = req.user?.userId;

      const rule = await this.uc.toggleRuleUseCase.execute(projectId, ruleId, userId);
      sendSuccess(res, { rule }, { message: `Rule ${rule.enabled ? "enabled" : "disabled"}.` });
    } catch (err) {
      next(err);
    }
  };

  public evaluateRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const evaluation = await this.uc.evaluateRulesUseCase.execute(projectId);
      sendSuccess(res, { evaluation });
    } catch (err) {
      next(err);
    }
  };

  // ── PM-04: Design Decisions (ADR) ──────────────────────────────────────────
  public getDecisions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const status = typeof req.query.status === "string" ? (req.query.status as any) : undefined;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const data = await this.uc.getDecisionsUseCase.execute({
        projectId,
        search,
        status,
        page,
        limit,
      });
      sendSuccess(res, { decisions: data.decisions }, { meta: data.meta });
    } catch (err) {
      next(err);
    }
  };

  public createDecision = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const { title, context, decision, alternatives, consequences, status, componentIds } = req.body;
      const userId = req.user?.userId;

      const created = await this.uc.createDecisionUseCase.execute({
        projectId,
        title,
        context,
        decision,
        alternatives,
        consequences,
        status,
        componentIds,
        userId,
      });
      sendSuccess(res, { decision: created }, { statusCode: 201, message: "Design decision created." });
    } catch (err) {
      next(err);
    }
  };

  public getDecisionDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId, decisionId } = req.params;
      const decision = await this.uc.getDecisionDetailUseCase.execute(projectId, decisionId);
      sendSuccess(res, { decision });
    } catch (err) {
      next(err);
    }
  };

  public updateDecision = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId, decisionId } = req.params;
      const { title, context, decision, alternatives, consequences, status, componentIds } = req.body;
      const userId = req.user?.userId;

      const updated = await this.uc.updateDecisionUseCase.execute({
        projectId,
        decisionId,
        title,
        context,
        decision,
        alternatives,
        consequences,
        status,
        componentIds,
        userId,
      });
      sendSuccess(res, { decision: updated }, { message: "Design decision updated." });
    } catch (err) {
      next(err);
    }
  };

  public deleteDecision = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId, decisionId } = req.params;
      const userId = req.user?.userId;

      await this.uc.deleteDecisionUseCase.execute(projectId, decisionId, userId);
      sendSuccess(res, null, { message: "Design decision deleted." });
    } catch (err) {
      next(err);
    }
  };

  // ── PM-05: Approval Queue ──────────────────────────────────────────────────
  public getApprovals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const status = typeof req.query.status === "string" ? (req.query.status as ApprovalStatus) : undefined;
      const type = typeof req.query.type === "string" ? (req.query.type as ApprovalType) : undefined;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const data = await this.uc.getApprovalsUseCase.execute({
        projectId,
        status,
        type,
        page,
        limit,
      });
      sendSuccess(res, { approvals: data.approvals }, { meta: data.meta });
    } catch (err) {
      next(err);
    }
  };

  public createApproval = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const { title, description, type, data } = req.body;
      const requestedBy = req.user?.userId;
      if (!requestedBy) throw new UnauthorizedError("Authentication required.");

      const approval = await this.uc.createApprovalUseCase.execute({
        projectId,
        title,
        description,
        type,
        data,
        requestedBy,
      });
      sendSuccess(res, { approval }, { statusCode: 201, message: "Approval request submitted." });
    } catch (err) {
      next(err);
    }
  };

  public getApprovalDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId, approvalId } = req.params;
      const approval = await this.uc.getApprovalDetailUseCase.execute(projectId, approvalId);
      sendSuccess(res, { approval });
    } catch (err) {
      next(err);
    }
  };

  public approveRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId, approvalId } = req.params;
      const { reviewNote } = req.body;
      const reviewerId = req.user?.userId;
      if (!reviewerId) throw new UnauthorizedError("Authentication required.");

      const approval = await this.uc.approveRequestUseCase.execute({
        projectId,
        approvalId,
        reviewerId,
        reviewNote,
      });
      sendSuccess(res, { approval }, { message: "Request approved successfully." });
    } catch (err) {
      next(err);
    }
  };

  public rejectRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId, approvalId } = req.params;
      const { reviewNote } = req.body;
      const reviewerId = req.user?.userId;
      if (!reviewerId) throw new UnauthorizedError("Authentication required.");

      const approval = await this.uc.rejectRequestUseCase.execute({
        projectId,
        approvalId,
        reviewerId,
        reviewNote,
      });
      sendSuccess(res, { approval }, { message: "Request rejected successfully." });
    } catch (err) {
      next(err);
    }
  };

  // ── PM-06: Team Invitations ────────────────────────────────────────────────
  public inviteMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const { email, role } = req.body;
      const invitedBy = req.user?.userId;
      if (!invitedBy) throw new UnauthorizedError("Authentication required.");

      const invitation = await this.uc.inviteMemberTokenUseCase.execute({
        projectId,
        email,
        role,
        invitedBy,
      });
      sendSuccess(res, { invitation }, { statusCode: 201, message: "Invitation sent successfully." });
    } catch (err) {
      next(err);
    }
  };

  public getInvitations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const invitations = await this.uc.getInvitationsUseCase.execute(projectId);
      sendSuccess(res, { invitations });
    } catch (err) {
      next(err);
    }
  };

  public cancelInvitation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId, invitationId } = req.params;
      await this.uc.cancelInvitationUseCase.execute(projectId, invitationId);
      sendSuccess(res, null, { message: "Invitation cancelled." });
    } catch (err) {
      next(err);
    }
  };

  public acceptInvitation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.params;
      const userId = req.user?.userId;
      const result = await this.uc.acceptInvitationUseCase.execute(token, userId);
      sendSuccess(res, result, { message: "Invitation accepted. Welcome to the project!" });
    } catch (err) {
      next(err);
    }
  };

  public declineInvitation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.params;
      await this.uc.declineInvitationUseCase.execute(token);
      sendSuccess(res, null, { message: "Invitation declined." });
    } catch (err) {
      next(err);
    }
  };

  // ── PM-07: Reports ─────────────────────────────────────────────────────────
  public getReports = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const reports = await this.uc.getReportsUseCase.execute(projectId);
      sendSuccess(res, { reports });
    } catch (err) {
      next(err);
    }
  };

  public generateReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId } = req.params;
      const { title, type } = req.body;
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required.");

      const report = await this.uc.generateReportUseCase.execute({
        projectId,
        title,
        type,
        userId,
      });
      sendSuccess(res, { report }, { statusCode: 201, message: "Report generated successfully." });
    } catch (err) {
      next(err);
    }
  };

  public getReportDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId, reportId } = req.params;
      const report = await this.uc.getReportDetailUseCase.execute(projectId, reportId);
      sendSuccess(res, { report });
    } catch (err) {
      next(err);
    }
  };

  public downloadReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId, reportId } = req.params;
      const report = await this.uc.getReportDetailUseCase.execute(projectId, reportId);

      const markdown = [
        `# ${report.title}`,
        `Type: ${report.type} | Date: ${new Date(report.createdAt).toLocaleString()}`,
        `\n## Executive Summary\n${report.summary}`,
        `\n## Aggregated Metrics\n\`\`\`json\n${JSON.stringify(report.data, null, 2)}\n\`\`\``,
      ].join("\n");

      res.setHeader("Content-Type", "text/markdown");
      res.setHeader("Content-Disposition", `attachment; filename="report-${report.id}.md"`);
      res.send(markdown);
    } catch (err) {
      next(err);
    }
  };
}
