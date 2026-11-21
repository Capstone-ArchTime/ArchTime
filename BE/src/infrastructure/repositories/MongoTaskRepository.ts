import type { ISprint, ITask, ITaskCommitLink } from "../../domain/entities/Task.js";
import type { CommitArchitecture, ICommitArchitectureSource, IMinedCommitSource, ITaskRepository, MinedCommit } from "../../domain/interfaces/ITaskRepository.js";
import { EvidenceModel } from "../database/models/EvidenceModel.js";
import type { ImportPlan } from "../../domain/tasks/tasks.js";
import { SnapshotModel } from "../database/models/SnapshotModel.js";
import { SprintModel, TaskCommitModel, TaskModel } from "../database/models/TaskModels.js";

const DUPLICATE_KEY = 11000;

const toTask = (d: any): ITask => ({
  id: String(d._id), projectId: d.projectId, key: d.key, summary: d.summary ?? "", status: d.status ?? null,
  statusCategory: d.statusCategory ?? "todo", assignee: d.assignee ?? null, storyPoints: d.storyPoints ?? null,
  sprintId: d.sprintId ?? null, removed: !!d.removed, removedAt: d.removedAt ?? null, lastImportedAt: d.lastImportedAt,
  createdAt: d.createdAt, updatedAt: d.updatedAt,
});
const toSprint = (d: any): ISprint => ({
  id: String(d._id), projectId: d.projectId, sprintId: d.sprintId, name: d.name, state: d.state ?? null,
  startDate: d.startDate ?? null, endDate: d.endDate ?? null, removed: !!d.removed, removedAt: d.removedAt ?? null,
  createdAt: d.createdAt, updatedAt: d.updatedAt,
});
const toLink = (d: any): ITaskCommitLink => ({
  projectId: d.projectId, taskKey: d.taskKey, hash: d.hash, fullHash: d.fullHash ?? null, title: d.title ?? "",
  author: d.author ?? "", date: d.date, source: d.source, linkedAt: d.linkedAt,
});

export class MongoTaskRepository implements ITaskRepository {
  async listTasks(projectId: string): Promise<ITask[]> {
    return (await TaskModel.find({ projectId }).sort({ key: 1 }).lean()).map(toTask);
  }

  async listSprints(projectId: string): Promise<ISprint[]> {
    return (await SprintModel.find({ projectId }).sort({ startDate: 1, name: 1 }).lean()).map(toSprint);
  }

  async applyImport(projectId: string, plan: ImportPlan, at: Date): Promise<void> {
    // Upserts keyed by (project, key): a concurrent second import of the same file cannot create a second copy, the
    // unique index refuses it. Sprints first, so a task never points at a sprint that is not stored yet.
    const sprintOps: any[] = [
      ...plan.sprints.upsert.map(s => ({
        updateOne: { filter: { projectId, sprintId: s.sprintId }, update: { $set: { ...s, removed: false, removedAt: null } }, upsert: true },
      })),
      ...plan.sprints.remove.map(sprintId => ({ updateOne: { filter: { projectId, sprintId, removed: false }, update: { $set: { removed: true, removedAt: at } } } })),
    ];
    if (sprintOps.length) await SprintModel.bulkWrite(sprintOps, { ordered: true });

    const taskOps: any[] = [
      ...[...plan.create, ...plan.update].map(t => ({
        updateOne: { filter: { projectId, key: t.key }, update: { $set: { ...t, removed: false, removedAt: null, lastImportedAt: at } }, upsert: true },
      })),
      ...plan.unchanged.map(key => ({ updateOne: { filter: { projectId, key }, update: { $set: { lastImportedAt: at } } } })),
      ...plan.remove.map(key => ({ updateOne: { filter: { projectId, key, removed: false }, update: { $set: { removed: true, removedAt: at } } } })),
    ];
    if (taskOps.length) await TaskModel.bulkWrite(taskOps, { ordered: true });
  }

  async addLinks(links: ITaskCommitLink[]): Promise<number> {
    if (!links.length) return 0;
    try {
      const inserted = await TaskCommitModel.insertMany(links, { ordered: false });
      return inserted.length;
    } catch (error: any) {
      // Links that exist already are refused by the unique index; everything else of the batch is inserted.
      const writeErrors: any[] = error?.writeErrors ?? [];
      if (writeErrors.length && writeErrors.every(e => (e.code ?? e.err?.code) === DUPLICATE_KEY)) {
        return error?.insertedDocs?.length ?? (links.length - writeErrors.length);
      }
      throw error;
    }
  }

  async listLinks(projectId: string): Promise<ITaskCommitLink[]> {
    return (await TaskCommitModel.find({ projectId }).sort({ date: -1, hash: 1 }).lean()).map(toLink);
  }

  async clearProject(projectId: string): Promise<{ tasks: number; sprints: number; links: number }> {
    // Links first, then tasks, then sprints: a failure part way leaves tasks without links (a relink restores them),
    // never links or tasks pointing at what is gone.
    const links = await TaskCommitModel.deleteMany({ projectId });
    const tasks = await TaskModel.deleteMany({ projectId });
    const sprints = await SprintModel.deleteMany({ projectId });
    return { tasks: tasks.deletedCount ?? 0, sprints: sprints.deletedCount ?? 0, links: links.deletedCount ?? 0 };
  }
}

/** Mined commits of a project, read from its snapshots (no graph), still in the history. */
export const mongoMinedCommits: IMinedCommitSource = {
  async commitsOf(projectId: string): Promise<MinedCommit[]> {
    const docs = await SnapshotModel.find({ projectId, missingSince: null }).select("hash fullHash title trailers author date").sort({ date: 1 }).lean();
    return docs.map((d: any) => ({ hash: d.hash, fullHash: d.fullHash ?? null, title: d.title ?? "", trailers: d.trailers ?? [], author: d.author ?? "", date: d.date }));
  },
};

type Graph = { nodes: { id: string }[]; edges: { source: string; target: string }[] };

/** A linked commit's snapshot, the snapshot it was measured against, and its evidence (DS-07a). */
export const mongoCommitArchitecture: ICommitArchitectureSource = {
  async ofCommit(projectId: string, hash: string): Promise<CommitArchitecture | null> {
    const snap = await SnapshotModel.findOne({ projectId, hash, missingSince: null }).select("depAdded depRemoved baseHash nodes edges").lean<Graph & { depAdded?: number; depRemoved?: number; baseHash?: string }>();
    if (!snap) return null;
    const [base, evidence] = await Promise.all([
      snap.baseHash ? SnapshotModel.findOne({ projectId, fullHash: snap.baseHash }).select("nodes edges").lean<Graph>() : Promise.resolve(null),
      EvidenceModel.findOne({ projectId, commit: hash }).select("_id").lean<{ _id: unknown }>(),
    ]);
    return {
      depAdded: snap.depAdded ?? 0, depRemoved: snap.depRemoved ?? 0,
      graph: { nodes: snap.nodes ?? [], edges: snap.edges ?? [] },
      baseGraph: base ? { nodes: base.nodes ?? [], edges: base.edges ?? [] } : null,
      evidenceId: evidence ? String(evidence._id) : null,
    };
  },
};
