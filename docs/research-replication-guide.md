# Research replication guide

How to reproduce every experiment of the ArchTime paper from this repository: environment, data, annotation, and the
commands for the extractor evaluation, RQ1-A, RQ1-B and RQ2. Status of each experiment:
[research-completion-report.md](research-completion-report.md). Claim-by-claim evidence:
[research-audit-report.md](research-audit-report.md). Protocols (Vietnamese): [rq1-protocol.md](rq1-protocol.md),
[rq2-protocol.md](rq2-protocol.md), [extractor-evaluation-report.md](extractor-evaluation-report.md),
[architecture-references/README.md](architecture-references/README.md), [rq1-labelling-guide.md](rq1-labelling-guide.md).

All commands run in `BE/` unless stated. On Windows PowerShell 5.1, `npm run <script> -- <args>` can drop arguments;
use `npx tsx scripts/<script>.ts <args>` instead.

## 1. Environment

| Item | Version used / required |
|---|---|
| Node.js | 22 or later (the audit ran Node 24.18) |
| MongoDB | a local or remote instance; the scripts only read it (except mining, which writes) |
| Git | any recent version; on Windows `git config --global core.longpaths true` (docusaurus has paths over 260 characters) |
| Back end commit | the frozen method is commit `0c5e1f8` (branch `docs/evaluation-decisions`). **It is not on `origin` yet**: push it or tag it before anyone else can replicate |
| OS | developed on Windows 11; nothing in the evaluation depends on it |

```
cd BE
npm ci
npm test                 # 910 tests at the audit commit, all passing
npm run typecheck        # src + scripts (tsconfig.scripts.json)
```

`npm run lint` is not usable yet: `BE` has no `eslint.config.*` for ESLint 9 (pre-existing).

## 2. Dependencies

Runtime dependencies are pinned by `BE/package-lock.json` (`npm ci`). The analysis itself needs only `typescript` (the
parser of the extractor), `simple-git` (mining), `mongoose` (storage) and `@anthropic-ai/sdk` or another LLM client for
refinement and RQ2. The statistics (MoJoFM, Wilcoxon, Holm, Cohen's kappa, Gwet's AC1, bootstrap) are implemented in
`BE/src/domain/architecture/mojo.ts` and `BE/src/domain/evaluation/stats.ts` without external libraries and are unit
tested (`mojo.test.mjs` against brute force, `rq1-stats.test.mjs`, `stats-bootstrap.test.mjs`,
`research-audit-rq1.test.mjs`).

## 3. Environment variables

Copy `BE/.env.example` to `BE/.env`. Required for the evaluation scripts:

| Variable | Needed by | Note |
|---|---|---|
| `MONGODB_URI` | mining, `rq1`, `rq1:milestones`, `rq2 list/run` | the database holding the mined test-set workspaces |
| `JWT_SECRET`, `SMTP_USER`, `SMTP_PASS` | every script that loads the server config | any value works for evaluation-only use |
| `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` (or `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`, `LLM_BASE_URL`) | `rq1:milestones --mode refine`, `rq2 run` | or a model added by an administrator in the app (`rq2 run --model <registry id>`) |
| `LLM_MAX_REFINE_FILES`, `LLM_MAX_MOVE_RATIO` | refinement | leave unset: the frozen values are 400 and 0.4 |

Not needed: `extractor-eval`, `reference-check`, `reference-agreement`, `rq1:labels`, `rq2 sheet/score` (files only).

## 4. Dataset preparation

1. **Checkouts at the frozen commits** (also used for references and the extractor sample):

   | Repository | Commit |
   |---|---|
   | outline/outline | `c0288df8eb4f4b33171e2a26b1f1f51a95f76ae5` |
   | facebook/docusaurus | `4c4ec4aaabc6d70288d53e10203c6d271f0cac7a` |
   | actualbudget/actual | `33912a083822f19090fe45a562d58fe29499ca25` |
   | marmelab/react-admin | `f466cf73330d1458c9e371c5a7bce2659ede5817` |
   | remix-run/react-router | `5d7962ea44fefef43718a6f9e6cce17f4e7e04ab` |

   ```
   git -c core.longpaths=true clone https://github.com/<owner>/<repo>.git
   git -C <repo> checkout <commit>
   ```

