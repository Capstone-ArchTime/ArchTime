import { useState, useEffect, useCallback, useRef } from 'react';
import { App } from 'antd';
import { useAuth } from '@/auth/auth-context';
import { apiRequest, ApiError } from '@/api/client';
import { getProjects } from '@/features/project-data';
import { emptyWorkspace, fromServer, type Workspace } from '@/features/maintainer-workspace';

export const panel = 'border border-[#242527] bg-[#11161b] p-5';
export type { Component, Dependency, Diagram, Rule, Decision, Workspace } from '@/features/maintainer-workspace';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** Loads and saves one workspace on the server, with revision checks so two maintainers never overwrite each other. */
export function useWorkspace(project: string) {
  const { message } = App.useApp();
  const { user } = useAuth();

  const [state, setState] = useState<{
    data: Workspace;
    loadError: boolean;
    loading: boolean;
    conflictError: string | null;
    resolvedProjectId: string | null;
  }>({ data: emptyWorkspace(), loadError: false, loading: true, conflictError: null, resolvedProjectId: null });

  const { data, loadError, loading, conflictError, resolvedProjectId } = state;
  const isFetchingRef = useRef(false);

  const loadServerWorkspace = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      let targetId: string | null = null;
      if (OBJECT_ID.test(project)) {
        targetId = project;
      } else {
        // Older links carry the workspace's name instead of its id.
        const list = await getProjects();
        targetId = list.find((p) => p.id === project || p.name.toLowerCase() === project.toLowerCase())?.id ?? null;
      }
      if (!targetId) throw new Error('Workspace not found.');

      const res = await apiRequest<{ data?: { workspace?: any } }>(`/projects/${encodeURIComponent(targetId)}/workspace`);
      const ws = res?.data?.workspace;
      if (!ws) throw new Error('The server returned no workspace.');

      setState((prev) => ({
        ...prev,
        data: fromServer(ws, emptyWorkspace()),
        loadError: false,
        loading: false,
        conflictError: null,
        resolvedProjectId: targetId,
      }));
    } catch {
      setState((prev) => ({ ...prev, loadError: true, loading: false }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [project]);

  useEffect(() => {
    loadServerWorkspace();
  }, [loadServerWorkspace]);

  // Save with Optimistic Concurrency Control: the server refuses a save made on an out-of-date revision.
  const save = async (next: Workspace): Promise<boolean> => {
    if (user?.role !== 'project-maintainer') {
      message.error('Only project maintainers can save this workspace.');
      return false;
    }
    if (loadError || !resolvedProjectId) {
      message.error('This workspace could not be loaded, so saving is disabled. Reload and try again.');
      return false;
    }

    try {
      const res = await apiRequest<{ data?: { workspace?: any }; message?: string }>(
        `/projects/${encodeURIComponent(resolvedProjectId)}/workspace`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedRevision: data.diagram.revision,
            diagram: next.diagram,
            rules: next.rules,
            decisions: next.decisions,
          }),
        }
      );
      const ws = res?.data?.workspace;
      if (!ws) {
        message.error('The server did not confirm the save. Please retry.');
        return false;
      }
      const updated = fromServer(ws, { ...next, diagram: { ...next.diagram, revision: next.diagram.revision + 1 } });
      setState((prev) => ({ ...prev, data: updated, loadError: false, conflictError: null }));
      return true;
    } catch (err: any) {
      if (err instanceof ApiError && (err.status === 409 || err.code === 'CONFLICT')) {
        const conflictMsg =
          err.message ||
          'Workspace revision conflict: someone else modified this workspace. Please reload to avoid overwriting changes.';
        setState((prev) => ({ ...prev, conflictError: conflictMsg }));
        message.error(conflictMsg);
        return false;
      }
      message.error(err.message || 'Could not save workspace to server. Please retry.');
      return false;
    }
  };

  return {
    data,
    save,
    loadError,
    loading,
    conflictError,
    resolvedProjectId,
    reload: loadServerWorkspace,
  };
}
