import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IProjectMemberRepository } from "../../../domain/interfaces/IProjectMemberRepository.js";
import type { IOrganizationRepository } from "../../../domain/interfaces/IOrganizationRepository.js";
import type { IProject } from "../../../domain/entities/Project.js";
import { MemberStatus } from "../../../domain/entities/ProjectMember.js";
import { OrganizationRole } from "../../../domain/entities/Organization.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors/AppError.js";

// Moving a personal project into an organization (RF-11, UC-29). Snapshots, evidence, the workspace with its diagram,
// path prefixes, rules and decisions, conformance findings and agent tokens are all keyed by the project id: they move
// with it, nothing is copied. What changes is who can see it: an organization's projects are visible to its members
// only, so members of the personal project outside the organization lose access (they are named before the move).

/** The repository a URL points at, written one way: host in lower case, no trailing ".git" or "/". */
export function sameRepositoryKey(url: string): string {
  try {
    const u = new URL(url.trim());
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, "").replace(/\.git$/i, "").replace(/\/+$/, "");
    return `${u.protocol}//${u.host.toLowerCase()}${u.host.includes("github.com") || u.host.includes("gitlab.com") ? path.toLowerCase() : path}`;
  } catch {
    return url.trim().replace(/\/+$/, "").replace(/\.git$/i, "").toLowerCase();
  }
}

export interface TransferPreview {
  project: { id: string; name: string; repoUrl: string };
  organization: { id: string; name: string };
  /** MSG18: the organization already has a workspace for this repository. */
  duplicate: { id: string; name: string } | null;
  /** Active members of the personal project who are not members of the organization: they lose access. */
  membersLosingAccess: { userId: string; name: string; email: string; role: string }[];
}

export type TransferAudit = (entry: { action: string; userId: string; targetId: string; details: Record<string, unknown> }) => Promise<void>;

export class TransferProjectUseCase {
  constructor(
    private readonly projects: Pick<IProjectRepository, "findById" | "findByOrganizationId" | "moveToOrganization">,
    private readonly organizations: Pick<IOrganizationRepository, "findById" | "findMember">,
    private readonly members: Pick<IProjectMemberRepository, "findByProjectId">,
    private readonly audit: TransferAudit = async () => {},
  ) {}

  private async check(input: { projectId: string; organizationId: unknown; userId: string }): Promise<{ project: IProject; preview: TransferPreview }> {
    if (typeof input.organizationId !== "string" || !input.organizationId.trim()) throw new BadRequestError("Choose the organization to move the workspace into.", "VALIDATION_ERROR");
    const organizationId = input.organizationId.trim();
    const project = await this.projects.findById(input.projectId);
    if (!project) throw new NotFoundError("Workspace not found.");
    if (project.organizationId) throw new ConflictError("This workspace already belongs to an organization.", "CONFLICT");
    if (project.userId !== input.userId) throw new ForbiddenError("Only the owner of a personal workspace can move it into an organization.");
    const organization = await this.organizations.findById(organizationId);
    if (!organization) throw new NotFoundError("Organization not found.");
    const membership = await this.organizations.findMember(organizationId, input.userId);
    if (membership?.role !== OrganizationRole.OWNER) throw new ForbiddenError("Only an owner of the organization can move a workspace into it.");

    const key = sameRepositoryKey(project.repoUrl);
    const existing = (await this.projects.findByOrganizationId(organizationId)).find(p => p.id !== project.id && sameRepositoryKey(p.repoUrl) === key);
    const members = await this.members.findByProjectId(project.id);
    const losing: TransferPreview["membersLosingAccess"] = [];
    for (const m of members) {
      if (m.status !== MemberStatus.ACTIVE || !m.userId || m.userId === project.userId) continue;
      if (!(await this.organizations.findMember(organizationId, m.userId))) losing.push({ userId: m.userId, name: m.name ?? "", email: m.email ?? "", role: m.role });
    }
    return {
      project,
      preview: {
        project: { id: project.id, name: project.name, repoUrl: project.repoUrl },
        organization: { id: organization.id, name: organization.name },
        duplicate: existing ? { id: existing.id, name: existing.name } : null,
        membersLosingAccess: losing.sort((a, b) => a.name.localeCompare(b.name)),
      },
    };
  }

  /** What the move would do, without doing it. */
  async preview(input: { projectId: string; organizationId: unknown; userId: string }): Promise<TransferPreview> {
    return (await this.check(input)).preview;
  }

  async execute(input: { projectId: string; organizationId: unknown; userId: string }): Promise<{ project: IProject; preview: TransferPreview }> {
    const { project, preview } = await this.check(input);
    if (preview.duplicate) {
      // MSG18
      throw new ConflictError(`The organization "${preview.organization.name}" already has a workspace for this repository ("${preview.duplicate.name}"). Use that workspace, or delete one of them first.`, "ALREADY_EXISTS");
    }
    const moved = await this.projects.moveToOrganization(project.id, input.userId, preview.organization.id);
    if (!moved) throw new ConflictError("The workspace changed while it was being moved. Reload and try again.", "CONFLICT");
    await this.audit({
      action: "PROJECT_TRANSFER", userId: input.userId, targetId: project.id,
      details: { organizationId: preview.organization.id, organizationName: preview.organization.name, membersLosingAccess: preview.membersLosingAccess.map(m => m.userId) },
    }).catch(() => undefined);
    return { project: moved, preview };
  }
}
