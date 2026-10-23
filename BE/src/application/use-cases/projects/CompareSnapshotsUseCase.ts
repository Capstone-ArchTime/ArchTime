import mongoose from "mongoose";
import { SnapshotModel } from "../../../infrastructure/database/models/SnapshotModel.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";

export class CompareSnapshotsUseCase {
  /** Both snapshots must belong to `projectId`: the route only checked access to that project. */
  public async execute(baseSnapshotId: string, targetSnapshotId: string, projectId: string) {
    if (!mongoose.isValidObjectId(baseSnapshotId) || !mongoose.isValidObjectId(targetSnapshotId)) {
      throw new BadRequestError("Invalid snapshot ID format", "VALIDATION_ERROR");
    }

    const [baseSnapshot, targetSnapshot] = await Promise.all([
      SnapshotModel.findOne({ _id: baseSnapshotId, projectId }),
      SnapshotModel.findOne({ _id: targetSnapshotId, projectId }),
    ]);

    if (!baseSnapshot || !targetSnapshot) {
      throw new NotFoundError("One or both snapshots not found in this workspace");
    }

    const baseNodes = baseSnapshot.nodes || [];
    const targetNodes = targetSnapshot.nodes || [];
    const baseEdges = baseSnapshot.edges || [];
    const targetEdges = targetSnapshot.edges || [];

    const baseNodeIds = new Set(baseNodes.map((n) => n.id));
    const targetNodeIds = new Set(targetNodes.map((n) => n.id));

    const nodesAdded = targetNodes.filter((n) => !baseNodeIds.has(n.id));
    const nodesRemoved = baseNodes.filter((n) => !targetNodeIds.has(n.id));
    const nodesUnchanged = targetNodes.filter((n) => baseNodeIds.has(n.id));

    const edgeId = (e: any) => `${e.source}-${e.target}-${e.type}`;
    const baseEdgeIds = new Set(baseEdges.map(edgeId));
    const targetEdgeIds = new Set(targetEdges.map(edgeId));

    const edgesAdded = targetEdges.filter((e) => !baseEdgeIds.has(edgeId(e)));
    const edgesRemoved = baseEdges.filter((e) => !targetEdgeIds.has(edgeId(e)));
    const edgesUnchanged = targetEdges.filter((e) => baseEdgeIds.has(edgeId(e)));

    return {
      baseSnapshot,
      targetSnapshot,
      diff: {
        nodesAdded,
        nodesRemoved,
        nodesUnchanged,
        edgesAdded,
        edgesRemoved,
        edgesUnchanged,
      },
    };
  }
}
