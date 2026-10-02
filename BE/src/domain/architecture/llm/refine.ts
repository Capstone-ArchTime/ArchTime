import { layerForRole } from '../naming.js';
import type { MappingComponent } from '../buildView.js';
import { answerSchema, buildMessages, parseJsonAnswer, retryMessages } from './prompt.js';
import type { PromptInput } from './prompt.js';
import { DEFAULT_REFINE_OPTIONS, LlmError } from './types.js';
import type { LlmClient, LlmMessage, RefineAttempt, RefineIssue, RefineOptions, RefineReceipt } from './types.js';
import { verifyNaming, verifyRefine } from './verify.js';

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
  const mode: PromptInput['mode'] = files.length <= options.maxRefineFiles ? 'refine' : 'name-only';
  // In name-only mode buildMessages sends just a few representative paths per cluster, never the whole list.
  const prompt: PromptInput = {
    mode, files, importance: fanIn, options,
    clusters: initial.map((c, ci) => ({ id: `c${ci}`, files: c.memberIds.flatMap(f => (index.has(f) ? [index.get(f)!] : [])) })),
    edges: mode === 'refine' ? edges : [],
  };
  const receipt: RefineReceipt = {
    mode, provider: client.info.provider, model: client.info.model, external: client.info.external,
    filesSent: mode === 'refine' ? files.length : initial.reduce((n, c) => n + Math.min(25, c.memberIds.length), 0),
    attempts: [], accepted: false,
  };
  const fallback = (reason: string): RefineResult => {
    receipt.fallbackReason = reason;
    return { components: initial, generator: 'cluster-only', receipt };
  };

  const schema = answerSchema(mode);
  let messages: LlmMessage[] = buildMessages(prompt);
  const total = options.maxAttempts;

  for (let n = 1; n <= total; n++) {
    if (input.isCancelled?.()) return fallback('cancelled');
    await input.onProgress?.(n === 1 ? 'Asking the model' : `Asking the model again (attempt ${n} of ${total})`, Math.round(15 + ((n - 1) / total) * 70));
    const attempt: RefineAttempt = { n, ok: false, issues: [] };
    receipt.attempts.push(attempt);

    let answer = '';
    try {
      answer = await client.complete(messages, { schema, signal: input.signal });
      const raw = parseJsonAnswer(answer);
      await input.onProgress?.('Checking the answer', Math.round(15 + (n / total) * 70) - 5);

      if (mode === 'refine') {
        const checked = verifyRefine(raw, { fileCount: files.length, initialCluster, options });
        receipt.movedRatio = checked.movedRatio;
        if (!checked.ok || !checked.value) throw new VerificationFailed(checked.issues);
        const ids = uniqueIds(checked.value.map(c => c.name));
        const components = checked.value.map((c, i): MappingComponent => ({
          id: ids[i], name: c.name.trim(), role: c.role, label: c.role === 'other' ? 'UNKNOWN' : 'INFERENCE', description: c.description.trim(),
          ...(c.role !== 'other' && layerForRole(c.role) !== undefined ? { layer: layerForRole(c.role) } : {}),
          memberIds: [...new Set(c.files)].sort((a, b) => a - b).map(f => files[f]),
        }));
        attempt.ok = true; receipt.accepted = true;
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
      attempt.ok = true; receipt.accepted = true;
      return { components, generator: 'cluster+llm', receipt };
    } catch (error) {
      attempt.issues = error instanceof VerificationFailed ? error.issues : [describe(error)];
      if (error instanceof LlmError && error.fatal) return fallback(`${error.kind}: ${error.message}`);
      if (error instanceof VerificationFailed || (!(error instanceof LlmError))) {
        messages = retryMessages(buildMessages(prompt), answer || '(no usable answer)', attempt.issues);
      }
    }
  }
  const last = receipt.attempts[receipt.attempts.length - 1];
  return fallback(`Verification failed after ${total} attempts: ${last.issues.slice(0, 3).map(i => i.code).join(', ') || 'no usable answer'}`);
}
