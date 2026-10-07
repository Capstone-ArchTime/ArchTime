import Anthropic from '@anthropic-ai/sdk';
import { estimateTokens, LlmError } from '../../domain/architecture/llm/types.js';
import type { CompleteOptions, LlmClient, LlmInfo, LlmMessage, LlmUsage } from '../../domain/architecture/llm/types.js';

export interface ClaudeConfig {
  apiKey?: string;
  model: string;
  baseUrl?: string;
  timeoutMs: number;
  effort?: 'low' | 'medium' | 'high';
}

/**
 * Claude through the official SDK. Answers are constrained to the JSON schema and a refusal is surfaced instead of read as an answer.
 * Two optional request features (the server-side refusal fallback and schema-constrained output) are switched off, once and for
 * good, if the API rejects the request with them; the answer is verified either way, so nothing is lost but a convenience.
 */
export class ClaudeClient implements LlmClient {
  readonly info: LlmInfo;
  private readonly client: Anthropic;
  private useFallbacks = true;
  private useSchema = true;
  private readonly dropped: string[] = [];

  constructor(private readonly config: ClaudeConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl, timeout: config.timeoutMs, maxRetries: 1 });
    const host = (() => { try { return new URL(config.baseUrl ?? 'https://api.anthropic.com').host; } catch { return 'api.anthropic.com'; } })();
    this.info = { provider: 'anthropic', model: config.model, host, external: !isPrivateHost(host) };
  }

  notes(): string[] {
    return [...this.dropped];
  }

  async complete(messages: LlmMessage[], options: CompleteOptions = {}): Promise<string> {
    for (let step = 0; ; step++) {
      try {
        return await this.send(messages, options);
      } catch (error) {
        const billing = billingProblem(error);
        if (billing) throw billing; // nothing about the request would change the outcome
        const rejected = error instanceof Anthropic.BadRequestError || error instanceof Anthropic.UnprocessableEntityError;
        if (rejected && this.useFallbacks) { this.useFallbacks = false; this.dropped.push(`The provider rejected the refusal-fallback option (${reasonOf(error)}); it was switched off.`); continue; }
        if (rejected && this.useSchema && options.schema) { this.useSchema = false; this.dropped.push(`The provider rejected schema-constrained output (${reasonOf(error)}); the answer is checked after the fact instead.`); continue; }
        throw translate(error, this.config.model);
      }
    }
  }

  private async send(messages: LlmMessage[], options: CompleteOptions): Promise<string> {
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const turns = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    const started = performance.now();
    const response = await this.client.beta.messages.create({
      model: this.config.model,
      // Thinking tokens count towards max_tokens. Kept under the size at which the SDK insists on streaming.
      max_tokens: options.maxTokens ?? 20000,
      ...(this.useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      output_config: { effort: this.config.effort ?? 'medium', ...(this.useSchema && options.schema ? { format: { type: 'json_schema' as const, schema: options.schema } } : {}) },
      ...(system ? { system } : {}),
      messages: turns,
    }, { signal: options.signal });
    const latencyMs = Math.round(performance.now() - started);
    const text = response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('');
    options.onUsage?.(usageOf(response.usage, messages, text), latencyMs);
    if (response.stop_reason === 'refusal') throw new LlmError('refusal', 'The model declined the request.');
    if (response.stop_reason === 'max_tokens') throw new LlmError('truncated', 'The answer was cut off before it finished (the model used all of its output budget).');
    if (!text.trim()) throw new LlmError('other', 'The model returned no text.');
    return text;
  }
}

/** Anthropic reports cached input apart from `input_tokens`; ArchTime counts all input together and keeps the cached share. */
function usageOf(usage: unknown, messages: LlmMessage[], text: string): LlmUsage {
  const u = (usage ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  if (typeof u.input_tokens !== 'number' || typeof u.output_tokens !== 'number') {
    return { inputTokens: estimateTokens(messages.map(m => m.content).join('\n')), outputTokens: estimateTokens(text), estimated: true };
  }
  const cacheRead = n(u.cache_read_input_tokens);
  return { inputTokens: n(u.input_tokens) + cacheRead + n(u.cache_creation_input_tokens), outputTokens: n(u.output_tokens), cacheReadTokens: cacheRead, estimated: false };
}

/** The provider's own explanation, without the status prefix and request echo the SDK puts in `message`. */
function reasonOf(error: unknown): string {
  const inner = (error as { error?: { error?: { message?: unknown } } })?.error?.error?.message;
  const text = typeof inner === 'string' ? inner : error instanceof Error ? error.message : 'no reason given';
  return text.replace(/\s+/g, ' ').slice(0, 240);
}

/** The API answers an unfunded account with a 400; retrying or dropping options cannot help. */
function billingProblem(error: unknown): LlmError | null {
  if (!(error instanceof Anthropic.APIError)) return null;
  if (!/credit balance|plans\s*&\s*billing|billing/i.test(reasonOf(error))) return null;
  return new LlmError('billing', 'The Anthropic account behind this API key has no credit left. Add credit under Plans & Billing in the Anthropic Console (a Claude subscription does not include API credit), or point ArchTime at a self-hosted model instead.');
}

function translate(error: unknown, model: string): LlmError | unknown {
  if (error instanceof LlmError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return new LlmError('auth', 'The API key was rejected or is not allowed to use this model.');
  if (error instanceof Anthropic.NotFoundError) return new LlmError('request', `Model "${model}" was not found, or this API key cannot use it. Check LLM_MODEL. (${reasonOf(error)})`);
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.UnprocessableEntityError) return new LlmError('request', `The provider rejected the request: ${reasonOf(error)}`);
  if (error instanceof Anthropic.RateLimitError) return new LlmError('rate_limit', 'Rate limited by the provider.');
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new LlmError('timeout', 'The request timed out. Raise LLM_TIMEOUT_MS or lower LLM_EFFORT.');
  if (error instanceof Anthropic.APIUserAbortError) return new LlmError('other', 'The request was cancelled.');
  if (error instanceof Anthropic.APIConnectionError) return new LlmError('network', `Could not reach the provider${error.cause instanceof Error ? ` (${error.cause.message})` : ''}. Check network access to the API host.`);
  if (error instanceof Anthropic.APIError) return new LlmError('other', `Provider error ${error.status ?? ''}: ${reasonOf(error)}`.slice(0, 300));
  return error;
}

export function isPrivateHost(host: string): boolean {
  const name = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  if (name === 'localhost' || name === '::1' || name.endsWith('.local') || name.endsWith('.internal')) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(name);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}
