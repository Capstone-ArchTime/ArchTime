import { WorkspaceModel } from "../database/models/WorkspaceModel.js";
import { ProjectModel } from "../database/models/ProjectModel.js";
import { OrganizationModel } from "../database/models/OrganizationModel.js";
import { SnapshotModel } from "../database/models/SnapshotModel.js";
import { JobKind, JobStatus, MiningJobModel } from "../database/models/MiningJobModel.js";
import type { WatchCandidate } from "./RepositoryWatcher.js";

/**
 * The workspaces the automatic check may look at: those with a confirmed component diagram, with what decides whether
 * this round checks them (RepositoryWatcher.shouldWatch). A handful of queries for all of them, not one per workspace.
 */
export async function loadWatchCandidates(): Promise<WatchCandidate[]> {
  const workspaces = await WorkspaceModel.find({ "diagram.confirmedAt": { $ne: null } }).select("projectId").lean<{ projectId: string }[]>();
  const ids = [...new Set(workspaces.map(w => String(w.projectId)))];
  if (!ids.length) return [];

  const [projects, minedIds, busyIds, lastWatches] = await Promise.all([
    ProjectModel.find({ _id: { $in: ids } }).select("userId organizationId").lean<{ _id: unknown; userId?: string; organizationId?: string | null }[]>(),
    SnapshotModel.distinct("projectId", { projectId: { $in: ids } }),
    MiningJobModel.distinct("projectId", { projectId: { $in: ids }, status: { $in: [JobStatus.QUEUED, JobStatus.RUNNING] } }),
    MiningJobModel.aggregate<{ _id: string; status: string; finishedAt?: Date }>([
      { $match: { projectId: { $in: ids }, kind: JobKind.WATCH, status: { $in: [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED] } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$projectId", status: { $first: "$status" }, finishedAt: { $first: "$finishedAt" } } },
    ]),
  ]);
  const orgIds = [...new Set(projects.map(p => p.organizationId).filter((id): id is string => !!id).map(String))];
  const suspended = new Set((await OrganizationModel.find({ _id: { $in: orgIds }, suspension: { $ne: null } }).select("_id").lean<{ _id: unknown }[]>()).map(o => String(o._id)));
  const mined = new Set(minedIds.map(String));
  const busy = new Set(busyIds.map(String));
  const failedAt = new Map(lastWatches.filter(w => w.status === JobStatus.FAILED).map(w => [String(w._id), w.finishedAt ? new Date(w.finishedAt) : new Date(0)]));

  return projects.map(p => {
    const projectId = String(p._id);
    return {
      projectId,
      ownerId: p.userId ? String(p.userId) : "",
      confirmed: true,
      mined: mined.has(projectId),
      suspended: !!p.organizationId && suspended.has(String(p.organizationId)),
      busy: busy.has(projectId),
      lastWatchFailedAt: failedAt.get(projectId) ?? null,
    };
  });
}
