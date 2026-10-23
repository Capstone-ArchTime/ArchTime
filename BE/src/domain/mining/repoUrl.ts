// What a repository URL may point to. The server clones it, so a URL is also a way to make the server read local
// directories (file://, a path), talk to internal hosts, or run commands (git's ext:: transport). Only public HTTPS
// remotes are accepted; ARCHTIME_ALLOW_LOCAL_REPOS=true relaxes this for tests and local development.

export class RepoUrlError extends Error {}

const MAX_LENGTH = 2048;

export function allowLocalRepos(): boolean {
  return process.env.ARCHTIME_ALLOW_LOCAL_REPOS === "true";
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (host.includes(":")) {
    return host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")
      || host.startsWith("::ffff:");
  }
  // Single-label names ("gitlab", "server") resolve on the internal network only.
  return !host.includes(".");
}

/** Returns the URL to store, or throws RepoUrlError with a message meant for the user. */
export function validateRepoUrl(value: unknown, allowLocal = allowLocalRepos()): string {
  if (typeof value !== "string" || !value.trim()) throw new RepoUrlError("repoUrl is required.");
  const raw = value.trim();
  if (raw.length > MAX_LENGTH) throw new RepoUrlError(`repoUrl must be at most ${MAX_LENGTH} characters.`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RepoUrlError("repoUrl must be a full HTTPS URL, for example https://github.com/owner/repo.git.");
  }
  const allowed = allowLocal ? ["https:", "http:", "file:"] : ["https:"];
  if (!allowed.includes(url.protocol)) {
    throw new RepoUrlError("Only HTTPS repository URLs are supported, for example https://github.com/owner/repo.git.");
  }
  if (url.username || url.password) {
    throw new RepoUrlError("Do not put credentials in the URL; send the access token in the token field instead.");
  }
  if (url.protocol !== "file:" && !allowLocal && isPrivateHost(url.hostname)) {
    throw new RepoUrlError("The repository host must be a public address.");
  }
  return raw;
}
