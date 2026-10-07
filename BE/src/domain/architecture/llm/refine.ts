import { layerForRole } from '../naming.js';
import type { MappingComponent } from '../buildView.js';
import { answerSchema, buildMessages, parseJsonAnswer, retryMessages } from './prompt.js';
import type { PromptInput } from './prompt.js';
import { DEFAULT_REFINE_OPTIONS, estimateTokens, LlmError, MAX_RATE_LIMIT_WAITS, MAX_WAIT_MS, sumUsage } from './types.js';
import type { LlmClient, LlmMessage, LlmUsage, RefineAttempt, RefineIssue, RefineOptions, RefineReceipt } from './types.js';
import { expandDelta, verifyNaming, verifyRefine } from './verify.js';

export interface RefineInput {
  /** Analyzable files and the dependencies between them (see fileDependencies). */
  files: string[];
  edges: { source: string; target: string }[];
  /** The deterministic grouping to start from, and to fall back to. */
  initial: MappingComponent[];
  client: LlmClient;
  options?: Partial<RefineOptions>;
  onProgress?: (stage: string, progress: number) => void | Promise<void>;
  isCancelled?: () => boolean;
  signal?: AbortSignal;
  /** Where to report why an attempt failed, for the server log. */
  log?: (message: string) => void;
}

export interface RefineResult {
  components: MappingComponent[];
  generator: 'cluster+llm' | 'cluster-only';
  receipt: RefineReceipt;
}

