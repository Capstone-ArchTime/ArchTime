import { LlmError } from '../../domain/architecture/llm/types.js';
import type { CompleteOptions, LlmClient, LlmInfo, LlmMessage } from '../../domain/architecture/llm/types.js';
import { isPrivateHost } from './ClaudeClient.js';

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
  jsonMode: boolean;
}

/**
 * For models you host yourself (Ollama, vLLM, LM Studio and similar servers that speak the chat-completions protocol),
 * so a repository never has to leave your network. Plain HTTP to a server you configure; it does not call Claude.
 */
export class OpenAiCompatibleClient implements LlmClient {
  readonly info: LlmInfo;

  constructor(private readonly config: OpenAiCompatibleConfig) {
    const host = new URL(config.baseUrl).host;
    this.info = { provider: 'openai-compatible', model: config.model, host, external: !isPrivateHost(host) };
  }

  async complete(messages: LlmMessage[], options: CompleteOptions = {}): Promise<string> {
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
          temperature: 0,
          max_tokens: options.maxTokens ?? 8000,
          ...(this.config.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal,
      });
    } catch (error) {
      if (timeout.aborted) throw new LlmError('timeout', 'The request timed out.');
      if (options.signal?.aborted) throw new LlmError('other', 'The request was cancelled.');
      throw new LlmError('network', `Could not reach ${this.info.host}: ${error instanceof Error ? error.message : 'connection failed'}`);
    }
    if (response.status === 401 || response.status === 403) throw new LlmError('auth', 'The server rejected the credentials.');
    if (response.status === 429) throw new LlmError('rate_limit', 'Rate limited by the server.');
    if (!response.ok) throw new LlmError('other', `The server answered ${response.status}.`);
    const body = await response.json().catch(() => null) as { choices?: { message?: { content?: unknown }; finish_reason?: string }[] } | null;
    const choice = body?.choices?.[0];
    if (choice?.finish_reason === 'length') throw new LlmError('truncated', 'The answer was cut off before it finished.');
    if (typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) throw new LlmError('other', 'The server returned no text.');
    return choice.message.content;
  }
}
