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

export type MissingRange = { from: string; to: string; commits: number };
export type CoverageSummary =
  | { kind: 'complete' }
  | { kind: 'empty' }
  | { kind: 'unknown'; mined: number }
  | { kind: 'partial'; mined: number; total: number; firstDate: string | null; lastDate: string | null; missing: MissingRange[] };

/** Contiguous runs of months that still contain unmined commits. */
export function missingRanges(rows: MonthRow[]): MissingRange[] {
  const out: MissingRange[] = [];
  let open: MissingRange | null = null;
  let previous = '';
  for (const row of rows) {
    const gap = row.total - row.mined;
    if (gap <= 0) { open = null; previous = row.month; continue; }
    if (open && nextMonth(previous) === row.month) { open.to = row.month; open.commits += gap; }
    else { open = { from: row.month, to: row.month, commits: gap }; out.push(open); }
    previous = row.month;
  }
  return out;
}

function nextMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`;
}

type OverviewLike = {
  history: { totalCommits: number; monthly: MonthCount[] } | null;
  mined: { count: number; firstDate: string | null; lastDate: string | null; monthly: MonthCount[] };
  remaining: number | null;
};

export function summarizeCoverage(overview: OverviewLike): CoverageSummary {
  const { history, mined } = overview;
  if (mined.count === 0) return { kind: 'empty' };
  if (!history || overview.remaining === null) return { kind: 'unknown', mined: mined.count };
  if (overview.remaining <= 0) return { kind: 'complete' };
  return {
    kind: 'partial', mined: mined.count, total: history.totalCommits, firstDate: mined.firstDate, lastDate: mined.lastDate,
    missing: missingRanges(coverageRows(history.monthly, mined.monthly)),
  };
}

/**
 * Upper bound on unmined commits between two dates. Whole months are counted, so the months containing
 * either date may include commits outside the span, which is why callers should say "up to".
 */
export function unminedBetween(rows: MonthRow[], fromIso: string, toIso: string): number {
  const a = fromIso.slice(0, 7);
  const b = toIso.slice(0, 7);
  const [from, to] = a <= b ? [a, b] : [b, a];
  return rows.filter(r => r.month >= from && r.month <= to).reduce((sum, r) => sum + Math.max(0, r.total - r.mined), 0);
}

export function formatMissing(missing: MissingRange[], max = 3): string {
  if (!missing.length) return '';
  const label = (m: MissingRange) => `${m.from === m.to ? m.from : `${m.from} to ${m.to}`} (${m.commits})`;
  const shown = missing.slice(0, max).map(label).join(', ');
  return missing.length > max ? `${shown} and ${missing.length - max} more` : shown;
}
