import mongoose from 'mongoose';
import type { LlmClient } from '../../domain/architecture/llm/types.js';
import type { Pricing } from '../../domain/architecture/llm/metrics.js';
import { LlmModelModel, WITH_SECRET } from '../database/models/LlmModelModel.js';
import type { ILlmModel } from '../database/models/LlmModelModel.js';
import { SystemSettingsModel } from '../database/models/SystemSettingsModel.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/AppError.js';
import { createLlmClient, envClientConfig, getLlmRuntime, refineOptionsFromEnv, runtimeOverride } from './runtime.js';
import type { LlmCapability, LlmRuntime } from './runtime.js';
import { seal, unseal } from './secrets.js';
import { isPrivateHost } from './ClaudeClient.js';

/** A model ready to be asked, with what is needed to account for the run. */
export interface ResolvedModel extends LlmRuntime {
  client: LlmClient;
  modelId: string | null;
  modelKey: string;
  pricing: Pricing | null;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const cache = new Map<string, { stamp: number; client: LlmClient }>();

/** Without a database connection (scripts, unit tests) only the environment's model exists. */
const dbReady = () => mongoose.connection.readyState === 1;

type ModelRow = ILlmModel & { _id: unknown };

function clientFor(row: ModelRow): LlmClient {
  const id = String(row._id);
  const stamp = new Date(row.updatedAt ?? 0).getTime();
  const hit = cache.get(id);
  if (hit && hit.stamp === stamp) return hit.client;
  const client = createLlmClient({
    provider: row.provider, model: row.model, baseUrl: row.baseUrl || undefined,
    apiKey: row.apiKey?.ciphertext ? unseal(row.apiKey) : undefined,
    timeoutMs: row.options?.timeoutMs || DEFAULT_TIMEOUT_MS, effort: row.options?.effort, jsonMode: row.options?.jsonMode,
    temperature: row.options?.temperature, maxTokens: row.options?.maxTokens,
  });
  cache.set(id, { stamp, client });
  return client;
}

function capabilityOf(row: ModelRow, client: LlmClient | null, reason?: string): LlmCapability {
  if (!client) return { enabled: false, provider: row.provider, model: row.model, host: null, external: false, reason, modelId: String(row._id), displayName: row.displayName };
  const { info } = client;
  return { enabled: true, provider: info.provider, model: info.model, host: info.host, external: info.external, modelId: String(row._id), displayName: row.displayName };
}

const pricingOf = (row: ModelRow): Pricing => ({
  inputPerMTok: row.pricing?.inputPerMTok ?? 0, outputPerMTok: row.pricing?.outputPerMTok ?? 0,
  ...(row.pricing?.cacheReadPerMTok !== undefined && row.pricing?.cacheReadPerMTok !== null ? { cacheReadPerMTok: row.pricing.cacheReadPerMTok } : {}),
  currency: row.pricing?.currency || 'USD',
});

function fromEnv(runtime: LlmRuntime): ResolvedModel | null {
  if (!runtime.client) return null;
  return { ...runtime, client: runtime.client, modelId: null, modelKey: `env:${runtime.client.info.model}`, pricing: null };
}

export class LlmModelRegistry {
  /** Drops cached clients so a changed key or URL takes effect on the next request. */
  static invalidate(id?: string) { if (id) cache.delete(id); else cache.clear(); }

  /** The administrator's default: the model named in settings, else the one flagged default. */
  static async defaultRow(): Promise<ModelRow | null> {
    if (!dbReady()) return null;
    const settings = await SystemSettingsModel.findOne().lean();
    const named = settings?.defaultModelId ? await LlmModelModel.findOne({ _id: settings.defaultModelId, enabled: true }).select(WITH_SECRET).lean() : null;
    return (named ?? await LlmModelModel.findOne({ isDefault: true, enabled: true }).select(WITH_SECRET).lean()) as ModelRow | null;
  }