2. **Mining.** Create one workspace per repository in the app and mine with `mode: range` from 2024-11-18 to the
   frozen commit's date (rq1-protocol §1, "Ghi chép khi chạy C11"). Mining writes snapshots and evidence to MongoDB.
3. **Milestones** (rule fixed before any score was seen, rq1-protocol §1):

   ```
   npm run rq1:milestones -- --project <id> --tags '^react-router@[78]\.\d+\.0$' --dry-run     # react-router
   npm run rq1:milestones -- --project <id> --tags '^v\d+\.\d+\.0$' --dry-run                  # react-admin, actual, outline
   npm run rq1:milestones -- --project <id> --tags '^v\d+\.\d+\.\d+$' --dry-run                # docusaurus (11 stable releases)
   npm run rq1:milestones -- --project <id> --tags '<same regex>' --mode refine                 # build with clustering + LLM
   ```

   Output: `rq1-results/milestones/<workspace>.json`. The refinement uses the LLM; a milestone whose answer fails
   verification keeps its clustering and the report flags it (8 of 59 in the paper's run).

## 5. Annotation preparation

Three independent human tasks; none may be done by an AI assistant, and none may look at ArchTime output first.

| Task | Template / sheet | Validation | Agreement |
|---|---|---|---|
| Extractor ground truth (2 labellers × 200 files) | `BE/eval/extractor/<repo>.json` → each labeller copies to `<repo>.<name>.json` | `extractor-eval validate` | `extractor-eval agree` (Jaccard) |
| Reference B (one author per repository, not the author of A) | `docs/architecture-references/b-templates/<repo>.B.json`, rules in `architecture-references/README.md` | `reference-check` (now also flags placeholders, missing responsibility/evidence, shared/shadowed prefixes, prefixes without a trailing `/`) | `reference-agreement` (MoJoFM both ways, lower reported; `--csv` lists every file treated differently) |
| RQ1-B change labels (Công and Trường, all 54 pairs each) | `npm run rq1 -- --milestones --annotator <name>` → `rq1-results/labels/<workspace>.<name>.json` | `npm run rq1:labels -- check --annotator <name>` | `npm run rq1:labels -- agree --a cong --b truong` (κ, AC1, trueChanges agreement, disagreements.csv) |
| RQ2 claim and answer judgements (2 annotators) | `rq2-results/sheets/claims.csv`, `answers.csv` → `claims.<name>.csv`, `answers.<name>.csv` | — | `npm run rq2 -- score --a <x> --b <y>` (κ and AC1) |

Independence rules that the tools cannot enforce: Reference B authors work from `b-templates/` in a separate checkout
and do not open `*.cong.json` or `*.claude.json`; RQ1-B annotators do not open `labels/keys/`, `report.md`,
`stability.csv`, `sensitivity.csv` or `detection.csv` before submitting; the first annotator, who ran the pipeline,
labels before opening the score report.

## 6. Extractor evaluation

```
npm run extractor-eval -- sample --checkout <dir> --repo <name> --n 40 --seed 2026     # already done: BE/eval/extractor/
npm run extractor-eval -- agree --a eval/extractor/<repo>.<A>.json --b eval/extractor/<repo>.<B>.json --out extractor-results/agreement/<repo>.json
# reconcile into eval/extractor/<repo>.json, fill labeledBy and agreement, then:
npm run extractor-eval -- validate --truth eval/extractor/<repo>.json --checkout <dir>
npm run extractor-eval -- score --syntax both \
  --truth eval/extractor/outline.json --checkout <outline> --truth eval/extractor/docusaurus.json --checkout <docusaurus> \
  --truth eval/extractor/actual.json --checkout <actual> --truth eval/extractor/react-admin.json --checkout <react-admin> \
  --truth eval/extractor/react-router.json --checkout <react-router>
```

`--syntax both` scores the frozen mining extractor (`es-import`) and the extended profile (`all-static`: adds
`export … from`, `require()`, `import x = require()`, literal `import()`, and `.mjs/.cjs/.mts/.cts`). Report the
`es-import` numbers as the accuracy of the extractor the results rest on; `all-static` shows what extending it would
add. Conventions: precision/recall/F1 are `null` when the denominator is 0; unlabelled files are not scored; micro pools
counts, macro averages repositories that have a value.

## 7. RQ1-A (recovery accuracy)

Prerequisites: milestones built; the reconciled reference of each repository imported (Quality → Reference
architecture, or `npx tsx scripts/reference-export.ts --checkout <dir> --ref <repo>.final.json` and
`PUT /api/projects/:id/architecture/reference`). Until Reference B exists, Reference A (`<repo>.cong.json`) is imported.

```
npm run rq1 -- --milestones --anchored --tolerance 0.02
```

Read `report.md` part A, `recovery.csv`, `recovery-tests.csv` and `summary.json`. The report prints the Wilcoxon tests
twice: first with the frozen method (anchored) as primary grouping, then with recovered; each with Holm over the
repositories. It prints both averages: over all milestones (the paper's "Mean (59)") and over repository means.

**Sensitivity to the reference:** import Reference A, run, keep the folder (`--out rq1-results-refA`); import
Reference B, run again (`--out rq1-results-refB`); then the reconciled reference (`--out rq1-results`).

## 8. RQ1-B (change detection)

```
npm run rq1 -- --milestones --anchored --tolerance 0.02 --annotator cong      # Công's sheets
npm run rq1 -- --milestones --anchored --tolerance 0.02 --annotator truong    # Trường's sheets
npm run rq1:labels -- check                                                    # completeness and consistency
npm run rq1:labels -- agree --a cong --b truong                                # BEFORE reconciling: report this
npm run rq1 -- --milestones --anchored --tolerance 0.02 --reconcile            # merged sheet, conflicts to settle
# settle the conflicts in rq1-results/labels/<workspace>.json by the labelling guide, then:
npm run rq1 -- --milestones --anchored --tolerance 0.02
```

Outputs: `report.md` part B (pooled and per repository), `detection.csv`, `labels-disagreements.csv`,
`rq1-results/agreement/agreement.json`.

**Dominance sensitivity (exploratory, after labelling only):**
`npm run rq1 -- --milestones --anchored --tolerance 0.02 --sensitivity 0.3,0.5,0.7 --out rq1-results-sensitivity`.
It writes per-threshold event counts per grouping. Verdicts are reused only for changes identical to a labelled change
of the frozen run; precision/recall are given only where every change is labelled. It must not be used to choose δ.
Running it before RQ1-B labelling is finished would show per-grouping change counts to the annotators: don't.

## 9. RQ2 (grounding of the mentor)

Before running, settle the mentor-context question (audit D6): the mentor currently receives file base names of the
latest snapshot, not components. Record the decision in `rq2-protocol.md` (version 1.3 if anything changes).

```
npm run rq2 -- list
npm run rq2 -- run --project <id> --repo react-router      # 10 questions × 3 conditions × 3 runs = 90 answers
npm run rq2 -- run --project <id> --repo docusaurus
npm run rq2 -- run --project <id> --repo actual
npm run rq2 -- sheet                                       # blind sheets + keys
# two annotators fill claims.<name>.csv / answers.<name>.csv, then:
npm run rq2 -- score --a <x> --b <y>
# adjudicate sheets/claims.adjudicate.csv -> claims.adjudicated.csv, then score again
```

Each answer file stores: answer id, repository, question id and text, condition, run, model and model info, prompt
version (fingerprint of the condition's fixed prompt), context fingerprint (the context text is saved once in
`contexts/`), questions version, request settings, raw and post-processed text, citation check, valid citations, token
usage, latency, timestamp and status. A failed request goes to `errors/` and is asked again on the next run; an answer
is never overwritten (`--force` moves the old one to `answers/superseded/`). `run-log.jsonl` has one line per request.
The report warns when one condition mixes prompt versions or models, or a repository's C1/C2 answers mix contexts.

## 10. Statistical analysis

| Analysis | Unit | Test / estimator | Correction | Code |
|---|---|---|---|---|
| RQ1-A method comparison | milestone, within one repository (milestones are dependent, so no pooling across repositories) | Wilcoxon signed-rank, exact for n ≤ 25 without tied \|d\|, else normal approximation with tie and continuity correction; matched-pairs rank-biserial r | Holm over the five repositories, per comparison | `stats.ts` `wilcoxonSignedRank`, `holm`; `rq1.ts` `recoveryTests` |
| RQ1-A averages | milestone (paper) or repository | arithmetic mean | — | `rq1.ts` `aggregateMeans` |
| RQ1-B | reported event / real change, pooled over labelled pairs; also per repository | precision, recall (correct capped at trueChanges per pair), F1 | — | `rq1.ts` `scoreLabels`, `scoreByProject` |
| Agreement (RQ1-B verdicts, RQ2 claims and refusals) | item pair | Cohen's κ and Gwet's AC1 (scale given explicitly) | — | `stats.ts` `cohenKappa`, `gwetAC1` |
| Reference agreement | file covered by both references | MoJoFM both directions, lower reported | — | `referenceAgreement.ts` |
| RQ2 rates | question (claims and runs of one question are clustered) | pooled ratio with 95 % percentile cluster bootstrap, 10,000 resamples, seed 20261119 | Holm over C0–C1 and C1–C2 | `stats.ts` `bootstrapRatio`, `bootstrapRatioDifference` |
| Extractor | directed file edge | precision, recall, F1; micro and macro | — | `extractor.ts` |

## 11. Output locations

| Folder (in `BE/`, git-ignored) | Contents | Raw or aggregated |
|---|---|---|
| `eval/extractor/` (committed) | sampled sheets; labellers' copies | raw (human labels) |
| `extractor-results/[es-import|all-static]/` | `report.md`, `edges.csv` (every TP/FP/FN edge), `results.json`, `summary.csv` | edges raw, rest aggregated |
| `rq1-results/milestones/` | chosen milestone snapshot ids per workspace | raw |
| `rq1-results/labels/`, `labels/keys/` | annotators' and reconciled sheets; keys (hidden from annotators) | raw |
| `rq1-results/recovery.csv`, `stability.csv` | per-milestone MoJoFM / per-step stability and change counts | raw measurements |
| `rq1-results/report.md`, `recovery-tests.csv`, `detection.csv`, `summary.json`, `labels-disagreements.csv`, `sensitivity.csv` | aggregated results | aggregated |
| `rq1-results/agreement/` | `agreement.json`, `disagreements.csv` | aggregated / raw disagreements |
| `rq2-results/answers/`, `contexts/`, `errors/`, `run-log.jsonl` | every model answer and its inputs | raw |
| `rq2-results/sheets/`, `keys/` | blind sheets, annotators' copies, adjudication; keys | raw |
| `rq2-results/report.md`, `metrics.csv`, `comparisons.csv` | aggregated results | aggregated |

Never edit generated files by hand except the human-filled fields (labels, verdicts, references). Archive all of the
above with the back-end commit hash in the replication package.

## 12. Reproducibility limitations

- **Unpushed frozen commit.** `0c5e1f8` and the rest of `docs/evaluation-decisions` are local only (audit D1).
- **Database state.** Results depend on the mined MongoDB data; re-mining the same window should give the same
  snapshots (mining and clustering are deterministic), but this has not been verified by an independent re-mine.
- **LLM non-determinism.** Refinement names and RQ2 answers vary between runs and provider versions. Clustering,
  matching and anchoring do not depend on names. RQ2 uses three runs and reports the spread; refined milestone
  groupings are stored, so RQ1 can be recomputed without calling the model again.
- **Provider settings.** Temperature is recorded only where the client exposes it; provider-side model updates cannot
  be pinned by this code.
- **Raw RQ1 outputs** of the paper's run live in a git-ignored folder of a local worktree (audit D4) and must be
  archived; the paper's Table 3 was reproduced from that `recovery.csv` during the audit.
- **Human annotation** (extractor labels, Reference B, RQ1-B labels, RQ2 judgements) is not reproducible by code;
  agreement before reconciliation and every reconciliation decision must be recorded.
- **Not available and not to be invented:** replication-package URL or DOI, ORCID identifiers, total model cost and
  runtime of the test-set run. Mark them pending until they exist.
