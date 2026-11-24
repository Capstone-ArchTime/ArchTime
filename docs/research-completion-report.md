# Research completion report

| | |
|---|---|
| Date | 2026-11-24 |
| Branch | `claude/archtime-pipeline-audit-cba0ea` = `origin/Develop` (`06dd028`) + merge of local `docs/evaluation-decisions` (`4cd8c17`, holds the frozen method `0c5e1f8`) + the audit changes (uncommitted at the time of writing) |
| Evidence | [research-audit-report.md](research-audit-report.md) (claim map, discrepancies D1–D12), [research-replication-guide.md](research-replication-guide.md) |

No research number in this report was estimated. Every figure is either produced by a command listed here or marked
pending.

## A. Engineering changes

| Area | Files | What changed | Tests |
|---|---|---|---|
| Extractor | `BE/src/infrastructure/services/DependencyExtractor.ts` | `moduleSpecifiers()` (pure, testable) and an explicit `moduleSyntax` profile. `es-import` (default, mining, frozen) is byte-for-byte the old behaviour; `all-static` adds `export … from`, `require()`, `import x = require()`, literal `import()` and `.mjs/.cjs/.mts/.cts`. Computed specifiers are never guessed | `tests/extractor-syntax.test.mjs` (8) |
| Extractor evaluation | `BE/src/domain/evaluation/extractor.ts`, `BE/scripts/extractor-eval.ts` | `labelAgreement` (Jaccard + per-file disagreements), `validateSheet`, `resultsJson`; CLI `agree`, `validate`, `score --syntax es-import|all-static|both`, outputs `results.json`, `summary.csv` | same file |
| Statistics | `BE/src/domain/evaluation/stats.ts` | `gwetAC1` (scale given explicitly; reproduces the development-set hand computation κ −0.0667 / AC1 0.8584) | `tests/research-audit-rq1.test.mjs` |
| RQ1-A | `BE/src/domain/evaluation/rq1.ts`, `BE/scripts/rq1.ts` | `recoveryTests(rows, methods, primary)` with Holm over repositories per comparison; report prints anchored-primary and recovered-primary tests; `aggregateMeans` (milestone-weighted and repository-weighted); `recovery-tests.csv`, `summary.json` | `research-audit-rq1.test.mjs`, `rq1.test.mjs` |
| RQ1-B | `rq1.ts`, `BE/scripts/rq1.ts`, new `BE/scripts/rq1-labels.ts` (`npm run rq1:labels`) | κ + AC1 per repository and pooled; `validateLabelSheet`; `labelDisagreements` → `labels-disagreements.csv`; `scoreByProject` → per-repository table and `detection.csv`; `droppedMethods` guard (a run without `--anchored` can no longer silently drop the frozen method from keys/sheets); F1 = 0 (not null) when P and R are measured and both 0 | `research-audit-rq1.test.mjs`, `rq1.test.mjs` (2 assertions updated for the F1 convention) |
| References | `BE/src/domain/evaluation/referenceAgreement.ts`, `scripts/reference-check.ts`, `scripts/reference-agreement.ts` | `referenceProblems` (placeholders, missing responsibility/evidence, shared/shadowed prefixes, prefixes without trailing `/`, count outside 5–15); `fileDisagreements` (unmatched files and non-mutual-best-match files) → `reference-agreement --csv` | `research-audit-rq1.test.mjs` |
| Matching sensitivity | `BE/src/domain/architecture/evaluation.ts`, `ArchitectureService.ts`, new `BE/src/domain/evaluation/sensitivity.ts`, `scripts/rq1.ts --sensitivity` | `dominance` option plumbed through (default 0.5 unchanged); `filesMoved` per step; `sensitivityRows` (counts per δ and grouping, verdict reuse only for identical changes, precision/recall only when every change is labelled) | `anchoring-audit.test.mjs`, `research-audit-rq1.test.mjs` |
| Anchoring | — (no code change) | Behaviour documented by tests: stable, new, deleted, moved files, split, merge, restructuring, inertia of a wrong boundary, all-or-nothing replacement | `tests/anchoring-audit.test.mjs` (10) |
| Verification semantics | `BE/src/domain/architecture/llm/verify.ts` | `auditRefinement` (advisory, not called by `refine()`): moved files with no import relation to their new component, or weaker than to their origin | `tests/verification-semantics.test.mjs` (7) |
| RQ2 | `BE/src/domain/evaluation/rq2.ts`, `BE/scripts/rq2.ts` | `answerIdOf`, `answerFileName`, `promptVersionOf`, `fingerprint`, `mixedRuns`; each answer stores id, prompt version, context fingerprint (+ `contexts/`), questions version, model info, settings, status; failures to `errors/` (never scored, retried); `--force` moves old answers to `answers/superseded/`; `run-log.jsonl`; AC1 for claims and refusals; `supportedPerAnswerableAnswer`, `answeredWithSupport`; report warns on mixed runs and states that citation validity is not semantic | `tests/research-audit-rq2.test.mjs` (5) |
| Tooling | `BE/tsconfig.scripts.json`, `BE/package.json` | `npm run typecheck` covers `src` and `scripts` (scripts were not type-checked before); `npm run rq1:labels` | — |
| Docs | `README.md`, `docs/research-*.md` (3 new), `docs/extractor-evaluation-report.md`, `docs/test-set-annotation-report.md`, `docs/architecture-reference-evaluation.md`, `docs/rq1-protocol.md`, `docs/rq2-protocol.md` | README rewritten to the implemented pipeline; protocol notes for every change; stale "90 answers", stale Reference A authorship and the missing `--anchored` flags corrected | — |

