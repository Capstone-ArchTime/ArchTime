import type { IOnboardingAssignment, IOnboardingPath, IOnboardingStep } from "../../../domain/entities/OnboardingPath.js";
import type { StepRevision, StepRevisionAssessment } from "../../../domain/onboarding/stepRevision.js";
import type { ReferenceWorkspace } from "../../../domain/onboarding/stepReference.js";

/** What is needed to judge a step: what it points at and the revision it was pinned to. */
export type AssessedStep = Pick<IOnboardingStep, "kind" | "componentId" | "adrId" | "revision">;

export type NewPath = Omit<IOnboardingPath, "id" | "createdAt" | "updatedAt">;
export type PathContent = Pick<IOnboardingPath, "title" | "description" | "status" | "steps" | "updatedBy">;

/** Where learning paths are kept: MongoOnboardingStores in production, an in-memory stand-in in tests. */
export interface PathStore {
  count(projectId: string): Promise<number>;
  create(path: NewPath): Promise<IOnboardingPath>;
  /** Newest edit first. */
  list(projectId: string, limit: number): Promise<IOnboardingPath[]>;
  find(projectId: string, pathId: string): Promise<IOnboardingPath | null>;
  findMany(pathIds: string[]): Promise<IOnboardingPath[]>;
  /** Writes the content only if the stored revision is still `expectedRevision`, and raises it by one. Null: it was not, or the path is gone. */
  replace(projectId: string, pathId: string, expectedRevision: number, content: PathContent): Promise<IOnboardingPath | null>;
  remove(projectId: string, pathId: string): Promise<boolean>;
}

/** Where the paths given to people, and their progress on them, are kept. */
export interface AssignmentStore {
  listByPaths(projectId: string, pathIds: string[]): Promise<IOnboardingAssignment[]>;
  /** One person's assignments, across projects, most recently touched first. */
  listByUser(userId: string, limit: number): Promise<IOnboardingAssignment[]>;
  find(pathId: string, userId: string): Promise<IOnboardingAssignment | null>;
  /** Gives the path to the person; giving it again changes nothing. */
  assign(projectId: string, pathId: string, userId: string, assignedBy: string): Promise<void>;
  unassign(pathId: string, userId: string): Promise<boolean>;
  removeByPath(pathId: string): Promise<void>;
  /** Marks the step done. The first time stays: doing it again changes nothing. Null when the person has no such assignment. */
  complete(pathId: string, userId: string, stepId: string, at: Date): Promise<IOnboardingAssignment | null>;
  /** Counts an answer to a question step, and marks the step done when the answer was right. Null when there is no such assignment. */
  recordAnswer(pathId: string, userId: string, stepId: string, choice: number, correct: boolean, at: Date): Promise<IOnboardingAssignment | null>;
}

export interface WorkspaceFacts {
  /** The canonical map's revision, or null when the workspace has none yet. */
  revision: number | null;
  componentIds: ReadonlySet<string>;
  adrIds: ReadonlySet<string>;
  /** The components, dependencies and decisions a step's fingerprint is taken from. */
  refs: ReferenceWorkspace;
}

/** What the use cases need to know about the rest of the system. */
export interface OnboardingDeps {
  /** Resolves a commit (or, without one, the latest mined snapshot) to the revision a step is written against. */
  pin(projectId: string, commit?: string): Promise<{ revision: StepRevision; title?: string }>;
  /** Whether each step still holds, in the order given: its commit, and the component or decision it is about. */
  assess(projectId: string, steps: AssessedStep[]): Promise<StepRevisionAssessment[]>;
  workspace(projectId: string): Promise<WorkspaceFacts>;
  /** Whether the person belongs to the project now: its owner or an active member. */
  isMember(projectId: string, userId: string): Promise<boolean>;
  people(userIds: string[]): Promise<Map<string, { name: string; email: string }>>;
  projectNames(projectIds: string[]): Promise<Map<string, string>>;
  now(): Date;
}
