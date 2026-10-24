import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";
import type { IOnboardingAssignment, IOnboardingPath } from "../../../domain/entities/OnboardingPath.js";
import { isCorrectAnswer, stepForLearner, summarizeProgress } from "../../../domain/onboarding/path.js";
import type { AssignmentStore, OnboardingDeps, PathStore } from "./OnboardingPorts.js";

const MAX_MY_PATHS = 100;

/**
 * What a person does with the paths they were given: see them, read a step, mark it done, answer its question. Everything
 * here is looked up by the signed-in person's own id, so nothing in it can show anyone else's progress.
 */
export class OnboardingLearningUseCases {
  constructor(
    private readonly paths: PathStore,
    private readonly assignments: AssignmentStore,
    private readonly deps: OnboardingDeps,
  ) {}

  /** The assignment and its published path, or 404: a path that is not yours, or not published, is simply not there. */
  private async mine(projectId: string, pathId: string, userId: string): Promise<{ path: IOnboardingPath; assignment: IOnboardingAssignment }> {
    const [path, assignment] = await Promise.all([this.paths.find(projectId, pathId), this.assignments.find(pathId, userId)]);
    if (!path || path.status !== "published" || !assignment || assignment.projectId !== projectId) {
      throw new NotFoundError("You have not been given this learning path.");
    }
    return { path, assignment };
  }

  /** Every path given to the person, across projects they still belong to. */
  async myPaths(userId: string) {
    const assignments = await this.assignments.listByUser(userId, MAX_MY_PATHS);
    const paths = await this.paths.findMany([...new Set(assignments.map(a => a.pathId))]);
    const byId = new Map(paths.map(path => [path.id, path]));
    const projectIds = [...new Set(assignments.map(a => a.projectId))];
    const names = await this.deps.projectNames(projectIds);
    const stillMember = new Map<string, boolean>();
    for (const projectId of projectIds) stillMember.set(projectId, await this.deps.isMember(projectId, userId));

    return assignments.flatMap(assignment => {
      const path = byId.get(assignment.pathId);
      if (!path || path.status !== "published" || !stillMember.get(assignment.projectId)) return [];
      return [{
        pathId: path.id, projectId: assignment.projectId, projectName: names.get(assignment.projectId) ?? null,
        title: path.title, description: path.description, assignedAt: assignment.assignedAt, lastActivityAt: assignment.updatedAt,
        ...summarizeProgress(path, assignment.progress),
      }];
    });
  }

  /** The path as its learner reads it: the learner's own progress, no answer keys, and a flag on steps that may be out of date. */
  async view(projectId: string, pathId: string, userId: string) {
    const { path, assignment } = await this.mine(projectId, pathId, userId);
    const assessments = await this.deps.assess(projectId, path.steps.map(step => step.revision));
    return {
      path: {
        id: path.id, projectId: path.projectId, title: path.title, description: path.description,
        steps: path.steps.map((step, i) => stepForLearner(step, assignment.progress[step.id], assessments[i])),
      },
      progress: summarizeProgress(path, assignment.progress),
    };
  }

  /** Marks a step done: for steps that are read or looked at. A question is done by answering it. */
  async complete(projectId: string, pathId: string, stepId: string, userId: string) {
    const { path } = await this.mine(projectId, pathId, userId);
    const step = path.steps.find(s => s.id === stepId);
    if (!step) throw new NotFoundError("This path has no such step.");
    if (step.kind === "question") throw new BadRequestError("Answer the question to finish this step.");
    const updated = await this.assignments.complete(pathId, userId, stepId, this.deps.now());
    if (!updated) throw new NotFoundError("You have not been given this learning path.");
    return { progress: summarizeProgress(path, updated.progress) };
  }

  /** Checks an answer. The step is done when it is right; the explanation is shown then, and not before. */
  async answer(projectId: string, pathId: string, stepId: string, userId: string, choice: unknown) {
    const { path } = await this.mine(projectId, pathId, userId);
    const step = path.steps.find(s => s.id === stepId);
    if (!step) throw new NotFoundError("This path has no such step.");
    const question = step.question;
    if (step.kind !== "question" || !question) throw new BadRequestError("This step has no question; mark it done instead.");
    if (!Number.isInteger(choice) || (choice as number) < 0 || (choice as number) >= question.options.length) {
      throw new BadRequestError("Choose one of the answers.", "VALIDATION_ERROR");
    }
    const correct = isCorrectAnswer(question, choice as number);
    const updated = await this.assignments.recordAnswer(pathId, userId, stepId, choice as number, correct, this.deps.now());
    if (!updated) throw new NotFoundError("You have not been given this learning path.");
    return {
      correct,
      attempts: updated.progress[stepId]?.attempts ?? 1,
      completed: !!updated.progress[stepId]?.completedAt,
      ...(correct ? { correctIndex: question.correctIndex, explanation: question.explanation } : {}),
      progress: summarizeProgress(path, updated.progress),
    };
  }
}
