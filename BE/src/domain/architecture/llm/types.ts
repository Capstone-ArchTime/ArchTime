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

export type LlmErrorKind = 'auth' | 'billing' | 'request' | 'rate_limit' | 'timeout' | 'refusal' | 'truncated' | 'network' | 'other';

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  constructor(kind: LlmErrorKind, message: string) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
  }
  /** Errors that another attempt cannot fix. */
  get fatal(): boolean {
    return this.kind === 'auth' || this.kind === 'billing' || this.kind === 'refusal' || this.kind === 'request';
  }
}

export interface CompleteOptions {
  /** JSON schema of the expected answer; used where the provider can enforce it. */
  schema?: Record<string, unknown>;
  maxTokens?: number;
  signal?: AbortSignal;
}

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
}

export const DEFAULT_REFINE_OPTIONS: RefineOptions = { minComponents: 8, maxComponents: 15, minSize: 2, maxMoveRatio: 0.4, maxRefineFiles: 400, maxAttempts: 3 };

export interface RefineIssue { code: string; message: string }
export interface RefineAttempt { n: number; ok: boolean; issues: RefineIssue[] }
export interface RefineReceipt {
  mode: 'refine' | 'name-only';
  provider: string;
  model: string;
  external: boolean;
  filesSent: number;
  attempts: RefineAttempt[];
  accepted: boolean;
  fallbackReason?: string;
  movedRatio?: number;
  notes?: string[];
}
