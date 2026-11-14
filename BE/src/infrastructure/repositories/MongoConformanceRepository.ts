import mongoose from "mongoose";
import type { FindingDecision, FindingExplanation, IConformanceCheck, IConformanceFinding } from "../../domain/entities/ConformanceFinding.js";
import type { FindingQuery, IConformanceRepository, IConformanceSnapshots, SnapshotRef } from "../../domain/interfaces/IConformanceRepository.js";
import { ConformanceCheckModel, ConformanceFindingModel, ConformanceSeenModel } from "../database/models/ConformanceModels.js";
import { SnapshotModel } from "../database/models/SnapshotModel.js";

const toFinding = (doc: any): IConformanceFinding => {
  const { _id, __v, ...rest } = doc;
  return { ...rest, id: String(_id), decision: doc.decision ?? null, explanation: doc.explanation ?? null, notifiedAt: doc.notifiedAt ?? null, outdated: !!doc.outdated };
};
const toCheck = (doc: any): IConformanceCheck => {
  const { _id, __v, ...rest } = doc;
  return rest;
};
const validId = (id: string) => mongoose.Types.ObjectId.isValid(id);

export class MongoConformanceRepository implements IConformanceRepository {
  async recordCheck({ check, findings, inherited }: Parameters<IConformanceRepository["recordCheck"]>[0]): Promise<void> {
    const { projectId, snapshotId } = check;
    if (findings.length) {
      await ConformanceFindingModel.bulkWrite(findings.map(f => ({
        updateOne: {
          filter: { projectId, snapshotId, key: f.key },
          update: {
            $set: {
              snapshotHash: check.snapshotHash, commitDate: check.commitDate, type: f.type, ruleId: f.ruleId, ruleName: f.ruleName,
              severity: f.severity, source: f.source, target: f.target, sourceName: f.sourceName, targetName: f.targetName,
              imports: f.imports, importCount: f.importCount, files: f.files, outdated: false,
            },
            $setOnInsert: { decision: inherited.get(f.key) ?? null, explanation: null, notifiedAt: null },
          },
          upsert: true,
        },
      })), { ordered: false });
    }
    // What this check no longer finds: gone if nobody decided on it, kept as outdated if someone did.
    const keys = findings.map(f => f.key);
    await ConformanceFindingModel.deleteMany({ projectId, snapshotId, key: { $nin: keys }, decision: null });
    await ConformanceFindingModel.updateMany({ projectId, snapshotId, key: { $nin: keys }, decision: { $ne: null } }, { $set: { outdated: true } });
    await ConformanceCheckModel.updateOne({ projectId, snapshotId }, { $set: check }, { upsert: true });
  }

  async checksOf(projectId: string, limit = 100): Promise<IConformanceCheck[]> {
    return (await ConformanceCheckModel.find({ projectId }).sort({ commitDate: -1 }).limit(limit).lean()).map(toCheck);
  }

  async checkOf(projectId: string, snapshotId: string): Promise<IConformanceCheck | null> {
    const doc = await ConformanceCheckModel.findOne({ projectId, snapshotId }).lean();
    return doc ? toCheck(doc) : null;
  }

  async carriedDecisions(projectId: string, keys: string[], before: Date) {
    const out = new Map<string, FindingDecision & { snapshotHash: string }>();
    if (!keys.length) return out;
    const docs = await ConformanceFindingModel.find({ projectId, key: { $in: keys }, commitDate: { $lt: before }, "decision.kind": { $in: ["accept", "dismiss"] } })
      .sort({ commitDate: -1 }).select("key decision snapshotHash").lean<{ key: string; decision: FindingDecision; snapshotHash: string }[]>();
    for (const d of docs) if (!out.has(d.key)) out.set(d.key, { ...d.decision, snapshotHash: d.snapshotHash });
    return out;
  }

  async findings(projectId: string, query: FindingQuery = {}): Promise<IConformanceFinding[]> {
    const filter: Record<string, unknown> = { projectId };
    if (query.snapshotId) filter.snapshotId = query.snapshotId;
    if (query.type) filter.type = query.type;
    if (query.status === "open") filter.decision = null;
    if (query.status === "decided") filter.decision = { $ne: null };
    const docs = await ConformanceFindingModel.find(filter).sort({ commitDate: -1, severity: 1, key: 1 }).limit(query.limit ?? 200).lean();
    return docs.map(toFinding);
  }

