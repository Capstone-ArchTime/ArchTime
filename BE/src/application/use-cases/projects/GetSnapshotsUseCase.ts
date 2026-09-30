import { SnapshotModel } from "../../../infrastructure/database/models/SnapshotModel.js";

export class GetSnapshotsUseCase {
  public async execute(projectId: string): Promise<any[]> {
    return await SnapshotModel.find({ projectId }).sort({ date: -1 }).lean();
  }
}