Not changed on purpose: mining extractor default, clustering, refinement rules and their use in `refine()`, δ = 0.5,
m = 3, τ = 0.02, the mentor's context and prompt, the question set, the label-sheet format.

## B. Task status

| Task | Status | Evidence | Remaining blocker |
|---|---|---|---|
| Phase 1: repository and paper audit | COMPLETED | `docs/research-audit-report.md` | — |
| Locate frozen method / reconcile branches | COMPLETED | `docs/evaluation-decisions` merged; D1 | Push `docs/evaluation-decisions` (or tag `0c5e1f8`) to `origin` |
| Extractor syntax support (opt-in) | COMPLETED | `extractor-syntax.test.mjs` | Adopting it for mining is a protocol decision + full re-run |
| Extractor evaluation pipeline | COMPLETED | `extractor-eval agree/validate/score --syntax both` ran on the real react-router checkout (all metrics null: 40/40 pending) | — |
| Extractor accuracy measurement | BLOCKED | `BE/eval/extractor/*.json`: 0/200 labelled; `validate` reports the 40 pending files of each repository | Two human labellers (≈ 200 files × 2–5 min each, per person) |
| Reference A | COMPLETED (before this audit) | `reference-check` on the frozen checkouts reproduces the paper's figures: 6 comp. 219/542, 8 comp. 679/813, 10 comp. 1,033/1,391, 8 comp. 1,896/1,953, 15 comp. 2,035/2,056; no completeness problem flagged | — |
| Reference B and A–B agreement | BLOCKED | `b-templates/` ready; 0/5 written | A second author per repository |
| Reference completeness / disagreement tooling | COMPLETED | `referenceProblems`, `fileDisagreements`, tests | — |
| RQ1-A recovery accuracy (vs Reference A) | COMPLETED (before this audit; verified now) | `recovery.csv` (59 milestones) recomputed: all Table 3 means and all ten Holm-adjusted p / r values match | Re-score after Reference B (sensitivity) |
| RQ1-A statistics in the committed pipeline | COMPLETED | anchored-primary Wilcoxon + Holm and both averages now in `report.md` / `recovery-tests.csv` / `summary.json` | — |
| RQ1-B annotation workflow (sheets, validation, AC1, disagreements, per-repo scores) | COMPLETED | `rq1-labels.ts`, `research-audit-rq1.test.mjs` | — |
| RQ1-B labelling and scores | BLOCKED | 54 pairs sheeted on 21/11/2026; no annotator sheet exists | Công and Trường label all 54 pairs (≈ 5–10 min per pair each) |
| Agreement statistics (κ, AC1) | PARTIALLY COMPLETED | implemented and tested for RQ1-B, RQ2, extractor (Jaccard), references (MoJoFM) | No labels yet |
| Matching threshold sensitivity (δ 0.3/0.5/0.7) | PARTIALLY COMPLETED | `--sensitivity` implemented and tested; behaviour per δ shown on synthetic cases | Running it on the test set before RQ1-B labels are submitted would show annotators per-grouping change counts; run after labelling |
| Anchoring evaluation | PARTIALLY COMPLETED | 10 behaviour tests incl. a reproducible inertia case (gain 0.0105 < τ keeps a wrong boundary) | Empirical effect on the test set needs RQ1-B labels |
| M001–M008 semantics | COMPLETED | `verification-semantics.test.mjs`; name-only mode applies M001/M002/M005–M007 only | Paper wording (see E) |
| Advisory move audit | COMPLETED | `auditRefinement` + tests | Not applied to stored runs (needs the DB) |
| RQ2 reproducibility (runs, records, errors, no overwrite) | COMPLETED | `research-audit-rq2.test.mjs`; run loop itself needs DB + model and is not unit-tested | — |
| RQ2 metrics incl. abstention guard | COMPLETED | `metricsOf` (+2 metrics), AC1 | — |
| RQ2 execution | BLOCKED | no `rq2-results/` anywhere | Decide the mentor-context question (D6), then credentials + model + 2 annotators for ≈ 270 answers' claims |
| LLM-only baseline | NOT STARTED | — | Protocol approval (new grouping on the frozen test set), token budget, a new script |
| Documentation and replication guide | COMPLETED | `research-replication-guide.md`, README, protocol notes | Replication-package URL/DOI do not exist yet |

