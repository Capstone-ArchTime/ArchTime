import { SystemSettingsModel } from "../../../infrastructure/database/models/SystemSettingsModel.js";
import { NotFoundError } from "../../../shared/errors/AppError.js";
import { AuditService } from "../../../infrastructure/services/AuditService.js";
import { AuditAction } from "../../../domain/entities/AuditLog.js";

export interface RevokeAdminApiKeyInput {
  keyId: string;
  adminUserId: string;
}

export class RevokeAdminApiKeyUseCase {
  async execute(input: RevokeAdminApiKeyInput): Promise<void> {
    const settings = await SystemSettingsModel.findOne();
    if (!settings) {
      throw new NotFoundError("API key not found.");
    }

    const index = settings.apiKeys.findIndex(
      (k: any) => (k._id ? k._id.toString() : k.id) === input.keyId,
    );

    if (index === -1) {
      throw new NotFoundError("API key not found.");
    }

    const [removed] = settings.apiKeys.splice(index, 1);
    await settings.save();

    await AuditService.log({
      action: AuditAction.API_KEY_REVOKE,
      userId: input.adminUserId,
      targetType: "api_key",
      targetId: input.keyId,
      details: { name: removed.name, keyPrefix: removed.keyPrefix },
    });
  }
}
