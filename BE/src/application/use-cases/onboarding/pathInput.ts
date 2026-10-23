import { ValidationError } from "../../../shared/errors/AppError.js";
import {
  ONBOARDING_PATH_STATUSES,
  ONBOARDING_STEP_KINDS,
  type IOnboardingQuestion,
  type OnboardingPathStatus,
  type OnboardingStepKind,
} from "../../../domain/entities/OnboardingPath.js";

export const PATH_LIMITS = {
  title: 120,
  description: 2000,
  steps: 50,
  stepTitle: 120,
  stepBody: 4000,
  prompt: 500,
  option: 200,
  optionsMin: 2,
  optionsMax: 6,
  explanation: 1000,
  refId: 100,
} as const;

export interface StepInput {
  /** Present when the step already exists, so the progress of the people it was given to stays attached to it. */
  id?: string;
  kind: OnboardingStepKind;
  title: string;
  body: string;
  componentId?: string;
  adrId?: string;
  commit?: string;
  question?: IOnboardingQuestion;
  /** Pin the step to the current revision again, as the mentor has updated it. */
  repin: boolean;
}

export interface PathInput {
  title: string;
  description: string;
  /** Left out on an update means "keep what it is now". */
  status?: OnboardingPathStatus;
  steps: StepInput[];
  /** The revision the editor loaded; required when saving an existing path. */
  expectedRevision?: number;
}

const STEP_ID = /^[a-z0-9-]{1,40}$/;
const COMMIT = /^[0-9a-f]{7,64}$/;

type Fields = Record<string, string>;

/** Trimmed text; a problem is recorded under `key` and the value is still returned so the other problems are found too. */
function text(fields: Fields, key: string, value: unknown, max: number, required: boolean): string {
  if (value === undefined || value === null || value === "") {
    if (required) fields[key] = "Required.";
    return "";
  }
  if (typeof value !== "string") {
    fields[key] = "Must be text.";
    return "";
  }
  const trimmed = value.trim();
  if (required && !trimmed) fields[key] = "Required.";
  else if (trimmed.length > max) fields[key] = `At most ${max} characters.`;
  return trimmed;
}

function parseQuestion(fields: Fields, key: string, value: unknown): IOnboardingQuestion | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fields[key] = "A question step needs a question.";
    return undefined;
  }
  const q = value as Record<string, unknown>;
  const prompt = text(fields, `${key}.prompt`, q.prompt, PATH_LIMITS.prompt, true);
  const explanation = text(fields, `${key}.explanation`, q.explanation, PATH_LIMITS.explanation, false);

  let options: string[] = [];
  if (!Array.isArray(q.options) || q.options.length < PATH_LIMITS.optionsMin || q.options.length > PATH_LIMITS.optionsMax) {
    fields[`${key}.options`] = `Give ${PATH_LIMITS.optionsMin} to ${PATH_LIMITS.optionsMax} answers.`;
  } else {
    options = q.options.map((option, i) => text(fields, `${key}.options[${i}]`, option, PATH_LIMITS.option, true));
    const seen = new Set(options.map(o => o.toLowerCase()));
    if (!fields[`${key}.options`] && seen.size !== options.length) fields[`${key}.options`] = "Two answers are the same.";
  }

  const correctIndex = q.correctIndex;
  if (!Number.isInteger(correctIndex) || (correctIndex as number) < 0 || (correctIndex as number) >= options.length) {
    fields[`${key}.correctIndex`] = "Must point at one of the answers.";
  }
  return { prompt, options, correctIndex: correctIndex as number, explanation };
}

