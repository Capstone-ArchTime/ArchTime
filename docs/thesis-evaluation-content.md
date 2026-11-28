# Experimental Evaluation: Design, Extractor Accuracy and Task Tracking

*Thesis content draft (task T11). Author: Đặng Nhật Trường. To be merged into the thesis by Nguyễn Duy Công. Requirement
identifiers refer to BM04; file paths refer to the ArchTime repository. Every figure in this draft was measured in the
repository on 16 November 2026, except the RQ1-B results of Section 6, which were measured on 27 November 2026, and the
RQ2 results of Section 7, which were measured on 28 November 2026. Sections
whose results depend on human labels that do not exist yet are marked **[PENDING]** and contain no numbers; they must not
be filled in with estimates.*

## 1. Overview

ArchTime recovers the architecture of a software project from its commit history and tracks how that architecture
changes. The evaluation answers two research questions about the recovered architecture (RQ1-A, recovery accuracy;
RQ1-B, change detection), one about the AI mentor that explains it (RQ2, whether grounding in the mined evidence reduces
unsupported claims), and one descriptive question about the input the recovery depends on (EX, the accuracy of the
dependency extractor). This chapter describes how the evaluation was designed so that its results can be trusted: the
separation of a development set from a test set, the criteria for choosing test repositories, how reference
architectures and labels are produced by people independently of the tool, and how agreement between those people is
measured. It also reports the evaluation of the task-tracking feature (F-13) and of the comparison feature (F-04),
including the performance requirement N-02.

## 2. Development set and test set

The most important rule of the method is the separation of data used to build the tool from data used to judge it
(`docs/rq1-protocol.md` §1).

- **Development set.** The workspaces the team used while building ArchTime (the ArchTime repository itself and a
  hackathon project). Algorithms, parameters and the experimental *anchored* variant were tuned on this set only.
- **Test set.** Five open-source repositories chosen before any result on them was seen. The algorithm and its parameters
  are frozen (the commit hash of the backend is recorded) before the test set is run, and the test set is run once.
  Nothing is adjusted according to its results; a defect that must be fixed is reported and the whole set is run again.

This separation protects the evaluation against the most common threat in tool evaluations, tuning to the data on which
the tool is assessed.

## 3. Repository selection criteria

The five test repositories were selected on 7 November 2026 against four criteria fixed in advance
(`docs/rq1-protocol.md` §1):

1. at least 80 % JavaScript/TypeScript and roughly 200–3,000 source files after removing tests, build output and
   dependencies (the extractor reads ES-module JavaScript and TypeScript);
2. at least two years of history and at least ten release tags (milestones for RQ1-B);
3. architecture documentation in the repository (an `ARCHITECTURE.md`, ADRs or a documentation page), so that a
   reference architecture can be written without looking at ArchTime's output;
4. not a repository of the team, and at least one repository whose directory structure does **not** reflect its
   functional architecture.

| Repository | JS/TS | Source files (protocol count) | Tags | Since | Architecture documentation |
|---|---|---:|---:|---|---|
| outline/outline | 99 % | 2,012 | 255 | 2016 | `docs/ARCHITECTURE.md` |
| facebook/docusaurus | 98 % | 690 | 189 | 2017 | `website/docs/advanced/architecture.mdx` |
| actualbudget/actual | 99 % | 1,824 | 64 | 2022 | architecture page and ADRs |
| marmelab/react-admin | 100 % | 1,056 | 448 | 2016 | `docs/Architecture.md` |
| remix-run/react-router | 100 % | 512 | 1,081 | 2014 | `decisions/` (ADRs) |

Outline satisfies criterion 4: its directories are organised by tier (`app/`, `server/`, `shared/`), while its functional
blocks (documents, collections, search, authentication) cut across the tiers. Repositories were excluded for being
written in CommonJS (eslint, whose `require` calls the extractor does not read), for lacking architecture documentation
(excalidraw, typeorm, nest, vite, insomnia), for a low JavaScript share (immich), or because their "architecture"
documents only instruct AI assistants (bruno, astro).

