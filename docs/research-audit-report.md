# Research audit: ArchTime paper vs. implementation and evidence

| | |
|---|---|
| Date | 2026-11-24 |
| Paper audited | `archtime_lncs.tex` / `archtime_lncs.pdf` (LNCS draft; source at `Document/Paper/lncs/`, outside this repository) |
| Repository state audited | `origin/Develop` at `06dd028`, **plus** the local, unpushed branch `docs/evaluation-decisions` (`4cd8c17`), merged into the audit branch because it holds the frozen test-set method the paper cites (see D1) |
| Frozen back end named by the paper | `0c5e1f8` ("docs(eval): freeze the test-set method, Reference A by Cong, RQ2 repos and protocol 1.2") |
| Raw RQ1 outputs found | `BE/rq1-results/` of a local worktree (`.claude/worktrees/next-task-280d27/`), git-ignored, not in any branch. Only `recovery.csv` was read for this audit (see D4) |
| Companion documents | [research-completion-report.md](research-completion-report.md) (status, tests, paper revisions), [research-replication-guide.md](research-replication-guide.md) |

Status words used below: **Implemented** (code exists), **Tested** (unit/integration tests cover it), **Measured**
(an experiment on the test set produced the number), **Pending** (planned, not done), **Discrepancy** (paper and
code/evidence disagree).

## 1. Claim-to-evidence map

