import { useState } from 'react';
import { App } from 'antd';
import { useAuth } from '@/auth/auth-context';

export const projects = ['E-Commerce Platform', 'Payment Platform', 'Healthcare Connect'];
export const panel = 'border border-[#222c37] bg-[#11161b] p-5';
export type Component = { id: string; name: string; kind: string; description: string };
export type Dependency = { id: string; source: string; target: string; label: string };
export type Diagram = { components: Component[]; dependencies: Dependency[]; revision: number; confirmedAt: string | null };
export type Rule = { id: string; name: string; source: string; target: string; constraint: 'forbidden' | 'required'; severity: 'error' | 'warning'; rationale: string; enabled: boolean };
export type Decision = { id: string; number: number; title: string; status: 'Proposed' | 'Accepted' | 'Deprecated'; context: string; decision: string; alternatives: string; consequences: string; componentIds: string[]; createdAt: string; updatedAt: string };
export type Workspace = { diagram: Diagram; rules: Rule[]; decisions: Decision[] };

function initialWorkspace(project: string): Workspace {
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
      ], revision: 1, confirmedAt: null,
    }, rules: [], decisions: [],
  };
}

export function useWorkspace(project: string) {
  const { message } = App.useApp();
  const { user } = useAuth();
  const key = `archtime:maintainer:v2:${user?.id}:${project}`;
  const [state, setState] = useState<{ data: Workspace; snapshot: string | null; loadError: boolean }>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (!saved) return { data: initialWorkspace(project), snapshot: null, loadError: false };
      const value = JSON.parse(saved);
      if (!value?.diagram || !Array.isArray(value.diagram.components) || !Array.isArray(value.diagram.dependencies) || !Array.isArray(value.rules) || !Array.isArray(value.decisions)) throw new Error('Invalid workspace');
      if (!Number.isInteger(value.diagram.revision) || value.diagram.revision < 1) throw new Error('Invalid revision');
      const hasStrings = (entry: Record<string, unknown>, fields: string[]) => entry && fields.every(field => typeof entry[field] === 'string');
      if (!value.diagram.components.every((c: Component) => hasStrings(c, ['id', 'name', 'kind', 'description'])) ||
          !value.diagram.dependencies.every((d: Dependency) => hasStrings(d, ['id', 'source', 'target', 'label'])) ||
          !value.rules.every((r: Rule) => hasStrings(r, ['id', 'name', 'source', 'target', 'rationale']) && ['required', 'forbidden'].includes(r.constraint) && ['error', 'warning'].includes(r.severity) && typeof r.enabled === 'boolean') ||
          !value.decisions.every((d: Decision) => hasStrings(d, ['id', 'title', 'context', 'decision', 'alternatives', 'consequences', 'createdAt', 'updatedAt']) && ['Proposed', 'Accepted', 'Deprecated'].includes(d.status) && Number.isInteger(d.number) && Array.isArray(d.componentIds) && d.componentIds.every(id => typeof id === 'string'))) throw new Error('Invalid records');
      return { data: value, snapshot: saved, loadError: false };
    } catch { return { data: initialWorkspace(project), snapshot: null, loadError: true }; }
  });
  const { data, loadError } = state;
  function save(next: Workspace) {
    if (user?.role !== 'project-maintainer') { message.error('Only project maintainers can save this workspace.'); return false; }
    if (loadError) { message.error('Stored workspace could not be read. Restore browser storage before saving to avoid overwriting it.'); return false; }
    try {
      if (localStorage.getItem(key) !== state.snapshot) { message.error('This project changed in another tab. Reload before saving to avoid overwriting newer changes.'); return false; }
      const snapshot = JSON.stringify(next);
      localStorage.setItem(key, snapshot);
      setState({ data: next, snapshot, loadError: false });
      return true;
    } catch { message.error('Could not save. Check browser storage permissions or available space.'); return false; }
  }
  return { data, save, loadError };
}
