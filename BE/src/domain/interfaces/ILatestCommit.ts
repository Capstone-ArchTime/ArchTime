/** The hash of the most recent mined commit of a project, or null when nothing was mined (baseline of BR-32). */
export type LatestCommitLookup = (projectId: string) => Promise<string | null>;
