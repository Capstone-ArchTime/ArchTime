import type { LlmClient } from '../../domain/architecture/llm/types.js';
import { DEFAULT_REFINE_OPTIONS } from '../../domain/architecture/llm/types.js';
import type { RefineOptions } from '../../domain/architecture/llm/types.js';
import { ClaudeClient } from './ClaudeClient.js';
import { OpenAiCompatibleClient } from './OpenAiCompatibleClient.js';

/**
 * The model configured through environment variables. Administrators can add more models at run time (see registry.ts);
 * this one stays the fallback when none is registered.
 *
 * LLM_PROVIDER      none | anthropic | gemini | openai-compatible
 *                    (default: anthropic when ANTHROPIC_API_KEY is set, else gemini when GEMINI_API_KEY is set, else none)
 * LLM_MODEL         anthropic: defaults to claude-opus-5-5; gemini: defaults to gemini-3.6-flash; openai-compatible: required
 * GEMINI_API_KEY    gemini (LLM_API_KEY also works)
 * LLM_BASE_URL      openai-compatible: required (for example http://localhost:11434/v1); anthropic: optional override
 * LLM_API_KEY       openai-compatible only, optional; anthropic reads ANTHROPIC_API_KEY
 * LLM_TIMEOUT_MS    default 180000
 * LLM_EFFORT        anthropic: low | medium | high (default medium); lower is faster and cheaper
 * LLM_JSON_MODE     openai-compatible: send response_format json_object (default true)
 * LLM_MAX_REFINE_FILES / LLM_MAX_MOVE_RATIO   see RefineOptions
 * LLM_SECRET_KEY    encrypts API keys of models added by an administrator (falls back to JWT_SECRET)
 */
export interface LlmCapability {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  host: string | null;
  /** Prompts (file paths and imports only) leave this machine or network. */
  external: boolean;
  reason?: string;
  /** Registry id of the model this describes; null for the one configured through environment variables. */
  modelId?: string | null;
  displayName?: string | null;
}

export interface LlmRuntime { client: LlmClient | null; capability: LlmCapability; options: Partial<RefineOptions> }

/** Everything needed to talk to one model, wherever its configuration came from. */
export interface LlmClientConfig {
  provider: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs: number;
  effort?: 'low' | 'medium' | 'high';
  jsonMode?: boolean;
  temperature?: number | null;
  maxTokens?: number;
}

const number = (v: string | undefined, fallback: number) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback; };

export function refineOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): Partial<RefineOptions> {
  return {
    maxRefineFiles: number(env.LLM_MAX_REFINE_FILES, DEFAULT_REFINE_OPTIONS.maxRefineFiles),
    maxMoveRatio: Math.min(1, Math.max(0, number(env.LLM_MAX_MOVE_RATIO, DEFAULT_REFINE_OPTIONS.maxMoveRatio))),
  };
}

/** Builds a client, or explains (as a thrown Error) why the configuration cannot work. */
export function createLlmClient(c: LlmClientConfig): LlmClient {
  if (c.provider === 'anthropic') {
    if (!c.apiKey) throw new Error('An Anthropic model needs an API key.');
    return new ClaudeClient({ apiKey: c.apiKey, model: c.model || 'claude-opus-5-5', baseUrl: c.baseUrl || undefined, timeoutMs: c.timeoutMs, effort: c.effort });
  }
  if (c.provider === 'gemini') {
    if (!c.apiKey) throw new Error('A Gemini model needs an API key.');
    // Google's OpenAI-compatible endpoint. Temperature is left at the model's default, which Google recommends for Gemini 3.
    return new OpenAiCompatibleClient({
      baseUrl: c.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai', model: c.model || 'gemini-3.6-flash', apiKey: c.apiKey,
      timeoutMs: c.timeoutMs, jsonMode: c.jsonMode !== false, providerName: 'gemini', temperature: c.temperature === undefined ? null : c.temperature, maxTokens: c.maxTokens ?? 16000,
    });
  }
  if (c.provider === 'openai-compatible') {
    if (!c.baseUrl || !c.model) throw new Error('A base URL and a model name are required for an openai-compatible provider.');
    return new OpenAiCompatibleClient({ baseUrl: c.baseUrl, model: c.model, apiKey: c.apiKey || undefined, timeoutMs: c.timeoutMs, jsonMode: c.jsonMode !== false, temperature: c.temperature, maxTokens: c.maxTokens });
  }
  throw new Error(`Unknown provider "${c.provider}".`);
}

/** Reads the environment's model configuration without building a client (used to seed the registry). */
export function envClientConfig(env: NodeJS.ProcessEnv = process.env): LlmClientConfig | { error: string } {
  const provider = (env.LLM_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : env.GEMINI_API_KEY ? 'gemini' : 'none')).toLowerCase();
  const timeoutMs = number(env.LLM_TIMEOUT_MS, 180_000);
  if (provider === 'none' || provider === '') return { error: 'No AI provider is configured on this server.' };
  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) return { error: 'LLM_PROVIDER is anthropic but ANTHROPIC_API_KEY is not set.' };
    return { provider, model: env.LLM_MODEL || 'claude-opus-5-5', apiKey: env.ANTHROPIC_API_KEY, baseUrl: env.LLM_BASE_URL || undefined, timeoutMs, effort: (['low', 'medium', 'high'] as const).find(e => e === env.LLM_EFFORT) };
  }
  if (provider === 'gemini') {
    const apiKey = env.GEMINI_API_KEY || env.LLM_API_KEY;
    if (!apiKey) return { error: 'LLM_PROVIDER is gemini but GEMINI_API_KEY is not set.' };
    return { provider, model: env.LLM_MODEL || 'gemini-3.6-flash', apiKey, baseUrl: env.LLM_BASE_URL || undefined, timeoutMs, jsonMode: env.LLM_JSON_MODE !== 'false' };
  }
  if (provider === 'openai-compatible') {
    if (!env.LLM_BASE_URL || !env.LLM_MODEL) return { error: 'LLM_BASE_URL and LLM_MODEL are required for an openai-compatible provider.' };
    return { provider, model: env.LLM_MODEL, apiKey: env.LLM_API_KEY || undefined, baseUrl: env.LLM_BASE_URL, timeoutMs, jsonMode: env.LLM_JSON_MODE !== 'false', temperature: 0 };
  }
  return { error: `Unknown LLM_PROVIDER "${provider}".` };
}

export function loadLlmRuntime(env: NodeJS.ProcessEnv = process.env): LlmRuntime {
  const options = refineOptionsFromEnv(env);
  const off = (reason: string): LlmRuntime => ({ client: null, options, capability: { enabled: false, provider: null, model: null, host: null, external: false, reason } });
  const config = envClientConfig(env);
  if ('error' in config) return off(config.error);
  try {
    const client = createLlmClient(config);
    const { info } = client;
    return { client, options, capability: { enabled: true, provider: info.provider, model: info.model, host: info.host, external: info.external } };
  } catch (error) {
    return off(error instanceof Error ? error.message : 'The AI provider could not be configured.');
  }
}

let current: LlmRuntime | null = null;
let overridden = false;
export function getLlmRuntime(): LlmRuntime { return (current ??= loadLlmRuntime()); }
/** For tests and for reloading configuration. A runtime set here takes precedence over the registry's default model. */
export function setLlmRuntime(runtime: LlmRuntime | null) { current = runtime; overridden = runtime !== null; }
export function runtimeOverride(): LlmRuntime | null { return overridden ? current : null; }
