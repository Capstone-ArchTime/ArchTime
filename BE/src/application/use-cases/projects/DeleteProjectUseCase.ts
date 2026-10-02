import { MiningService } from "../../../infrastructure/services/MiningService.js";
import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";

export class DeleteProjectUseCase {
  constructor(private readonly projectRepository: IProjectRepository) {}

  async execute(projectId: string, userId: string): Promise<boolean> {
    if (!projectId || !userId) {
      throw new Error("Missing required parameters");
    }
    const deleted = await this.projectRepository.delete(projectId, userId);
    if (deleted) await MiningService.purgeProject(projectId);
    return deleted;
  }
}
