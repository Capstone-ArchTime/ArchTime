// A component's path prefix: the folder of the repository the component owns on the canonical map (F-07, SRS §3.9.1),
// for example "src/auth/". Optional; two components may not claim the same folder. Nested folders are allowed
// ("src/" and "src/auth/"), the longer one being the more specific claim. Pure, so unit-testable.

import type { IWorkspaceComponent } from "../entities/Workspace.js";

export const MAX_PATH_PREFIX_LENGTH = 200;

/**
 * The prefix in the one form it is stored and compared in: forward slashes, no leading "./" or "/", no empty segment,
 * and a trailing "/". "" when the component has none. Repository paths are case-sensitive, so the case is kept.
 */
export function normalizePathPrefix(value: unknown): string {
  if (typeof value !== "string") return "";
  const segments = value.trim().replace(/\\/g, "/").split("/").filter((s) => s !== "" && s !== ".");
  return segments.length ? `${segments.join("/")}/` : "";
}

export interface PrefixCheck<C> {
  /** The components with their prefixes normalized; the input is left untouched. */
  components: C[];
  /** Why the prefixes cannot be saved, or null. */
  problem: string | null;
}

/** Normalizes every component's prefix and finds the first one that cannot be saved. */
export function checkPathPrefixes<C extends Pick<IWorkspaceComponent, "name"> & { pathPrefix?: unknown }>(components: readonly C[]): PrefixCheck<C> {
  const normalized = components.map((c) => ({ ...c, pathPrefix: normalizePathPrefix(c.pathPrefix) }));
  const owner = new Map<string, string>();
  for (const c of normalized) {
    const prefix = c.pathPrefix;
    if (!prefix) continue;
    if (prefix.length > MAX_PATH_PREFIX_LENGTH) {
      return { components: normalized, problem: `The path prefix of "${c.name}" is longer than ${MAX_PATH_PREFIX_LENGTH} characters.` };
    }
    if (prefix.split("/").includes("..")) {
      return { components: normalized, problem: `The path prefix of "${c.name}" must stay inside the repository (no "..").` };
    }
    const other = owner.get(prefix);
    if (other !== undefined) {
      return { components: normalized, problem: `"${c.name}" and "${other}" have the same path prefix "${prefix}". Each folder belongs to one component.` };
    }
    owner.set(prefix, c.name);
  }
  return { components: normalized, problem: null };
}
