import mongoose from "mongoose";
import type { IOnboardingAssignment, IOnboardingPath } from "../../domain/entities/OnboardingPath.js";
import { OnboardingPathModel } from "../database/models/OnboardingPathModel.js";
import { OnboardingAssignmentModel } from "../database/models/OnboardingAssignmentModel.js";
import type { AssignmentStore, NewPath, PathContent, PathStore } from "../../application/use-cases/onboarding/OnboardingPorts.js";

const validId = (id: string) => mongoose.isValidObjectId(id);

function toPath(doc: any): IOnboardingPath {
  return {
    id: String(doc._id), projectId: doc.projectId, title: doc.title, description: doc.description ?? "", status: doc.status,
    steps: doc.steps ?? [], revision: doc.revision, createdBy: doc.createdBy, updatedBy: doc.updatedBy,
    createdAt: doc.createdAt, updatedAt: doc.updatedAt,
  };
}

function toAssignment(doc: any): IOnboardingAssignment {
  return {
    id: String(doc._id), projectId: doc.projectId, pathId: doc.pathId, userId: doc.userId, assignedBy: doc.assignedBy,
    assignedAt: doc.assignedAt, progress: doc.progress ?? {}, updatedAt: doc.updatedAt,
  };
}

export class MongoPathStore implements PathStore {
  async count(projectId: string): Promise<number> {
    return OnboardingPathModel.countDocuments({ projectId });
  }

  async create(path: NewPath): Promise<IOnboardingPath> {
    return toPath((await OnboardingPathModel.create(path)).toObject());
  }

  async list(projectId: string, limit: number): Promise<IOnboardingPath[]> {
    const docs = await OnboardingPathModel.find({ projectId }).sort({ updatedAt: -1 }).limit(limit).lean();
    return docs.map(toPath);
  }

  async find(projectId: string, pathId: string): Promise<IOnboardingPath | null> {
    if (!validId(pathId)) return null;
    const doc = await OnboardingPathModel.findOne({ _id: pathId, projectId }).lean();
    return doc ? toPath(doc) : null;
  }

  async findMany(pathIds: string[]): Promise<IOnboardingPath[]> {
    const ids = pathIds.filter(validId);
    if (!ids.length) return [];
    return (await OnboardingPathModel.find({ _id: { $in: ids } }).lean()).map(toPath);
  }

  async replace(projectId: string, pathId: string, expectedRevision: number, content: PathContent): Promise<IOnboardingPath | null> {
    if (!validId(pathId)) return null;
    // The revision test and the write are one operation, so two saves from the same revision cannot both succeed.
    const doc = await OnboardingPathModel.findOneAndUpdate(
      { _id: pathId, projectId, revision: expectedRevision },
      { $set: { title: content.title, description: content.description, status: content.status, steps: content.steps, updatedBy: content.updatedBy }, $inc: { revision: 1 } },
      { new: true },
    ).lean();
    return doc ? toPath(doc) : null;
  }

  async remove(projectId: string, pathId: string): Promise<boolean> {
    if (!validId(pathId)) return false;
    return (await OnboardingPathModel.deleteOne({ _id: pathId, projectId })).deletedCount > 0;
  }
}

export class MongoAssignmentStore implements AssignmentStore {
  async listByPaths(projectId: string, pathIds: string[]): Promise<IOnboardingAssignment[]> {
    if (!pathIds.length) return [];
    return (await OnboardingAssignmentModel.find({ projectId, pathId: { $in: pathIds } }).lean()).map(toAssignment);
  }

  async listByUser(userId: string, limit: number): Promise<IOnboardingAssignment[]> {
    return (await OnboardingAssignmentModel.find({ userId }).sort({ updatedAt: -1 }).limit(limit).lean()).map(toAssignment);
  }

  async find(pathId: string, userId: string): Promise<IOnboardingAssignment | null> {
    const doc = await OnboardingAssignmentModel.findOne({ pathId, userId }).lean();
    return doc ? toAssignment(doc) : null;
  }

  async assign(projectId: string, pathId: string, userId: string, assignedBy: string): Promise<void> {
    try {
      await OnboardingAssignmentModel.updateOne(
        { pathId, userId },
        { $setOnInsert: { projectId, assignedBy, assignedAt: new Date(), progress: {} } },
        { upsert: true },
      );
    } catch (error) {
      // Two requests giving the same path to the same person at once: the other one won, which is what was asked for.
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }

  async unassign(pathId: string, userId: string): Promise<boolean> {
    return (await OnboardingAssignmentModel.deleteOne({ pathId, userId })).deletedCount > 0;
  }

  async removeByPath(pathId: string): Promise<void> {
    await OnboardingAssignmentModel.deleteMany({ pathId });
  }

  // `stepId` is always the id of a step of the path (checked by the caller), so it is safe to use as a key.
  async complete(pathId: string, userId: string, stepId: string, at: Date): Promise<IOnboardingAssignment | null> {
    await OnboardingAssignmentModel.updateOne(
      { pathId, userId, [`progress.${stepId}.completedAt`]: { $exists: false } },
      { $set: { [`progress.${stepId}.completedAt`]: at } },
    );
    return this.find(pathId, userId);
  }

  async recordAnswer(pathId: string, userId: string, stepId: string, choice: number, correct: boolean, at: Date): Promise<IOnboardingAssignment | null> {
    await OnboardingAssignmentModel.updateOne(
      { pathId, userId },
      { $inc: { [`progress.${stepId}.attempts`]: 1 }, $set: { [`progress.${stepId}.lastChoice`]: choice } },
    );
    return correct ? this.complete(pathId, userId, stepId, at) : this.find(pathId, userId);
  }
}
