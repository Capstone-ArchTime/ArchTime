import type { Request, Response, NextFunction } from "express";
import type { OrganizationUseCases } from "../../application/use-cases/organizations/OrganizationUseCases.js";
import type { OrganizationCredentialUseCases } from "../../application/use-cases/organizations/OrganizationCredentialUseCases.js";
import { AuditAction } from "../../domain/entities/AuditLog.js";
import { AuditService } from "../../infrastructure/services/AuditService.js";
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
      sendSuccess(res, { member }, { statusCode: 201, message: "Member added." });
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
