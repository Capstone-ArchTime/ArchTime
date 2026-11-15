# Grounded Guidance: the AI Mentor, Architecture Conformance and Context for Coding Agents

*Thesis chapter draft (task D12). Author: Nguyễn Đàm Chấn Đức. To be merged into the thesis by the editor. Requirement
identifiers refer to BM04; file paths refer to the ArchTime repository.*

ArchTime reconstructs a project's architecture from its commit history and lets a maintainer confirm a component
diagram as the project's **canonical map**. This chapter describes three features built on that map and on the mined
history. The **AI mentor** answers newcomers' questions about how the architecture evolved, with claims that the system
itself checks against the mined commits (F-06). The **conformance check** compares every new commit with the canonical
map and tells maintainers where the code departs from it (F-14, WF-08). The **agent context** gives AI coding agents the
same architectural knowledge before they change a file, without ever exposing source code (F-15, WF-09). The chapter
ends with the design of the evaluation of the mentor (RQ2).

The three features share one principle: **a statement the system shows as fact must be traceable to the repository**.
The mentor's facts must cite mined commits; a conformance finding carries the imports that cause it; the agent context is
derived only from what a maintainer confirmed.

## 1. The AI mentor

### 1.1 Grounding data

The mentor does not search the repository at question time. It receives a bounded, plain-text summary of what ArchTime
already mined (`mentorProjectData`, `BE/src/application/use-cases/llm/ProjectChatUseCase.ts`):

- the 15 newest snapshots (one per mined commit: short hash, version tag, date, title, author, file count, number of
  architectural changes, dependencies added and removed);
- the 25 newest *change evidence* records (commits whose dependency graph changed, with a summary and the source files
  involved);
- the structure of the newest snapshot (up to 60 nodes by type).

The summary is capped at 24,000 characters and never contains the repository's access token: credentials embedded in
the repository URL are removed (`buildProjectContext`). The text is marked as untrusted data in the prompt, so instructions
that happen to appear in commit messages are not followed.

### 1.2 Claim labels

The system prompt asks the model to label every substantive claim:

| Label | Meaning |
|---|---|
| `[FACT]` | Stated directly in the project data |
| `[INFERENCE]` | Reasoned from the data; the answer must say what it rests on |
| `[UNKNOWN]` | The data does not say |

and to cite commits by short hash, only hashes that appear in the data. The labels make the epistemic status of each
sentence visible to a newcomer, who cannot be expected to know which parts of an answer were looked up and which were
guessed.

### 1.3 The citation filter

A prompt is a request, not a guarantee: models label confidently and cite hashes that do not exist. The mentor therefore
checks every answer after it is generated (`enforceClaimLabels`, `BE/src/domain/mentor/claimLabels.ts`), with two rules:

1. **A cited commit must be a mined commit of this project.** A hash is valid when it is a prefix (seven characters or
   more) of a mined commit's full hash. Any other hash, whether invented, from another project or rewritten away by a
   force push, is removed from the text.
2. **A FACT must rest on at least one valid citation.** A claim runs from its label to the next label on the same line,
   and the first claim of a line also takes the text before its label. A FACT whose claim has no valid citation left
   after rule 1 is rewritten as `[INFERENCE]`.

Nothing else in the answer changes. A bare hexadecimal word counts as a citation only if it mixes digits and letters,
so ordinary words ("deadbeef", "acceded") and numbers are not mistaken for hashes. The check is a pure function, so its
behaviour is fixed by tests (eleven cases in `mentor-claim-labels.test.mjs`), and the same checked text is what the user
reads, what the evidence panel is built from and what the conversation history stores.

The **evidence panel** lists, for each valid citation, the commit's title, date, author, number of files and dependency
changes and its source files, so the newcomer can verify a FACT in one click instead of trusting it.

### 1.4 Cost and abuse control

