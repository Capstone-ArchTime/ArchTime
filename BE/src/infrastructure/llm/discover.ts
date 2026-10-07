import { isPrivateHost } from './ClaudeClient.js';

// Lists the models a provider offers for a key, so administrators pick from real ids instead of typing them.

export interface DiscoveredModel {
  id: string;
  name?: string;
  ownedBy?: string;
  contextWindow?: number;
  /** False for models that cannot answer a chat prompt (guards, speech, embeddings, images...). */
  chat: boolean;
  /** Why a model is not usable for drawing architectures. */
  reason?: string;
  free: boolean;
  /** USD per million tokens, when the provider publishes it (OpenRouter does). */
  pricing?: { inputPerMTok: number; outputPerMTok: number };
}

/** Below this a model cannot take the architecture prompt of a mid-sized repository. */
export const MIN_CONTEXT = 16_000;

export class DiscoveryError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = 'DiscoveryError'; }
}

const NOT_CHAT: [RegExp, string][] = [
  [/guard|safeguard|shield/i, 'safety classifier, not a chat model'],
  [/whisper|transcri|speech|tts|audio|orpheus|playai/i, 'speech model'],
  [/embed/i, 'embedding model'],
  [/rerank/i, 'reranker'],
  [/moderation/i, 'moderation model'],
  [/dall-e|imagen|image-gen|stable-diffusion|flux|veo|sora/i, 'image or video model'],
  [/(^|[-/])ocr([-/]|$)/i, 'OCR model'],
];

export function classify(id: string, extra: { outputModalities?: unknown; active?: unknown } = {}): { chat: boolean; reason?: string } {
  if (extra.active === false) return { chat: false, reason: 'not active' };
  if (Array.isArray(extra.outputModalities) && !extra.outputModalities.includes('text')) return { chat: false, reason: 'does not produce text' };
  for (const [re, reason] of NOT_CHAT) if (re.test(id)) return { chat: false, reason };
  return { chat: true };
}

const num = (v: unknown) => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) ? n : undefined; };
const round = (x: number) => Math.round(x * 1e4) / 1e4;

/** Reads OpenAI-style `{ data: [...] }` and Ollama-style `{ models: [...] }` lists. */
export function parseModelList(body: unknown, local: boolean): DiscoveredModel[] {
  const b = body as { data?: unknown; models?: unknown } | null;
  const list = Array.isArray(b?.data) ? b.data : Array.isArray(b?.models) ? b.models : Array.isArray(body) ? body : null;
  if (!list) throw new DiscoveryError('The provider answered, but not with a list of models.');
  const out: DiscoveredModel[] = [];
  const seen = new Set<string>();
  for (const raw of list as Record<string, any>[]) {
    // Gemini lists ids as "models/x"; its chat endpoint takes them without the prefix.
    const id = String(raw?.id ?? raw?.name ?? '').replace(/^models\//, '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const pIn = num(raw?.pricing?.prompt), pOut = num(raw?.pricing?.completion);
    const pricing = pIn !== undefined && pOut !== undefined && pIn >= 0 && pOut >= 0 ? { inputPerMTok: round(pIn * 1e6), outputPerMTok: round(pOut * 1e6) } : undefined;
    const context = num(raw?.context_window ?? raw?.context_length);
    const name = typeof raw?.display_name === 'string' ? raw.display_name : typeof raw?.name === 'string' && raw.name !== raw?.id ? raw.name : undefined;
    out.push({
      id,
      ...(name && name !== id ? { name } : {}),
      ...(typeof raw?.owned_by === 'string' ? { ownedBy: raw.owned_by } : {}),
      ...(context ? { contextWindow: context } : {}),
      ...(context && context < MIN_CONTEXT && classify(id).chat ? { chat: false, reason: `context window too small (${Math.round(context / 1000)}k)` } : classify(id, { outputModalities: raw?.architecture?.output_modalities, active: raw?.active })),
      free: local || id.endsWith(':free') || (pricing ? pricing.inputPerMTok === 0 && pricing.outputPerMTok === 0 : false),
      ...(pricing ? { pricing } : {}),
    });
  }
  return out.sort((a, b) => Number(b.chat) - Number(a.chat) || Number(b.free) - Number(a.free) || (b.contextWindow ?? 0) - (a.contextWindow ?? 0) || a.id.localeCompare(b.id));
}

/** Where a provider lists its models, and how to authenticate. */
export function listEndpoint(input: { provider: string; baseUrl?: string; apiKey?: string }): { url: string; headers: Record<string, string> } {
  if (input.provider === 'anthropic') {
    if (!input.apiKey) throw new DiscoveryError('Enter the API key first.');
    return {
      url: `${(input.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '').replace(/\/v1$/, '')}/v1/models?limit=100`,
      headers: { 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01' },
    };
  }
  if (input.provider === 'gemini') {
    if (!input.apiKey) throw new DiscoveryError('Enter the API key first.');
    return { url: `${(input.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, '')}/models`, headers: { Authorization: `Bearer ${input.apiKey}` } };
  }
  if (!input.baseUrl) throw new DiscoveryError('Enter the base URL first.');
  return { url: `${input.baseUrl.replace(/\/+$/, '')}/models`, headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {} };
}

export async function discoverModels(input: { provider: string; baseUrl?: string; apiKey?: string }, timeoutMs = 15_000): Promise<DiscoveredModel[]> {
  const { url, headers } = listEndpoint(input);
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new DiscoveryError('The base URL is not a valid URL.'); }
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new DiscoveryError(`Could not reach ${parsed.host}: ${error instanceof Error ? error.message : 'connection failed'}. For a server on this machine (Ollama), check that it is running.`);
  }
  if (response.status === 401 || response.status === 403) throw new DiscoveryError('The provider rejected the API key.', response.status);
  if (response.status === 404) throw new DiscoveryError(`${parsed.host} has no model list at ${parsed.pathname}. Check the base URL; most providers end it with /v1.`, 404);
  if (!response.ok) throw new DiscoveryError(`${parsed.host} answered ${response.status}: ${(await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)}`, response.status);
  let body: unknown;
  try { body = await response.json(); } catch { throw new DiscoveryError(`${parsed.host} did not answer with JSON. Check the base URL; most providers end it with /v1.`); }
  return parseModelList(body, isPrivateHost(parsed.host));
}
