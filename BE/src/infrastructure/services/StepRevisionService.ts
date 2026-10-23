import mongoose from "mongoose";
import { SnapshotModel } from "../database/models/SnapshotModel.js";
import { WorkspaceModel } from "../database/models/WorkspaceModel.js";
import { assessStepRevision } from "../../domain/onboarding/stepRevision.js";
import type { StepRevision, StepRevisionAssessment } from "../../domain/onboarding/stepRevision.js";
import { BadRequestError, NotFoundError } from "../../shared/errors/AppError.js";

const MAX_CHECK = 200;

type SnapshotRow = { _id: unknown; hash: string; fullHash?: string; title: string; date: Date; missingSince?: Date | null };

export interface PinnedRevision extends StepRevision {
  snapshot: { id: string; hash: string; title: string; date: Date };
}

/**
 * Pins learning material to a revision and checks it later. Used by onboarding steps (and anything else that explains
 * the code at a point in time): store the StepRevision returned by pin(), call check() when showing it.
 */
export class StepRevisionService {
  private static async workspaceRevision(projectId: string): Promise<number | null> {
    const ws = await WorkspaceModel.findOne({ projectId }).select("revision").lean();
    return ws?.revision ?? null;
  }

  /** Resolves a commit (hash or prefix of at least 7) or a snapshot id, else the latest snapshot, to a revision. */
  public static async pin(projectId: string, input: { commit?: unknown; snapshotId?: unknown }): Promise<PinnedRevision> {
    const commit = typeof input.commit === "string" && input.commit.trim() ? input.commit.trim().toLowerCase() : undefined;
    const snapshotId = typeof input.snapshotId === "string" && input.snapshotId.trim() ? input.snapshotId.trim() : undefined;
    if (commit && !/^[0-9a-f]{7,64}$/.test(commit)) throw new BadRequestError("commit must be a hash of at least 7 hex characters.", "VALIDATION_ERROR");
    if (snapshotId && !mongoose.isValidObjectId(snapshotId)) throw new BadRequestError("Invalid snapshotId.", "VALIDATION_ERROR");

    const query: Record<string, unknown> = { projectId };
    if (snapshotId) query._id = snapshotId;
    if (commit) query.$or = [{ fullHash: { $regex: `^${commit}` } }, { hash: commit.slice(0, 7), fullHash: { $exists: false } }];
    // "The latest" means the latest commit still in the history, not one a force-push removed.
    if (!commit && !snapshotId) query.missingSince = null;
    const snapshot = await SnapshotModel.findOne(query).sort({ date: -1 }).select("hash fullHash title date missingSince").lean() as SnapshotRow | null;
    if (!snapshot) {
      throw new NotFoundError(commit || snapshotId ? "That commit has not been mined in this workspace." : "This workspace has no mined snapshots yet.");
    }
    if (snapshot.missingSince) {
      throw new BadRequestError("That commit is no longer in the repository history; pin a current commit instead.", "VALIDATION_ERROR");
    }
    return {
      commit: snapshot.fullHash ?? snapshot.hash,
      snapshotId: String(snapshot._id),
      workspaceRevision: await this.workspaceRevision(projectId),
      pinnedAt: new Date(),
      snapshot: { id: String(snapshot._id), hash: snapshot.hash, title: snapshot.title.split("\n")[0], date: snapshot.date },
    };
  }

  /** Assesses each revision in order, with three queries whatever the count. */
  public static async check(projectId: string, revisions: unknown): Promise<StepRevisionAssessment[]> {
    if (!Array.isArray(revisions)) throw new BadRequestError("revisions must be an array.", "VALIDATION_ERROR");
    if (revisions.length > MAX_CHECK) throw new BadRequestError(`At most ${MAX_CHECK} revisions per request.`, "VALIDATION_ERROR");
    const parsed = revisions.map(parseRevision);

    const ids = parsed.map(r => r.snapshotId).filter((id): id is string => !!id && mongoose.isValidObjectId(id));
    const hashes = parsed.map(r => r.commit).filter((h): h is string => !!h);
    const [byId, byHash, currentWorkspaceRevision] = await Promise.all([
      ids.length ? SnapshotModel.find({ projectId, _id: { $in: ids } }).select("hash fullHash missingSince").lean() : [],
      hashes.length ? SnapshotModel.find({ projectId, $or: [{ fullHash: { $in: hashes } }, { hash: { $in: hashes.map(h => h.slice(0, 7)) } }] }).select("hash fullHash missingSince").lean() : [],
      this.workspaceRevision(projectId),
    ]);
    const idIndex = new Map((byId as unknown as SnapshotRow[]).map(s => [String(s._id), s]));
    const hashIndex = new Map<string, SnapshotRow>();
    for (const s of byHash as unknown as SnapshotRow[]) {
      if (s.fullHash) hashIndex.set(s.fullHash, s);
      hashIndex.set(s.hash, s);
    }

    return parsed.map(revision => {
      const snapshot = (revision.snapshotId ? idIndex.get(revision.snapshotId) : undefined)
        ?? (revision.commit ? hashIndex.get(revision.commit) ?? hashIndex.get(revision.commit.slice(0, 7)) : undefined);
      return assessStepRevision(revision, {
        snapshotExists: !!snapshot,
        commitGone: !!snapshot?.missingSince,
        goneSince: snapshot?.missingSince ?? null,
        currentWorkspaceRevision,
      });
    });
  }
}

function parseRevision(value: any): StepRevision {
  if (!value || typeof value !== "object") throw new BadRequestError("Each revision must be an object.", "VALIDATION_ERROR");
  const commit = typeof value.commit === "string" && value.commit ? value.commit.toLowerCase() : null;
  const snapshotId = typeof value.snapshotId === "string" && value.snapshotId ? value.snapshotId : null;
  if (!commit && !snapshotId) throw new BadRequestError("Each revision needs commit or snapshotId.", "VALIDATION_ERROR");
  const workspaceRevision = Number.isInteger(value.workspaceRevision) ? value.workspaceRevision : null;
  const pinnedAt = value.pinnedAt ? new Date(value.pinnedAt) : new Date(0);
  return { commit, snapshotId, workspaceRevision, pinnedAt };
}
