import { CredentialProvider, type IOrganizationCredential } from "../../../domain/entities/Organization.js";
import type { IOrganizationCredentialRepository } from "../../../domain/interfaces/IOrganizationRepository.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../../shared/errors/AppError.js";
import type { OrganizationUseCases } from "./OrganizationUseCases.js";

const NAME_MAX = 80;
const SECRET_MIN = 8;
const SECRET_MAX = 1024;

export interface CredentialView extends IOrganizationCredential {
  /** Projects that clone with this credential. */
  usedBy: number;
}

function parseName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > NAME_MAX) {
    throw new BadRequestError(`Credential name must be 1–${NAME_MAX} characters.`, "VALIDATION_ERROR");
  }
  return value.trim();
}

function parseSecret(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < SECRET_MIN || value.length > SECRET_MAX || /\s/.test(value.trim())) {
    throw new BadRequestError(`Token must be ${SECRET_MIN}–${SECRET_MAX} characters without spaces.`, "VALIDATION_ERROR");
  }
  return value.trim();
}

function parseProvider(value: unknown): CredentialProvider {
  if (value === undefined) return CredentialProvider.GITHUB;
  if (!Object.values(CredentialProvider).includes(value as CredentialProvider)) {
    throw new BadRequestError(`Provider must be one of: ${Object.values(CredentialProvider).join(", ")}.`, "VALIDATION_ERROR");
  }
  return value as CredentialProvider;
}

/**
 * Repository credentials that belong to an organization. Only owners manage them; the token is write-only: responses
 * carry the name, provider and last four characters, never the token.
 */
export class OrganizationCredentialUseCases {
  constructor(
    private readonly organizations: OrganizationUseCases,
    private readonly credentials: IOrganizationCredentialRepository,
    private readonly projects: IProjectRepository,
  ) {}

  private async view(credential: IOrganizationCredential): Promise<CredentialView> {
    return { ...credential, usedBy: await this.projects.countByCredentialId(credential.id) };
  }

  async list(organizationId: string, userId: string): Promise<CredentialView[]> {
    await this.organizations.requireOwner(organizationId, userId);
    return Promise.all((await this.credentials.list(organizationId)).map(c => this.view(c)));
  }

  async create(input: { organizationId: string; userId: string; name: unknown; provider?: unknown; token: unknown }): Promise<CredentialView> {
    await this.organizations.requireOwner(input.organizationId, input.userId);
    const name = parseName(input.name);
    const provider = parseProvider(input.provider);
    const secret = parseSecret(input.token);
    if ((await this.credentials.list(input.organizationId)).some(c => c.name.toLowerCase() === name.toLowerCase())) {
      throw new ConflictError("A credential with this name already exists in the organization.");
    }
    const created = await this.credentials.create({ organizationId: input.organizationId, name, provider, secret, createdBy: input.userId });
    return { ...created, usedBy: 0 };
  }

  /** Replaces the token, for example after it expired; projects using the credential pick it up on their next job. */
  async rotate(input: { organizationId: string; userId: string; credentialId: string; token: unknown }): Promise<CredentialView> {
    await this.organizations.requireOwner(input.organizationId, input.userId);
    const secret = parseSecret(input.token);
    const rotated = await this.credentials.rotate(input.organizationId, input.credentialId, secret);
    if (!rotated) throw new NotFoundError("Credential not found.");
    return this.view(rotated);
  }

  async delete(input: { organizationId: string; userId: string; credentialId: string }): Promise<void> {
    await this.organizations.requireOwner(input.organizationId, input.userId);
    const credential = await this.credentials.findById(input.organizationId, input.credentialId);
    if (!credential) throw new NotFoundError("Credential not found.");
    const usedBy = await this.projects.countByCredentialId(credential.id);
    if (usedBy > 0) {
      throw new ConflictError(`${usedBy} project(s) still clone with this credential. Rotate it instead, or move those projects to another credential first.`, "CONFLICT");
    }
    await this.credentials.delete(input.organizationId, credential.id);
  }

  /** For project registration: the credential must belong to the project's organization. */
  async requireCredential(organizationId: string, credentialId: string): Promise<IOrganizationCredential> {
    const credential = await this.credentials.findById(organizationId, credentialId);
    if (!credential) throw new BadRequestError("This credential does not belong to the organization.", "VALIDATION_ERROR");
    return credential;
  }
}