| Paper claim | Implementation location | Evidence/data location | Current status | Required action |
|---|---|---|---|---|
| §3.2 Snapshot edges are top-level ES `import` declarations with relative specifiers, resolved with/without extension or to `index` | `BE/src/infrastructure/services/DependencyExtractor.ts` (`moduleSpecifiers`, profile `es-import`); `BE/src/domain/architecture/resolveImport.ts`; `buildView.ts` `fileDependencies` | `BE/tests/extractor-syntax.test.mjs`, `extractor-eval.test.mjs` | Implemented, Tested. Paper omits two behaviours: `.js`→`.ts` resolution and `@/` / `~/` aliases to the nearest `src/` are also resolved; side-effect `import './x'` and `import type` count | State aliases and `.js`→`.ts` resolution in §3.2; keep "export-from / require / import() not read" |
| §3.2 Nodes are `.ts .tsx .js .jsx` files; dependency/build/VCS folders skipped | `DependencyExtractor.ts` `getAllFiles`, `SKIPPED_DIRS`; `buildView.ts` `isAnalyzable` (also drops tests, `.d.ts`) | same tests | Implemented, Tested. `isAnalyzable` excludes `*.test.*`, `*.spec.*`, `test(s)/`, `__tests__/` only; react-router `*-test.ts` integration tests are analysed (extractor report §6.1) | Mention the test-file rule and its gap as a threat |
| §3.2 / §4.7 Extractor precision/recall/F1 on 40 seeded files per repository, two annotators, Jaccard agreement | `BE/src/domain/evaluation/extractor.ts`; `BE/scripts/extractor-eval.ts` (`sample`, `score`, new `agree`, `validate`, `--syntax`) | `BE/eval/extractor/*.json`: 5 × 40 files sampled (seed 2026), **0 / 200 labelled** | Implemented, Tested; **not Measured** | Two people label the 200 files; run `agree`, reconcile, `validate`, `score --syntax both`. Until then §4.7 must say pending; abstract/§3.2 TODO stays |
| §3.3 Louvain with hub damping `w = n/√(deg·deg)`, folder link α=0.5, γ=1 then {1.4,2,3,5,8}, k 8–15, s_min 2, deterministic | `BE/src/domain/architecture/cluster.ts` | `BE/tests/architecture-domain.test.mjs` (determinism, order independence) | Implemented, Tested (not re-derived line by line in this audit) | None for the claim; Algorithm 1 is consistent with the code comments |
| §3.3 "range is a target, not a guarantee"; §5.1 ArchTime has 32–72 components vs 6–15 in Reference A | `cluster.ts` (unmergeable isolated groups kept) | `recovery.csv` (`*Components` columns) | Measured (raw data present) | None; but see M003 row: the 8–15 rule is not enforced in name-only mode |
| §3.4 LLM receives only file paths and imports, never source code | `BE/src/domain/architecture/llm/prompt.ts`, `refine.ts` | `architecture-llm.test.mjs` | Implemented, Tested | None |
| §3.4 Refine mode ≤400 files (delta format), name-only above or when the prompt does not fit | `refine.ts` (`maxRefineFiles`, `maxRequestTokens`), `verify.ts` `expandDelta` | `architecture-llm.test.mjs` | Implemented, Tested | None |
| §3.4 / Table 1: "Every answer is expanded and checked by the rules of Table 1" | `verify.ts` `verifyRefine` (refine mode: M001–M008) and `verifyNaming` (name-only: M001, M002 on cluster ids, M005, M006, M007) | `BE/tests/verification-semantics.test.mjs` (new) | **Discrepancy.** In name-only mode — 50 of the 59 test-set milestones — M003 (8–15 components), M004 (≤40 % moved) and M008 (min size) are not applied (they are vacuous for M004/M008, but M003 is simply not checked: milestones have 32–72 clusters) | Say that name-only answers are checked by M001, M002 (every cluster named once), M005–M007 only |
| Title / §3.4 "Verified LLM refinement" | `verify.ts` | `verification-semantics.test.mjs` shows swapped names, a false description, an unfitting role and arbitrary file moves under 40 % all **pass** | **Discrepancy in wording.** The rules verify the *form* (coverage, counts, sizes, move share, name/role/description syntax), not that a file or name is architecturally correct | Use "rule-checked" / "structurally verified" or define "verified" explicitly as structural verification with deterministic fallback (see §3 of the completion report) |
| §3.4 After three failures or a provider error the deterministic grouping is kept; reason stored; tokens/latency/cost recorded | `refine.ts` (receipt, attempts) | `architecture-refine-service.test.mjs`, `llm-metrics.test.mjs` | Implemented, Tested | None |
| §3.4 Component dependencies are always derived from file imports | `buildView.ts` `buildView` → `derive.ts` `deriveComponentEdges` | `architecture-domain.test.mjs` | Implemented, Tested | None |
| §3.5 Matching with dominance δ=0.5 on forward or backward share; moves by unique non-generic base name | `BE/src/domain/architecture/matching.ts` | `component-matching.test.mjs`, `anchoring-audit.test.mjs` (new) | Implemented, Tested | None. Note: move detection is independent of δ by construction |
| §3.5 Evidence rule (churn in some part, every part ≥ m=3 files; assembled/dissolved need ≥ half new/gone) | `matching.ts` (`evidence`, `EVIDENCE_RULE`) | `component-matching.test.mjs` | Implemented, Tested | None |
| §3.5 "On the development set every such report without file changes was judged wrong" | — | `docs/rq1-protocol.md` §4 (dev-set labels, partly by an AI annotator, second annotator labelled a 10/24 sample) | Reported from development data; dev-set label files are not in the repository | Keep, but say the first dev-set annotator was an AI assistant and the second labelled a sample (protocol §4) |
| §3.5 Anchored variant: existing files keep component, new files join majority of placed neighbours, fresh replaces anchored only if modularity gain > τ=0.02 | `BE/src/domain/architecture/anchored.ts` | `architecture-anchored.test.mjs`, `anchoring-audit.test.mjs` (new: stable, new, deleted, moved files, split, merge, restructuring, inertia) | Implemented, Tested | Add the inertia limitation (see D7); moved files are re-placed by neighbours, not by their previous component |
| §3.5 Frozen method: anchored + evidence rule, δ=0.5, m=3, τ=0.02, chosen on the development set; back end `0c5e1f8` | `docs/rq1-protocol.md` §1 (on `docs/evaluation-decisions` only) | commit `0c5e1f8` (local branch, **not on origin**) | Documented; **not reproducible by others** while `0c5e1f8` is unpushed | Push `docs/evaluation-decisions` (or tag `0c5e1f8`) before submission; cite a tag |
| §3.6 Mentor context: 15 latest snapshots, 25 latest evidence records (≤6 files each), "the current components with their dependencies", 24,000 chars, last 10 messages | `BE/src/application/use-cases/llm/ProjectChatContext.ts` (`CHAT_LIMITS`), `ProjectChatUseCase.ts` `mentorProjectData` | `project-chat.test.mjs` | **Discrepancy.** The context has a "LATEST STRUCTURE" block listing up to 60 *file base names* and node/edge counts of the latest snapshot. It contains no recovered components, no component dependencies and no evolution events | Either correct §3.6 ("the latest snapshot's file names and size") or change the mentor before RQ2 is run, record it as protocol 1.3, and re-check Q1 (see D6) |
| §3.6 System prompt requires FACT/INFERENCE/UNKNOWN; data treated as untrusted | `ProjectChatUseCase.ts` `SYSTEM_PROMPT` | `mentor-claim-labels.test.mjs`, `project-chat.test.mjs` | Implemented, Tested | Give the prompt in an appendix (paper TODO) |
| §3.6 Citations of non-mined commits removed; uncited FACT downgraded; counts logged | `BE/src/domain/mentor/claimLabels.ts` `enforceClaimLabels` | `mentor-claim-labels.test.mjs` | Implemented, Tested | None |
| §4.2 Five test repositories, selection criteria, eslint excluded for CommonJS | `docs/rq1-protocol.md` §1, `docs/repo-selection.md` | GitHub API figures of 07/11/2026 | Documented | None |
| §4.2 Milestones: 12 (docusaurus 11) minor releases in a 2-year window; 8 of 59 fell back to clustering; only first two react-router milestones ≤400 files | `BE/scripts/rq1-milestones.ts` (`--tags`) | `rq1-results/milestones/*.json` in the local worktree; protocol §1 C11 notes | Measured (local raw data); milestone files not archived in the repository | Archive the milestone files in the replication package |
| §4.3 Two references per repository written independently before mining | `docs/architecture-references/<repo>.cong.json` (Reference A, 6/8/10/8/15 components, written 2026-11-18) | `BE/scripts/reference-check.ts`, `reference-agreement.ts` (+ new completeness checks and `--csv`) | **Reference A only.** Reference B: 0 / 5. Earliest git evidence of Reference A is commit `0c5e1f8` (2026-11-19), while the protocol records C11 mining notes dated 2026-11-18 | Write Reference B (5 repos), measure agreement before reconciliation, reconcile, re-score. Reword "before the repository is mined" to what can be evidenced (e.g. "before any ArchTime output was viewed"), or add the evidence |
| §4.3 Reference coverage figures (219/542, 679/813, 1,033/1,391, 1,896/1,953, 2,035/2,056) | `reference-check` | not re-run in this audit (needs the five checkouts) | Reported | Re-run `reference-check` at the frozen commits and archive the output |
| §4.4 Compared groupings: anchored, recovered (ablation), clustering only, directory baseline | `BE/src/domain/architecture/evaluation.ts`, `baseline.ts`, `ArchitectureService.evaluation` | `architecture-evaluation.test.mjs`, `directory-baseline.test.mjs` | Implemented, Tested, Measured | None |
| §4.4 LLM-only baseline | — | — | Not implemented (paper TODO) | Requires protocol approval and token budget; must be run on the frozen test set with the same references (see completion report §4) |
| §4.5 RQ1-A: MoJoFM per milestone; Wilcoxon paired by milestone, exact for n≤25 without ties, else normal approximation with tie correction; rank-biserial r; per repository; Holm over the five repositories | `BE/src/domain/architecture/mojo.ts`, `BE/src/domain/evaluation/stats.ts`, `rq1.ts` `recoveryTests` (now with `primary` and Holm) | `mojo.test.mjs` (brute force), `rq1-stats.test.mjs`, `research-audit-rq1.test.mjs` | Implemented, Tested, **Measured**. At `0c5e1f8` the committed report tested only *recovered* against the others and had no Holm step: the paper's anchored-vs-baseline p-values were computed outside the committed pipeline. This audit recomputed them from `recovery.csv` with the new `recoveryTests(…, 'anchored')` and they match Table 3 exactly (D3) | None for the numbers; cite the reproducing command |
| Table 3 "Mean (59)" row (84.5, 79.6, 79.4, 56.2) | `rq1.ts` `renderReport` "All" row = mean over all snapshots | `recovery.csv`: anchored 84.46, recovered 79.63, clustering 79.44, directory 56.19 (milestone-weighted); unweighted means of repository means: 84.49, 79.76, 79.57, 55.80 | Measured; **ambiguous in the paper** (D2) | Say "mean over the 59 milestones (repositories weighted by their number of milestones)" in the caption |
| §4.5 Sensitivity to the reference (A vs B) | — | — | Pending (needs Reference B) | Run RQ1-A against A and B separately |
| §4.5 Stability: MoJoFM between consecutive milestones | `evaluation.ts` `side().stability` | `stability.csv` (local; not read in this audit to protect annotator blindness) | Implemented, Tested; values exist but are not reported | Report after RQ1-B labelling |
| §4.5 RQ1-B: blind sheet, keys apart, two annotators, trueChanges first, κ and AC1, precision/recall/F1 with capped correct | `rq1.ts` (`buildLabelSheet`, `reconcile`, `agreement`, `scoreLabels`), new `validateLabelSheet`, `labelDisagreements`, `scoreByProject`; `scripts/rq1-labels.ts` (new) | Label sheets for 54 pairs created 21/11 (local worktree); **0 pairs labelled** | Implemented, Tested; AC1 now computed by `stats.ts` `gwetAC1` (was a paper TODO: "computed by hand"); **not Measured** | Công and Trường label all 54 pairs; `rq1:labels check`, `rq1:labels agree`, reconcile, score |
| §4.6 RQ2: C0/C1/C2 as described; same data builder for C1 and C2 | `BE/src/domain/evaluation/rq2.ts` `messagesFor`, `postProcess`; `scripts/rq2.ts` | `rq2.test.mjs` | Implemented, Tested | None (but see the context discrepancy above) |
| §4.6 3 repos × 10 questions × 3 conditions × 3 runs = 270 answers | `scripts/rq2.ts` `--runs 3` (default) — **only on `docs/evaluation-decisions`**; `origin/Develop` runs once (90 answers) | No answers collected (`rq2-results/` absent) | Implemented on the unpushed branch, now merged here; **not Measured** (D1, D5) | Push the branch; run RQ2 after the mentor-context decision |
| §4.6 Claim splitting, blind shuffled sheets, S/C/N, refusal, coverage; κ on claims and refusals; cluster bootstrap 10,000; paired differences with Holm | `rq2.ts` `splitClaims`, `buildSheets`, `agreementOf`, `metricsOf`, `comparisonsOf`; `stats.ts` bootstrap, `holm` | `rq2.test.mjs`, `stats-bootstrap.test.mjs`, `research-audit-rq2.test.mjs` | Implemented, Tested; not Measured | None. Added: AC1, supported claims per answerable answer, mixed-run warnings |
| §4.6 Citation validity (automatic) vs citation precision (annotated) | `rq2.ts` `metricsOf` | — | Implemented. Validity checks hash existence only; semantic support of the citation is part of the S verdict (guide: S requires the cited commit to be where it happened) | Say so explicitly in §4.6 so validity is not read as semantic correctness |
| §4.6 "Record model, provider, date and temperature" (TODO) | `scripts/rq2.ts` now stores `model`, `modelInfo`, `promptVersion`, `contextSha256`, `questionsVersion`, `settings`, `askedAt`, `usage`, `latencyMs` per answer, plus `run-log.jsonl`, `contexts/`, `errors/` | — | Implemented (this audit); temperature is recorded only where the client exposes it (OpenAI-compatible default 0) | Fill the TODO from the stored records after the run |
| §4.8 Patch cap of one million characters; frozen method unaffected | `BE/src/domain/mining/miningPlan.ts` `capPatch` (commit `78cf323` on the unpushed branch) | `mining-plan.test.mjs` | Implemented, Tested | None |
| §5.4 Cost of verified refinement (preliminary 127-file measurement) | `llm/metrics.ts`, `organization-ai-cost` | not in repository | Preliminary, development data | Replace with test-set AI-run records (paper TODO) |
| Abstract: "Change detection reaches F1 X.XX; mentor reduces unsupported claims from XX% to YY%" | — | — | Pending | Do not fill until RQ1-B and RQ2 are scored |
| §1 contribution 4: replication package (URL/DOI) | — | — | Pending | Do not invent; publish after the experiments |

