export type MonthCount = { month: string; commits: number };
export type MonthRow = { month: string; total: number; mined: number };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** One row per month with the repository's commit count and how many of them are already mined. */
export function coverageRows(history: MonthCount[], mined: MonthCount[]): MonthRow[] {
  const minedBy = new Map(mined.filter(m => MONTH.test(m.month)).map(m => [m.month, m.commits]));
  const rows = new Map<string, MonthRow>();
  for (const { month, commits } of history) {
    if (MONTH.test(month)) rows.set(month, { month, total: commits, mined: Math.min(commits, minedBy.get(month) ?? 0) });
  }
  // Snapshots from before the history scan still count, so they are shown rather than dropped.
  for (const [month, count] of minedBy) if (!rows.has(month)) rows.set(month, { month, total: count, mined: count });
  return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** First and last day (YYYY-MM-DD) covered by a YYYY-MM month. */
export function monthBounds(month: string): { since: string; until: string } {
  if (!MONTH.test(month)) throw new Error('Invalid month');
  const [year, mon] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { since: `${month}-01`, until: `${month}-${String(lastDay).padStart(2, '0')}` };
}

export function describeBatchProgress(job: { processed: number; total: number; batchIndex: number; batchCount: number }): string {
  if (!job.total) return 'Preparing';
  return `Batch ${Math.min(job.batchIndex || 1, job.batchCount)}/${job.batchCount} · ${job.processed}/${job.total} commits`;
}
