import mongoose from "mongoose";
import { assessStepRevision, type StepRevision, type StepRevisionAssessment } from "../../domain/onboarding/stepRevision.js";
import { MemberStatus } from "../../domain/entities/ProjectMember.js";
import type { IProjectMemberRepository } from "../../domain/interfaces/IProjectMemberRepository.js";
import type { OnboardingDeps } from "../../application/use-cases/onboarding/OnboardingPorts.js";
import { NotFoundError } from "../../shared/errors/AppError.js";
import { ProjectModel } from "../database/models/ProjectModel.js";
import { UserModel } from "../database/models/UserModel.js";
import { WorkspaceModel } from "../database/models/WorkspaceModel.js";
import { StepRevisionService } from "./StepRevisionService.js";

/** StepRevisionService.check takes at most this many revisions at a time. */
const CHECK_CHUNK = 200;

const validIds = (ids: string[]) => [...new Set(ids)].filter(id => mongoose.isValidObjectId(id));

async function workspaceRevisionOf(projectId: string): Promise<number | null> {
  const ws = await WorkspaceModel.findOne({ projectId }).select("revision").lean();
  return ws?.revision ?? null;
}

/** The learning-path use cases' view of the rest of the system, backed by the real services and collections. */
export function createOnboardingDeps(memberRepository: Pick<IProjectMemberRepository, "findByProjectAndUserId">): OnboardingDeps {
  return {
    async pin(projectId, commit) {
      try {
        const { snapshot, ...revision } = await StepRevisionService.pin(projectId, { commit });
        return { revision, title: snapshot.title };
      } catch (error) {
        // A workspace nobody has mined yet has no snapshot to pin: the step is still tied to the map as it is now.
        if (!commit && error instanceof NotFoundError) {
          return { revision: { commit: null, snapshotId: null, workspaceRevision: await workspaceRevisionOf(projectId), pinnedAt: new Date() } };
        }
        throw error;
      }
    },

    async assess(projectId, revisions) {
      const results: StepRevisionAssessment[] = new Array(revisions.length);
      const indexed = revisions.map((revision, index) => ({ revision, index }));
      const pinnedToSnapshot = indexed.filter(({ revision }) => revision.commit || revision.snapshotId);
      for (let start = 0; start < pinnedToSnapshot.length; start += CHECK_CHUNK) {
        const chunk = pinnedToSnapshot.slice(start, start + CHECK_CHUNK);
        const assessed = await StepRevisionService.check(projectId, chunk.map(({ revision }) => revision));
        chunk.forEach(({ index }, i) => { results[index] = assessed[i]; });
      }
      // A step pinned before anything was mined has no commit to look for; only the map can have changed under it.
      const unpinned = indexed.filter(({ revision }) => !revision.commit && !revision.snapshotId);
      if (unpinned.length) {
        const current = await workspaceRevisionOf(projectId);
        for (const { revision, index } of unpinned) {
          results[index] = assessStepRevision(revision as StepRevision, { snapshotExists: true, commitGone: false, currentWorkspaceRevision: current });
        }
      }
      return results;
    },

    async workspace(projectId) {
      const ws = await WorkspaceModel.findOne({ projectId }).select("revision diagram.components.id decisions.id").lean();
      return {
        revision: ws?.revision ?? null,
        componentIds: new Set((ws?.diagram?.components ?? []).map(c => c.id)),
        adrIds: new Set((ws?.decisions ?? []).map(d => d.id)),
      };
    },

    async isMember(projectId, userId) {
      if (!mongoose.isValidObjectId(projectId)) return false;
      const project = await ProjectModel.findById(projectId).select("userId").lean();
      if (!project) return false;
      if (project.userId === userId) return true;
      const member = await memberRepository.findByProjectAndUserId(projectId, userId);
      return !!member && member.status === MemberStatus.ACTIVE;
    },

    async people(userIds) {
      const ids = validIds(userIds);
      if (!ids.length) return new Map();
      const users = await UserModel.find({ _id: { $in: ids } }).select("name email").lean();
      return new Map(users.map(user => [String(user._id), { name: user.name, email: user.email }]));
    },

    async projectNames(projectIds) {
      const ids = validIds(projectIds);
      if (!ids.length) return new Map();
      const projects = await ProjectModel.find({ _id: { $in: ids } }).select("name").lean();
      return new Map(projects.map(project => [String(project._id), project.name]));
    },

    now: () => new Date(),
  };
}
