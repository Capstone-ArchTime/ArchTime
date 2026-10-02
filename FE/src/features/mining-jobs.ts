export type MiningJob = { id: string; project: string; requestedBy: string; status: string; stage: string; progress: number; createdAt: string; error?: string; kind: string; total: number; processed: number; batchIndex: number; batchCount: number };
export function parseMiningJobs(value: unknown): MiningJob[] {
  const body = value as { data?: { jobs?: Record<string, unknown>[] } };
  if (!Array.isArray(body?.data?.jobs)) throw new Error('The server returned an invalid jobs list.');
  return body.data.jobs.map(job => {
    if (!job || typeof (job.id ?? job._id) !== 'string' || typeof job.status !== 'string') throw new Error('The server returned an invalid job.');
    const project = job.projectId as { name?: unknown } | null;
    const requester = job.requestedBy as { name?: unknown } | null;
    return { id: String(job.id ?? job._id), project: typeof project?.name === 'string' ? project.name : 'Unknown project', requestedBy: typeof requester?.name === 'string' ? requester.name : typeof job.requestedBy === 'string' ? job.requestedBy : 'Not provided', status: job.status, stage: typeof job.stage === 'string' ? job.stage : 'Not provided', progress: typeof job.progress === 'number' && Number.isFinite(job.progress) ? Math.min(100, Math.max(0, job.progress)) : 0, createdAt: typeof job.createdAt === 'string' && Number.isFinite(Date.parse(job.createdAt)) ? job.createdAt : '', error: typeof job.error === 'string' ? job.error : undefined, kind: typeof job.kind === 'string' ? job.kind : 'mine', ...counts(job) };
  });
}
function counts(job: Record<string, unknown>) {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return { total: n(job.total), processed: n(job.processed), batchIndex: n(job.batchIndex), batchCount: n(job.batchCount) };
}
