import { apiRequest, ApiError } from '../api/client.ts';

export type Component = { id: string; name: string; kind: string; description: string };
export type Dependency = { id: string; source: string; target: string; label: string };
export type Diagram = { components: Component[]; dependencies: Dependency[]; revision: number; confirmedAt: string | null };
export type Rule = { id: string; name: string; source: string; target: string; constraint: 'forbidden' | 'required'; severity: 'error' | 'warning'; rationale: string; enabled: boolean };
export type Decision = { id: string; number: number; title: string; status: 'Proposed' | 'Accepted' | 'Deprecated'; context: string; decision: string; alternatives: string; consequences: string; componentIds: string[]; createdAt: string; updatedAt: string };
export type Workspace = { diagram: Diagram; rules: Rule[]; decisions: Decision[] };

/** What a workspace holds before anyone has saved anything to it: nothing is invented for the maintainer. */
export function emptyWorkspace(): Workspace {
  return { diagram: { components: [], dependencies: [], revision: 1, confirmedAt: null }, rules: [], decisions: [] };
}

export const isServerProjectId = (value: string) => /^[0-9a-f]{24}$/i.test(value);

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const date = (value: unknown) => (typeof value === 'string' ? value : value instanceof Date ? value.toISOString() : '');

/**
 * The server workspace in the shape the editors use. Fields are rebuilt in a fixed order so that comparing a draft with
 * the saved diagram is not thrown off by key order. The workspace revision is the one the server checks on save.
 */
export function fromServer(ws: any): Workspace {
  const revision = Number(ws?.revision ?? ws?.diagram?.revision ?? 1);
  return {
    diagram: {
      components: (ws?.diagram?.components ?? []).map((c: any) => ({ id: text(c.id), name: text(c.name), kind: text(c.kind), description: text(c.description) })),
      dependencies: (ws?.diagram?.dependencies ?? []).map((d: any) => ({ id: text(d.id), source: text(d.source), target: text(d.target), label: text(d.label) })),
      revision: Number.isInteger(revision) && revision > 0 ? revision : 1,
      confirmedAt: date(ws?.diagram?.confirmedAt) || null,
    },
    rules: ws?.rules ?? [],
    // Keep provenance fields (origin, sources, history); the server ignores changes to them on a workspace save.
    decisions: (ws?.decisions ?? []).map((d: any) => ({ ...d, componentIds: d.componentIds ?? [], createdAt: date(d.createdAt), updatedAt: date(d.updatedAt) })),
  };
}

export async function fetchServerWorkspace(projectId: string, signal?: AbortSignal): Promise<Workspace> {
  const res = await apiRequest<{ data?: { workspace?: unknown } }>(`/projects/${encodeURIComponent(projectId)}/workspace`, { signal });
  if (!res?.data?.workspace) throw new Error('The server returned an invalid workspace.');
  return fromServer(res.data.workspace);
}

/** Saves only if the server still holds `expectedRevision`; otherwise the server answers 409 and nothing is written. */
export async function saveServerWorkspace(projectId: string, expectedRevision: number, next: Workspace): Promise<Workspace> {
  const res = await apiRequest<{ data?: { workspace?: unknown } }>(`/projects/${encodeURIComponent(projectId)}/workspace`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision, diagram: next.diagram, rules: next.rules, decisions: next.decisions }),
  });
  if (!res?.data?.workspace) throw new Error('The server returned an invalid workspace.');
  return fromServer(res.data.workspace);
}

export const isRevisionConflict = (error: unknown) => error instanceof ApiError && (error.status === 409 || error.code === 'CONFLICT');