For the evaluation every repository is fixed at one commit (Table 2). The same commit is used for the reference
architecture and for the extractor sample, so that a single checkout serves both.

*Table 2. Commits of the test set (default branch, 16 November 2026) and the number of source files ArchTime analyses
there (tests, `__tests__`, build output and declaration files excluded; examples and documentation sites included).*

| Repository | Commit | Analysed source files |
|---|---|---:|
| outline | `c0288df8eb4f` | 2,056 |
| docusaurus | `4c4ec4aaabc6` | 813 |
| actual | `33912a083822` | 1,953 |
| react-admin | `f466cf73330d` | 1,391 |
| react-router | `5d7962ea44fe` | 542 |

## 4. Reference architectures

RQ1-A compares the recovered architecture with a **reference architecture** written by people. A reference is a list of
components, each with a responsibility and a set of path prefixes; a prefix may be the full path of a single file, so a
file can be assigned by its function rather than by its directory (`docs/architecture-references/README.md`).

**Independence.** For each repository two people write a reference independently, from the repository's documentation
and code, **before** seeing any output of ArchTime. Each writes their own file, does not open the other's until both are
submitted, and records the documents read and, for every component, the evidence for it. References are written by
function: the guide asks writers to assign individual files when a directory mixes functions. This addresses a known
threat of the method: a reference written as directory prefixes favours the directory baseline (on the ArchTime
repository the directory baseline scored MoJoFM 64.69 against a directory-shaped reference, above the recovered
architecture's 55.74; `docs/rq1-protocol.md` §7).

**Reconciliation.** After both references are compared (Section 5), the two writers settle each disagreement by the
repository's documentation, not by either writer's preference, and record each decision. The reconciled reference is
imported into the repository's workspace and used for RQ1-A.

**[PENDING]** By 16 November 2026, reference A had been written for all five repositories: react-router (13 components,
208 of 542 analysed files; integration tests and playgrounds deliberately excluded), docusaurus (15 components, 671 of
813), react-admin (16 components, 994 of 1,391; examples excluded), actual (19 components, 1,789 of 1,953) and outline
(16 components, 2,035 of 2,056, assigned file by file because its folders follow tiers rather than functions). All were
written by an AI assistant from the repositories' architecture documents and source, before
ArchTime had been run on these repositories; this is disclosed as in the development set. Reference B, by a team
member working independently, and therefore writer agreement, are pending for all five repositories
(`docs/architecture-reference-evaluation.md`).

## 5. Agreement between reference writers (MoJoFM)

The agreement of the two writers is measured with **MoJoFM** (Wen and Tzerpos, 2004), the same measure used for RQ1-A.
MoJoFM(A, B) is the share of the work needed to turn an arbitrary grouping into B that grouping A already does:

MoJoFM(A, B) = (1 − mno(A, B) / max mno(·, B)) × 100,

where mno(A, B) is the minimum number of *move* and *join* operations that transform A into B. The implementation
(`BE/src/domain/architecture/mojo.ts`) is validated against a brute-force search on small groupings
(`BE/tests/mojo.test.mjs`).

The comparison tool (`npm run reference-agreement`; `BE/src/domain/evaluation/referenceAgreement.ts`) assigns every
analysed source file at the fixed commit to a component of each reference, using the rule ArchTime itself uses when it
scores against a reference (the most specific matching prefix wins), and computes MoJoFM on the files **both** references
assign. Because MoJoFM is not symmetric, both directions are computed and the **lower** value is reported as the
agreement. The coverage of each reference is reported alongside, since agreement on a fifth of the files says less than
agreement on most of them. The tool refuses two references by the same author, references of different commits and a
checkout at the wrong commit, and lists prefixes that match no file. Its tests include a hand-computed case: two
groupings of four files that differ in one file have MoJoFM 50 in both directions.

Writer agreement is interpreted as an upper bound of what any automatic recovery can be expected to reach on a
repository: if two informed people agree at 70, a recovered architecture at 70 is as close to "the" architecture as a
second person would be.

**[PENDING]** Agreement per repository (Table 3 in `docs/architecture-reference-evaluation.md`).

## 6. Labelling architectural changes (RQ1-B)

For RQ1-B each method's reported changes between consecutive milestones are judged by people
(`docs/rq1-protocol.md` §4, `docs/rq1-labelling-guide.md`):

1. Labelling sheets **hide the method**: the changes of all methods for a pair of milestones are merged into one list,
   each change has a random key, and the list is sorted by key. The key file that maps changes to methods is never given
   to labellers.
2. For each pair a labeller first records `trueChanges`, the number of real architectural changes (a functional block
   added, removed, split, merged or reorganised), **before** reading the reported changes. Only then is each reported
   change judged `correct` or `wrong`, independently of the others. A pair in which no source file is added, removed or
   moved has `trueChanges = 0` by rule.
3. Two labellers work independently. Agreement is recorded **before** reconciliation: the share of pairs with equal
   `trueChanges`, the mean difference, Cohen's κ on verdicts and, because κ is unstable when almost all verdicts fall in
   one class (the "kappa paradox"), Gwet's AC1.
4. Disagreements are settled by the rules of the labelling guide; settled values carry a note.

Precision, recall and F1 of change detection are computed per method on the reconciled sheets: precision = correct /
reported, recall = correct / Σ `trueChanges`, F1 their harmonic mean; a method is credited with at most `trueChanges`
correct changes per pair.

On the development set, the first labeller was an AI assistant and the second a team member, who labelled a random sample
of 10 of the 24 pairs with file changes (seed 2026). Before reconciliation 14 of 16 verdicts agreed (κ = −0.07, AC1 = 0.86)
and `trueChanges` agreed exactly on 2 of 10 pairs. This is reported as a limitation (Section 11).

### 6.1 Labelling of the test set

The test set was mined and its milestones were built in task C11 (21 November 2026): 54 pairs of consecutive milestones
over the five repositories (react-router 11, docusaurus 10, react-admin 11, actual 11, outline 11), with 792 reported
changes to judge (381, 29, 35, 194 and 153). Two team members, Nguyễn Duy Công and Đặng Nhật Trường, labelled **all**
pairs independently; no AI assistant labelled the test set. Every pair carries `trueChanges` and a note, and every
`correct` verdict carries a note as evidence. The validation command reported no error on any sheet.

Agreement before reconciliation (`rq1-labels.ts agree`, 27 November 2026) is shown in Table 6. Over all 792 verdicts the
labellers agreed on 70.6 %, with Cohen's κ = 0.21 and Gwet's AC1 = 0.53. Neither sheet changed after agreement was
measured. The 262 disagreements, in 37 of the 54 pairs, were all settled by the rules of the labelling guide
(`docs/test-set-annotation-report.md` §4). Scores were then computed on the reconciled sheets with the frozen method
(backend commit `a7a22df` recorded in `summary.json`), using
`npx tsx scripts/rq1.ts --milestones --anchored --tolerance 0.02`.

*Table 6. Agreement of the two labellers on the test set before reconciliation.*

| Repository | Pairs | `trueChanges` identical | Mean difference | Verdicts | Verdict agreement | κ | AC1 |
|---|---:|---:|---:|---:|---:|---:|---:|
| react-router | 11 | 27.3 % | 4.09 | 381 | 78.0 % | 0.23 | 0.69 |
| docusaurus | 10 | 70.0 % | 0.30 | 29 | 69.0 % | 0.20 | 0.50 |
| react-admin | 11 | 81.8 % | 0.18 | 35 | 57.1 % | 0.18 | 0.19 |
| actual | 11 | 27.3 % | 2.09 | 194 | 67.5 % | 0.19 | 0.46 |
| outline | 11 | 27.3 % | 1.55 | 153 | 59.5 % | 0.14 | 0.25 |
| **Pooled** | **54** | | | **792** | **70.6 %** | **0.21** | **0.53** |

### 6.2 Results

Table 7 gives TP, FP and FN summed over the five repositories, the micro averages computed from them, and the macro
averages of the per-repository values. The reconciled sheets contain 133 true changes. Percentages are computed from the
exact fractions and may differ by 0.1 point from the rounded values in `report.md` (for example, anchored recall is
105/133 = 78.9 %).

*Table 7. Change detection on the test set (54 pairs, 133 true changes).*

| Grouping | TP | FP | FN | Precision | Recall | F1 | Macro precision | Macro recall | Macro F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ArchTime, anchored (frozen method) | 105 | 205 | 28 | 33.9 % | **78.9 %** | **47.4 %** | 36.3 % | **83.6 %** | **50.2 %** |
| Clustering only | 78 | 152 | 55 | 33.9 % | 58.6 % | 43.0 % | 43.2 % | 56.3 % | 46.7 % |
| ArchTime, recovered | 74 | 157 | 59 | 32.0 % | 55.6 % | 40.7 % | 39.6 % | 56.7 % | 45.1 % |
| Directory baseline | 13 | 8 | 120 | 61.9 % | 9.8 % | 16.9 % | 72.2 %¹ | 11.3 % | 16.9 % |

¹ Over three repositories only: the baseline reported no change on docusaurus and outline, so its precision is undefined
there.

*Table 8. Change detection per repository (reconciled sheets; from `BE/rq1-results/report.md`, section B).*

| Repository | True changes | Grouping | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| react-router | 40 | Anchored | 16 | 99 | 24 | 13.9 % | 40.0 % | 20.6 % |
| | | Clustering only | 31 | 103 | 9 | 23.1 % | 77.5 % | 35.6 % |
| | | Recovered | 26 | 102 | 14 | 20.3 % | 65.0 % | 30.9 % |
| | | Directory baseline | 4 | 0 | 36 | 100.0 % | 10.0 % | 18.2 % |
| docusaurus | 5 | Anchored | 5 | 10 | 0 | 33.3 % | 100.0 % | 50.0 % |
| | | Clustering only | 3 | 3 | 2 | 50.0 % | 60.0 % | 54.5 % |
| | | Recovered | 3 | 5 | 2 | 37.5 % | 60.0 % | 46.2 % |
| | | Directory baseline | 0 | 0 | 5 | n/a | 0.0 % | n/a |
| react-admin | 7 | Anchored | 6 | 10 | 1 | 37.5 % | 85.7 % | 52.2 % |
| | | Clustering only | 3 | 4 | 4 | 42.9 % | 42.9 % | 42.9 % |
| | | Recovered | 4 | 5 | 3 | 44.4 % | 57.1 % | 50.0 % |
| | | Directory baseline | 2 | 1 | 5 | 66.7 % | 28.6 % | 40.0 % |
| actual | 39 | Anchored | 37 | 53 | 2 | 41.1 % | 94.9 % | 57.4 % |
| | | Clustering only | 19 | 26 | 20 | 42.2 % | 48.7 % | 45.2 % |
| | | Recovered | 20 | 25 | 19 | 44.4 % | 51.3 % | 47.6 % |
| | | Directory baseline | 7 | 7 | 32 | 50.0 % | 17.9 % | 26.4 % |
| outline | 42 | Anchored | 41 | 33 | 1 | 55.4 % | 97.6 % | 70.7 % |
| | | Clustering only | 22 | 16 | 20 | 57.9 % | 52.4 % | 55.0 % |
| | | Recovered | 21 | 20 | 21 | 51.2 % | 50.0 % | 50.6 % |
| | | Directory baseline | 0 | 0 | 42 | n/a | 0.0 % | n/a |

**Interpretation.** The anchored method has the highest recall and F1, both micro and macro. It is clearly better than
the directory baseline, which is precise when it reports something but finds fewer than one true change in ten, and
slightly better than the two other groupings. Its precision is low, about one reported change in three is correct, and
no better than that of the other groupings. The results are also uneven across repositories: on react-router the
anchored method reaches only 20.6 % F1, below clustering only (35.6 %), while it finds every true change on docusaurus and
reaches 70.7 % F1 on outline. No significance test was applied to RQ1-B; the Wilcoxon tests in `report.md` belong to RQ1-A.

With precision at this level, detected changes should be presented as **suggestions backed by evidence for a person to
review**, not as facts. This matches the design of the tool: the mentor separates FACT from INFERENCE and cites evidence,
and a maintainer reviews changes before they are accepted.

## 7. Grounding of the AI mentor (RQ2)

RQ2 asks whether grounding the AI mentor in the mined evidence, with mandatory claim labels and citation filtering,
reduces unsupported claims compared with an ungrounded assistant and with the same evidence without labels and
filtering, without excessive refusal. The protocol is `docs/rq2-protocol.md` (version 1.3, approved on 28 November
2026).

### 7.1 Design and run

The same model answers the same questions under three conditions. **C0** receives the question and the repository name
only. **C1** also receives the project data the mentor would receive (snapshots, change evidence, the stored
architecture of up to twelve milestones, the ten largest dependency changes of the whole history) and is told to answer
from it, without labels or citation rules. **C2** is the mentor unchanged: the same data, the mentor prompt (FACT /
INFERENCE / UNKNOWN labels, commit citations) and the post-generation check that removes citations of commits that are
not mined and downgrades FACT claims left without a valid citation. C0 vs C1 isolates the effect of the evidence, C1 vs
C2 the effect of labels and filtering.

Three test repositories are used at their frozen commits: react-router, docusaurus and actual. Each has ten fixed
questions, eight answerable from the mined data and two not (design rationale, number of production users). Each
question is asked three times per condition, giving 270 answers. All answers were generated on 28 November 2026 with
`gemini/gemini-3.1-flash-lite`, at most 2,000 output tokens and the provider's default temperature (1.45 million input
and 58 thousand output tokens in total). Every answer records the model, the prompt version and a fingerprint of the
context it received.

