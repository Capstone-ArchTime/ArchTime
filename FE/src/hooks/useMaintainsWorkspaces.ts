import { useEffect, useState } from 'react';
import { countManagedProjects } from '@/features/project-data';

/** How long an answer counts as current; every page mounts its own layout, so this keeps navigation to one request. */
const FRESH_MS = 30_000;
/** The last answer per account, so a page that mounts its own layout shows the navigation at once instead of flickering. */
const known = new Map<string, { maintains: boolean; at: number }>();

/** Records whether an account maintains at least one workspace (also used by tests to set the answer up front). */
export function rememberMaintains(userId: string, maintains: boolean, at = Date.now()) {
  known.set(userId, { maintains, at });
}

/**
 * Whether this developer-analyst maintains at least one workspace: undefined until the server first answers. Shows the
 * last known answer straight away and asks the server again once it is older than half a minute, so a workspace created
 * or handed over since then appears soon after. Hiding the pages is presentation only: the server checks every request.
 */
export function useMaintainsWorkspaces(userId: string | undefined, enabled: boolean) {
  const [maintains, setMaintains] = useState(() => (userId ? known.get(userId)?.maintains : undefined));
  useEffect(() => {
    if (!userId || !enabled) return;
    const last = known.get(userId);
    if (last && Date.now() - last.at < FRESH_MS) return;
    const controller = new AbortController();
    countManagedProjects(controller.signal)
      .then(total => { rememberMaintains(userId, total > 0); setMaintains(total > 0); })
      .catch(() => { /* keep the last known answer; the pages report their own load errors */ });
    return () => controller.abort();
  }, [userId, enabled]);
  return userId && enabled ? maintains : false;
}
