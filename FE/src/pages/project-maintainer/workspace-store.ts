import { useState, useEffect, useCallback, useRef } from 'react';
import { App } from 'antd';
import { useAuth } from '@/auth/auth-context';
import { demoProjects } from '@/features/maintainer-demo';
import { getProjects } from '@/features/project-data';
import { fetchServerWorkspace, isRevisionConflict, isServerProjectId, saveServerWorkspace } from '@/features/workspace-sync';
import type { Component, Decision, Dependency, Rule, Workspace } from '@/features/workspace-sync';

export const projects = demoProjects;
export const panel = 'border border-[#242527] bg-[#11161b] p-5';
export type { Component, Dependency, Diagram, Rule, Decision, Workspace } from '@/features/workspace-sync';

export function initialWorkspace(project: string): Workspace {
  const service = project === projects[1] ? 'Payment Service' : project === projects[2] ? 'Patient Service' : 'Catalog Service';
  return {
    diagram: {
      components: [
        { id: 'web', name: 'Web Application', kind: 'UI', description: 'User-facing application' },
        { id: 'api', name: 'API Gateway', kind: 'Service', description: 'Routes incoming requests' },
        { id: 'service', name: service, kind: 'Service', description: 'Domain logic and operations' },
        { id: 'db', name: 'Database', kind: 'Database', description: 'Persistent domain data' },
      ],
      dependencies: [
        { id: 'e1', source: 'web', target: 'api', label: 'HTTPS' },
        { id: 'e2', source: 'api', target: 'service', label: 'REST' },
        { id: 'e3', source: 'service', target: 'db', label: 'SQL' },
      ],
      revision: 1,
      confirmedAt: null,
    },
    rules: [],
    decisions: [],
  };
}

function isValidWorkspace(value: any): value is Workspace {
  if (!value?.diagram || !Array.isArray(value.diagram.components) || !Array.isArray(value.diagram.dependencies) || !Array.isArray(value.rules) || !Array.isArray(value.decisions)) {
    return false;
  }
  if (!Number.isInteger(value.diagram.revision) || value.diagram.revision < 1) {
    return false;
  }
  const hasStrings = (entry: Record<string, unknown>, fields: string[]) =>
    entry && fields.every((field) => typeof entry[field] === 'string');

  const validComponents = value.diagram.components.every((c: Component) =>
    hasStrings(c as any, ['id', 'name', 'kind', 'description'])
  );
  const validDependencies = value.diagram.dependencies.every((d: Dependency) =>
    hasStrings(d as any, ['id', 'source', 'target', 'label'])
  );
  const validRules = value.rules.every(
    (r: Rule) =>
      hasStrings(r as any, ['id', 'name', 'source', 'target', 'rationale']) &&
      ['required', 'forbidden'].includes(r.constraint) &&
      ['error', 'warning'].includes(r.severity) &&
      typeof r.enabled === 'boolean'
  );
  const validDecisions = value.decisions.every(
    (d: Decision) =>
      hasStrings(d as any, ['id', 'title', 'context', 'decision', 'alternatives', 'consequences', 'createdAt', 'updatedAt']) &&
      ['Proposed', 'Accepted', 'Deprecated'].includes(d.status) &&
      Number.isInteger(d.number) &&
      Array.isArray(d.componentIds) &&
      d.componentIds.every((id) => typeof id === 'string')
  );

  return validComponents && validDependencies && validRules && validDecisions;
}

type LoadState = {
  data: Workspace;
  /** Server project id, or null for a sample workspace kept in this browser. */
  projectId: string | null;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  conflictError: string | null;
  /** localStorage text the sample workspace was read from; detects edits made in another tab. */
  snapshot: string | null;
  /** Increases on every (re)load, so editors know to replace their draft with what was loaded. */
  loadVersion: number;
};

async function resolveServerProject(project: string): Promise<string | null> {
  if (isServerProjectId(project)) return project;
  try {
    const match = (await getProjects()).find((p) => p.name.toLowerCase() === project.toLowerCase());
    return match?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * A server workspace is read from and written to the API only: if it cannot be loaded, editing is disabled instead of
 * falling back to a browser copy that a later save would push over newer server data. Every save carries the revision
 * that was loaded; the server rejects it with 409 when someone else saved in between.
 */
export function useWorkspace(project: string) {
  const { message } = App.useApp();
  const { user } = useAuth();
  const key = `archtime:maintainer:v2:${user?.id}:${project}`;
  const [state, setState] = useState<LoadState>({
    data: initialWorkspace(project), projectId: null, status: 'loading', error: null, conflictError: null, snapshot: null, loadVersion: 0,
  });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const loadRef = useRef(0);

  const load = useCallback(async () => {
    const attempt = ++loadRef.current;
    const projectId = await resolveServerProject(project);
    if (attempt !== loadRef.current) return;

    if (projectId) {
      try {
        const data = await fetchServerWorkspace(projectId);
        if (attempt !== loadRef.current) return;
        setState((prev) => ({ data, projectId, status: 'ready', error: null, conflictError: null, snapshot: null, loadVersion: prev.loadVersion + 1 }));
      } catch (err) {
        if (attempt !== loadRef.current) return;
        const error = err instanceof Error ? err.message : 'Could not load the workspace.';
        setState((prev) => ({ ...prev, projectId, status: 'error', error }));
      }
      return;
    }

    let saved: string | null = null;
    try { saved = localStorage.getItem(key); } catch { /* storage blocked */ }
    let data = initialWorkspace(project);
    if (saved) {
      try {
        const value = JSON.parse(saved);
        if (!isValidWorkspace(value)) throw new Error('Invalid workspace');
        data = value;
      } catch {
        setState((prev) => ({ ...prev, projectId: null, status: 'error', error: null, snapshot: saved }));
        return;
      }
    }
    setState((prev) => ({ data, projectId: null, status: 'ready', error: null, conflictError: null, snapshot: saved, loadVersion: prev.loadVersion + 1 }));
  }, [project, key]);

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
    if (state.status !== 'ready') {
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
      if (state.projectId) {
        const projectId = state.projectId;
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
        }
      }

      if (user?.role !== 'project-maintainer') {
        message.error('Only project maintainers can save this workspace.');
        return null;
      }
      try {
        if (localStorage.getItem(key) !== state.snapshot) {
          const conflictError = 'This workspace changed in another tab. Reload it before saving to avoid overwriting newer changes.';
          setState((prev) => ({ ...prev, conflictError }));
          message.error(conflictError);
          return null;
        }
        const snapshot = JSON.stringify(next);
        localStorage.setItem(key, snapshot);
        setState((prev) => ({ ...prev, data: next, snapshot, conflictError: null }));
        return next;
      } catch {
        message.error('Could not save. Check browser storage permissions or available space.');
        return null;
      }
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
