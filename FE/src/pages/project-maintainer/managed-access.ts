import { ApiError } from '@/api/client';
import type { ProjectSummary } from '@/features/project-data';

/** What to tell a maintainer whose request failed: a 403 means they no longer maintain that workspace. */
export function describeAccessError(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 403) return 'You do not maintain this workspace (any more). Reload the page to see the workspaces you maintain now.';
  return error instanceof Error && error.message ? error.message : fallback;
}

/** The workspace a page opens first: the one in the link when the account maintains it, else the first it maintains. */
export function pickWorkspace(projects: readonly ProjectSummary[], requested?: string | null) {
  return projects.find(p => p.id === requested)?.id ?? projects[0]?.id ?? '';
}