class VerificationFailed extends Error {
  constructor(readonly issues: RefineIssue[]) { super(issues.map(i => i.code).join(',')); }
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'component';

function uniqueIds(names: string[]): string[] {
  const used = new Set<string>();
  return names.map(name => {
    let id = slug(name), n = 2;
    while (used.has(id)) id = `${slug(name)}-${n++}`;
    used.add(id);
    return id;
  });
}

const describe = (error: unknown): RefineIssue => {
  if (error instanceof LlmError) return { code: 'M000', message: `${error.kind}: ${error.message}` };
  return { code: 'M001', message: error instanceof Error ? error.message : 'The answer could not be read.' };
};

/**
 * Asks the model to name, and where the repository is small enough to regroup, the components found by clustering.
 * Whatever it answers is verified before use; after `maxAttempts` failures the clustering result is returned unchanged.
 * Sends file paths and import relations only.
 */
export async function refineMapping(input: RefineInput): Promise<RefineResult> {
  const options: RefineOptions = { ...DEFAULT_REFINE_OPTIONS, ...input.options };
  const { client, initial } = input;
  const files = input.files;
  const index = new Map(files.map((f, i) => [f, i]));
  const initialCluster = new Array<number>(files.length).fill(-1);
  initial.forEach((c, ci) => c.memberIds.forEach(f => { const i = index.get(f); if (i !== undefined) initialCluster[i] = ci; }));
  const fanIn = new Array<number>(files.length).fill(0);
  const edges: [number, number][] = [];
  for (const e of input.edges) {
    const a = index.get(e.source), b = index.get(e.target);
    if (a === undefined || b === undefined) continue;
    edges.push([a, b]);
    fanIn[b]++;
  }
  const clusters = initial.map((c, ci) => ({ id: `c${ci}`, files: c.memberIds.flatMap(f => (index.has(f) ? [index.get(f)!] : [])) }));
  // In name-only mode buildMessages sends just a few representative paths per cluster, never the whole list.
  const promptFor = (m: PromptInput['mode']): PromptInput => ({ mode: m, files, importance: fanIn, options, clusters, edges: m === 'refine' ? edges : [] });
  const filesSentFor = (m: PromptInput['mode']) => (m === 'refine' ? files.length : initial.reduce((n, c) => n + Math.min(25, c.memberIds.length), 0));
  /** What an answer needs: names for every cluster, and in refine mode the moves (capped by maxMoveRatio). */
  const expectedOutput = (m: PromptInput['mode']) => 300 + 80 * clusters.length + (m === 'refine' ? 15 * Math.floor(options.maxMoveRatio * files.length) : 0);
  const textOf = (ms: LlmMessage[]) => ms.map(x => x.content).join('\n');

  let mode: PromptInput['mode'] = files.length <= options.maxRefineFiles ? 'refine' : 'name-only';
  let narrowed: string | undefined;
  // A prompt that cannot fit the model's request limit together with its answer goes out in name-only mode straight away.
  if (mode === 'refine' && options.maxRequestTokens) {
    const need = estimateTokens(textOf(buildMessages(promptFor('refine')))) + expectedOutput('refine');
    if (need > options.maxRequestTokens) { mode = 'name-only'; narrowed = `about ${need} tokens needed, the model takes ${options.maxRequestTokens} per request`; }
  }
  let prompt = promptFor(mode);
  const receipt: RefineReceipt = {
    mode, ...(mode === 'refine' ? { format: 'delta' as const } : {}), ...(narrowed ? { narrowed } : {}),
    provider: client.info.provider, model: client.info.model, external: client.info.external,
    filesSent: filesSentFor(mode), attempts: [], accepted: false,
  };
  const finish = () => {
    const notes = client.notes?.() ?? [];
    if (notes.length) receipt.notes = notes;
    receipt.usage = sumUsage(receipt.attempts);
    receipt.latencyMs = receipt.attempts.reduce((s, a) => s + (a.latencyMs ?? 0), 0);
  };
  const fallback = (reason: string): RefineResult => {
    receipt.fallbackReason = reason;
    finish();
    return { components: initial, generator: 'cluster-only', receipt };
  };
  const narrow = (why: string) => {
    mode = 'name-only'; narrowed = why; prompt = promptFor(mode);
    receipt.mode = mode; receipt.narrowed = why; receipt.filesSent = filesSentFor(mode); delete receipt.format; delete receipt.movedRatio;
    schema = answerSchema(mode); messages = buildMessages(prompt);
  };
  /** Answer budget: only sized when the model has a request limit; otherwise the client's own default stands. */
  const answerBudget = (ms: LlmMessage[]) => {
    if (!options.maxRequestTokens) return undefined;
    const room = options.maxRequestTokens - estimateTokens(textOf(ms));
    return Math.max(1000, Math.min(room, Math.max(2000, 2 * expectedOutput(mode))));
  };
  const sleep = async (ms: number) => {
    for (let left = ms; left > 0 && !input.isCancelled?.() && !input.signal?.aborted; left -= 1000) await new Promise(r => setTimeout(r, Math.min(1000, left)));
  };

  let schema = answerSchema(mode);
  let messages: LlmMessage[] = buildMessages(prompt);
  const total = options.maxAttempts;
  let waits = 0;

  for (let n = 1; n <= total; n++) {
    if (input.isCancelled?.()) return fallback('cancelled');
    await input.onProgress?.(n === 1 ? 'Asking the model' : `Asking the model again (attempt ${n} of ${total})`, Math.round(15 + ((n - 1) / total) * 70));
    const attempt: RefineAttempt = { n, ok: false, issues: [] };
    receipt.attempts.push(attempt);

    let answer = '';
    const started = Date.now();
    // A client may send more than one request per call (it retries without an option the server rejected); all of them count.
    const onUsage = (u: LlmUsage) => {
      const prev = attempt.usage;
      attempt.usage = prev ? {
        inputTokens: prev.inputTokens + u.inputTokens, outputTokens: prev.outputTokens + u.outputTokens,
        cacheReadTokens: (prev.cacheReadTokens ?? 0) + (u.cacheReadTokens ?? 0), reasoningTokens: (prev.reasoningTokens ?? 0) + (u.reasoningTokens ?? 0),
        estimated: prev.estimated || u.estimated,
      } : u;
    };
    try {
      try {
        const maxTokens = answerBudget(messages);
        answer = await client.complete(messages, { schema, signal: input.signal, onUsage, ...(maxTokens ? { maxTokens } : {}) });
      } finally {
        attempt.latencyMs = Date.now() - started;
      }
      const raw = parseJsonAnswer(answer);
      await input.onProgress?.('Checking the answer', Math.round(15 + (n / total) * 70) - 5);

      if (mode === 'refine') {
        const expanded = expandDelta(raw, { fileCount: files.length, clusters: prompt.clusters });
        if (!expanded.ok || !expanded.value) throw new VerificationFailed(expanded.issues);
        const checked = verifyRefine(expanded.value, { fileCount: files.length, initialCluster, options });
        receipt.movedRatio = checked.movedRatio;
        if (!checked.ok || !checked.value) throw new VerificationFailed(checked.issues);
        const ids = uniqueIds(checked.value.map(c => c.name));
        const components = checked.value.map((c, i): MappingComponent => ({
          id: ids[i], name: c.name.trim(), role: c.role, label: c.role === 'other' ? 'UNKNOWN' : 'INFERENCE', description: c.description.trim(),
          ...(c.role !== 'other' && layerForRole(c.role) !== undefined ? { layer: layerForRole(c.role) } : {}),
          memberIds: [...new Set(c.files)].sort((a, b) => a - b).map(f => files[f]),
        }));
        attempt.ok = true; receipt.accepted = true; finish();
        return { components, generator: 'cluster+llm', receipt };
      }

      const checked = verifyNaming(raw, { clusterIds: prompt.clusters.map(c => c.id) });
      if (!checked.ok || !checked.value) throw new VerificationFailed(checked.issues);
      const byCluster = new Map(checked.value.map(c => [c.cluster, c]));
      const ids = uniqueIds(prompt.clusters.map(c => byCluster.get(c.id)!.name));
      const components = initial.map((c, ci): MappingComponent => {
        const named = byCluster.get(`c${ci}`)!;
        const layer = named.role !== 'other' ? layerForRole(named.role) : undefined;
        const { layer: _previous, ...rest } = c;
        return {
          ...rest, id: ids[ci], name: named.name.trim(), role: named.role, label: named.role === 'other' ? 'UNKNOWN' : 'INFERENCE',
          description: named.description.trim(), ...(layer === undefined ? {} : { layer }),
        };
      });
      attempt.ok = true; receipt.accepted = true; finish();
      return { components, generator: 'cluster+llm', receipt };
    } catch (error) {
      attempt.issues = error instanceof VerificationFailed ? error.issues : [describe(error)];
      if (error instanceof LlmError) attempt.errorKind = error.kind;
      input.log?.(`attempt ${n}/${total} failed: ${attempt.issues.slice(0, 3).map(i => `${i.code} ${i.message}`).join(' | ')}`);
      // A busy provider is waited for, as long as it asks, instead of being asked again at once; the wait is not an attempt.
      if (error instanceof LlmError && error.kind === 'rate_limit' && waits < MAX_RATE_LIMIT_WAITS) {
        waits++;
        const ms = Math.min(MAX_WAIT_MS, error.retryAfterMs ?? 20_000);
        attempt.waitedMs = ms;
        await input.onProgress?.(`The provider is rate limiting; waiting ${Math.ceil(ms / 1000)} s`, Math.round(15 + ((n - 1) / total) * 70));
        await sleep(ms);
        n--;
        continue;
      }
      // Too big for the model (request limit, context, or the answer did not fit): ask for names only, once.
      if (error instanceof LlmError && (error.kind === 'too_large' || error.kind === 'truncated') && mode === 'refine') {
        narrow(error.kind === 'too_large' ? `the provider said the request was too large (${error.message.slice(0, 120)})` : 'the answer did not fit the output budget');
        n--;
        continue;
      }
      if (error instanceof LlmError && error.fatal) return fallback(`${error.kind}: ${error.message}`);
      if (error instanceof VerificationFailed || (!(error instanceof LlmError))) {
        messages = retryMessages(buildMessages(prompt), answer || '(no usable answer)', attempt.issues);
      } else {
        messages = buildMessages(prompt);
      }
    }
  }
  const last = receipt.attempts[receipt.attempts.length - 1];
  const providerFailure = last.issues.find(i => i.code === 'M000');
  return fallback(providerFailure
    ? `The AI provider failed on every attempt: ${providerFailure.message}`
    : `Verification failed after ${total} attempts: ${last.issues.slice(0, 3).map(i => i.code).join(', ') || 'no usable answer'}`);
}