## C. Experiment status

| Experiment | Pipeline | Empirical result |
|---|---|---|
| Extractor accuracy | Implemented and run end to end | **None.** 0 of 200 sampled files labelled |
| RQ1-A (MoJoFM vs Reference A) | Implemented | **Measured** on 59 milestones (C11, 21/11/2026); reproduced from raw `recovery.csv` in this audit |
| RQ1-A sensitivity to the reference | Implemented (run per reference) | **None.** Reference B missing |
| RQ1-B (change detection) | Implemented | **None.** 0 of 54 pairs labelled |
| Agreement (RQ1-B, RQ2, extractor, references) | Implemented | **None** on the test set (development-set κ/AC1 only, partly with an AI annotator) |
| Matching sensitivity | Implemented | **None** on the test set (deliberately deferred until labels are in) |
| Anchoring | Implemented, behaviour-tested | Ablation measured in RQ1-A (anchored vs recovered); effect on change detection **pending** |
| Statistical analysis | Implemented and tested | Applied to RQ1-A only |
| RQ2 | Implemented | **None.** No answer collected |

## D. Test report

Commands run in `BE/` on the audit branch (2026-11-24):

| Command | Result |
|---|---|
| `npm ci` | ok |
| `npm test` (baseline, before changes, after merging the evaluation branch) | 869 tests, 869 pass, 0 fail |
| `npm test` (final) | **911 tests, 911 pass, 0 fail, 0 skipped** (42 new tests in 5 new files: extractor-syntax 8, research-audit-rq1 12, research-audit-rq2 5, anchoring-audit 10, verification-semantics 7; 2 assertions of `rq1.test.mjs` updated for the F1 convention) |
| `npx tsc -p tsconfig.json --noEmit` | no errors |
| `npm run typecheck` (src + scripts, new) | no errors |
| `npm run lint` / `npx eslint .` | **fails (exit 2): no `eslint.config.*` for ESLint 9** — pre-existing, unchanged |
| `npx tsx scripts/reference-check.ts --checkout <repo> --ref ../docs/architecture-references/<repo>.cong.json` × 5 (frozen checkouts) | all pass; coverage figures above |
| `npx tsx scripts/extractor-eval.ts validate --truth eval/extractor/<repo>.json --checkout <repo>` × 5 | 1 error each (40 of 40 files not labelled) + 2 warnings (labeledBy, agreement empty) — expected |
| `npx tsx scripts/extractor-eval.ts score --syntax both` (react-router) | runs; `results.json` `final: false`, all metrics null (no labels) |
| Recomputation of Table 3 from `rq1-results/recovery.csv` with `aggregateMeans` and `recoveryTests(…, 'anchored')` | matches the paper (see audit D2, D3) |
| `npm run rq1`, `rq1:milestones`, `rq2 run` | **not run**: they need the mined MongoDB and (for refinement/RQ2) an LLM; re-running `rq1` would also rewrite label sheets during the labelling period |

