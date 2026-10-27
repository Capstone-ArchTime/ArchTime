import mongoose from "mongoose";
import { assessStepRevision } from "../../domain/onboarding/stepRevision.js";
import { referenceFacts, type ReferenceWorkspace } from "../../domain/onboarding/stepReference.js";
import { MemberStatus } from "../../domain/entities/ProjectMember.js";
import type { IProjectMemberRepository } from "../../domain/interfaces/IProjectMemberRepository.js";
import type { IOrganizationRepository } from "../../domain/interfaces/IOrganizationRepository.js";
import type { OnboardingDeps, WorkspaceFacts } from "../../application/use-cases/onboarding/OnboardingPorts.js";
import { NotFoundError } from "../../shared/errors/AppError.js";
import { ProjectModel } from "../database/models/ProjectModel.js";
import { UserModel } from "../database/models/UserModel.js";
import { WorkspaceModel } from "../database/models/WorkspaceModel.js";
import { StepRevisionService } from "./StepRevisionService.js";

const validIds = (ids: string[]) => [...new Set(ids)].filter(id => mongoose.isValidObjectId(id));

/** Everything of the workspace a step can be about; rules and decision provenance are not needed. */
const WORKSPACE_FIELDS = [
  "revision", "diagram.components", "diagram.dependencies", "diagram.confirmedAt",
  ...["id", "title", "status", "context", "decision", "alternatives", "consequences", "componentIds", "updatedAt"].map(f => `decisions.${f}`),
].join(" ");

async function loadWorkspace(projectId: string): Promise<WorkspaceFacts> {
  const ws = await WorkspaceModel.findOne({ projectId }).select(WORKSPACE_FIELDS).lean();
  const refs: ReferenceWorkspace = {
    components: ws?.diagram?.components ?? [],
    dependencies: ws?.diagram?.dependencies ?? [],
    decisions: ws?.decisions ?? [],
    confirmedAt: ws?.diagram?.confirmedAt ?? null,
  };
  return {
    revision: ws?.revision ?? null,
    componentIds: new Set(refs.components.map(c => c.id)),
    adrIds: new Set(refs.decisions.map(d => d.id)),
    refs,
  };
}

/** The learning-path use cases' view of the rest of the system, backed by the real services and collections. */
export function createOnboardingDeps(
  memberRepository: Pick<IProjectMemberRepository, "findByProjectAndUserId">,
  organizationRepository?: Pick<IOrganizationRepository, "findMember">,
): OnboardingDeps {
  return {
    async pin(projectId, commit) {
      try {
        const { snapshot, ...revision } = await StepRevisionService.pin(projectId, { commit });
        return { revision, title: snapshot.title };
      } catch (error) {
        // A workspace nobody has mined yet has no snapshot to pin: the step is still tied to the map as it is now.
        if (!commit && error instanceof NotFoundError) {
          return { revision: { commit: null, snapshotId: null, workspaceRevision: (await loadWorkspace(projectId)).revision, pinnedAt: new Date() } };
        }
        throw error;
      }
    },

    async assess(projectId, steps) {
      if (!steps.length) return [];
      // The commit of each step is looked up in the snapshots; what it is about, in the workspace as it is now.
      const [facts, workspace] = await Promise.all([
        StepRevisionService.facts(projectId, steps.map(step => step.revision)),
        loadWorkspace(projectId),
      ]);
      return steps.map((step, i) => assessStepRevision(step.revision, { ...facts[i], reference: referenceFacts(step, workspace.refs) }));
    },

    workspace: loadWorkspace,

    async isMember(projectId, userId) {
      if (!mongoose.isValidObjectId(projectId)) return false;
      const project = await ProjectModel.findById(projectId).select("userId organizationId").lean();
      if (!project) return false;
      // Leaving the organization ends access to its projects, ownership included (ProjectAccessPolicy).
      if (project.organizationId && !(await organizationRepository?.findMember(project.organizationId, userId))) return false;
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