## 2. Discrepancies and findings

**D1. The frozen method is not on the main branch.** Commits `78cf323`, `d0585bd`, `0c5e1f8`, `4cd8c17` (patch cap,
RQ2 three runs + bootstrap + Holm, frozen-method decisions and Reference A, C11 notes) exist only on the local branch
`docs/evaluation-decisions`, which is not on `origin`. `origin/Develop` therefore still runs RQ2 once per question (90
answers), has no cluster bootstrap and no Reference A. This explains the "270 vs 90" inconsistency: three runs *are*
implemented, on the unpushed branch. The audit branch merges it.

**D2. "Mean (59)" is milestone-weighted.** Recomputed from `recovery.csv`: directory baseline 56.19 over 59
milestones (11 of them docusaurus at 33.15) vs 55.80 for the unweighted mean of the five repository means. All four
Table 3 means are milestone-weighted (84.46, 79.63, 79.44, 56.19). The number in the paper is right; the caption should
say how it is averaged.

**D3. Table 3 p-values are reproducible, but were not produced by the committed report.** With
`recoveryTests(rows, methods, 'anchored')` and Holm over the five repositories, `recovery.csv` gives exactly the
printed values: vs directory p_Holm = .0025, .005, .0025, .0025, .005 (outline, docusaurus, actual, react-admin,
react-router; r = +1, +1, −1, +1, +1) and vs clustering .168, .0264, .2031, .0236, .0125 (r = −0.64, −1, −0.51, −1, +1).
docusaurus and react-router vs directory use the normal approximation (tied differences); the others are exact. The
report code at `0c5e1f8` only tested *recovered* against the others and had no Holm step, so these figures came from an
uncommitted computation. The report now prints both (anchored first) and writes `recovery-tests.csv` and `summary.json`.