Answers are split into 1,743 claims. Two annotators, Nguyễn Duy Công and Đặng Nhật Trường, judged every claim blind to
the condition (labels removed, order shuffled) as Supported (S), Contradicted (C) or Not verifiable (N), checking it
against the repository at the frozen commit with Git, not against ArchTime. They also marked each answer as a refusal or
not and, for answerable questions, its coverage. A first annotation pass was discarded before any score was computed,
because some verdicts had been checked against ArchTime's mined data instead of the repository; the claims concerned were
annotated again. Disagreements were then settled against the repository.

### 7.2 Results

*Table 9. Agreement of the two annotators on RQ2 before adjudication.*

| Item | Pairs | Agreement | Cohen's κ | Gwet's AC1 |
|---|---:|---:|---:|---:|
| Claim verdicts (S / C / N) | 1,743 | 87.3 % | 0.80 | 0.82 |
| Refusal (yes / no) | 270 | 97.4 % | 0.90 | 0.96 |

The 221 claims the annotators disagreed on (C vs N 88, C vs S 70, N vs S 63) were adjudicated, so every claim has a final
verdict. **[TEAM]** Record who adjudicated.

*Table 10. RQ2 results per condition (90 answers each; from `BE/rq2-results/report.md`).*

| Metric | C0 | C1 | C2 |
|---|---:|---:|---:|
| Judged claims (per answer) | 658 (7.31) | 509 (5.66) | 576 (6.40) |
| Unsupported (C + N) | 90.9 % | 27.3 % | 34.5 % |
| 95 % interval (cluster bootstrap over questions) | 81.9–97.9 % | 20.3–36.7 % | 28.1–42.1 % |
| Lowest–highest run | 89.5–92.3 % | 23.1–30.4 % | 31.8–36.9 % |
| Contradicted | 29.3 % | 9.4 % | 11.8 % |
| Citation precision (cited claims that are Supported) | 0.0 % of 38 | 81.2 % of 234 | 77.2 % of 307 |
| Citation validity (cited hashes that are mined commits) | 0.0 % | 100.0 % | 100.0 % |
| FACT precision | n/a | n/a | 81.4 % of 183 |
| Refusal, unanswerable questions | 30.6 % | 100.0 % | 100.0 % |
| Refusal, answerable questions | 0.0 % | 0.0 % | 0.0 % |
| Coverage, answerable questions (0–1) | 0.16 | 0.97 | 0.93 |
| Supported claims per answerable answer | 0.71 | 5.14 | 5.21 |
| Answerable questions with at least one Supported claim | 20.8 % | 97.2 % | 95.8 % |

