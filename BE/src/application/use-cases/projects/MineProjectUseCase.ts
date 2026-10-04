import { MiningService } from "../../../infrastructure/services/MiningService.js";
import { parseMineRequest } from "../../../domain/mining/miningPlan.js";
import { BadRequestError } from "../../../shared/errors/AppError.js";
import { loadOwnedProject } from "./loadOwnedProject.js";

export class MineProjectUseCase {
  /** `body` is `{ mode: "range", since?, until?, force? }` or `{ mode: "remaining" }`; no body mines everything not yet mined. */
  public async execute(projectId: string, userId: string, body?: unknown): Promise<string> {
    await loadOwnedProject(projectId, userId);
    let request;
    try {
      request = parseMineRequest(body);
    } catch (error: any) {
      throw new BadRequestError(error.message);
    }
    return MiningService.startMiningJob(projectId, userId, request);
  }
}
