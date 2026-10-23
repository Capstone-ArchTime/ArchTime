import mongoose from "mongoose";
import type { DecisionSourceKind, IDecisionSource } from "../../domain/entities/Workspace.js";
import type { IDecisionSourceVerifier } from "../../domain/interfaces/IDecisionSourceVerifier.js";
import { SnapshotModel } from "../database/models/SnapshotModel.js";
import { EvidenceModel } from "../database/models/EvidenceModel.js";
import { ApprovalRequestModel } from "../database/models/ApprovalRequestModel.js";

const firstLine = (text: unknown) => String(text ?? "").split("\n")[0];

/** Resolves ADR sources against the project's mined snapshots, evidence and approval requests. */
export class MongoDecisionSourceVerifier implements IDecisionSourceVerifier {
  async resolve(projectId: string, kind: DecisionSourceKind, ref: string): Promise<Omit<IDecisionSource, "note"> | null> {
    switch (kind) {
      case "commit": {
        // A mined commit, by full hash or any prefix of at least 7 characters (legacy snapshots kept 7 only).
        if (!/^[0-9a-f]{7,64}$/i.test(ref)) return null;
        const hash = ref.toLowerCase();
        const snapshot = await SnapshotModel.findOne({
          projectId,
          $or: [{ fullHash: { $regex: `^${hash}` } }, { hash: hash.slice(0, 7), fullHash: { $exists: false } }],
        }).select("hash fullHash title date").lean();
        return snapshot ? { kind, ref: snapshot.fullHash ?? snapshot.hash, title: firstLine(snapshot.title), date: snapshot.date } : null;
      }
      case "snapshot": {
        if (!mongoose.isValidObjectId(ref)) return null;
        const snapshot = await SnapshotModel.findOne({ _id: ref, projectId }).select("hash title date").lean();
        return snapshot ? { kind, ref: String(snapshot._id), title: `${snapshot.hash} ${firstLine(snapshot.title)}`, date: snapshot.date } : null;
      }
      case "evidence": {
        if (!mongoose.isValidObjectId(ref)) return null;
        const evidence = await EvidenceModel.findOne({ _id: ref, projectId }).select("changeTitle commit date").lean();
        return evidence ? { kind, ref: String(evidence._id), title: `${evidence.commit} ${evidence.changeTitle}`, date: evidence.date } : null;
      }
      case "approval": {
        if (!mongoose.isValidObjectId(ref)) return null;
        const approval = await ApprovalRequestModel.findOne({ _id: ref, projectId }).select("title").lean();
        return approval ? { kind, ref: String(approval._id), title: approval.title } : null;
      }
      default:
        return null;
    }
  }
}
