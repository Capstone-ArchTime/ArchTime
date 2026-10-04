import { createHash, randomBytes } from "node:crypto";
import { SystemSettingsModel } from "../../../infrastructure/database/models/SystemSettingsModel.js";
import { BadRequestError } from "../../../shared/errors/AppError.js";
import { AuditService } from "../../../infrastructure/services/AuditService.js";
import { AuditAction } from "../../../domain/entities/AuditLog.js";

export interface CreateAdminApiKeyInput {
  name: string;
  adminUserId: string;
}

export interface CreateAdminApiKeyResult {
  apiKey: string;
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
}

export class CreateAdminApiKeyUseCase {
  async execute(input: CreateAdminApiKeyInput): Promise<CreateAdminApiKeyResult> {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestError("Key name is required.");
    }

    let settings = await SystemSettingsModel.findOne();
    if (!settings) {
      settings = await SystemSettingsModel.create({});
    }

    const secret = randomBytes(24).toString("hex");
    const rawKey = `arch_live_${secret}`;
    const keyPrefix = rawKey.slice(0, 14);
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const newKey = {
      name,
      keyPrefix,
      keyHash,
      createdBy: input.adminUserId,
      createdAt: new Date(),
    };

    settings.apiKeys.push(newKey as any);
    await settings.save();

    const created = settings.apiKeys[settings.apiKeys.length - 1];
    const keyId = (created as any)._id?.toString() || (created as any).id;

    await AuditService.log({
      action: AuditAction.API_KEY_CREATE,
      userId: input.adminUserId,
      targetType: "api_key",
      targetId: keyId,
      details: { name, keyPrefix },
    });

    return {
      apiKey: rawKey,
      id: keyId,
      name,
      keyPrefix,
      createdAt: created.createdAt,
    };
  }
}
