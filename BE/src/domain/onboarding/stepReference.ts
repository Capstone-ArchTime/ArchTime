// What a learning step is about inside the workspace (one component, or one design decision), reduced to a fingerprint.
// A step stores the fingerprint of its own reference when it is pinned; comparing it with the current one tells whether
// THAT changed, so saving an unrelated rule, ADR or component no longer flags every step. Pure, so it is unit-testable.

import { createHash } from "node:crypto";
import type { IOnboardingStep } from "../entities/OnboardingPath.js";
import type { ReferenceFacts } from "./stepRevision.js";

/** The parts of a workspace a step can be about, as much of them as the fingerprints read. */
export interface ReferenceWorkspace {
  components: { id: string; name: string; kind: string; description: string }[];
  dependencies: { source: string; target: string; label: string }[];
  decisions: {
    id: string; title: string; status: string; context: string; decision: string; alternatives: string; consequences: string;
    componentIds: string[];
    /** When the decision was last edited; only used for steps pinned before fingerprints existed. */
    updatedAt?: Date | null;
  }[];
  /** When the diagram was last confirmed (null while it is a draft); only used for steps pinned before fingerprints existed. */
  confirmedAt: Date | null;
}

export const EMPTY_REFERENCE_WORKSPACE: ReferenceWorkspace = { components: [], dependencies: [], decisions: [], confirmedAt: null };

export type ReferencedStep = Pick<IOnboardingStep, "kind" | "componentId" | "adrId">;

const digest = (parts: unknown[]): string => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);

/** Order-free: the same set of entries gives the same list whatever order the diagram stores them in. */
const sorted = (entries: unknown[][]): string[] => entries.map(entry => JSON.stringify(entry)).sort();

function componentFingerprint(id: string, ws: ReferenceWorkspace): string | null {
  const component = ws.components.find(c => c.id === id);
  if (!component) return null;
  // A neighbour is named too: the step reads "Billing calls Orders", so renaming Orders changes what it says.
  const name = (other: string) => ws.components.find(c => c.id === other)?.name ?? null;
  const incoming = sorted(ws.dependencies.filter(d => d.target === id).map(d => [d.source, name(d.source), d.label ?? ""]));
  const outgoing = sorted(ws.dependencies.filter(d => d.source === id).map(d => [d.target, name(d.target), d.label ?? ""]));
  return digest(["component", component.name, component.kind ?? "", component.description ?? "", incoming, outgoing]);
}

function decisionFingerprint(id: string, ws: ReferenceWorkspace): string | null {
  const d = ws.decisions.find(decision => decision.id === id);
  if (!d) return null;
  return digest(["adr", d.title, d.status, d.context ?? "", d.decision ?? "", d.alternatives ?? "", d.consequences ?? "", [...(d.componentIds ?? [])].sort()]);
}

/** The fingerprint of what the step is about, or null when it is about nothing in the workspace (or that thing is gone). */
export function referenceFingerprint(step: ReferencedStep, ws: ReferenceWorkspace): string | null {
  if (step.kind === "component") return componentFingerprint(step.componentId ?? "", ws);
  if (step.kind === "adr") return decisionFingerprint(step.adrId ?? "", ws);
  return null;
}

/** What assessStepRevision needs to know about the step's own reference, as the workspace is now. */
export function referenceFacts(step: ReferencedStep, ws: ReferenceWorkspace): ReferenceFacts {
  if (step.kind === "component") {
    const exists = ws.components.some(c => c.id === step.componentId);
    return { kind: "component", exists, fingerprint: referenceFingerprint(step, ws), changedAt: ws.confirmedAt ?? null };
  }
  if (step.kind === "adr") {
    const decision = ws.decisions.find(d => d.id === step.adrId);
    return { kind: "adr", exists: !!decision, fingerprint: referenceFingerprint(step, ws), changedAt: decision?.updatedAt ?? null };
  }
  return { kind: null, exists: true, fingerprint: null, changedAt: null };
}
