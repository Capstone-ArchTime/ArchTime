import { useState, useEffect, useCallback, useRef } from 'react';
import { App } from 'antd';
import { getProjects } from '@/features/project-data';
import { emptyWorkspace, fetchServerWorkspace, isRevisionConflict, isServerProjectId, saveServerWorkspace } from '@/features/workspace-sync';
import type { Workspace } from '@/features/workspace-sync';

export const panel = 'border border-[#242527] bg-[#11161b] p-5';
export type { Component, Dependency, Diagram, Rule, Decision, Workspace } from '@/features/workspace-sync';

type LoadState = {
  data: Workspace;
  /** The server id of the workspace; null until it has been found. */
  projectId: string | null;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  conflictError: string | null;
  /** Increases on every (re)load, so editors know to replace their draft with what was loaded. */
  loadVersion: number;
};

/** The workspace's id: the id itself, or (for links made before ids were used) the one with that name. Null when there is none. */
async function resolveServerProject(project: string): Promise<string | null> {
  if (isServerProjectId(project)) return project;
  const match = (await getProjects()).find((p) => p.name.toLowerCase() === project.toLowerCase());
  return match?.id ?? null;
}

/**
 * A workspace is read from and written to the API only: if it cannot be loaded, editing is disabled instead of falling back
 * to a copy that a later save would push over newer server data. Every save carries the revision that was loaded; the server
 * rejects it with 409 when someone else saved in between.
 */
export function useWorkspace(project: string) {
  const { message } = App.useApp();
  const [state, setState] = useState<LoadState>({
    data: emptyWorkspace(), projectId: null, status: 'loading', error: null, conflictError: null, loadVersion: 0,
  });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const loadRef = useRef(0);

  const load = useCallback(async () => {
    const attempt = ++loadRef.current;
    let projectId: string | null = null;
    try {
      projectId = await resolveServerProject(project);
      if (!projectId) throw new Error('Workspace not found.');
      const data = await fetchServerWorkspace(projectId);
      if (attempt !== loadRef.current) return;
      setState((prev) => ({ data, projectId, status: 'ready', error: null, conflictError: null, loadVersion: prev.loadVersion + 1 }));
    } catch (err) {
      if (attempt !== loadRef.current) return;
      const error = err instanceof Error ? err.message : 'Could not load the workspace.';
      setState((prev) => ({ ...prev, projectId, status: 'error', error }));
    }
  }, [project]);

  useEffect(() => {
    const loads = loadRef;
    load();
    return () => { loads.current++; };
  }, [load]);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'loading', error: null }));
    load();
  }, [load]);

  /** Returns the saved workspace, or null when nothing was saved (the reason has already been shown). */
  const save = async (next: Workspace): Promise<Workspace | null> => {
    const projectId = state.projectId;
    if (state.status !== 'ready' || !projectId) {
      message.error(state.status === 'loading' ? 'The workspace is still loading.' : 'The workspace could not be loaded, so saving is disabled.');
      return null;
    }
    if (savingRef.current) {
      message.warning('The previous change is still being saved. Try again in a moment.');
      return null;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const data = await saveServerWorkspace(projectId, state.data.diagram.revision, next);
      setState((prev) => (prev.projectId === projectId ? { ...prev, data, conflictError: null } : prev));
      return data;
    } catch (err) {
      if (isRevisionConflict(err)) {
        const conflictError = (err as Error).message;
        setState((prev) => ({ ...prev, conflictError }));
        message.error('Not saved: someone else changed this workspace.');
        return null;
      }
      message.error(err instanceof Error ? err.message : 'Could not save the workspace. Please retry.');
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return {
    data: state.data,
    save,
    saving,
    loading: state.status === 'loading',
    loadError: state.status === 'error',
    loadErrorMessage: state.error,
    conflictError: state.conflictError,
    resolvedProjectId: state.projectId,
    loadVersion: state.loadVersion,
    reload,
  };
}
