import { LlmError } from '../../domain/architecture/llm/types.js';
import type { CompleteOptions, LlmClient, LlmInfo, LlmMessage } from '../../domain/architecture/llm/types.js';
import { isPrivateHost } from './ClaudeClient.js';

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
  jsonMode: boolean;
  /** Name reported in `info.provider`. */
  providerName?: string;
  /** Sampling temperature; null leaves it to the server (some models advise against changing it). Default 0. */
  temperature?: number | null;
  /** Output budget; models that reason before answering need room for both. Default 8000. */
  maxTokens?: number;
}

/**
 * For models you host yourself (Ollama, vLLM, LM Studio and similar servers that speak the chat-completions protocol),
 * so a repository never has to leave your network. Plain HTTP to a server you configure; it does not call Claude.
 */
export class OpenAiCompatibleClient implements LlmClient {
  readonly info: LlmInfo;
  private jsonMode: boolean;
  private readonly dropped: string[] = [];

  constructor(private readonly config: OpenAiCompatibleConfig) {
    this.jsonMode = config.jsonMode;
    const host = new URL(config.baseUrl).host;
    this.info = { provider: config.providerName ?? 'openai-compatible', model: config.model, host, external: !isPrivateHost(host) };
  }

  notes(): string[] {
    return [...this.dropped];
  }

  /** If the server refuses `response_format`, ask again without it once; the answer is verified either way. */
  async complete(messages: LlmMessage[], options: CompleteOptions = {}): Promise<string> {
    try {
      return await this.send(messages, options);
    } catch (error) {
      if (!(error instanceof LlmError) || error.kind !== 'request' || !this.jsonMode) throw error;
      this.jsonMode = false;
      this.dropped.push(`The server rejected JSON mode (${error.message.replace(/^The server rejected the request/, '').replace(/^ \(|\)\.$/g, '') || 'no reason given'}); it was switched off.`);
      return this.send(messages, options);
    }
  }

  private async send(messages: LlmMessage[], options: CompleteOptions): Promise<string> {
    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          ...(this.config.temperature === null ? {} : { temperature: this.config.temperature ?? 0 }),
          max_tokens: options.maxTokens ?? this.config.maxTokens ?? 8000,
          ...(this.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal,
      });
    } catch (error) {
      if (timeout.aborted) throw new LlmError('timeout', 'The request timed out.');
      if (options.signal?.aborted) throw new LlmError('other', 'The request was cancelled.');
      throw new LlmError('network', `Could not reach ${this.info.host}: ${error instanceof Error ? error.message : 'connection failed'}`);
    }
    if (!response.ok) throw await failure(response);
    const body = await response.json().catch(() => null) as { choices?: { message?: { content?: unknown }; finish_reason?: string }[] } | null;
    const choice = body?.choices?.[0];
    if (choice?.finish_reason === 'length') throw new LlmError('truncated', 'The answer was cut off before it finished.');
    if (typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) throw new LlmError('other', 'The server returned no text.');
    return choice.message.content;
  }
}

/** The server's own explanation: OpenAI-style `{error:{message}}`, Google-style `[{error:{message}}]`, or plain text. */
async function reasonFrom(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(text) as unknown;
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    const message = (first as { error?: { message?: unknown } } | undefined)?.error?.message;
    if (typeof message === 'string') return message.replace(/\s+/g, ' ').slice(0, 300);
  } catch { /* not JSON */ }
  return text.replace(/\s+/g, ' ').slice(0, 200);
}

async function failure(response: Response): Promise<LlmError> {
  const reason = await reasonFrom(response);
  const detail = reason ? ` (${reason})` : '';
  // Google reports a bad key as 400 "API key not valid", not 401.
  if (response.status === 401 || response.status === 403 || /api[_ ]key (is )?(not valid|invalid)|API_KEY_INVALID/i.test(reason)) return new LlmError('auth', `The server rejected the credentials${detail}.`);
  if (/credit|billing|insufficient[_ ]quota/i.test(reason) && response.status !== 429) return new LlmError('billing', `The account has no credit or billing is not set up${detail}.`);
  if (response.status === 429) return new LlmError('rate_limit', `Rate limited or out of quota${detail}.`);
  if (response.status === 404) return new LlmError('request', `The model or endpoint was not found. Check LLM_MODEL and LLM_BASE_URL${detail}.`);
  if (response.status >= 400 && response.status < 500) return new LlmError('request', `The server rejected the request${detail}.`);
  return new LlmError('other', `The server answered ${response.status}${detail}.`);
}
