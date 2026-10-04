import { SystemSettingsModel } from "../../../infrastructure/database/models/SystemSettingsModel.js";

export class GetAdminSettingsUseCase {
  async execute(): Promise<Record<string, unknown>> {
    let settings = await SystemSettingsModel.findOne();
    if (!settings) {
      settings = await SystemSettingsModel.create({
        maxConcurrentJobs: 5,
        maxRepoSizeMb: 500,
        miningTimeoutMinutes: 60,
        defaultLlmProvider: "none",
        maintenanceMode: false,
        allowPublicRegistration: true,
        apiKeys: [],
      });
    }

    return settings.toJSON();
  }
}