Known failures: lint (configuration missing). No test failures.

## E. Paper revision recommendations

| Section | Current issue | Supporting evidence | Required correction | Safe now? |
|---|---|---|---|---|
| Title, abstract, §3.4 "verified LLM refinement" | "Verified" reads as verified correctness; the rules check structure only | `verification-semantics.test.mjs`: swapped names, false descriptions, unfitting roles, arbitrary moves under 40 % pass | Define it once ("verified against structural rules M001–M008, with deterministic fallback; the rules do not establish that an assignment is architecturally correct") or use "rule-checked". Renaming the system is not needed | Yes |
| §3.4 "Every answer is … checked by the rules of Table 1" | Name-only mode (50/59 milestones) applies M001, M002 (each cluster named once), M005–M007 only; M003 is not checked (milestones have 32–72 clusters) | `refine.ts` uses `verifyNaming` in name-only mode | Say which rules apply in which mode; add a column to Table 1 | Yes |
| §3.2 extractor description | Omits `.js`→`.ts` and `@/`/`~/` alias resolution, side-effect and type-only imports | `resolveImport.ts`, `buildView.ts` `resolveSpecifier` | Add one sentence | Yes |
| §3.2 TODO, §4.7 extractor accuracy | No labels exist | `eval/extractor/*.json` 0/200 | Keep pending or move to threats; never estimate | Needs data |
| §3.6 mentor context | Claims "current components with their dependencies"; code supplies ≤60 file base names of the latest snapshot | `ProjectChatContext.ts` | Correct the text, or change the mentor before RQ2 (protocol 1.3) | Text fix: yes. Mentor change: decide before RQ2 |
| §3.5 "On the development set every such report … was judged wrong" | Dev-set first annotator was an AI assistant; second labelled 10/24 pairs | `rq1-protocol.md` §4 | State both facts | Yes |
| §3.5 / §6.1 anchoring | Only the benefit is discussed | `anchoring-audit.test.mjs` inertia case; all-or-nothing replacement | Add the limitation: anchoring preserves early boundary errors whose correction gains < τ in modularity, and reveals a local restructuring only if the whole fresh grouping wins | Yes |
| §3.5 "evaluated back end is commit 0c5e1f8" | Commit is on an unpushed local branch | `git branch -a --contains 0c5e1f8` → only `docs/evaluation-decisions` | Push/tag, then cite the tag | After push |
| §4.3 "written before the repository is mined" | Earliest git evidence of Reference A (commit `0c5e1f8`, 19/11) is after the C11 mining notes (18/11) | `git log`, `rq1-protocol.md` §1 | Claim only what is evidenced (e.g. "before any ArchTime output was viewed"), or add timestamped evidence | Yes |
| §4.3 Reference B TODO; §4.5 sensitivity; §6.2 conclusion validity | Reference B missing | `architecture-reference-evaluation.md` | Keep TODO; results remain "against Reference A only" | Needs data |
| Table 3 caption, "Mean (59)" | Averaging unstated; the unweighted mean differs (directory 55.8 vs 56.2) | `recovery.csv`: 56.19 milestone-weighted | "Mean over the 59 milestones (repositories weighted by their number of milestones)" | Yes |
| Table 3 p-values; §4.5 test description | Values are correct but were computed outside the committed pipeline; two of five repositories use the normal approximation because of ties | `recoveryTests(…, 'anchored')` + Holm reproduces every value | Cite the reproducing command; say "exact where no differences are tied (outline, actual, react-admin vs directory), normal approximation otherwise" | Yes |
| §4.4 LLM-only baseline TODO | Not implemented | — | Either run it as a separately approved experiment on the same frozen test set, or state it as future work | Needs approval + data |
| §4.6 RQ2 design | Citation validity could be read as semantic | `rq2.ts` | One sentence: validity = hash exists; support is judged by annotators (citation precision) | Yes |
| §4.6 "Record model, provider, date and temperature" TODO | — | answers now store model info, prompt version, context fingerprint | Fill from the run records after RQ2 | Needs data |
| §4.6 abstention | Lower unsupported rates could come from saying less | new metrics `supportedPerAnswerableAnswer`, `answeredWithSupport` | Report them next to the unsupported rate | Yes (design); numbers need data |
| Table 4 (RQ1-B), Table 5 (RQ2), abstract TODOs, §5 interpretations, conclusion TODO | Empty | — | Leave TBD until scored; never estimate | Needs data |
| §4.8 "MoJoFM, the Wilcoxon test, Cohen's κ, the seeded cluster bootstrap and the Holm adjustment are covered by unit tests"; AC1 TODO | AC1 is now implemented and tested | `stats.ts` `gwetAC1` | Remove the AC1 TODO; add AC1 to that sentence | Yes |
| §5.4 cost of refinement | Preliminary dev measurement | — | Replace with test-set AI-run records | Needs data |
| Contributions (replication package), Data Availability, ORCID, author order | Placeholders | — | Fill only with real identifiers | Needs real values |
| §6.2 external validity | Correctly says `require()`, `import()`, re-exports, aliases are not extracted; aliases `@/`, `~/` *are* partly resolved | `buildView.ts` | Narrow to "other path aliases" | Yes |

