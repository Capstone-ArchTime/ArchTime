import { randomUUID } from "node:crypto";
import { AppError, BadRequestError, ConflictError, NotFoundError, ValidationError } from "../../../shared/errors/AppError.js";
import type { IOnboardingPath, IOnboardingStep } from "../../../domain/entities/OnboardingPath.js";
import { stepProgressList, summarizeProgress } from "../../../domain/onboarding/path.js";
import { referenceFingerprint } from "../../../domain/onboarding/stepReference.js";
import type { AssignmentStore, OnboardingDeps, PathStore } from "./OnboardingPorts.js";
import { parsePathInput, parseUserIds, type StepInput } from "./pathInput.js";

export const MAX_PATHS_PER_PROJECT = 100;

const newStepId = (taken: ReadonlySet<string>): string => {
  let id = `step-${randomUUID().slice(0, 8)}`;
  while (taken.has(id)) id = `step-${randomUUID().slice(0, 8)}`;
  return id;
};

/** Whether a stored commit hash and a hash typed by a mentor (7 characters or more) name the same commit. */
const sameCommit = (stored: string | null | undefined, typed: string | undefined): boolean =>
  !!stored && !!typed && (stored.startsWith(typed) || typed.startsWith(stored));

/**
 * What a project's mentors do with learning paths: write them, give them to people, and see how far each person has got.
 * Who may do this is decided before it gets here, by the route guard (the right to write to the project); what each person
 * may see of their own progress is OnboardingLearningUseCases.
 */
export class OnboardingPathUseCases {
  constructor(
    private readonly paths: PathStore,
    private readonly assignments: AssignmentStore,
    private readonly deps: OnboardingDeps,
  ) {}

  private async requirePath(projectId: string, pathId: string): Promise<IOnboardingPath> {
    const path = await this.paths.find(projectId, pathId);
    if (!path) throw new NotFoundError("Learning path not found.");
    return path;
  }

  /** A path as the mentors see it, with the answer keys and whether each step still holds. */
  private async detail(path: IOnboardingPath) {
    const assessments = await this.deps.assess(path.projectId, path.steps);
    return { ...path, steps: path.steps.map((step, i) => ({ ...step, assessment: assessments[i] })) };
  }

  /**
   * Turns the steps sent by the editor into stored steps: every reference must exist in this workspace, and every step is
   * pinned to the revision it was written against. A step that was already in the path and has not changed keeps its pin
   * and its id, so the progress of the people it was given to stays with it.
   */
  private async buildSteps(projectId: string, inputs: StepInput[], existing: IOnboardingStep[]): Promise<IOnboardingStep[]> {
    const workspace = await this.deps.workspace(projectId);
    const prior = new Map(existing.map(step => [step.id, step]));
    const taken = new Set(existing.map(step => step.id));
    const problems: Record<string, string> = {};
    const steps: IOnboardingStep[] = [];

    for (const [i, input] of inputs.entries()) {
      const before = input.id ? prior.get(input.id) : undefined;
      if (input.id && !before) {
        problems[`steps[${i}].id`] = "This path has no such step.";
        continue;
      }
      if (input.kind === "component" && !workspace.componentIds.has(input.componentId ?? "")) {
        problems[`steps[${i}].componentId`] = "This workspace's component diagram has no such component.";
        continue;
      }
      if (input.kind === "adr" && !workspace.adrIds.has(input.adrId ?? "")) {
        problems[`steps[${i}].adrId`] = "This workspace has no such design decision.";
        continue;
      }

      // An existing commit step that was sent without its commit still means the commit it has.
      const commit = input.kind !== "commit" ? undefined : input.commit ?? (before?.kind === "commit" ? before.revision.commit ?? undefined : undefined);
      if (input.kind === "commit" && !commit) {
        problems[`steps[${i}].commit`] = "Required.";
        continue;
      }

      const unchanged = !!before && !input.repin && before.kind === input.kind
        && before.componentId === input.componentId && before.adrId === input.adrId
        && (input.kind !== "commit" || sameCommit(before.revision.commit, commit));

      let revision = before?.revision;
      let commitTitle = before?.commitTitle;
      if (!unchanged || !revision) {
        try {
          const pinned = await this.deps.pin(projectId, commit);
          // The step remembers what its own component or decision looked like, so only a change to that outdates it.
          const fingerprint = referenceFingerprint(input, workspace.refs);
          revision = fingerprint ? { ...pinned.revision, fingerprint } : pinned.revision;
          commitTitle = input.kind === "commit" ? pinned.title : undefined;
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          problems[`steps[${i}].${input.kind === "commit" ? "commit" : "title"}`] = error.message;
          continue;
        }
      }

      const id = before?.id ?? newStepId(taken);
      taken.add(id);
      steps.push({
        id,
        kind: input.kind,
        title: input.title,
        body: input.body,
        ...(input.kind === "component" ? { componentId: input.componentId } : {}),
        ...(input.kind === "adr" ? { adrId: input.adrId } : {}),
        ...(input.kind === "commit" && commitTitle ? { commitTitle } : {}),
        ...(input.kind === "question" && input.question ? { question: input.question } : {}),
        revision,
      });
    }

    if (Object.keys(problems).length) throw new ValidationError("Some steps point at things this workspace does not have.", problems);
    return steps;
  }

