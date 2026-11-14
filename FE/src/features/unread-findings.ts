import { useEffect, useSyncExternalStore } from 'react';
import { apiRequest } from '../api/client.ts';

// MSG26: conformance findings a maintainer has not looked at yet, across the workspaces they maintain. One shared copy
// for the sidebar badge and the overview notice; refreshed every two minutes, on focus, and after the findings page
// marks a workspace as seen.

export interface UnreadProject { projectId: string; projectName: string; count: number }
export interface Unread { total: number; projects: UnreadProject[] }

export const NO_UNREAD: Unread = { total: 0, projects: [] };
const REFRESH_MS = 120_000;

/** MSG26, worded for the count. */
export function unreadMessage(unread: Unread): string | null {
  if (!unread.total) return null;
  const n = unread.total;
  const where = unread.projects.length === 1 ? ` in ${unread.projects[0].projectName}` : ` in ${unread.projects.length} workspaces`;
  return `You have ${n} new conformance finding${n === 1 ? '' : 's'}${where} to review.`;
}

/** What the server sent, or nothing when it is not the expected shape. */
export function parseUnread(data: unknown): Unread {
  const d = (data && typeof data === 'object' ? data : {}) as { total?: unknown; projects?: unknown };
  const projects = Array.isArray(d.projects)
    ? d.projects.filter((p): p is UnreadProject => !!p && typeof p.projectId === 'string' && typeof p.projectName === 'string' && Number.isInteger(p.count) && p.count > 0)
    : [];
  return { total: projects.reduce((n, p) => n + p.count, 0), projects };
}

let current: Unread = NO_UNREAD;
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;

function publish(next: Unread) {
  if (next.total === current.total && JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  listeners.forEach(listener => listener());
}

/** Asks the server again; a failure keeps what is shown (a badge is not worth an error message). */
export function refreshUnread(): Promise<void> {
  inFlight ??= apiRequest<{ data?: unknown }>('/conformance/unread')
    .then(res => publish(parseUnread(res.data)))
    .catch(() => undefined)
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** The person has looked at this workspace's findings: they are no longer unread. */
export async function markFindingsSeen(projectId: string): Promise<void> {
  await apiRequest(`/projects/${encodeURIComponent(projectId)}/conformance/seen`, { method: 'POST' }).catch(() => undefined);
  await refreshUnread();
}

/** Unread findings, kept fresh while `enabled` (only people who maintain a workspace can have any). */
export function useUnreadFindings(enabled: boolean): Unread {
  useEffect(() => {
    if (!enabled) return;
    void refreshUnread();
    const timer = window.setInterval(() => { void refreshUnread(); }, REFRESH_MS);
    const onFocus = () => { void refreshUnread(); };
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [enabled]);
  const unread = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current, () => NO_UNREAD);
  return enabled ? unread : NO_UNREAD;
}