/** Checks a learning path as sent by the editor; every problem is reported at once, by field. */
export function parsePathInput(body: unknown, { update }: { update: boolean }): PathInput {
  const fields: Fields = {};
  const input = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;

  const title = text(fields, "title", input.title, PATH_LIMITS.title, true);
  const description = text(fields, "description", input.description, PATH_LIMITS.description, false);

  let status: OnboardingPathStatus | undefined;
  if (input.status !== undefined) {
    if (typeof input.status === "string" && (ONBOARDING_PATH_STATUSES as readonly string[]).includes(input.status)) status = input.status as OnboardingPathStatus;
    else fields.status = `Must be one of: ${ONBOARDING_PATH_STATUSES.join(", ")}.`;
  }

  const steps: StepInput[] = [];
  if (!Array.isArray(input.steps)) {
    fields.steps = "Must be a list of steps.";
  } else if (input.steps.length > PATH_LIMITS.steps) {
    fields.steps = `At most ${PATH_LIMITS.steps} steps.`;
  } else {
    const ids = new Set<string>();
    input.steps.forEach((raw, i) => {
      const at = (name: string) => `steps[${i}].${name}`;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        fields[`steps[${i}]`] = "Must be an object.";
        return;
      }
      const s = raw as Record<string, unknown>;
      const kind = ONBOARDING_STEP_KINDS.find(k => k === s.kind);
      if (!kind) {
        fields[at("kind")] = `Must be one of: ${ONBOARDING_STEP_KINDS.join(", ")}.`;
        return;
      }

      let id: string | undefined;
      if (s.id !== undefined && s.id !== null && s.id !== "") {
        if (typeof s.id !== "string" || !STEP_ID.test(s.id)) fields[at("id")] = "Not a valid step id.";
        else if (ids.has(s.id)) fields[at("id")] = "Used by two steps.";
        else {
          id = s.id;
          ids.add(s.id);
        }
      }

      const step: StepInput = {
        id,
        kind,
        title: text(fields, at("title"), s.title, PATH_LIMITS.stepTitle, true),
        body: text(fields, at("body"), s.body, PATH_LIMITS.stepBody, false),
        repin: s.repin === true,
      };
      if (kind === "component") step.componentId = text(fields, at("componentId"), s.componentId, PATH_LIMITS.refId, true);
      if (kind === "adr") step.adrId = text(fields, at("adrId"), s.adrId, PATH_LIMITS.refId, true);
      if (kind === "commit") {
        // A step that already exists keeps its commit when none is sent; a new one must name it.
        const commit = text(fields, at("commit"), s.commit, 64, !id).toLowerCase();
        if (commit && !COMMIT.test(commit)) fields[at("commit")] = "Must be a commit hash of at least 7 hex characters.";
        if (commit) step.commit = commit;
      }
      if (kind === "question") step.question = parseQuestion(fields, at("question"), s.question);
      steps.push(step);
    });
  }

  if (status === "published" && Array.isArray(input.steps) && !input.steps.length) fields.steps = "A published path needs at least one step.";

  let expectedRevision: number | undefined;
  if (update) {
    if (Number.isInteger(input.expectedRevision) && (input.expectedRevision as number) > 0) expectedRevision = input.expectedRevision as number;
    else fields.expectedRevision = "Required: the revision of the path you loaded.";
  }

  if (Object.keys(fields).length) throw new ValidationError("The learning path is not valid.", fields);
  return { title, description, ...(status ? { status } : {}), steps, ...(expectedRevision !== undefined ? { expectedRevision } : {}) };
}

export const MAX_ASSIGNEES_PER_REQUEST = 50;

/** The people a path is being given to: one to fifty distinct ids. */
export function parseUserIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_ASSIGNEES_PER_REQUEST) {
    throw new ValidationError("Give 1 to 50 people.", { userIds: `Give 1 to ${MAX_ASSIGNEES_PER_REQUEST} user ids.` });
  }
  const ids = value.map(v => (typeof v === "string" ? v.trim() : ""));
  if (ids.some(id => !id || id.length > 64)) throw new ValidationError("A user id is not valid.", { userIds: "Each entry must be a user id." });
  return [...new Set(ids)];
}