  async create(projectId: string, userId: string, body: unknown) {
    const input = parsePathInput(body, { update: false });
    if ((await this.paths.count(projectId)) >= MAX_PATHS_PER_PROJECT) {
      throw new BadRequestError(`A workspace can have at most ${MAX_PATHS_PER_PROJECT} learning paths.`);
    }
    const steps = await this.buildSteps(projectId, input.steps, []);
    const created = await this.paths.create({
      projectId, title: input.title, description: input.description, status: input.status ?? "draft", steps,
      revision: 1, createdBy: userId, updatedBy: userId,
    });
    return this.detail(created);
  }

  async update(projectId: string, userId: string, pathId: string, body: unknown) {
    const input = parsePathInput(body, { update: true });
    const current = await this.requirePath(projectId, pathId);
    const status = input.status ?? current.status;
    if (status === "published" && !input.steps.length) {
      throw new ValidationError("The learning path is not valid.", { steps: "A published path needs at least one step." });
    }
    const steps = await this.buildSteps(projectId, input.steps, current.steps);
    const saved = await this.paths.replace(projectId, pathId, input.expectedRevision!, {
      title: input.title, description: input.description, status, steps, updatedBy: userId,
    });
    if (!saved) {
      const now = await this.paths.find(projectId, pathId);
      if (!now) throw new NotFoundError("Learning path not found.");
      throw new ConflictError(
        `Learning path revision conflict: you edited revision ${input.expectedRevision}, but the current revision is ${now.revision}. Load the latest version and apply your changes again.`,
        "CONFLICT",
      );
    }
    return this.detail(saved);
  }

  async remove(projectId: string, pathId: string): Promise<void> {
    if (!(await this.paths.remove(projectId, pathId))) throw new NotFoundError("Learning path not found.");
    await this.assignments.removeByPath(pathId);
  }

  async get(projectId: string, pathId: string) {
    return this.detail(await this.requirePath(projectId, pathId));
  }

  /** Every path of the project, with how many people have it, how many finished it, and how many steps need a mentor's attention. */
  async list(projectId: string) {
    const paths = await this.paths.list(projectId, MAX_PATHS_PER_PROJECT);
    const assignments = await this.assignments.listByPaths(projectId, paths.map(path => path.id));
    const assessments = await this.deps.assess(projectId, paths.flatMap(path => path.steps));
    let offset = 0;
    return paths.map(path => {
      const own = assessments.slice(offset, offset + path.steps.length);
      offset += path.steps.length;
      const given = assignments.filter(a => a.pathId === path.id);
      return {
        id: path.id, title: path.title, description: path.description, status: path.status, revision: path.revision,
        stepCount: path.steps.length, updatedAt: path.updatedAt,
        assigned: given.length,
        finished: given.filter(a => { const { done, total } = summarizeProgress(path, a.progress); return total > 0 && done === total; }).length,
        outdatedSteps: own.filter(a => a.status === "outdated").length,
        missingSteps: own.filter(a => a.status === "missing").length,
      };
    });
  }

  /** Gives a published path to people who belong to the project. Giving it to someone who already has it changes nothing. */
  async assign(projectId: string, pathId: string, assignedBy: string, userIds: unknown) {
    const path = await this.requirePath(projectId, pathId);
    if (path.status !== "published") throw new BadRequestError("Publish the path before giving it to anyone.");
    const ids = parseUserIds(userIds);
    const outsiders: string[] = [];
    for (const id of ids) if (!(await this.deps.isMember(projectId, id))) outsiders.push(id);
    if (outsiders.length) {
      throw new ValidationError("Some of these people are not members of this workspace.", { userIds: `Not members: ${outsiders.join(", ")}` });
    }
    for (const id of ids) await this.assignments.assign(projectId, pathId, id, assignedBy);
    return { assigned: ids };
  }

  async unassign(projectId: string, pathId: string, userId: string): Promise<void> {
    await this.requirePath(projectId, pathId);
    if (!(await this.assignments.unassign(pathId, userId))) throw new NotFoundError("This path was not given to that person.");
  }

  /** How far everyone who has the path has got: for the project's mentors only. */
  async progress(projectId: string, pathId: string) {
    const path = await this.requirePath(projectId, pathId);
    const assignments = await this.assignments.listByPaths(projectId, [pathId]);
    const people = await this.deps.people(assignments.map(a => a.userId));
    return {
      path: { id: path.id, title: path.title, status: path.status, steps: path.steps.map(s => ({ id: s.id, kind: s.kind, title: s.title })) },
      learners: assignments.map(a => ({
        userId: a.userId,
        name: people.get(a.userId)?.name ?? null,
        email: people.get(a.userId)?.email ?? null,
        assignedAt: a.assignedAt,
        lastActivityAt: a.updatedAt,
        ...summarizeProgress(path, a.progress),
        steps: stepProgressList(path, a.progress),
      })),
    };
  }
}