**D4. Raw RQ1 outputs are not preserved.** `rq1-results/` (milestones, recovery/stability CSVs, label sheets, keys) is
git-ignored and lives in a worktree that may be deleted. It must be archived (outside the annotators' reach for
`keys/`, `report.md` and `stability.csv` until labelling is done).

**D5. RQ2 has not been run.** No `rq2-results/` exists anywhere; Table 5 is empty in the paper, correctly.

**D6. The mentor sees file names, not components.** The paper (§3.6) and the RQ2 condition C2 ("full architectural
mentor") imply that the mentor receives the recovered components and their dependencies. The code gives it snapshots,
evidence records and up to 60 file *base names* of the latest snapshot. Question Q1 ("main parts (folders or modules)
… in the latest mined snapshot") may then be unanswerable from the context, because base names carry no folders. This
must be settled before RQ2 runs; changing the context is a methodological change (protocol 1.3), not a bug fix.

**D7. Anchoring can carry a wrong boundary forward.** `anchoring-audit.test.mjs` builds a synthetic case (two 10-file
cliques and one ambiguous file) where moving the file to its better home raises modularity from 0.4680 to 0.4785, a
gain of 0.0105 (< τ = 0.02): the anchored grouping keeps the wrong assignment at every later milestone,
and anchoring is all-or-nothing (one large improvement elsewhere replaces the whole grouping, a small local correction
never surfaces). The react-router result (76.7 anchored vs 51.4) shows the benefit when the first grouping is good; the
same mechanism preserves errors when it is not. The paper's discussion presents only the benefit.

**D8. Extractor scope vs. evaluation scope.** Mining reads only top-level ES imports in `.ts/.tsx/.js/.jsx`. The
labelling rules (and the paper, §4.7) count `export … from`, `require()` and literal `import()` too, so recall is
expected to be below 1 by design. An opt-in profile `all-static` now reads those forms (and `.mjs/.cjs/.mts/.cts`) for
the extractor evaluation only; mining keeps the frozen profile, because switching would change every RQ1 result and
require a full re-run of the test set (protocol §1).

**D9. F1 convention.** RQ1-B returned `F1 = null` when precision and recall were both measured and both 0; the
extractor evaluation returned 0. RQ1-B now returns 0 (a measured failure); `null` remains only for zero denominators.
No reported number changes (the dev-set F1 values are non-zero).

**D10. README was stale.** It described Java/Spring Boot, graph edit distance and a local LLM. Rewritten to the
implemented pipeline.

**D11. Second-annotator independence for references.** `docs/architecture-references/` holds Reference A
(`*.cong.json`) and the unused AI-written references (`*.claude.json`) next to the B templates. A Reference B author
working in this folder can open them. The B author should work from `b-templates/` in a separate checkout and record
that they did not open the A files.

**D12a. The documented annotator command would drop the frozen method from the RQ1-B sheets.**
On `origin/Develop`, `test-set-annotation-report.md` §1 told the second annotator to run
`npm run rq1 -- --milestones --annotator truong`; on the evaluation branch step 1 has `--anchored --tolerance 0.02`, but
the reconcile and re-score steps (`--reconcile`, then `npm run rq1 -- --milestones`) still did not. The script rebuilds
the keys and the reconciled sheet from the groupings of the current run, so those commands would have removed every
change of the anchored grouping (the frozen method) from the key. The steps are corrected, and the script now refuses
to drop a grouping an earlier key had (`droppedMethods`, override `--allow-dropping-methods`).

**D12. Lint is not configured.** `npm run lint` fails with ESLint 9 because `BE` has no `eslint.config.*`. Pre-existing;
not changed by this audit.

## 3. What this audit changed (summary)

Code (all with tests; full list in the completion report): extractor syntax profiles and evaluation exports
(`agree`, `validate`, `results.json`, `summary.csv`); Gwet's AC1; RQ1-B sheet validation, disagreement export,
per-repository scores; Wilcoxon tests with the frozen method as primary grouping and Holm over repositories; both
averages of RQ1-A; reference completeness checks and file-level disagreement export; dominance sensitivity rows (opt-in,
exploratory); RQ2 run records (answer id, prompt version, context fingerprint, errors kept apart, `--force` never
deletes); RQ2 AC1 and supported-claims-per-answer; advisory move audit for refinements. The frozen defaults (mining
extractor, δ = 0.5, m = 3, τ = 0.02, refinement rules) are unchanged.
