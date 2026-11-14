import type { Request, Response, NextFunction } from "express";
import type { OrganizationUseCases } from "../../application/use-cases/organizations/OrganizationUseCases.js";
import type { OrganizationCredentialUseCases } from "../../application/use-cases/organizations/OrganizationCredentialUseCases.js";
import { AuditAction } from "../../domain/entities/AuditLog.js";
import { AuditService } from "../../infrastructure/services/AuditService.js";
import { LlmRunService } from "../../infrastructure/services/LlmRunService.js";
import { BadRequestError } from "../../shared/errors/AppError.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";

export class OrganizationController {
  constructor(
    private readonly organizations: OrganizationUseCases,
    private readonly credentials: OrganizationCredentialUseCases,
  ) {}

  private audit(req: Request, action: AuditAction, targetType: string, targetId: string, details?: Record<string, unknown>) {
    return AuditService.log({
      action, userId: req.user!.userId, targetType, targetId, details,
      ipAddress: req.ip, userAgent: req.get("user-agent"),
    });
  }

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, description } = req.body ?? {};
      const organization = await this.organizations.create({ userId: req.user!.userId, name, description });
      await this.audit(req, AuditAction.ORGANIZATION_CREATE, "organization", organization.id, { name: organization.name });
      sendSuccess(res, { organization }, { statusCode: 201, message: "Organization created." });
    } catch (err) { next(err); }
  };

  listMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizations = await this.organizations.listMine(req.user!.userId);
      sendSuccess(res, { organizations });
    } catch (err) { next(err); }
  };

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organization = await this.organizations.get(req.params.orgId, req.user!.userId);
      sendSuccess(res, { organization });
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, description } = req.body ?? {};
      const organization = await this.organizations.update({ organizationId: req.params.orgId, userId: req.user!.userId, name, description });
      sendSuccess(res, { organization }, { message: "Organization updated." });
    } catch (err) { next(err); }
  };

  /** UC-30: owners see AI tokens and cost per project of the organization for a period; there is no per-member view. */
  aiCost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.organizations.requireOwner(req.params.orgId, req.user!.userId);
      const parse = (v: unknown, name: string) => {
        if (v === undefined || v === "") return undefined;
        const d = new Date(String(v));
        if (Number.isNaN(d.getTime())) throw new BadRequestError(`${name} must be a date (YYYY-MM-DD).`, "VALIDATION_ERROR");
        return d;
      };
      const from = parse(req.query.from, "from");
      const to = parse(req.query.to, "to");
      if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setUTCHours(23, 59, 59, 999);
      if (from && to && from > to) throw new BadRequestError("from must not be after to.", "VALIDATION_ERROR");
      const report = await LlmRunService.costByProject(req.params.orgId, { from, to });
      sendSuccess(res, { period: { from: from ?? null, to: to ?? null }, ...report });
    } catch (err) { next(err); }
  };

  myInvitations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const invitations = await this.organizations.myInvitations(req.user!.userId);
      sendSuccess(res, { invitations });
    } catch (err) { next(err); }
  };

  acceptInvitation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organization = await this.organizations.respondToInvitation({ organizationId: req.params.orgId, userId: req.user!.userId, accept: true });
      await this.audit(req, AuditAction.ORGANIZATION_MEMBER_ADD, "organization", req.params.orgId, { memberUserId: req.user!.userId, accepted: true });
      sendSuccess(res, { organization }, { message: "You joined the organization." });
    } catch (err) { next(err); }
  };

  declineInvitation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.organizations.respondToInvitation({ organizationId: req.params.orgId, userId: req.user!.userId, accept: false });
      sendSuccess(res, { declined: true }, { message: "Invitation declined." });
    } catch (err) { next(err); }
  };

  listMembers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const members = await this.organizations.listMembers(req.params.orgId, req.user!.userId);
      sendSuccess(res, { members });
    } catch (err) { next(err); }
  };

  addMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, role } = req.body ?? {};
      const member = await this.organizations.addMember({ organizationId: req.params.orgId, userId: req.user!.userId, email, role });
      await this.audit(req, AuditAction.ORGANIZATION_MEMBER_ADD, "organization", req.params.orgId, { memberUserId: member.userId, role: member.role });
      sendSuccess(res, { member }, { statusCode: 201, message: "Invitation sent. The person becomes a member after accepting it." });
    } catch (err) { next(err); }
  };

  updateMemberRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const member = await this.organizations.updateMemberRole({
        organizationId: req.params.orgId, userId: req.user!.userId, memberId: req.params.memberId, role: req.body?.role,
      });
      sendSuccess(res, { member }, { message: "Member role updated." });
    } catch (err) { next(err); }
  };

  removeMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.organizations.removeMember({ organizationId: req.params.orgId, userId: req.user!.userId, memberId: req.params.memberId });
      await this.audit(req, AuditAction.ORGANIZATION_MEMBER_REMOVE, "organization", req.params.orgId, { memberId: req.params.memberId, ...result });
      sendSuccess(res, result, { message: "Member removed from the organization and its projects." });
    } catch (err) { next(err); }
  };

  listCredentials = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const credentials = await this.credentials.list(req.params.orgId, req.user!.userId);
      sendSuccess(res, { credentials });
    } catch (err) { next(err); }
  };

  createCredential = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, provider, token } = req.body ?? {};
      const credential = await this.credentials.create({ organizationId: req.params.orgId, userId: req.user!.userId, name, provider, token });
      await this.audit(req, AuditAction.ORGANIZATION_CREDENTIAL_CREATE, "organization-credential", credential.id, { organizationId: req.params.orgId, name: credential.name });
      sendSuccess(res, { credential }, { statusCode: 201, message: "Credential saved." });
    } catch (err) { next(err); }
  };

  rotateCredential = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const credential = await this.credentials.rotate({
        organizationId: req.params.orgId, userId: req.user!.userId, credentialId: req.params.credentialId, token: req.body?.token,
      });
      await this.audit(req, AuditAction.ORGANIZATION_CREDENTIAL_ROTATE, "organization-credential", credential.id, { organizationId: req.params.orgId });
      sendSuccess(res, { credential }, { message: "Credential token replaced." });
    } catch (err) { next(err); }
  };

  deleteCredential = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.credentials.delete({ organizationId: req.params.orgId, userId: req.user!.userId, credentialId: req.params.credentialId });
      await this.audit(req, AuditAction.ORGANIZATION_CREDENTIAL_DELETE, "organization-credential", req.params.credentialId, { organizationId: req.params.orgId });
      sendSuccess(res, null, { message: "Credential deleted." });
    } catch (err) { next(err); }
  };
}
