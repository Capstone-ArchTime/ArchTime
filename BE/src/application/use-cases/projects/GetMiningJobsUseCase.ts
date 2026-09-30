import { MiningJobModel } from "../../../infrastructure/database/models/MiningJobModel.js";

export class GetMiningJobsUseCase {
  public async execute(): Promise<any[]> {
    return await MiningJobModel.find().populate('projectId', 'name').sort({ createdAt: -1 }).lean();
  }
}
