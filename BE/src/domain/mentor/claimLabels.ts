// What the AI mentor's answer may claim as FACT. The model is asked to label each claim FACT / INFERENCE / UNKNOWN and to
// cite commits, but nothing makes it obey; this is the check that does, after the answer comes back:
// 1. A cited commit must be a commit mined for this project. Any other hash (made up, from another project, vanished) is
//    taken out of the text.
// 2. A FACT must rest on at least one commit that is still cited after step 1; one that does not becomes an INFERENCE.
// Nothing else in the answer changes. Pure, so it is unit-testable; the caller looks the commits up.

export type ClaimLabel = "FACT" | "INFERENCE" | "UNKNOWN";

export interface LabelCheck {
  /** FACT claims that had no valid citation and now read INFERENCE. */
  downgraded: number;
  /** Hashes that were cited but are not mined commits of this project, as the answer wrote them. */
  removedCitations: string[];
  /** Labels in the answer as returned to the user. */
  labels: Record<ClaimLabel, number>;
}

const LABEL = /\[(FACT|INFERENCE|UNKNOWN)\]/g;
// A commit hash as the model writes it: in backticks (as it is told to), or bare. A bare hex word only counts when it
// mixes digits and letters, so plain numbers ("1234567") and words ("deadbeef", "acceded") are not taken for hashes.
const CITATION = /`([0-9a-fA-F]{7,40})`|\b([0-9a-fA-F]{7,40})\b/g;
const looksLikeHash = (token: string, quoted: boolean) => quoted || (/[0-9]/.test(token) && /[a-fA-F]/.test(token));

/** Every distinct hash the answer cites, lower-cased, for the caller to look up. */
export function citedHashes(answer: string): string[] {
  const found = new Set<string>();
  for (const m of answer.matchAll(CITATION)) {
    const token = m[1] ?? m[2];
    if (looksLikeHash(token, m[1] !== undefined)) found.add(token.toLowerCase());
  }
  return [...found];
}

/** Takes the invalid citations out of one line and tidies what they leave behind: "()", "(, x)", doubled spaces. */
function stripCitations(line: string, isValid: (hash: string) => boolean, removed: Set<string>): string {
  let changed = false;
  const out = line.replace(CITATION, (whole, quoted: string | undefined, bare: string | undefined) => {
    const token = quoted ?? bare ?? "";
    if (!looksLikeHash(token, quoted !== undefined) || isValid(token.toLowerCase())) return whole;
    removed.add(token);
    changed = true;
    return "";
  });
  if (!changed) return line;
  return out
    // "()", "(, )", "(see )", "(xem: )": brackets left with nothing to point at.
    .replace(/\(\s*(?:see|cf\.?|xem)?\s*[:,;]?\s*(?:[,;]\s*)*\)/gi, "")
    // "a1b2c3d`,." -> a list that lost its last item.
    .replace(/[ \t]*[,;][ \t]*([.!?:)])/g, "$1")
    .replace(/\(\s*[,;]\s*/g, "(")
    .replace(/\s*[,;]\s*\)/g, ")")
    .replace(/\s*,\s*,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]+$/, "");
}

/**
 * Applies the two rules to an answer. `isValid` says whether a cited hash (lower case, 7 to 40 characters) is a mined
 * commit of the project. A claim runs from its label to the next label on the same line, and the first claim of a line
 * also takes the text before its label, so "`a1b2c3d` [FACT] ..." counts the citation.
 */
export function enforceClaimLabels(answer: string, isValid: (hash: string) => boolean): { text: string; check: LabelCheck } {
  const removed = new Set<string>();
  let downgraded = 0;

  const lines = answer.split("\n").map(raw => {
    const line = stripCitations(raw, isValid, removed);
    const marks = [...line.matchAll(LABEL)];
    if (!marks.some(m => m[1] === "FACT")) return line;
    let out = "";
    let cursor = 0;
    marks.forEach((mark, i) => {
      const start = mark.index!;
      const end = i + 1 < marks.length ? marks[i + 1].index! : line.length;
      const claim = line.slice(i === 0 ? 0 : start, end);
      out += line.slice(cursor, start);
      if (mark[1] === "FACT" && citedHashes(claim).filter(isValid).length === 0) {
        out += "[INFERENCE]";
        downgraded++;
      } else {
        out += mark[0];
      }
      cursor = start + mark[0].length;
    });
    return out + line.slice(cursor);
  });

  const text = lines.join("\n");
  const labels: Record<ClaimLabel, number> = { FACT: 0, INFERENCE: 0, UNKNOWN: 0 };
  for (const m of text.matchAll(LABEL)) labels[m[1] as ClaimLabel]++;
  return { text, check: { downgraded, removedCitations: [...removed], labels } };
}

/**
 * A matcher over the project's mined commits. A citation is valid when it is a prefix of a mined commit's full hash;
 * old snapshots kept only 7 characters, so for those the first 7 must agree.
 */
export function minedCommitMatcher(commits: { hash: string; fullHash?: string | null }[]): (hash: string) => boolean {
  const full = commits.map(c => (c.fullHash ?? "").toLowerCase()).filter(Boolean);
  const short = new Set(commits.filter(c => !c.fullHash).map(c => c.hash.toLowerCase().slice(0, 7)));
  return (hash: string) => {
    const h = hash.toLowerCase();
    if (h.length < 7) return false;
    return full.some(f => f.startsWith(h)) || short.has(h.slice(0, 7));
  };
}