Differences in unsupported rate, paired cluster bootstrap over questions with Holm adjustment over the two comparisons:
C0 − C1 = +63.6 points (95 % interval +55.0 to +71.2, adjusted p = 0.0004); C1 − C2 = −7.2 points (−11.9 to −1.7,
adjusted p = 0.012). Both differences are significant.

**Interpretation.** The evidence is what grounds the mentor. Without project data, nine claims in ten could not be
supported from the repository and almost a third were contradicted by it; C0 wrote 38 distinct commit hashes, none of
which exists in the repositories, and answered most unanswerable questions anyway. With the data, the unsupported rate
falls to about a quarter, every cited commit exists, and every unanswerable question is declined. The gain does not
come from saying less: C1 answers contain more Supported claims per answerable question (5.14 vs 0.71) and almost every
answerable question receives at least one.

Labels and filtering do not reduce unsupported claims further. C2's unsupported rate is 7.2 points higher than C1's,
with similar coverage and Supported claims per answer: answers written with labels contain more claims, and the extra
ones are more often Not verifiable. The post-generation check downgraded 120 FACT labels and removed 36 citations (all in
three answers). The labels remain useful to a reader, since four FACT claims in five are Supported and every remaining
citation exists, but a FACT label is not proof: users should follow the cited commit rather than trust the label. This
result is reported although it runs against the reason the labels were introduced.

