import { apiRequest } from '../api/client.ts';
import type { Component, Dependency, Diagram } from './workspace-sync.ts';

// A project Member proposes a change to the confirmed diagram (WF-04, DS-04a): POST /projects/:id/approvals with the
// proposed diagram in `data.diagram`. A maintainer approves it in the Approval Queue, which applies the diagram, confirms
// it and moves the baseline; until then the confirmed map stays as it is.

export type ProposedDiagram = { components: Component[]; dependencies: Dependency[] };
export type MyProposal = { id: string; title: string; status: 'pending' | 'approved' | 'rejected'; createdAt: string | null; reviewNote: string };

const dependencyName = (d: Dependency, names: Map<string, string>) => `${names.get(d.source) ?? d.source} → ${names.get(d.target) ?? d.target}`;
const sameComponent = (a: Component, b: Component) => a.name === b.name && a.kind === b.kind && a.description === b.description;

/** What the proposal changes in the confirmed diagram, one line each, in the order a reviewer reads them. */
export function diagramChanges(base: Pick<Diagram, 'components' | 'dependencies'>, next: ProposedDiagram): string[] {
  const before = new Map(base.components.map(c => [c.id, c]));
  const after = new Map(next.components.map(c => [c.id, c]));
  const names = new Map([...base.components, ...next.components].map(c => [c.id, c.name]));
  const edgeKey = (d: Dependency) => `${d.source}->${d.target}`;
  const edgesBefore = new Map(base.dependencies.map(d => [edgeKey(d), d]));
  const edgesAfter = new Map(next.dependencies.map(d => [edgeKey(d), d]));
  const lines: string[] = [];
  for (const c of next.components) {
    const old = before.get(c.id);
    if (!old) lines.push(`Adds component ${c.name} (${c.kind})`);
    else if (old.name !== c.name) lines.push(`Renames component ${old.name} to ${c.name}`);
    else if (!sameComponent(old, c)) lines.push(`Changes component ${c.name}`);
  }
  for (const c of base.components) if (!after.has(c.id)) lines.push(`Removes component ${c.name}`);
  for (const [key, d] of edgesAfter) if (!edgesBefore.has(key)) lines.push(`Adds dependency ${dependencyName(d, names)}`);
  for (const [key, d] of edgesBefore) if (!edgesAfter.has(key)) lines.push(`Removes dependency ${dependencyName(d, names)}`);
  return lines;
}

/** Why the proposal cannot be sent yet, or null. The server checks the same and more (path prefixes, MSG24). */
export function checkProposal(title: string, base: Pick<Diagram, 'components' | 'dependencies'>, next: ProposedDiagram): string | null {
  if (!title.trim()) return 'Give the proposal a title.';
  if (!next.components.length) return 'A diagram needs at least one component.';
  const ids = new Set(next.components.map(c => c.id));
  if (next.dependencies.some(d => !ids.has(d.source) || !ids.has(d.target))) return 'A dependency points to a component that is no longer in the diagram.';
  if (!diagramChanges(base, next).length) return 'The proposal changes nothing in the confirmed diagram.';
  return null;
}

/** Removing a component also removes the dependencies that start or end at it. */
export function withoutComponent(diagram: ProposedDiagram, id: string): ProposedDiagram {
  return { components: diagram.components.filter(c => c.id !== id), dependencies: diagram.dependencies.filter(d => d.source !== id && d.target !== id) };
}

/** The request body: the changes are listed in the description too, so the Approval Queue shows them to the reviewer. */
export function buildProposal(input: { title: string; description: string }, base: Pick<Diagram, 'components' | 'dependencies'>, next: ProposedDiagram) {
  const changes = diagramChanges(base, next);
  const description = [input.description.trim(), changes.length ? `Changes:\n${changes.map(l => `- ${l}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
  return {
    title: input.title.trim(),
    description,
    type: 'architecture_change',
    // Path prefixes are left out: a proposed component keeps the prefixes it has, and a new one gets them when mapped.
    data: { diagram: { components: next.components.map(({ id, name, kind, description }) => ({ id, name, kind, description })), dependencies: next.dependencies } },
  };
}

export async function proposeChange(projectId: string, body: ReturnType<typeof buildProposal>) {
  return apiRequest<{ data?: { approval?: { id?: string } } }>(`/projects/${encodeURIComponent(projectId)}/approvals`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

/** The proposals this account sent for the workspace, newest first (members may read the queue, not decide it). */
export async function listMyProposals(projectId: string, userId: string, signal?: AbortSignal): Promise<MyProposal[]> {
  const body = await apiRequest<{ data?: { approvals?: unknown } }>(`/projects/${encodeURIComponent(projectId)}/approvals?type=architecture_change&limit=50`, { signal });
  const rows = body?.data?.approvals;
  if (!Array.isArray(rows)) throw new Error('The server returned an invalid list of proposals.');
  return rows
    .filter((a: any) => String(a?.requestedBy ?? '') === userId)
    .map((a: any) => ({
      id: String(a.id ?? a._id ?? ''), title: String(a.title ?? ''),
      status: a.status === 'approved' || a.status === 'rejected' ? a.status : 'pending',
      createdAt: a.createdAt ? String(a.createdAt) : null, reviewNote: String(a.reviewNote ?? ''),
    }));
}
