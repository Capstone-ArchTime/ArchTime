import type { LlmRun, UsageRow } from './llm-api';

/** What a run was, when it was not an ordinary architecture drawing; shown under the model's name. */
export function runKindNote(mode: LlmRun['mode']): string {
  if (mode === 'chat') return 'AI Insights chat';
  if (mode === 'name-only') return 'names only';
  return '';
}

/** The outcome word for a run. "Accepted" is the architecture validator's word; a question that got an answer was answered. */
export function resultLabel(run: Pick<LlmRun, 'mode' | 'status'>, labels: Record<LlmRun['status'], string>): string {
  return run.mode === 'chat' && run.status === 'accepted' ? 'Answered' : labels[run.status];
}

/** Only runs that drew an architecture are scored; a chat run (or an old row) has no quality to show. */
export function hasQuality(run: Pick<LlmRun, 'quality'>): run is Pick<LlmRun, 'quality'> & { quality: NonNullable<LlmRun['quality']> } {
  return typeof run.quality?.score === 'number';
}

/**
 * Architecture drawings only. A usage row also counts every question asked in AI Insights, which belongs in the totals of
 * runs, tokens and cost but says nothing about how often drawing succeeds. successRate is null when nothing was drawn.
 */
export function drawingStats(row: Pick<UsageRow, 'runs' | 'accepted' | 'chatRuns' | 'chatAccepted'>): { runs: number; accepted: number; successRate: number | null } {
  const runs = Math.max(0, row.runs - (row.chatRuns ?? 0));
  const accepted = Math.max(0, row.accepted - (row.chatAccepted ?? 0));
  return { runs, accepted, successRate: runs > 0 ? accepted / runs : null };
}
