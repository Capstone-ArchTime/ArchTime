// The canonical map: the component diagram a maintainer has confirmed as the project's reference architecture.
// Who confirmed it, when and at which revision is decided here from the stored diagram, never taken from the client,
// and a confirmation only holds while the diagram's content is the one that was confirmed. Pure, so unit-testable.

import type { IWorkspaceDiagram } from "../entities/Workspace.js";

export interface DiagramConfirmation {
  confirmedAt: Date | null;
  confirmedBy: string | null;
  /** The workspace revision written by the save that confirmed the diagram. */
  confirmedRevision: number | null;
  /**
   * The latest mined commit when the diagram was confirmed (BR-32). The conformance check covers only commits after it;
   * an approved architecture change request moves it. Null when nothing was mined yet.
   */
  baselineCommit: string | null;
}

export const UNCONFIRMED: DiagramConfirmation = { confirmedAt: null, confirmedBy: null, confirmedRevision: null, baselineCommit: null };

type DiagramContent = Pick<IWorkspaceDiagram, "components" | "dependencies">;

/** The diagram's content in a fixed order: components and dependencies, without positions in the arrays. */
export function diagramContentKey(diagram: DiagramContent | null | undefined): string {
  const components = (diagram?.components ?? [])
    .map(c => [String(c.id), String(c.name ?? ""), String(c.kind ?? ""), String(c.description ?? "")])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const dependencies = (diagram?.dependencies ?? [])
    .map(d => [String(d.source), String(d.target), String(d.label ?? "")])
    .sort((a, b) => a.join("\u0000").localeCompare(b.join("\u0000")));
  return JSON.stringify([components, dependencies]);
}

const time = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const t = new Date(value as string | Date).getTime();
  return Number.isNaN(t) ? null : t;
};

export function confirmationOf(diagram: Partial<IWorkspaceDiagram> | null | undefined): DiagramConfirmation {
  const at = time(diagram?.confirmedAt);
  if (at === null) return UNCONFIRMED;
  return {
    confirmedAt: new Date(at),
    confirmedBy: diagram?.confirmedBy ?? null,
    confirmedRevision: typeof diagram?.confirmedRevision === "number" ? diagram.confirmedRevision : null,
    baselineCommit: typeof diagram?.baselineCommit === "string" && diagram.baselineCommit ? diagram.baselineCommit : null,
  };
}

/**
 * What a save of the whole workspace asks for. The page sends the diagram with its `confirmedAt`: a new time means
 * "confirm this", the stored time means "leave it as it is", nothing means "not confirmed".
 */
export function requestedConfirmation(stored: Partial<IWorkspaceDiagram> | null | undefined, incoming: Partial<IWorkspaceDiagram>): "confirm" | "keep" | "clear" {
  const sent = time(incoming.confirmedAt);
  if (sent === null) return "clear";
  return sent === time(stored?.confirmedAt) ? "keep" : "confirm";
}

/**
 * The confirmation the saved diagram carries.
 * - confirm: the caller, now, at the revision this save writes, with the latest mined commit as baseline.
 * - keep: the stored confirmation, if the content is still the content that was confirmed; otherwise none.
 * - clear: none.
 */
export function settleConfirmation(input: {
  stored: Partial<IWorkspaceDiagram> | null | undefined;
  incoming: DiagramContent;
  request: "confirm" | "keep" | "clear";
  userId?: string;
  now: Date;
  nextRevision: number;
  /** The latest mined commit of the project; used only when confirming. */
  baselineCommit?: string | null;
}): DiagramConfirmation {
  if (input.request === "confirm") {
    return { confirmedAt: input.now, confirmedBy: input.userId ?? null, confirmedRevision: input.nextRevision, baselineCommit: input.baselineCommit ?? null };
  }
  if (input.request === "clear") return UNCONFIRMED;
  const stored = confirmationOf(input.stored);
  if (!stored.confirmedAt) return UNCONFIRMED;
  return diagramContentKey(input.stored as DiagramContent) === diagramContentKey(input.incoming) ? stored : UNCONFIRMED;
}
