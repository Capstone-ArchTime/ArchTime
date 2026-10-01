import { MiningService } from "../../../infrastructure/services/MiningService.js";

export class MineProjectUseCase {
  public async execute(projectId: string, userId: string): Promise<string> {
    return await MiningService.startMiningJob(projectId, userId);
  }
}
