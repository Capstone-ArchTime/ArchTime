import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IProject } from "../../../domain/entities/Project.js";

export class GetAllProjectsUseCase {
  constructor(private readonly projectRepository: IProjectRepository) {}

  async execute(userId: string): Promise<IProject[]> {
    return this.projectRepository.findByUserId(userId);
  }
}
