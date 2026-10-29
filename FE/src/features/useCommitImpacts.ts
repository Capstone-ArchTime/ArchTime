import { useCallback, useEffect, useState } from 'react';
import { getCommitImpacts } from './evidence-bridge';
import type { CommitImpacts } from './evidence-bridge';

export const COMMITS_LIMIT = 20;
export type CommitImpactsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; impacts: CommitImpacts };

/**
 * The recent commits that changed the components of one viewed snapshot, fetched lazily and once: nothing is requested
 * until `wanted` is true for the first time, the answer is kept per workspace, snapshot and grouping (`version`, so a new
 * grouping asks again), and selecting other components never asks again. A request in flight is aborted when the
 * snapshot changes or the page goes away. A failure is not kept: `retry` asks again.
 */
export function useCommitImpacts(projectId: string | undefined, snapshotId: string | undefined, wanted: boolean, version = ''): CommitImpactsState & { retry: () => void } {
  const key = projectId && snapshotId ? `${projectId}:${snapshotId}:${version}` : '';
  const [cache] = useState(() => new Map<string, CommitImpacts>());
  const [latched, setLatched] = useState('');
  const [fetched, setFetched] = useState<{ key: string; state: CommitImpactsState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  // Once a snapshot's list was wanted it stays wanted, so deselecting a component does not abort the request half way.
  if (key && wanted && latched !== key) setLatched(key);
  const active = !!key && latched === key;

  useEffect(() => {
    if (!active || !projectId || cache.has(key)) return;
    const controller = new AbortController();
    const at = `${key}#${attempt}`;
    getCommitImpacts(projectId, snapshotId, COMMITS_LIMIT, controller.signal)
      .then(impacts => { cache.set(key, impacts); if (!controller.signal.aborted) setFetched({ key: at, state: { status: 'done', impacts } }); })
      .catch(cause => { if (!controller.signal.aborted) setFetched({ key: at, state: { status: 'error', message: cause instanceof Error ? cause.message : 'Could not load the commits.' } }); });
    return () => controller.abort();
  }, [active, cache, key, projectId, snapshotId, attempt]);

  const kept = key ? cache.get(key) : undefined;
  const state: CommitImpactsState = kept ? { status: 'done', impacts: kept } : fetched?.key === `${key}#${attempt}` ? fetched.state : { status: active ? 'loading' : 'idle' };
  return { ...state, retry };
}
