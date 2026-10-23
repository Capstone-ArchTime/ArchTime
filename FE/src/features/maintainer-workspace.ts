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

/** The workspace as the server sends it, with every list defaulted so the pages never see a missing one. */
export function fromServer(ws: any, fallback: Workspace): Workspace {
  return {
    diagram: {
      components: ws.diagram?.components ?? fallback.diagram.components,
      dependencies: ws.diagram?.dependencies ?? fallback.diagram.dependencies,
      revision: ws.diagram?.revision ?? ws.revision ?? fallback.diagram.revision,
      confirmedAt: ws.diagram?.confirmedAt ?? fallback.diagram.confirmedAt,
    },
    rules: ws.rules ?? fallback.rules,
    decisions: ws.decisions ?? fallback.decisions,
  };
}
