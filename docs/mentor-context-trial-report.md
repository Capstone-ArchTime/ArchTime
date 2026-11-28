# Mentor context trial report (protocol 1.3, development set)

| | |
|---|---|
| Date | 2026-11-24 |
| Protocol | [rq2-protocol.md](rq2-protocol.md) "Protocol 1.3" §1.3.8 |
| Workspaces | **ArchTime** `6ac02d6c05de42f87e0eba04` (31 snapshots, 26 evidence records, 31 stored groupings, 2026-10-01 … 10-02) and **Hackathon** `6ac10b6e5a79cd6a59741beb` (84 snapshots, 48 evidence, 3 groupings, 2026-08-02 … 08-24). Development set only |
| Test-set protection | The five test repositories were not used. `scripts/mentor-trial.ts` refused `react-router (C11 test set)` before reading any data ("is a frozen test-set repository … Nothing was read") |
| Model | `gemini/gemini-3.1-flash-lite` (default registry model), temperature not sent (provider default, value unknown), `maxTokens` 2000 |
| Raw outputs | `BE/mentor-trial-results/` (git-ignored): `contexts/` (every context text, by fingerprint), `answers/` (50 records of the complete run), `answers-interrupted-run/` (21 records of a first run that was cut off by a shell pipe; kept, not used), `archtime-0eba04.summary.json`, `hackathon-741beb.summary.json`, `archtime-ask.log` |
| Status | Trial done. **These are indicators of the context's behaviour, not RQ2 results**: one run, one workspace for questions, no human claim judgement |

## 1. Context construction

`npx tsx scripts/mentor-trial.ts --project <id>` for both workspaces.

| | ArchTime 1.2 | ArchTime 1.3 | Hackathon 1.2 | Hackathon 1.3 |
|---|---:|---:|---:|---:|
| Characters | 13,215 | 19,049 | 14,347 | 18,876 |
| Approx. tokens (chars / 4) | 3,304 | 4,762 | 3,587 | 4,719 |
| Fingerprint | `b210e36c1adaa33f` | `18b6c81cf81de88f` | `43f63a2552e4ee06` | `5324aab1c927a984` |
| Commits named (known to the citation check) | 27 | 30 | 29 | 33 |
| Sections | snapshots, evidence, structure | snapshots, evidence, folders, components, dependencies, events, milestones, largest changes | as ArchTime 1.2 | as ArchTime 1.3 |
| Part-level truncation | none | none | none | none |
| Section caps hit ("… not listed") | — | yes (components 1, dependencies 8, events) | — | yes |
| Milestones / components / component edges / events listed | — | 12 / 10 / 23 / 5 (21 renames counted) | — | 3 / 11 / 18 / 5 (3 renames counted) |

**Reproducibility.** Building the ArchTime contexts again (the `--ask` run) gave the same fingerprints
(`b210e36c1adaa33f`, `18b6c81cf81de88f`).

**Retrieved evidence, checked against the database.** The first line of LARGEST DEPENDENCY CHANGES equals the
database's largest change of the whole history in both workspaces (ArchTime `76fdf16` +8/−38; Hackathon `360b009`
+152/−14). The milestone list of ArchTime starts at `d0c882a`, the oldest mined snapshot.

**Defects found by reading the contexts, fixed before the question run** (regression test in
`mentor-context-13.test.mjs`): renames flooded the event list (21 of 26 events in ArchTime, mostly name changes
between clustering-only and LLM-refined milestones); file counts per step were printed as if per event; a milestone
whose version is its hash printed the hash twice.

## 2. Question trial

`npx tsx scripts/mentor-trial.ts --project 6ac02d6c05de42f87e0eba04 --ask`: the ten RQ2 questions (set 1.1, `{repo}` =
"ArchTime"), C0 once, C1 and C2 with the 1.2 and the 1.3 context, one run each: 50 requests.

| | Value |
|---|---|
| Answers / provider errors | 44 / **6** (all HTTP 503 "model is currently experiencing high demand"; the trial script records and does not retry; the RQ2 script records them in `errors/` and asks again on the next run) |
| Tokens | 196,721 input, 8,447 output (provider-reported) |
| Mean input tokens per request | C0 74; C1 1.2 4,374; C2 1.2 4,470; C1 1.3 6,318; C2 1.3 6,414 (1.3 ≈ +44 %) |
| Cost | not computed (no price recorded for this model) |

### 2.1 Citation validity

