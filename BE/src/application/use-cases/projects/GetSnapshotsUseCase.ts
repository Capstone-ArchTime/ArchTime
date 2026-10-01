import { SnapshotModel } from "../../../infrastructure/database/models/SnapshotModel.js";

export class GetSnapshotsUseCase {
  public async execute(projectId: string): Promise<any[]> {
    const snapshots = await SnapshotModel.find({ projectId }).sort({ date: -1 }).lean();
    return snapshots.map(s => ({
      ...s,
      id: s._id.toString(),
      _id: undefined
    }));
  }
}
