import type { StepRevision } from "../onboarding/stepRevision.js";

export const ONBOARDING_STEP_KINDS = ["component", "commit", "adr", "question"] as const;
export type OnboardingStepKind = (typeof ONBOARDING_STEP_KINDS)[number];

export const ONBOARDING_PATH_STATUSES = ["draft", "published"] as const;
export type OnboardingPathStatus = (typeof ONBOARDING_PATH_STATUSES)[number];

/** A multiple-choice check question. The answer key stays on the server until a learner has answered correctly. */
export interface IOnboardingQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface IOnboardingStep {
  id: string;
  kind: OnboardingStepKind;
  title: string;
  /** What to read or look at, in the mentor's words. */
  body: string;
  /** kind "component": id of a component in the project's workspace diagram. */
  componentId?: string;
  /** kind "adr": id of a design decision in the project's workspace. */
  adrId?: string;
  /** kind "commit": what the commit was called when the step was written (its hash is in `revision`). */
  commitTitle?: string;
  /** kind "question". */
  question?: IOnboardingQuestion;
  /** What the step was written against, so it can be flagged once that no longer holds. */
  revision: StepRevision;
}

/** A learning path a mentor wrote for one project: ordered steps about components, commits, decisions and check questions. */
export interface IOnboardingPath {
  id: string;
  projectId: string;
  title: string;
  description: string;
  /** Learners see published paths only. */
  status: OnboardingPathStatus;
  steps: IOnboardingStep[];
  /** Counts saves, so two mentors editing at the same time cannot overwrite each other. */
  revision: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** One learner's state on one step; the step is done once `completedAt` is set. */
export interface IStepProgress {
  attempts?: number;
  lastChoice?: number;
  completedAt?: Date;
}

/** A path given to one person. Only that person (and the project's mentors) can read the progress on it. */
export interface IOnboardingAssignment {
  id: string;
  projectId: string;
  pathId: string;
  userId: string;
  assignedBy: string;
  assignedAt: Date;
  /** Progress by step id. */
  progress: Record<string, IStepProgress>;
  updatedAt: Date;
}