Every hash cited in a C1 or C2 answer was a mined commit (both context versions). C0 cited one hash in total (Q7),
and it was not a mined commit of the project: an invented citation, as expected without data. In C2 the filter removed
no citation; it downgraded FACT claims without a citation, most visibly in **Q1 with 1.3: 13 FACT claims about
folders and components became INFERENCE**. Those claims rest on the ARCHITECTURE block, which names a milestone hash in
its headers but not on each component line, and the model did not cite it. The downgrade is the intended behaviour
(generated names are not facts), but it means component claims will rarely be FACT under 1.3.

### 2.2 Spot checks against database facts

Automatic: does the answer name the commit (or author) the database gives? "—" = provider error.

| Question | Check | C0 | C1 1.2 | C2 1.2 | C1 1.3 | C2 1.3 |
|---|---|---|---|---|---|---|
| Q2 | names the largest change (added + removed) `76fdf16` | — | fail* | pass | pass | pass |
| Q3 | names the newest dependency change `cdba0c2` | fail | pass | pass | pass | — |
| Q6 | names its author | fail | — | pass | pass | pass |
| Q7 | names the largest removal `76fdf16` | fail | pass | — | pass | pass |
| Q8 | names the oldest mined snapshot `d0c882a` (stricter than the question) | — | fail | fail | pass | pass |

\* C1 1.2 listed `ce9a1c5` (+34) first: the commit with the most *added* dependencies. Q2 says "changed … the most",
which can be read as added only; the check's reading (added + removed) is ours. This is a wording ambiguity of Q2,
not a model error, and annotators would judge the claim true.

Q8: under 1.2 the oldest snapshot *shown* was a recent one, so naming it answers the question as worded; 1.3 adds the
milestones, so the oldest mined snapshot becomes visible. The question asks for the oldest shown, so both are
acceptable answers; only 1.3 lets the model describe the start of the history.

### 2.3 Answers read (qualitative, development data)

- Q1 C2 1.3 described folders and the ten components from the block, all labelled INFERENCE after the check.
- Q2 C2 1.3 ranked `76fdf16` (46), `ce9a1c5` (37), `c5751d8` (22), `5dea1d1` (18), `e611d99` (17): the order of the
  LARGEST DEPENDENCY CHANGES section, with correct totals.
- Q9 C2 1.3 declined ("the project data does not contain information regarding … decision-making") with UNKNOWN; Q9
  and Q10 produced no citation in any C1/C2 answer.

## 3. What the trial does and does not show

**Shows:** the 1.3 context builds on real development data within its budget, with every section and reproducible
fingerprints; its whole-history ranking and milestones match the database; C1 and C2 answers use it and cite only
mined commits; the C2 filter treats component claims as non-facts; unanswerable questions are still declined.

**Does not show:**
- **The Q2 improvement on long histories.** Both development workspaces are short (31 and 84 commits): the 1.2
  context already contained their largest change (ArchTime and Hackathon 1.2 both name it). The improvement for the
  test repositories (react-router: +1,240 in the history vs +7 in the 1.2 window) rests on the construction (a
  whole-history query) and on tests, and cannot be checked on the test set before the run (lock).
- **Effectiveness.** One run, one workspace, automatic indicators, no claim-level human judgement; no rate in this
  report may be read as an RQ2 result.
- **Behaviour under load.** 12 % of requests failed with 503; a test-set run must expect retries.

## 4. Failures and limitations recorded

| # | Finding | Effect | Action |
|---|---|---|---|
| T1 | Three formatting defects in the block (renames, step counts, duplicated hash) | noise in events | fixed and tested before the question run |
| T2 | Provider 503 on 6 of 50 requests | incomplete cells | RQ2 script already keeps failures apart and re-asks; budget for retries |
| T3 | Component claims carry no commit citation → downgraded to INFERENCE in C2 | FACT precision covers few architecture claims | document; optional future change: name the milestone hash on component lines (would be a protocol change) |
| T4 | Q2 wording ("changed the most") is ambiguous between added and added + removed | annotators must accept either reading | note in the annotation guide; no question change (set 1.1 kept) |
| T5 | Development workspaces too short to exercise the history window | Q2 improvement on long histories not demonstrated | stated in protocol 1.3.10 |
| T6 | Temperature not sent; provider model version not reported | run-to-run variation not controlled | record per answer; team to confirm the model |
| T7 | First `--ask` run cut off by a shell pipe after 21 answers | none (kept aside in `answers-interrupted-run/`, not used) | — |

## 5. Answer to the trial's question

The development trial **succeeded as a technical trial**: the context is built correctly, within budget, reproducibly,
and the model uses it with valid citations. It **did not and could not** demonstrate the Q2 improvement on a long
history or any effect on grounding; those are what the approved RQ2 run measures.