The answers, contexts, blind sheets, both annotators' verdicts, the adjudication and the computed results are published
in the replication package, <https://doi.org/10.5281/zenodo.24625325>; the scores can be recomputed from those files
without a database or an LLM.

## 8. Extractor evaluation (EX)

### 8.1 Design

The recovered architecture can be no better than the dependency graph it is built from, so the extractor that mining
actually uses (`BE/src/infrastructure/services/DependencyExtractor.ts` with `fileDependencies`) is evaluated against
dependencies labelled by people.

- **Sample.** For each test repository, 40 source files are drawn uniformly at random from the files the extractor
  analyses (plus JavaScript files it may miss) with a fixed seed (2026), using `npm run extractor-eval -- sample`. Running
  the command again on the same checkout reproduces the same 40 files; this was verified.
- **Unit.** A directed file-to-file dependency from a sampled file to another source file of the repository. A predicted
  dependency is a true positive when a labeller listed it, a false positive otherwise; a labelled dependency the extractor
  did not produce is a false negative.
- **Labels.** Two people independently list, for each sampled file, every repository source file it depends on through
  `import`, `import type`, `export … from`, `require()` or `import()` with a literal path, excluding packages, Node
  built-ins, tests and build output, without looking at ArchTime's output. Their edge-set agreement (|A ∩ B| / |A ∪ B|) is
  recorded before reconciliation.
