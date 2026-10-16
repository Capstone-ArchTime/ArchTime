/** One commit the answer cited, as sent by the server. `evidence` items make up the totals; `snapshot` items are not counted. */
export interface CitedItem {
  commit: string;
  kind: 'evidence' | 'snapshot';
  title: string;
  type: string;
  date: string;
  author?: string;
  summary?: string;
  files: number;
  dependencies: { added: number; removed: number };
  sourceFiles: string[];
  moreFiles: number;
}

export interface ChatEvidence {
  commits: string[];
  files: number;
  dependencies: { added: number; removed: number };
  /** Missing when the server predates the breakdown; the chips then only link to the evidence page. */
  items?: CitedItem[];
}

export type AnswerLabel = 'FACT' | 'INFERENCE' | 'UNKNOWN';
export type AnswerSegment =
  | { kind: 'text'; value: string }
  | { kind: 'label'; value: AnswerLabel }
  | { kind: 'code'; value: string }
  | { kind: 'commit'; value: string; commit: string };

/** What the panel under the answer shows: one commit, the files behind the "files" total, or the dependencies behind "deps". */
export type EvidenceDetail = { kind: 'commit'; commit: string } | { kind: 'files' } | { kind: 'deps' };

const SPLIT = /(\[(?:FACT|INFERENCE|UNKNOWN)\]|`[^`\n]+`)/g;
const LABEL = /^\[(FACT|INFERENCE|UNKNOWN)\]$/;
const HASH = /^[0-9a-f]{7,40}$/i;

export const shortCommit = (value: string) => value.trim().toLowerCase().slice(0, 7);

/**
 * Splits an answer into plain text, the model's FACT / INFERENCE / UNKNOWN labels, `code` spans, and commit hashes.
 * Only a hash the server confirmed as cited becomes a `commit`; any other code span stays code.
 */
export function tokenizeAnswer(text: string, citedCommits: readonly string[] = []): AnswerSegment[] {
  const cited = new Set(citedCommits.map(shortCommit));
  const segments: AnswerSegment[] = [];
  for (const part of text.split(SPLIT)) {
    if (!part) continue;
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      const value = part.slice(1, -1);
      segments.push(HASH.test(value) && cited.has(shortCommit(value))
        ? { kind: 'commit', value, commit: shortCommit(value) }
        : { kind: 'code', value });
      continue;
    }
    const label = LABEL.exec(part)?.[1] as AnswerLabel | undefined;
    segments.push(label ? { kind: 'label', value: label } : { kind: 'text', value: part });
  }
  return segments;
}

/** The Changes & Evidence page opens its detail drawer for this commit. */
export function evidenceHref(projectId: string, commit: string): string {
  return `/evidence?projectId=${encodeURIComponent(projectId)}&commit=${encodeURIComponent(commit)}`;
}

/** The items that add up to the "files" and "deps" totals. */
export const countedItems = (items: readonly CitedItem[]): CitedItem[] => items.filter(item => item.kind === 'evidence');

/** Clicking what is already open closes it; clicking another commit switches to it. */
export function toggleDetail(current: EvidenceDetail | null, next: EvidenceDetail): EvidenceDetail | null {
  if (current?.kind !== next.kind) return next;
  if (current.kind === 'commit' && next.kind === 'commit' && current.commit !== next.commit) return next;
  return null;
}
