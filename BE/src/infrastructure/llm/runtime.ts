import type { LlmClient } from '../../domain/architecture/llm/types.js';
import { DEFAULT_REFINE_OPTIONS } from '../../domain/architecture/llm/types.js';
import type { RefineOptions } from '../../domain/architecture/llm/types.js';
import { ClaudeClient } from './ClaudeClient.js';
import { OpenAiCompatibleClient } from './OpenAiCompatibleClient.js';

/**
 * LLM_PROVIDER      none | anthropic | openai-compatible   (default: anthropic when ANTHROPIC_API_KEY is set, otherwise none)
 * LLM_MODEL         anthropic: defaults to claude-opus-5-5; openai-compatible: required
 * LLM_BASE_URL      openai-compatible: required (for example http://localhost:11434/v1); anthropic: optional override
 * LLM_API_KEY       openai-compatible only, optional; anthropic reads ANTHROPIC_API_KEY
 * LLM_TIMEOUT_MS    default 180000
 * LLM_JSON_MODE     openai-compatible: send response_format json_object (default true)
 * LLM_MAX_REFINE_FILES / LLM_MAX_MOVE_RATIO   see RefineOptions
 */
export interface LlmCapability {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  host: string | null;
  /** Prompts (file paths and imports only) leave this machine or network. */
  external: boolean;
  reason?: string;
}

export interface LlmRuntime { client: LlmClient | null; capability: LlmCapability; options: Partial<RefineOptions> }

const number = (v: string | undefined, fallback: number) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback; };

export function loadLlmRuntime(env: NodeJS.ProcessEnv = process.env): LlmRuntime {
  const options: Partial<RefineOptions> = {
    maxRefineFiles: number(env.LLM_MAX_REFINE_FILES, DEFAULT_REFINE_OPTIONS.maxRefineFiles),
    maxMoveRatio: Math.min(1, Math.max(0, number(env.LLM_MAX_MOVE_RATIO, DEFAULT_REFINE_OPTIONS.maxMoveRatio))),
  };
  const off = (reason: string): LlmRuntime => ({ client: null, options, capability: { enabled: false, provider: null, model: null, host: null, external: false, reason } });
  const provider = (env.LLM_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : 'none')).toLowerCase();
  const timeoutMs = number(env.LLM_TIMEOUT_MS, 180_000);
  try {
    let client: LlmClient;
    if (provider === 'none' || provider === '') return off('No AI provider is configured on this server.');
    if (provider === 'anthropic') {
      if (!env.ANTHROPIC_API_KEY) return off('LLM_PROVIDER is anthropic but ANTHROPIC_API_KEY is not set.');
      client = new ClaudeClient({ apiKey: env.ANTHROPIC_API_KEY, model: env.LLM_MODEL || 'claude-opus-5-5', baseUrl: env.LLM_BASE_URL || undefined, timeoutMs });
    } else if (provider === 'openai-compatible') {
      if (!env.LLM_BASE_URL || !env.LLM_MODEL) return off('LLM_BASE_URL and LLM_MODEL are required for an openai-compatible provider.');
      client = new OpenAiCompatibleClient({ baseUrl: env.LLM_BASE_URL, model: env.LLM_MODEL, apiKey: env.LLM_API_KEY || undefined, timeoutMs, jsonMode: env.LLM_JSON_MODE !== 'false' });
    } else {
      return off(`Unknown LLM_PROVIDER "${provider}".`);
    }
    const { info } = client;
    return { client, options, capability: { enabled: true, provider: info.provider, model: info.model, host: info.host, external: info.external } };
  } catch (error) {
    return off(error instanceof Error ? error.message : 'The AI provider could not be configured.');
  }
}

let current: LlmRuntime | null = null;
export function getLlmRuntime(): LlmRuntime { return (current ??= loadLlmRuntime()); }
/** For tests and for reloading configuration. */
export function setLlmRuntime(runtime: LlmRuntime | null) { current = runtime; }
