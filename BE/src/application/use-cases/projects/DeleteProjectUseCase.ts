import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";

export class DeleteProjectUseCase {
  constructor(private readonly projectRepository: IProjectRepository) {}

  async execute(projectId: string, userId: string): Promise<boolean> {
    if (!projectId || !userId) {
      throw new Error("Missing required parameters");
    }
    return this.projectRepository.delete(projectId, userId);
  }
}
