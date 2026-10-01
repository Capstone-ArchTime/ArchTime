import mongoose from "mongoose";
import { SnapshotModel } from "../../../infrastructure/database/models/SnapshotModel.js";

export class CompareSnapshotsUseCase {
  public async execute(baseSnapshotId: string, targetSnapshotId: string) {
    if (!mongoose.isValidObjectId(baseSnapshotId) || !mongoose.isValidObjectId(targetSnapshotId)) {
      throw new Error("Invalid snapshot ID format");
    }

    const baseSnapshot = await SnapshotModel.findById(baseSnapshotId);
    const targetSnapshot = await SnapshotModel.findById(targetSnapshotId);

    if (!baseSnapshot || !targetSnapshot) {
      throw new Error("One or both snapshots not found");
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