- **Metrics.** Precision, recall and F1 per repository; **micro** averages from summed TP, FP and FN, and **macro**
  averages of the per-repository values. A metric whose denominator is zero is reported as *n/a*, not as 0. Unlabelled
  files are excluded and counted as *pending*; results are final only when no file is pending.

### 8.2 Results

**[PENDING]** The five sheets were generated (`BE/eval/extractor/*.json`, 200 files in total), but no file had been
labelled by 16 November 2026. The table of TP, FP, FN, precision, recall and F1 per repository, micro and macro, is to be
filled from `BE/extractor-results/report.md` once labelling is complete.

What is known before measurement comes from tests on a constructed repository: the extractor finds `import` and
`import type` declarations, correctly ignores npm packages, and does **not** follow `export … from`, `require()` or
dynamic `import()`. Recall is therefore expected to be lower in repositories with many barrel files.

## 9. Task tracking (F-13) and its evaluation

### 9.1 Design

F-13 connects project work to architecture changes (workflow WF-07). Tasks and sprints are imported from a Jira JSON
export; mined commits are linked to the tasks their messages name.

- **Parsing** (`BE/src/domain/tasks/jiraExport.ts`). The parser reads Jira's issue-search format and extracts the key,
  summary, status (with its category), assignee, story points and sprint of every task. Story points and sprint are
  custom fields whose identifiers differ between Jira sites; they are located by name when the export includes field
  names, otherwise among the default identifiers of Jira Cloud and Server. The file is accepted or refused **as a whole**:
  a task without a key refuses the file with message MSG22, and a value of the wrong type refuses it naming the task and
  field. No task is dropped silently, because a dropped task would later be marked removed.
