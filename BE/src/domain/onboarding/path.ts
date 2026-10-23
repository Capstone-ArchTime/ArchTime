// What can be said about a learning path without touching the database: how far someone has got, whether an answer is right,
// and what a learner is allowed to see of a step. Pure, so it is unit-testable.

import type { IOnboardingPath, IOnboardingQuestion, IOnboardingStep, IStepProgress } from "../entities/OnboardingPath.js";
import type { StepRevisionAssessment } from "./stepRevision.js";

export interface ProgressSummary {
  done: number;
  total: number;
  percent: number;
}

/** Counts the steps the path has now: progress on a step that was removed from the path does not count. */
export function summarizeProgress(path: Pick<IOnboardingPath, "steps">, progress: Record<string, IStepProgress> | undefined): ProgressSummary {
  const total = path.steps.length;
  const done = path.steps.filter(step => !!progress?.[step.id]?.completedAt).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

export const isCorrectAnswer = (question: IOnboardingQuestion, choice: number): boolean => choice === question.correctIndex;

/** The progress of every step of the path, in order, for the person it belongs to (and the mentors who assigned it). */
export function stepProgressList(path: Pick<IOnboardingPath, "steps">, progress: Record<string, IStepProgress> | undefined) {
  return path.steps.map(step => {
    const entry = progress?.[step.id];
    return { stepId: step.id, completed: !!entry?.completedAt, completedAt: entry?.completedAt ?? null, attempts: entry?.attempts ?? 0 };
  });
}

/**
 * A step as its learner may see it. The answer key and the explanation of a question are held back until the learner has
 * answered it correctly, so the page never carries the answer to someone who has not given it.
 */
export function stepForLearner(step: IOnboardingStep, progress: IStepProgress | undefined, assessment?: StepRevisionAssessment) {
  const completed = !!progress?.completedAt;
  const { question, ...rest } = step;
  return {
    ...rest,
    ...(question
      ? { question: { prompt: question.prompt, options: question.options, ...(completed ? { correctIndex: question.correctIndex, explanation: question.explanation } : {}) } }
      : {}),
    progress: { completed, completedAt: progress?.completedAt ?? null, attempts: progress?.attempts ?? 0 },
    ...(assessment ? { assessment } : {}),
  };
}
