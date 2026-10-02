import { SnapshotModel } from "../../../infrastructure/database/models/SnapshotModel.js";
import { loadOwnedProject } from "./loadOwnedProject.js";

export class GetSnapshotsUseCase {
  /** `summary` leaves out the dependency graph, which is most of a snapshot's size. */
  public async execute(projectId: string, userId: string, summary = false): Promise<any[]> {
    await loadOwnedProject(projectId, userId);
    const query = SnapshotModel.find({ projectId }).sort({ date: -1 });
    const snapshots = await (summary ? query.select("-nodes -edges") : query).lean();
    return snapshots.map(s => ({
      ...s,
      id: s._id.toString(),
      _id: undefined
    }));
  }
}