- **Import** (`ImportTasksUseCase`). Tasks are identified by key within a project. A re-import updates tasks in place and
  never creates a second copy (enforced by a unique index); a task absent from the latest export is kept and marked
  *removed*, and restored if it reappears, so its history and commit links survive.
- **Commit linking** (`LinkCommitsToTasksUseCase`). After every mined batch, and after every import, each commit's
  subject and `Task:` trailers are scanned for keys such as `ARCH-12` or `T22`. A key links the commit only if it is a
  task of the project; a link is unique per (project, task, commit). Mining was extended to keep each commit's git
  trailers.
- **Sprint progress** is the number of done tasks over the number of tasks of the sprint. Removed tasks are excluded from
  both, and a sprint without tasks has no percentage rather than 0 %.

The commit convention (RF-30) builds on the same trailers: `commitConvention.ts` checks the header
`type(scope): summary`, and compares the components a commit declares in `Arch-Change:` with the components whose
dependencies the commit actually changed, computed from the commit's snapshot and its base. Mismatches become
conformance findings of type `convention`, in the finding schema shared with the conformance check.

### 9.2 Verification

Verification is by automated tests run against the real routers, authentication and access policy (Table 4); the Mongo
repository is tested separately on a real MongoDB. All tests passed on 16 November 2026.

*Table 4. Tests of WF-07 (all automated).*

| Aspect | Tests | Result |
|---|---|---|
| Import, re-import without duplicates, removal, MSG22 refusal leaving data unchanged | WF07-01 to WF07-04 | Pass |
| Access: members read, only maintainers import; strangers, anonymous callers and the System Administrator (for an organisation workspace) are refused | WF07-05, WF07-09 | Pass |
| Sprint progress with removed tasks and an empty sprint | WF07-06 | Pass |
| Linking after a real mining run on a git repository, trailers preserved | WF07-07 | Pass |
| Relinking is idempotent; unknown keys are reported, not linked | WF07-08, WF07-10 | Pass |
| Parser unit tests (written before the parser) | 11 | Pass |
| Concurrent imports and links on MongoDB keep one record per key | 2 | Pass |

### 9.3 Comparison and performance (F-04, N-02)

WF-02 was tested through the complete application on a MongoDB database seeded with **1,000 snapshots** (each a file
dependency graph of about 120–139 files and 200–219 edges). N-02 requires listing to answer within one second. Latency was
measured as the 95th percentile (nearest rank) of 30 sequential requests after three warm-up requests.

*Table 5. N-02 measurements on the development machine (local MongoDB, no network latency).*

| Request | p95 over four runs | Payload |
|---|---|---|
| List all 1,000 snapshots (summaries) | 47.7 – 89.1 ms | 0.49 MB |
| One page of 50 snapshots | 11.9 – 20.8 ms | 25 KB |
| List all 1,000 snapshots **with** graphs (the Compare page before the fix) | 1,001.7 – 1,215.4 ms (3,796.7 ms in a run where every graph element also carried an identifier) | 24.8 – 36.0 MB |

