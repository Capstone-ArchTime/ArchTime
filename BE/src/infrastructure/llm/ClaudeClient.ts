import Anthropic from '@anthropic-ai/sdk';
import { LlmError } from '../../domain/architecture/llm/types.js';
import type { CompleteOptions, LlmClient, LlmInfo, LlmMessage } from '../../domain/architecture/llm/types.js';

export interface ClaudeConfig {
  apiKey?: string;
  model: string;
  baseUrl?: string;
  timeoutMs: number;
  effort?: 'low' | 'medium' | 'high';
}

/** Claude through the official SDK. Answers are constrained to the JSON schema and a refusal is surfaced instead of read as an answer. */
export class ClaudeClient implements LlmClient {
  readonly info: LlmInfo;
  private readonly client: Anthropic;

  constructor(private readonly config: ClaudeConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl, timeout: config.timeoutMs, maxRetries: 1 });
    const host = (() => { try { return new URL(config.baseUrl ?? 'https://api.anthropic.com').host; } catch { return 'api.anthropic.com'; } })();
    this.info = { provider: 'anthropic', model: config.model, host, external: !isPrivateHost(host) };
  }

  async complete(messages: LlmMessage[], options: CompleteOptions = {}): Promise<string> {
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const turns = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    try {
      const response = await this.client.beta.messages.create({
        model: this.config.model,
        max_tokens: options.maxTokens ?? 16000,
        // A declined request is re-run on Anthropic's recommended fallback model by the server (Claude API only).
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: this.config.effort ?? 'medium', ...(options.schema ? { format: { type: 'json_schema' as const, schema: options.schema } } : {}) },
        ...(system ? { system } : {}),
        messages: turns,
      }, { signal: options.signal });
      if (response.stop_reason === 'refusal') throw new LlmError('refusal', 'The model declined the request.');
      if (response.stop_reason === 'max_tokens') throw new LlmError('truncated', 'The answer was cut off before it finished.');
      const text = response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('');
      if (!text.trim()) throw new LlmError('other', 'The model returned no text.');
      return text;
    } catch (error) {
      throw translate(error);
    }
  }
}

function translate(error: unknown): LlmError | unknown {
  if (error instanceof LlmError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return new LlmError('auth', 'The API key was rejected.');
  if (error instanceof Anthropic.RateLimitError) return new LlmError('rate_limit', 'Rate limited by the provider.');
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new LlmError('timeout', 'The request timed out.');
  if (error instanceof Anthropic.APIUserAbortError) return new LlmError('other', 'The request was cancelled.');
  if (error instanceof Anthropic.APIConnectionError) return new LlmError('network', 'Could not reach the provider.');
  if (error instanceof Anthropic.APIError) return new LlmError('other', `Provider error ${error.status ?? ''}: ${error.message}`.slice(0, 300));
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