  /**
   * The model to use for a request. With no id: the administrator's default, else the environment's model.
   * `forUser` also requires the model to be offered to users (administrators can benchmark hidden models).
   */
  static async resolve(modelId?: string | null, { forUser = false } = {}): Promise<ResolvedModel> {
    const options = refineOptionsFromEnv();
    if (modelId) {
      if (!dbReady() || !mongoose.isValidObjectId(modelId)) throw new NotFoundError('Model not found');
      const row = await LlmModelModel.findById(modelId).select(WITH_SECRET).lean() as ModelRow | null;
      if (!row) throw new NotFoundError('Model not found');
      if (!row.enabled) throw new BadRequestError(`The model "${row.displayName}" is turned off.`);
      if (forUser && !row.visibleToUsers) throw new BadRequestError(`The model "${row.displayName}" is not available to users.`);
      return this.fromRow(row, options);
    }
    const override = runtimeOverride();
    if (override) { const r = fromEnv(override); if (r) return r; throw new BadRequestError(override.capability.reason ?? 'AI refinement is not configured on this server'); }
    const row = await this.defaultRow();
    if (row) return this.fromRow(row, options);
    const env = getLlmRuntime();
    const resolved = fromEnv(env);
    if (!resolved) throw new BadRequestError(env.capability.reason ?? 'AI refinement is not configured on this server');
    return resolved;
  }

  private static fromRow(row: ModelRow, options: LlmRuntime['options']): ResolvedModel {
    let client: LlmClient;
    try { client = clientFor(row); } catch (error) { throw new BadRequestError(`The model "${row.displayName}" is misconfigured: ${error instanceof Error ? error.message : 'unknown error'}`); }
    const limit = row.options?.maxRequestTokens;
    return { client, options: { ...options, ...(limit ? { maxRequestTokens: limit } : {}) }, capability: capabilityOf(row, client), modelId: String(row._id), modelKey: row.key, pricing: pricingOf(row) };
  }

  /** What the default model can do, for the architecture page. Never throws. */
  static async capability(): Promise<LlmCapability> {
    try {
      const override = runtimeOverride();
      if (override) return override.capability;
      const row = await this.defaultRow();
      if (row) {
        try { return capabilityOf(row, clientFor(row)); } catch (error) { return capabilityOf(row, null, error instanceof Error ? error.message : 'Misconfigured'); }
      }
    } catch { /* fall back to the environment */ }
    return getLlmRuntime().capability;
  }

  /** Where a model's prompts go, worked out from its configuration without decrypting its key. */
  static describe(row: Pick<ILlmModel, 'provider' | 'baseUrl'>): { host: string; external: boolean } {
    const fallback = row.provider === 'anthropic' ? 'https://api.anthropic.com' : row.provider === 'gemini' ? 'https://generativelanguage.googleapis.com' : '';
    let host = '';
    try { host = new URL(row.baseUrl || fallback).host; } catch { host = row.baseUrl || ''; }
    return { host, external: host ? !isPrivateHost(host) : false };
  }

  /** Builds a client for a model that is not saved yet, or saved and possibly disabled (the administrator's "Test" button). */
  static clientForRow(row: ModelRow): LlmClient { return clientFor(row); }

  /**
   * On first start with an empty registry, records the model configured in the environment as the default so it can be
   * managed (and priced) from the admin pages. The key is stored encrypted; the environment keeps working as a fallback.
   */
  static async seedFromEnv(): Promise<void> {
    if (!dbReady() || await LlmModelModel.estimatedDocumentCount() > 0) return;
    const config = envClientConfig();
    if ('error' in config) return;
    const model = config.model ?? 'model';
    try {
      await LlmModelModel.create({
        key: `${config.provider}-${model}`.toLowerCase().replace(/[^a-z0-9.]+/g, '-'),
        displayName: `${model} (from server config)`,
        provider: config.provider, model, baseUrl: config.baseUrl,
        apiKey: config.apiKey ? seal(config.apiKey) : null,
        options: { effort: config.effort, jsonMode: config.jsonMode, temperature: config.temperature, maxTokens: config.maxTokens, timeoutMs: config.timeoutMs },
        enabled: true, visibleToUsers: true, isDefault: true,
      });
      console.log(`[llm] Registered the configured model ${model} as the default. Set its price under System Administrator > AI Models.`);
    } catch (error) {
      console.warn('[llm] Could not register the configured model:', error instanceof Error ? error.message : error);
    }
  }
}
