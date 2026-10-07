import { MiningJobModel, JobStatus } from "../database/models/MiningJobModel.js";
import { ArchitectureService } from "./ArchitectureService.js";

export interface ArchitectureJobInput {
  id: string;
  projectId: string;
  target?: string;
  requestedBy?: string;
  modelId?: string;
  purpose?: "user" | "benchmark";
  benchmarkId?: string;
  benchmarkModels?: string[];
}

/**
 * Runs an `abstract` job: group a snapshot's files and refine the result with the chosen (else the default) model.
 * Failing to get a usable answer from the model is not a job failure: the clustering result is stored and the receipt says why.
 * A benchmark job asks each listed model in turn and only records the runs.
 */
export async function runArchitectureJob(job: ArchitectureJobInput, isCancelled: () => boolean): Promise<void> {
  const set = (patch: Record<string, unknown>) => MiningJobModel.updateOne({ _id: job.id }, { $set: patch });
  const abort = new AbortController();
  const watcher = setInterval(() => { if (isCancelled()) abort.abort(); }, 1000);
  watcher.unref();
  try {
    await set({ status: JobStatus.RUNNING, startedAt: new Date(), stage: "Preparing", progress: 1 });
    if (job.purpose === "benchmark") return await runBenchmark(job, isCancelled, abort.signal, set);
    const payload = await ArchitectureService.refine(String(job.projectId), job.target || undefined, {
      onProgress: async (stage, progress) => { await set({ stage, progress }); },
      isCancelled,
      signal: abort.signal,
    }, {}, { modelId: job.modelId, userId: job.requestedBy, jobId: job.id, purpose: "user" });
    if (isCancelled()) {
      await set({ status: JobStatus.CANCELLED, stage: "Cancelled - the grouping by dependencies was kept", finishedAt: new Date() });
      return;
    }
    const receipt = payload.mapping?.receipt;
    const tokens = receipt?.usage ? ` · ${receipt.usage.totalTokens.toLocaleString("en-US")} tokens` : "";
    const stage = receipt?.accepted
      ? `Refined by ${receipt.model} (attempt ${receipt.attempts.filter(a => !a.ok).length + 1})${tokens}`
      : `Completed without AI: ${receipt?.fallbackReason ?? "no answer"}`;
    await set({ status: JobStatus.COMPLETED, stage, progress: 100, finishedAt: new Date() });
  } catch (error: any) {
    const message = String(error?.message ?? error).slice(0, 300);
    await set({ status: JobStatus.FAILED, stage: `Failed: ${message}`, error: message, finishedAt: new Date() });
  } finally {
    clearInterval(watcher);
  }
}

async function runBenchmark(job: ArchitectureJobInput, isCancelled: () => boolean, signal: AbortSignal, set: (patch: Record<string, unknown>) => Promise<unknown>) {
  const models = job.benchmarkModels ?? [];
  const results: string[] = [];
  for (let i = 0; i < models.length; i++) {
    if (isCancelled()) break;
    const share = (p: number) => Math.round(((i + p / 100) / models.length) * 98) + 1;
    try {
      const payload = await ArchitectureService.refine(String(job.projectId), job.target || undefined, {
        onProgress: async (stage, progress) => { await set({ stage: `Model ${i + 1} of ${models.length}: ${stage}`, progress: share(progress) }); },
        isCancelled,
        signal,
      }, {}, { modelId: models[i], userId: job.requestedBy, jobId: job.id, purpose: "benchmark", benchmarkId: job.benchmarkId });
      results.push(`${payload.llm.displayName ?? payload.llm.model}: ok`);
    } catch (error: any) {
      // One model failing (removed, misconfigured) must not stop the others.
      results.push(`${models[i]}: ${String(error?.message ?? error).slice(0, 80)}`);
    }
  }
  if (isCancelled()) {
    await set({ status: JobStatus.CANCELLED, stage: `Benchmark cancelled after ${results.length} of ${models.length} models`, finishedAt: new Date() });
    return;
  }
  await set({ status: JobStatus.COMPLETED, stage: `Benchmark finished: ${models.length} models`, progress: 100, finishedAt: new Date() });
}