The measurement exposed a defect: the Compare page loaded every snapshot together with its dependency graph to fill its
revision pickers, which violates N-02 for a repository of this size. The pickers need only names, dates and titles; the
page now requests summaries, and a test prevents regression. With the fix the requirement is met with a wide margin. The
measurement has not yet been repeated on the staging environment.

## 10. Limitations

1. **Pending human data.** RQ1-B now has results (Section 6, 27 November 2026). Reference B for RQ1-A and the dependency
   labels for EX did not exist at the time of writing; RQ1-A writer agreement and EX results on the test set are therefore
   not reported here.
2. **Small samples.** Five test repositories, about a dozen milestones each (54 pairs and 133 true changes for RQ1-B), and
   40 files per repository for EX; confidence intervals are wide and conclusions apply to similar JavaScript/TypeScript
   repositories only.
3. **Labeller agreement on RQ1-B.** Before reconciliation, agreement was only "fair" by κ (0.21) and "moderate" by AC1
   (0.53). The largest differences were in counting `trueChanges`, identical on only 27 % of the pairs in three of the
   five repositories. Reconciliation by written rules removes the disagreements from the scores but not the ambiguity of
   what counts as one architectural change.
4. **Evaluation data outside version control.** The RQ1-B and RQ2 sheets and results are in `BE/rq1-results/` and
   `BE/rq2-results/`, which are excluded from version control; they are archived in the replication package on Zenodo
   (<https://doi.org/10.5281/zenodo.24625325>, 28 November 2026).
5. **Scope of the extractor sample.** The sample follows what mining analyses, which includes example applications,
   playgrounds and integration tests in some repositories, and test files named `*-test.ts` that the current filter does
   not exclude (5 of 40 files in react-router).
6. **AI labeller on the development set.** One of the two labellers of the development set was an AI assistant, and the
   second labelled a sample of 10 pairs.
7. **Performance environment.** N-02 was measured on a development machine with a local database.
8. **RQ2 scope.** One small, inexpensive model on three repositories, ten questions each and only two unanswerable per
   repository. A stronger model may answer better without evidence, especially on the two well-known repositories
   (react-router, docusaurus), and may follow the labelling instructions more precisely.
9. **RQ2 annotation.** A first annotation pass was discarded (Section 7.1). **[TEAM]** State who adjudicated the 221
   disagreements (the two annotators together or a third person); adjudication by the annotators themselves is less
   independent than by a third person.

## 11. Threats to validity

- **Construct validity.** MoJoFM depends on the reference; a reference shaped by directories favours the directory
  baseline. Mitigation: references are written by function with file-level assignment, by two people, with their
  agreement reported. Component names in labelling sheets may still hint at the method that produced a change. For RQ1-B,
  what counts as one architectural change is open to interpretation: before reconciliation the two labellers' agreement
  was only fair by κ (0.21) and moderate by AC1 (0.53), and lowest on `trueChanges` (Section 10, item 3), so recall depends on the counting
  rule of the guide.
- **Internal validity.** Labellers could be biased toward the tool. Mitigation: hidden-method sheets, independent labelling,
  `trueChanges` recorded before verdicts, agreement reported before reconciliation, and rule-based reconciliation.
  Tuning on test data is prevented by the development/test separation and by freezing the algorithm before the run.
  For RQ2, annotators judged claims against the repository at the frozen commit, not against ArchTime's data (which would
  favour C1 and C2); a first pass that broke this rule was discarded, and labels written inside brackets were removed
  from the sheets so that C2 claims could not be recognised.
- **External validity.** All repositories are open-source JavaScript/TypeScript projects with architecture documentation;
  results may not transfer to other languages, to CommonJS code, or to projects without documentation.
- **Reliability.** Clustering is deterministic, and samples use fixed seeds and fixed commits; every command needed to
  reproduce a figure is recorded with it. Names produced by the AI may vary between runs, which is why component matching
  does not depend on names. LLM answers vary between runs, which is why each RQ2 question was asked three times and the
  spread across runs is reported. The RQ1-B and RQ2 sheets and results are archived in the replication package
  (Section 10, item 4).
