import { SnapshotModel } from "../database/models/SnapshotModel.js";
import type { LatestCommitLookup } from "../../domain/interfaces/ILatestCommit.js";

/** Latest snapshot by commit date: the baseline a confirmation fixes. */
export const latestMinedCommit: LatestCommitLookup = async (projectId) => {
  const snap = await SnapshotModel.findOne({ projectId }).sort({ date: -1 }).select("hash").lean<{ hash?: string }>();
  return snap?.hash ?? null;
};
