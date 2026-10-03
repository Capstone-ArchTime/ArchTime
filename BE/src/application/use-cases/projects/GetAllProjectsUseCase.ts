import type { IProjectRepository } from "../../../domain/interfaces/IProjectRepository.js";
import type { IProject } from "../../../domain/entities/Project.js";
import type { PaginatedResult } from "../../../shared/utils/apiResponse.js";

export class GetAllProjectsUseCase {
  constructor(private readonly projectRepository: IProjectRepository) {}

  async execute(
    userId: string,
    skip: number,
    limit: number,
  ): Promise<PaginatedResult<IProject>> {
    return this.projectRepository.findByUserIdPaginated(userId, skip, limit);
  }
}
