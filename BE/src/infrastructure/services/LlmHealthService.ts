import { LlmError } from "../../domain/architecture/llm/types.js";
import type { LlmClient, LlmUsage } from "../../domain/architecture/llm/types.js";
import type { LlmHealthStatus } from "../database/models/LlmModelModel.js";

/** Slower than this and the model is reported as degraded: an architecture request sends far more than the probe. */
const SLOW_MS = 20_000;

export interface HealthResult { status: LlmHealthStatus; latencyMs: number; usage: LlmUsage | null; error?: string; errorKind?: string }

/**
 * Asks the model for a tiny JSON answer. Proves the key, the model name and the network path work, and measures latency.
 * Costs a few dozen tokens.
 */
export async function probeModel(client: LlmClient, timeoutMs = 60_000): Promise<HealthResult> {
  let usage: LlmUsage | null = null;
  const started = Date.now();
  try {
    const text = await client.complete(
      [{ role: "system", content: "Reply with JSON only." }, { role: "user", content: 'Reply with exactly {"ok":true}' }],
      { maxTokens: 2000, signal: AbortSignal.timeout(timeoutMs), onUsage: u => { usage = u; } },
    );
    const latencyMs = Date.now() - started;
    const ok = /"ok"\s*:\s*true/.test(text);
    if (!ok) return { status: "degraded", latencyMs, usage, error: `Unexpected answer: ${text.slice(0, 120)}` };
    return { status: latencyMs > SLOW_MS ? "degraded" : "up", latencyMs, usage, ...(latencyMs > SLOW_MS ? { error: `Slow: ${latencyMs} ms` } : {}) };
  } catch (error) {
    const latencyMs = Date.now() - started;
    if (error instanceof LlmError) {
      // Rate limiting means the model works but is busy; everything else means requests will fail.
      return { status: error.kind === "rate_limit" ? "degraded" : "down", latencyMs, usage, error: error.message.slice(0, 300), errorKind: error.kind };
    }
    return { status: "down", latencyMs, usage, error: (error instanceof Error ? error.message : String(error)).slice(0, 300) };
  }
}