Every question that reaches a model is recorded as an AI run (model, tokens, cost at the model's price, latency, outcome),
whether it was answered or not, so the AI cost of each project is accounted for. One user may send at most 15 questions a
minute. Viewers of a public personal workspace may ask only if the owner allows it, within a daily limit the owner sets.

## 2. Architecture conformance

### 2.1 From diagram to files: path prefixes

The canonical map names components and the dependencies allowed between them; to check code against it, files must be
mapped to components. Each component carries **path prefixes** (RF-08, BR-27). A prefix is normalised to one form
(forward slashes, no leading `./` or `/`, no trailing `/`) and refused if it cannot name a place inside the repository
(empty, absolute, containing `..` or glob characters). **One prefix belongs to one component** (MSG24); nested prefixes
are allowed, and a file belongs to the component with the **longest** prefix that contains it, matched on whole path
segments (`BE/src/domain` covers `BE/src/domain/order.ts` but not `BE/src/domainx/a.ts`).

Prefixes are deliberately **not part of the confirmed content** of the diagram: mapping files does not change the
architecture, so a confirmed diagram stays confirmed and keeps its baseline.

### 2.2 The check

The check is a pure module (`BE/src/domain/architecture/conformance.ts`) with three steps:

1. **Assign** each file of a snapshot to a component (longest prefix); files no prefix covers are reported apart.
2. **Aggregate** the snapshot's resolved file imports into component dependencies, keeping the imports behind each one;
   imports inside a component are ignored.
3. **Report** findings, each with the importing files:

| Finding | Condition |
|---|---|
| Forbidden dependency | An enabled *forbidden* rule's dependency exists in the code |
| Missing required dependency | An enabled *required* rule's dependency does not exist |
| Undeclared dependency | A dependency exists in the code but not in the diagram (not reported again when a forbidden rule already reports the pair) |

Rules may name a component by id or by name; a rule naming a component that no longer exists is listed, never guessed.
Each finding has a stable key `type|rule|source|target`.

The module uses no clock and no randomness, and sorts every list, so **the same input gives the same output in any
order** (N-07). This matters because findings are stored and decided on: a check run twice must not create different
findings, or decisions would be lost.

### 2.3 Which commits, and storage

Only commits **after the baseline** are checked: the baseline is the newest mined commit when the maintainer confirmed
the diagram; what came before is what the maintainer approved. Findings are stored per snapshot and **upserted by
(project, snapshot, key)**, so a re-check updates them in place; a finding the check no longer produces is removed if
nobody decided on it, and kept as *outdated* if someone did. Each checked snapshot records a **fingerprint** of what it was
checked against (components with their prefixes, declared dependencies, enabled rules, baseline); a snapshot with an
unchanged fingerprint is skipped, which keeps the automatic check after each mining run cheap.

N-07 is verified on a real database (`nfr-n07-n08.test.mjs`): checking the same snapshots three times yields identical
findings, evidence, document identities and counts, with no duplicates.

### 2.4 Decisions and explanations

A maintainer decides on each finding (UC-41): **Fix** (the code is to change), **Accept** (the change is intended and the
diagram should follow through an architecture change request) or **Dismiss** (not a real problem). Accept and Dismiss
require a reason, which is shown to everyone who meets the finding later, and they **carry forward**: the same finding in
later commits takes the decision, whether those commits were checked before or after it, so a settled question is not
asked again in every commit. A decision made directly on a later commit is never overwritten.

On request, a model **explains** a finding: what it means for this architecture and two or three ways to resolve it. The
model receives names, descriptions, the rule and its rationale, related design decisions and file paths, never source
code. The explanation is stored and reused, so it costs once.

### 2.5 Automatic check and notification

After every fetch or mining job the check runs by itself (RF-29). It never delays or fails the mining job; a project
without a confirmed diagram is skipped quietly. New findings are then sent in **one e-mail per project and run** to the
owner, the active maintainers and the owners of the project's organization (BR-34). Each problem is listed once with its
newest commit, errors first.

A finding must never be e-mailed twice, even if two runs overlap. The notifier therefore **claims** the open, undecided
findings that nobody was told about by setting their `notifiedAt` in a single write; MongoDB applies the update per
document atomically, so two concurrent claims take disjoint sets. If no e-mail can be sent the claim is released for the
next run; if at least one recipient was reached, the findings count as notified.

Inside the application (MSG26), each person sees how many open problems were found since they last opened the findings
of each project they maintain: a notice on the maintainer overview and a counter in the navigation. A problem found again
in later commits counts once.

## 3. Architecture context for AI coding agents

### 3.1 Motivation

Coding agents edit code quickly but know nothing of a project's intended architecture, and they are a new way for
architecture to erode. ArchTime gives an agent, **before it changes a file**, the part of the canonical map that concerns
that file (RF-09, UC-42 to UC-44).

### 3.2 Project tokens

An agent does not sign in as a person. A maintainer creates a **project token** for one project (BR-30):

- 256 random bits with the prefix `atk_`; only its SHA-256 hash is stored, with the first characters for recognition;
  the token is shown once;
- it expires after 1 to 90 days and can be revoked at any time, effective on the next request;
- at most ten active tokens per project; creation and revocation are audited, without the token.

The `agentAuth` middleware accepts only a known, unexpired, unrevoked token of an existing project, and **the token alone
decides the project**: no parameter or header can point it elsewhere. A token opens nothing but the agent endpoints, and a
person's session token is not accepted there.

### 3.3 The context

`GET /api/agent/context?file=<path>` answers from the **confirmed** diagram only (an unconfirmed diagram is not a reference
to follow):

- the file's component (longest prefix), or guidance to ask a maintainer when no component covers it;
- the components it may depend on (declared, or required by a rule) and must not depend on (forbidden rules, with their
  rationale), plus the components that must not call it; a forbidden rule wins over a declared dependency;
- accepted and proposed design decisions about the component;
- the team's commit convention (`type(scope): summary` with `Task:` and `Arch-Change:` trailers).

It contains names, paths and decisions, **never source code** (BR-31). The same knowledge is offered as an `AGENTS.md`
file, generated from the confirmed diagram, for agents that read such a file at the root of a repository.

N-08 (no data of another project) is verified through the real application on a real database: a token of project A,
with project B's identifier passed as a parameter or header, returns nothing of B; every other API answers 401; revoked,
expired and unknown tokens and tokens of deleted projects are refused. The test was checked not to pass vacuously: making
the controller honour a `projectId` parameter makes it fail.

## 4. Evaluation of the mentor (RQ2)

**RQ2:** Do claim labels and the citation filter make the mentor's answers better grounded?

### 4.1 Design

The same model answers the same questions under three conditions (`docs/rq2-protocol.md`):

| Condition | The model receives | After answering |
|---|---|---|
| C0 | The question and the repository name only | Nothing |
| C1 | The mentor's project data; told to answer only from it; no labels, no citation instruction | Nothing |
| C2 | The mentor as deployed: the same data and the mentor's prompt | The citation filter (§1.3) |

C1 and C2 receive identical data from the same function, and C2 uses the deployed prompt and filter, so C1 versus C2
isolates the effect of labels and filtering, and C0 versus C1 the effect of the project data.

Ten fixed questions per repository (axios, nest, ArchTime at the commits frozen for RQ1): eight answerable from the mined
data (structure, architectural changes, files, authors, size over time) and two that are not (design rationale, number of
users), to measure appropriate refusal.

Answers are split into claims (each labelled segment, otherwise each sentence; rows of a table are claims, its header is
not). Two annotators judge every claim **blind**: claims are shuffled with a fixed seed across conditions, carry opaque
identifiers, and are shown without labels, which would reveal C2; citations are kept because they are needed to verify a
claim against the repository. Verdicts are *Supported*, *Contradicted* or *Not verifiable*; each answer is also marked for
refusal and, for answerable questions, coverage of the expected content. Disagreements are adjudicated jointly.

### 4.2 Metrics

| Metric | Definition |
|---|---|
| Unsupported rate | (Contradicted + Not verifiable) / judged claims |
| Citation accuracy | Supported share of claims that cite at least one commit |
| Citation validity | Cited hashes that are mined commits / all cited hashes (automatic) |
| FACT precision | Supported share of claims labelled FACT (C2) |
| Refusal rate | On unanswerable questions (higher is better) and on answerable ones (lower is better) |
| Coverage | Mean coverage of answerable questions (full 1, partial 0.5, none 0) |
| Agreement | Cohen's κ between annotators on claim verdicts and on refusal |

### 4.3 Pilot

The tooling (`npm run rq2`) was piloted on axios with two questions (Q2 answerable, Q10 unanswerable) under the three
conditions, six model calls in total.

- C0 declined both questions, including the answerable one, for lack of data.
- C1 and C2 named five commits each, all of them mined commits of the project.
- In C2 the filter downgraded one FACT to INFERENCE.
- On Q10, C2 answered `[UNKNOWN]`: the data does not record usage.

The pilot validated the pipeline end to end. It is not evidence for or against the hypothesis.

### 4.4 Results

*To be completed from `rq2-results/report.md` after the full run (3 repositories × 10 questions × 3 conditions) and the
annotation.*

| Metric | C0 | C1 | C2 |
|---|---|---|---|
| Unsupported rate | | | |
| Citation accuracy | | | |
| Citation validity | | | |
| FACT precision | n/a | n/a | |
| Refusal (unanswerable / answerable) | | | |
| Coverage | | | |
| Cohen's κ (claims) | | | |

### 4.5 Threats to validity

- One model and one sample per question: answers vary between runs.
- Citations remain visible to annotators and may reveal C0, which rarely cites.
- Rule-based claim splitting may merge or split ideas.
- ArchTime is the team's own repository, so its annotators know it; results are reported per repository.

## 5. Verification

| Area | Automated tests | Notes |
|---|---|---|
| Mentor labels and citation filter | 11 (`mentor-claim-labels`) plus chat history and context tests | Pure functions and HTTP flow |
| Path prefixes | 10 (`component-path-prefixes`) | Including MSG24 and the confirmed-content rule |
| Conformance core, check, storage, notification | 11 + 12 + 8 + 8 | Storage and notification also on a real MongoDB |
| Agent context and tokens | 14 (`agent-context`) | |
| N-07, N-08 | 2 (`nfr-n07-n08`) | Real MongoDB, real application |
| RQ2 tooling | 6 (`rq2`) | |

All backend and frontend tests run in continuous integration on every push, with a MongoDB service; the job fails if any
test is skipped, so the database tests are never silently left out. Workflow test cases are listed in
`docs/d11-test-cases-wf05-wf08-wf09.md` (25 cases, 13 automated).
