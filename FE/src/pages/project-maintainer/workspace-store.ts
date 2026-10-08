import { useState, useEffect, useCallback, useRef } from 'react';
import { App } from 'antd';
import { useAuth } from '@/auth/auth-context';
import { demoProjects } from '@/features/maintainer-demo';
import { apiRequest, ApiError } from '@/api/client';
import { getProjects } from '@/features/project-data';

export const projects = demoProjects;
export const panel = 'border border-[#242527] bg-[#11161b] p-5';
export type Component = { id: string; name: string; kind: string; description: string };
export type Dependency = { id: string; source: string; target: string; label: string };
export type Diagram = { components: Component[]; dependencies: Dependency[]; revision: number; confirmedAt: string | null };
export type Rule = { id: string; name: string; source: string; target: string; constraint: 'forbidden' | 'required'; severity: 'error' | 'warning'; rationale: string; enabled: boolean };
export type Decision = { id: string; number: number; title: string; status: 'Proposed' | 'Accepted' | 'Deprecated'; context: string; decision: string; alternatives: string; consequences: string; componentIds: string[]; createdAt: string; updatedAt: string };
export type Workspace = { diagram: Diagram; rules: Rule[]; decisions: Decision[] };

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

export function useWorkspace(project: string) {
  const { message } = App.useApp();
  const { user } = useAuth();
  const key = `archtime:maintainer:v2:${user?.id}:${project}`;

  const [state, setState] = useState<{
    data: Workspace;
    snapshot: string | null;
    loadError: boolean;
    loading: boolean;
    conflictError: string | null;
    resolvedProjectId: string | null;
  }>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (!saved) {
        return {
          data: initialWorkspace(project),
          snapshot: null,
          loadError: false,
          loading: true,
          conflictError: null,
          resolvedProjectId: null,
        };
      }
      const value = JSON.parse(saved);
      if (!isValidWorkspace(value)) throw new Error('Invalid workspace');
      return {
        data: value,
        snapshot: saved,
        loadError: false,
        loading: true,
        conflictError: null,
        resolvedProjectId: null,
      };
    } catch {
      return {
        data: initialWorkspace(project),
        snapshot: null,
        loadError: false,
        loading: true,
        conflictError: null,
        resolvedProjectId: null,
      };
    }
  });

  const { data, loadError, loading, conflictError, resolvedProjectId } = state;
  const isFetchingRef = useRef(false);

  // 1. Resolve project ID: Check if project is a 24-character ObjectId or matches a server project
  const loadServerWorkspace = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      let targetId: string | null = null;
      if (/^[0-9a-fA-F]{24}$/.test(project)) {
        targetId = project;
      } else {
        // Try looking up server projects by name
        try {
          const serverList = await getProjects();
          const match = serverList.find(
            (p) => p.name.toLowerCase() === project.toLowerCase() || p.id === project
          );
          if (match) targetId = match.id;
        } catch {
          // Offline or demo
        }
      }

      if (targetId) {
        const res = await apiRequest<{ data?: { workspace?: any } }>(
          `/projects/${encodeURIComponent(targetId)}/workspace`
        );
        if (res?.data?.workspace) {
          const ws = res.data.workspace;
          const loaded: Workspace = {
            diagram: {
              components: ws.diagram?.components ?? [],
              dependencies: ws.diagram?.dependencies ?? [],
              revision: ws.diagram?.revision ?? ws.revision ?? 1,
              confirmedAt: ws.diagram?.confirmedAt ?? null,
            },
            rules: ws.rules ?? [],
            decisions: ws.decisions ?? [],
          };
          const snap = JSON.stringify(loaded);
          setState((prev) => ({
            ...prev,
            data: loaded,
            snapshot: snap,
            loadError: false,
            loading: false,
            conflictError: null,
            resolvedProjectId: targetId,
          }));
          try {
            localStorage.setItem(key, snap);
          } catch {}
          return;
        }
      }

      // If no server project ID found, read from localStorage fallback
      const saved = localStorage.getItem(key);
      if (saved) {
        const val = JSON.parse(saved);
        if (isValidWorkspace(val)) {
          setState((prev) => ({
            ...prev,
            data: val,
            snapshot: saved,
            loadError: false,
            loading: false,
            conflictError: null,
            resolvedProjectId: null,
          }));
          return;
        }
      }

      setState((prev) => ({
        ...prev,
        data: initialWorkspace(project),
        snapshot: null,
        loadError: false,
        loading: false,
        conflictError: null,
        resolvedProjectId: null,
      }));
    } catch (err: any) {
      // If error fetching server workspace
      setState((prev) => ({
        ...prev,
        loading: false,
        loadError: false,
        conflictError: null,
      }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [project, key]);

  useEffect(() => {
    loadServerWorkspace();
  }, [loadServerWorkspace]);

  // 2. Save workspace with Optimistic Concurrency Control
  const save = async (next: Workspace): Promise<boolean> => {
    if (user?.role !== 'project-maintainer') {
      message.error('Only project maintainers can save this workspace.');
      return false;
    }
    if (loadError) {
      message.error(
        'Stored workspace could not be read. Restore browser storage before saving to avoid overwriting it.'
      );
      return false;
    }

    // A. If connected to backend project, persist via API
    if (resolvedProjectId) {
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

        if (res?.data?.workspace) {
          const ws = res.data.workspace;
          const updated: Workspace = {
            diagram: {
              components: ws.diagram?.components ?? next.diagram.components,
              dependencies: ws.diagram?.dependencies ?? next.diagram.dependencies,
              revision: ws.diagram?.revision ?? ws.revision ?? next.diagram.revision + 1,
              confirmedAt: ws.diagram?.confirmedAt ?? next.diagram.confirmedAt,
            },
            rules: ws.rules ?? next.rules,
            decisions: ws.decisions ?? next.decisions,
          };
          const snap = JSON.stringify(updated);
          setState((prev) => ({
            ...prev,
            data: updated,
            snapshot: snap,
            loadError: false,
            conflictError: null,
          }));
          try {
            localStorage.setItem(key, snap);
          } catch {}
          return true;
        }
      } catch (err: any) {
        if (err instanceof ApiError && (err.status === 409 || err.code === 'CONFLICT')) {
          const conflictMsg =
            err.message ||
            'Workspace revision conflict: someone else modified this workspace. Please reload to avoid overwriting changes.';
          setState((prev) => ({ ...prev, conflictError: conflictMsg }));
          message.error(conflictMsg);
          return false;
        }

        const msg = err.message || 'Could not save workspace to server. Please retry.';
        message.error(msg);
        return false;
      }
    }

    // B. Local fallback for demo project without backend entity
    try {
      if (localStorage.getItem(key) !== state.snapshot) {
        message.error(
          'This project changed in another tab. Reload before saving to avoid overwriting newer changes.'
        );
        return false;
      }
      const snapshot = JSON.stringify(next);
      localStorage.setItem(key, snapshot);
      setState((prev) => ({ ...prev, data: next, snapshot, loadError: false, conflictError: null }));
      return true;
    } catch {
      message.error('Could not save. Check browser storage permissions or available space.');
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
