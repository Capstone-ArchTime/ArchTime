// The five frozen test-set repositories (docs/rq1-protocol.md §1) and the lock that protects them while RQ1-B is being
// annotated. While the lock is on, nothing derived from their recovered architecture (components, dependencies,
// evolution events) is put into the mentor's PROJECT DATA: annotators could otherwise see, through the mentor, which
// changes the groupings report. The lock is lifted only after both RQ1-B annotators have submitted their sheets, by
// setting ARCHTIME_TEST_SET_LOCK=off for the RQ2 run (docs/rq2-protocol.md §5d). Development trials never touch them.

export const TEST_SET_REPOS = ["outline/outline", "facebook/docusaurus", "actualbudget/actual", "marmelab/react-admin", "remix-run/react-router"] as const;

/** "owner/name" of a GitHub repository address (https, ssh or bare), lower-cased; null when it is not one. */
export function githubSlug(repoUrl: string | undefined | null): string | null {
  const m = /github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?(?:[#?].*)?$/i.exec(String(repoUrl ?? "").trim());
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

/** Whether a workspace's repository is one of the five frozen test-set repositories. */
export function isTestSetRepo(repoUrl: string | undefined | null): boolean {
  const slug = githubSlug(repoUrl);
  return !!slug && (TEST_SET_REPOS as readonly string[]).includes(slug);
}

/** The lock is on unless ARCHTIME_TEST_SET_LOCK is exactly "off". */
export function testSetLocked(env: Record<string, string | undefined> = process.env): boolean {
  return env.ARCHTIME_TEST_SET_LOCK !== "off";
}
