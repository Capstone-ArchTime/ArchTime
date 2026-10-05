import { MiningJobModel, JobStatus } from "../database/models/MiningJobModel.js";
import { ArchitectureService } from "./ArchitectureService.js";

/**
 * Runs an `abstract` job: group a snapshot's files and refine the result with the configured model.
 * Failing to get a usable answer from the model is not a job failure: the clustering result is stored and the receipt says why.
 */
export async function runArchitectureJob(job: { id: string; projectId: string; target?: string }, isCancelled: () => boolean): Promise<void> {
  const set = (patch: Record<string, unknown>) => MiningJobModel.updateOne({ _id: job.id }, { $set: patch });
  const abort = new AbortController();
  const watcher = setInterval(() => { if (isCancelled()) abort.abort(); }, 1000);
  watcher.unref();
  try {
    await set({ status: JobStatus.RUNNING, startedAt: new Date(), stage: "Preparing", progress: 1 });
    const payload = await ArchitectureService.refine(String(job.projectId), job.target || undefined, {
      onProgress: async (stage, progress) => { await set({ stage, progress }); },
      isCancelled,
      signal: abort.signal,
    });
    if (isCancelled()) {
      await set({ status: JobStatus.CANCELLED, stage: "Cancelled - the grouping by dependencies was kept", finishedAt: new Date() });
      return;
    }
    const receipt = payload.mapping?.receipt;
    const stage = receipt?.accepted
      ? `Refined by ${receipt.model} (attempt ${receipt.attempts.filter(a => !a.ok).length + 1})`
      : `Completed without AI: ${receipt?.fallbackReason ?? "no answer"}`;
    await set({ status: JobStatus.COMPLETED, stage, progress: 100, finishedAt: new Date() });
  } catch (error: any) {
    const message = String(error?.message ?? error).slice(0, 300);
    await set({ status: JobStatus.FAILED, stage: `Failed: ${message}`, error: message, finishedAt: new Date() });
  } finally {
    clearInterval(watcher);
  }
}
