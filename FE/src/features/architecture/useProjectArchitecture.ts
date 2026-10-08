import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { generateArchitecture, getArchitecture, getSnapshotSummaries, refineArchitecture } from './api';
import type { ArchitecturePayload, SnapshotSummary } from './api';
import { serializeHash } from './url-state';
import type { ViewerState } from './url-state';
import { getMiningOverview } from '@/features/mining-api';
import { getUserModels, selectedModel } from '@/features/llm-api';
import type { UserModels } from '@/features/llm-api';

/** The viewer state lives in the URL hash, so a view can be shared and the back button works. */
export function useHash() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);
  const commit = useCallback((state: ViewerState, push = false) => {
    const next = serializeHash(state);
    const url = `${window.location.pathname}${window.location.search}${next}`;
    if (push) window.history.pushState(null, '', url); else window.history.replaceState(null, '', url);
    setHash(next);
  }, []);
  return [hash, commit] as const;
}

export type Load = { key: string; status: 'loading' } | { key: string; status: 'error'; message: string } | { key: string; status: 'done'; payload: ArchitecturePayload };

/**
 * One project's architecture for one snapshot (the latest when none is given): loading, snapshots, the models the user
 * may pick, grouping, AI refinement as a background job, and reloading when that job ends.
 */
export function useProjectArchitecture(projectId: string | undefined, snapshotParam: string | undefined) {
  const { message, modal } = App.useApp();
  const [snapshots, setSnapshots] = useState<{ projectId: string; rows: SnapshotSummary[] } | null>(null);
  const [load, setLoad] = useState<Load | null>(null);
  const [reloads, setReloads] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState<{ stage: string; progress: number } | null>(null);
  const [models, setModels] = useState<UserModels | null>(null);
  const [modelChoice, setModelChoice] = useState<string | undefined>();
  const request = useRef(0);
  const reload = useCallback(() => setReloads(v => v + 1), []);

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    getSnapshotSummaries(projectId, controller.signal).then(rows => setSnapshots({ projectId, rows })).catch(() => { if (!controller.signal.aborted) setSnapshots({ projectId, rows: [] }); });
    return () => controller.abort();
  }, [projectId, reloads]);

  // The models the user may pick, with estimates for this snapshot's size. Optional: the default model works without it.
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    getUserModels(projectId, snapshotParam, controller.signal).then(setModels).catch(() => { if (!controller.signal.aborted) setModels(null); });
    return () => controller.abort();
  }, [projectId, snapshotParam, reloads]);

  const key = projectId ? `${projectId}:${snapshotParam ?? 'latest'}:${reloads}` : '';
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    const mine = ++request.current;
    getArchitecture(projectId, snapshotParam, controller.signal)
      .then(payload => { if (!controller.signal.aborted && mine === request.current) setLoad({ key, status: 'done', payload }); })
      .catch(cause => { if (!controller.signal.aborted && mine === request.current) setLoad({ key, status: 'error', message: cause instanceof Error ? cause.message : 'Could not load the architecture.' }); });
    return () => controller.abort();
  }, [projectId, snapshotParam, key]);

  // While an AI refinement runs in the background, follow its progress and reload when it ends.
  const polling = refining !== null;
  useEffect(() => {
    if (!projectId || !polling) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      getMiningOverview(projectId, controller.signal).then(overview => {
        const job = overview.activeJob;
        if (job) { setRefining({ stage: job.stage || 'Working', progress: job.progress }); return; }
        setRefining(null);
        setReloads(v => v + 1);
        message[overview.lastJob?.status === 'failed' ? 'error' : 'success'](overview.lastJob?.stage || 'The refinement finished.');
      }).catch(() => { /* keep polling; a transient error should not end the wait */ });
    }, 1500);
    return () => { controller.abort(); clearInterval(timer); };
  }, [projectId, polling, message]);

  // The result only counts while it belongs to the current selection; anything else is still loading.
  const current: Load | null = projectId ? (load && load.key === key ? load : { key, status: 'loading' }) : null;
  const payload = current?.status === 'done' ? current.payload : null;

  async function startRefine() {
    if (!projectId || !payload) return;
    try {
      await refineArchitecture(projectId, payload.snapshot?.id ?? snapshotParam, models?.allowUserModelChoice ? modelChoice : undefined);
      setRefining({ stage: 'Queued', progress: 0 });
    } catch (cause) { message.error(cause instanceof Error ? cause.message : 'Could not start the refinement.'); }
  }

  /** What a refinement would use and where its prompts would go. */
  function target() {
    const llm = payload?.llm;
    const chosen = selectedModel(models, modelChoice);
    return chosen ? { host: chosen.host, model: chosen.displayName, external: chosen.external, estimate: chosen.estimate }
      : { host: llm?.host ?? null, model: llm?.displayName ?? llm?.model ?? null, external: !!llm?.external, estimate: null };
  }

  function refine() {
    if (!payload?.llm?.enabled) return;
    const t = target();
    if (!t.external) { void startRefine(); return; }
    const estimate = t.estimate ? ` Expected use: about ${t.estimate.tokens.toLocaleString('en-US')} tokens.` : '';
    modal.confirm({
      title: 'Send file paths to an external AI service?',
      content: `ArchTime will send this snapshot's file paths and which files import which to ${t.host} (model ${t.model}). It never sends source code, commit messages, or access tokens. The answer is checked before it is used, and the dependency-based result is kept if it fails.${estimate}`,
      okText: 'Send and refine', cancelText: 'Cancel',
      onOk: () => startRefine(),
    });
  }

  async function generate() {
    if (!projectId) return;
    setGenerating(true);
    try {
      const next = await generateArchitecture(projectId, snapshotParam ?? payload?.snapshot?.id);
      setLoad({ key, status: 'done', payload: next });
      message.success('Components generated.');
    } catch (cause) { message.error(cause instanceof Error ? cause.message : 'Generating the components failed.'); }
    finally { setGenerating(false); }
  }

  return {
    current, payload, reload,
    snapshots: snapshots && snapshots.projectId === projectId ? snapshots.rows : [],
    models, modelChoice, setModelChoice, target,
    refining, refine, generating, generate,
  };
}