  async findById(projectId: string, findingId: string): Promise<IConformanceFinding | null> {
    if (!validId(findingId)) return null;
    const doc = await ConformanceFindingModel.findOne({ _id: findingId, projectId }).lean();
    return doc ? toFinding(doc) : null;
  }

  async setDecision(projectId: string, findingId: string, decision: FindingDecision | null): Promise<IConformanceFinding | null> {
    if (!validId(findingId)) return null;
    const doc = await ConformanceFindingModel.findOneAndUpdate({ _id: findingId, projectId }, { $set: { decision } }, { new: true }).lean();
    return doc ? toFinding(doc) : null;
  }

  async claimUnnotified(projectId: string, at: Date): Promise<IConformanceFinding[]> {
    await ConformanceFindingModel.updateMany({ projectId, notifiedAt: null, decision: null, outdated: false }, { $set: { notifiedAt: at } });
    const docs = await ConformanceFindingModel.find({ projectId, notifiedAt: at }).sort({ commitDate: -1, severity: 1, key: 1 }).lean();
    return docs.map(toFinding);
  }

  async releaseClaim(projectId: string, at: Date): Promise<void> {
    await ConformanceFindingModel.updateMany({ projectId, notifiedAt: at }, { $set: { notifiedAt: null } });
  }

  async markSeen(projectId: string, userId: string, at: Date): Promise<void> {
    await ConformanceSeenModel.updateOne({ projectId, userId }, { $max: { seenAt: at } }, { upsert: true });
  }

  async unreadCounts(userId: string, projectIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!projectIds.length) return out;
    const seen = new Map((await ConformanceSeenModel.find({ userId, projectId: { $in: projectIds } }).lean<{ projectId: string; seenAt: Date }[]>()).map(s => [s.projectId, s.seenAt]));
    const rows = await ConformanceFindingModel.aggregate<{ _id: string; count: number }>([
      { $match: { projectId: { $in: projectIds }, decision: null, outdated: false } },
      { $project: { projectId: 1, key: 1, createdAt: 1 } },
      { $match: { $or: projectIds.map(p => ({ projectId: p, ...(seen.get(p) ? { createdAt: { $gt: seen.get(p) } } : {}) })) } },
      // One problem found again in every later commit is one unread problem, not one per commit.
      { $group: { _id: { projectId: "$projectId", key: "$key" } } },
      { $group: { _id: "$_id.projectId", count: { $sum: 1 } } },
    ]);
    for (const r of rows) if (r.count > 0) out.set(r._id, r.count);
    return out;
  }

  async carryForward(projectId: string, key: string, after: Date, decision: FindingDecision): Promise<number> {
    const result = await ConformanceFindingModel.updateMany({ projectId, key, commitDate: { $gt: after }, decision: null }, { $set: { decision } });
    return result.modifiedCount;
  }

  async setExplanation(projectId: string, findingId: string, explanation: FindingExplanation): Promise<IConformanceFinding | null> {
    if (!validId(findingId)) return null;
    const doc = await ConformanceFindingModel.findOneAndUpdate({ _id: findingId, projectId }, { $set: { explanation } }, { new: true }).lean();
    return doc ? toFinding(doc) : null;
  }
}

/** Snapshots as the check reads them: still in the history (not missing), ordered by commit date. */
export const mongoConformanceSnapshots: IConformanceSnapshots = {
  async dateOf(projectId, hash) {
    const short = hash.slice(0, 7);
    const doc = await SnapshotModel.findOne({ projectId, missingSince: null, $or: [{ hash: short }, { fullHash: hash }] }).select("date").lean<{ date: Date }>();
    return doc?.date ?? null;
  },
  async after(projectId, after) {
    const docs = await SnapshotModel.find({ projectId, missingSince: null, ...(after ? { date: { $gt: after } } : {}) })
      .sort({ date: 1, _id: 1 }).select("hash date").lean<{ _id: unknown; hash: string; date: Date }[]>();
    return docs.map((d): SnapshotRef => ({ id: String(d._id), hash: d.hash, date: d.date }));
  },
  async graph(snapshotId) {
    if (!validId(snapshotId)) return null;
    return SnapshotModel.findById(snapshotId).select("nodes edges").lean<{ nodes: { id: string }[]; edges: { source: string; target: string }[] }>();
  },
};
