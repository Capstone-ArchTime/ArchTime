export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmInfo {
  provider: string;
  model: string;
  /** Host the prompts are sent to. */
  host: string;
  /** True when the prompts leave the machine/network running ArchTime. */
  external: boolean;
}

export type LlmErrorKind = 'auth' | 'billing' | 'request' | 'rate_limit' | 'too_large' | 'timeout' | 'refusal' | 'truncated' | 'network' | 'other';

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  /** How long the provider asked us to wait before trying again (rate limits). */
  readonly retryAfterMs?: number;
  constructor(kind: LlmErrorKind, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) this.retryAfterMs = retryAfterMs;
  }
  /** Errors that another attempt cannot fix. */
  get fatal(): boolean {
    return this.kind === 'auth' || this.kind === 'billing' || this.kind === 'refusal' || this.kind === 'request';
  }
}

/** Tokens one request consumed, as reported by the provider (or estimated from text length when it reports nothing). */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  /** Part of inputTokens served from the provider's prompt cache. */
  cacheReadTokens?: number;
  /** Part of outputTokens spent on reasoning before the answer. */
  reasoningTokens?: number;
  estimated: boolean;
}

export interface CompleteOptions {
  /** JSON schema of the expected answer; used where the provider can enforce it. */
  schema?: Record<string, unknown>;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Called once per request that reached the provider and got an answer, including answers then rejected (refusal, truncated). */
  onUsage?: (usage: LlmUsage, latencyMs: number) => void;
}

/** Rough token count for providers that report none: about four characters per token. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export interface LlmClient {
  readonly info: LlmInfo;
  /** Optional request features this client had to switch off because the provider rejected them. */
  notes?(): string[];
  /** Returns the model's text answer. Throws LlmError. */
  complete(messages: LlmMessage[], options?: CompleteOptions): Promise<string>;
}

export interface RefineOptions {
  minComponents: number;
  maxComponents: number;
  minSize: number;
  /** Largest share of files the model may move out of their initial cluster. */
  maxMoveRatio: number;
  /** Above this many files only names, roles and descriptions are requested. */
  maxRefineFiles: number;
  /** Total attempts including the first. */
  maxAttempts: number;
  /**
   * Largest request (prompt + answer budget) the provider accepts, e.g. a free tier's tokens per minute. When set, the answer
   * budget is sized to fit and an oversized prompt is sent in name-only mode. Unset: no limit, the client's own output budget.
   */
  maxRequestTokens?: number;
}

/** Rate-limit waits and request-size retreats per run; they do not use up attempts. */
export const MAX_RATE_LIMIT_WAITS = 2;
export const MAX_WAIT_MS = 65_000;

export const DEFAULT_REFINE_OPTIONS: RefineOptions = { minComponents: 8, maxComponents: 15, minSize: 2, maxMoveRatio: 0.4, maxRefineFiles: 400, maxAttempts: 3 };

export interface RefineIssue { code: string; message: string }
export interface RefineAttempt {
  n: number;
  ok: boolean;
  issues: RefineIssue[];
  /** Time spent waiting for the provider's rate limit to reset after this attempt. */
  waitedMs?: number;
  usage?: LlmUsage;
  latencyMs?: number;
  /** LlmError kind when the provider, not the answer, failed. */
  errorKind?: LlmErrorKind;
}
export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  /** True when any request's count was estimated rather than reported. */
  estimated: boolean;
}
export interface RefineReceipt {
  mode: 'refine' | 'name-only';
  /** "delta": the model returned names and moves only (since quality v2); absent for older full-list answers. */
  format?: 'delta';
  /** Why a refinement fell back to naming only (prompt too large for the model's limit). */
  narrowed?: string;
  provider: string;
  model: string;
  external: boolean;
  filesSent: number;
  attempts: RefineAttempt[];
  accepted: boolean;
  fallbackReason?: string;
  movedRatio?: number;
  notes?: string[];
  /** Summed over every attempt, failed ones included: they were paid for too. */
  usage?: UsageTotals;
  /** Time spent waiting on the provider, summed over attempts. */
  latencyMs?: number;
  /** Set once the run is recorded (see LlmRunModel). */
  runId?: string;
  modelId?: string;
  cost?: { amount: number; currency: string };
}

export function sumUsage(attempts: { usage?: LlmUsage }[]): UsageTotals {
  const t: UsageTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0, totalTokens: 0, estimated: false };
  for (const { usage: u } of attempts) {
    if (!u) continue;
    t.inputTokens += u.inputTokens;
    t.outputTokens += u.outputTokens;
    t.cacheReadTokens += u.cacheReadTokens ?? 0;
    t.reasoningTokens += u.reasoningTokens ?? 0;
    t.estimated ||= u.estimated;
  }
  t.totalTokens = t.inputTokens + t.outputTokens;
  return t;
}
