// Automatic spot checks for the development-set trial of the mentor context (scripts/mentor-trial.ts). Each check asks
// whether an answer names the commit the database says is the right one. They are indicators that the context lets the
// model find historical facts; they are not RQ2 metrics (those need human claim judgements) and never replace them.

export interface TrialFacts {
  topChange: { hash: string; added: number; removed: number } | null;
  newestChange: { hash: string; author: string } | null;
  oldest: { hash: string; files: number } | null;
  largestRemoval: { hash: string; removed: number } | null;
}

export interface TrialCheck { check: string; expected: string; passed: boolean }

const mentions = (text: string, hash: string | undefined) => !!hash && text.toLowerCase().includes(hash.slice(0, 7).toLowerCase());

/** The spot checks that apply to a question (none for questions without a single database answer). */
export function trialChecks(questionId: string, text: string, facts: TrialFacts): TrialCheck[] {
  const out: TrialCheck[] = [];
  if (questionId === "Q2" && facts.topChange) out.push({ check: "names the largest dependency change of the whole history", expected: facts.topChange.hash.slice(0, 7), passed: mentions(text, facts.topChange.hash) });
  if (questionId === "Q3" && facts.newestChange) out.push({ check: "names the newest dependency change", expected: facts.newestChange.hash.slice(0, 7), passed: mentions(text, facts.newestChange.hash) });
  if (questionId === "Q6" && facts.newestChange) out.push({ check: "names the author of the newest dependency change", expected: facts.newestChange.author, passed: text.toLowerCase().includes(facts.newestChange.author.toLowerCase()) });
  if (questionId === "Q7" && facts.largestRemoval) out.push({ check: "names a commit that removed dependencies (largest removal shown as reference)", expected: facts.largestRemoval.hash.slice(0, 7), passed: mentions(text, facts.largestRemoval.hash) });
  if (questionId === "Q8" && facts.oldest) out.push({ check: "names the oldest mined snapshot (stricter than the question, which asks for the oldest shown)", expected: facts.oldest.hash.slice(0, 7), passed: mentions(text, facts.oldest.hash) });
  return out;
}
