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
  | { kind: 'commit'; value: string; commit: string }
  | { kind: 'bold'; children: AnswerSegment[] };

/** The answer as the page lays it out: paragraphs, headings and tables, each made of segments. */
export type AnswerBlock =
  | { kind: 'text'; segments: AnswerSegment[] }
  | { kind: 'heading'; segments: AnswerSegment[] }
  | { kind: 'table'; header: AnswerSegment[][]; rows: AnswerSegment[][][] };

/** What the panel under the answer shows: one commit, the files behind the "files" total, or the dependencies behind "deps". */
export type EvidenceDetail = { kind: 'commit'; commit: string } | { kind: 'files' } | { kind: 'deps' };

// Code spans and labels are cut out first, whole, so a "**" inside `src/**/*.ts` is never taken for bold.
const SPLIT = /(\[(?:FACT|INFERENCE|UNKNOWN)\]|`[^`\n]+`|\*\*)/g;
const LABEL = /^\[(FACT|INFERENCE|UNKNOWN)\]$/;
const HASH = /^[0-9a-f]{7,40}$/i;
const HEADING = /^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

export const shortCommit = (value: string) => value.trim().toLowerCase().slice(0, 7);

type Flat = AnswerSegment | { kind: 'marker' };

function mergeText(segments: AnswerSegment[]): AnswerSegment[] {
  const out: AnswerSegment[] = [];
  for (const segment of segments) {
    const last = out[out.length - 1];
    if (segment.kind === 'text' && last?.kind === 'text') last.value += segment.value;
    else out.push(segment);
  }
  return out;
}

/**
 * Pairs "**" markers into bold. An opener needs something other than a space after it and a closer something other
 * than a space before it; bold never spans a line break. A marker that finds no partner stays as the literal "**".
 */
function foldBold(flat: Flat[]): AnswerSegment[] {
  const out: AnswerSegment[] = [];
  let open = -1;
  const startsWithSpace = (item: Flat | undefined) => item?.kind === 'text' && /^\s/.test(item.value);
  const endsWithSpace = (item: Flat | undefined) => item?.kind === 'text' && /\s$/.test(item.value);
  const spansLines = (items: AnswerSegment[]) => items.some(item => item.kind === 'text' && item.value.includes('\n'));

  flat.forEach((item, index) => {
    if (item.kind !== 'marker') { out.push(item); return; }
    if (open >= 0 && spansLines(out.slice(open + 1))) open = -1;
    if (open >= 0 && out.length > open + 1 && !endsWithSpace(flat[index - 1])) {
      const children = mergeText(out.splice(open + 1));
      out[open] = { kind: 'bold', children };
      open = -1;
      return;
    }
    const next = flat[index + 1];
    if (open < 0 && next && next.kind !== 'marker' && !startsWithSpace(next)) {
      open = out.length;
    }
    out.push({ kind: 'text', value: '**' });
  });
  return mergeText(out);
}

/**
 * Splits an answer line into plain text, **bold**, the model's FACT / INFERENCE / UNKNOWN labels, `code` spans, and
 * commit hashes. Only a hash the server confirmed as cited becomes a `commit`; any other code span stays code.
 */
export function tokenizeAnswer(text: string, citedCommits: readonly string[] = []): AnswerSegment[] {
  const cited = new Set(citedCommits.map(shortCommit));
  const flat: Flat[] = [];
  for (const part of text.split(SPLIT)) {
    if (!part) continue;
    if (part === '**') { flat.push({ kind: 'marker' }); continue; }
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      const value = part.slice(1, -1);
      flat.push(HASH.test(value) && cited.has(shortCommit(value))
        ? { kind: 'commit', value, commit: shortCommit(value) }
        : { kind: 'code', value });
      continue;
    }
    const label = LABEL.exec(part)?.[1] as AnswerLabel | undefined;
    flat.push(label ? { kind: 'label', value: label } : { kind: 'text', value: part });
  }
  return foldBold(flat);
}

const cellsOf = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());

/**
 * Lays an answer out as paragraphs, headings ("### Title") and tables ("| a | b |" with a "---" rule under the header).
 * Anything else stays text with its line breaks; a table-looking line without the rule is not turned into a table.
 */
export function parseAnswer(text: string, citedCommits: readonly string[] = []): AnswerBlock[] {
  const lines = text.split('\n');
  const blocks: AnswerBlock[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const value = buffer.join('\n').replace(/^\n+|\n+$/g, '');
    buffer = [];
    if (value) blocks.push({ kind: 'text', segments: tokenizeAnswer(value, citedCommits) });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', segments: tokenizeAnswer(heading[1], citedCommits) });
    } else if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_ROW.test(lines[i + 1]) && TABLE_RULE.test(lines[i + 1])) {
      flush();
      const header = cellsOf(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(cellsOf(lines[i++]));
      i--;
      const fit = (cells: string[]) => header.map((_, column) => tokenizeAnswer(cells[column] ?? '', citedCommits));
      blocks.push({ kind: 'table', header: fit(header), rows: rows.map(fit) });
    } else {
      buffer.push(line);
    }
  }
  flush();
  return blocks;
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