## F. Next actions for the research team (in order)

1. **Push** `docs/evaluation-decisions` (or this audit branch) and tag the frozen commit `0c5e1f8`; archive
   `rq1-results/` from the machine that ran C11 (keep `keys/`, `report.md`, `stability.csv` closed to annotators).
2. **RQ1-B labelling:** Công and Trường each run
   `npm run rq1 -- --milestones --anchored --tolerance 0.02 --annotator <name>`, label all 54 pairs alone, run
   `npm run rq1:labels -- check`, then `npm run rq1:labels -- agree --a cong --b truong` **before** reconciling.
3. **Reference B:** one author per repository (not Công), from `b-templates/` in a separate checkout;
   `reference-check`, `reference-agreement --csv`, reconcile by the documentation, re-run RQ1-A per reference.
4. **Extractor labels:** two labellers × 200 files; `agree`, reconcile, `validate`, `score --syntax both`.
5. **RQ2:** decide the mentor-context question (D6) and record it in `rq2-protocol.md`; confirm model, provider and
   budget; run 270 answers; two annotators judge claims and answers; `score`.
6. After labels exist: run `--sensitivity 0.3,0.5,0.7` (exploratory) and report it in the threats section only.
7. Decide whether the LLM-only baseline is in scope; if yes, write its protocol before running anything.
8. Apply the "Safe now" paper corrections of section E.
9. Add an `eslint.config.js` to `BE` so `npm run lint` works.
