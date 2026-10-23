import type { DecisionSourceKind, IDecisionSource } from "../entities/Workspace.js";

/**
 * Looks up a source an ADR cites, within one project. Returns null when it does not exist there, so an ADR cannot
 * cite a commit that was never mined or another project's evidence.
 */
export interface IDecisionSourceVerifier {
  resolve(projectId: string, kind: DecisionSourceKind, ref: string): Promise<Omit<IDecisionSource, "note"> | null>;
}
