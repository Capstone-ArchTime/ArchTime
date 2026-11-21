# Committed tests in CI (BM04 §8)

BM04 commits the team to 101 tests, at least 52 of them automated in CI. This page says how a test counts, how to see
the current count, and where each workflow stands. Owner of this page: Bảo (B9).

## How a test counts

1. **It runs in CI.** `.github/workflows/ci.yml` runs `npm test` in `BE/` (with a MongoDB 8 service) and in `FE/` on every
   push, on every branch. Every `*.test.mjs` file under `BE/tests` and `FE/tests` is included,
   so a test that is merged and green is in CI. Tests that need MongoDB skip themselves locally when none is running, but
   run in CI.
2. **Its name starts with the BM04 ID**, so it can be found and shown at the defense:
   - feature tests: `FE-08-TC01 (F-07): …`
   - state transitions: `SM-05 pending -> approved: …` (one test per transition)
   - demo scenarios: `DS-04b: …`
   - end-to-end workflow test: `WF-04 end to end (DS-04a): …`
   - NFRs: `N-04: …`, `N-05: …`

## Counting

```sh
node scripts/committed-tests.mjs --summary   # counts per kind
node scripts/committed-tests.mjs             # Markdown table: ID, test, file
```

The script reads the test names only; it does not run anything.

## Status per workflow

Committed and "in CI" are the BM04 §8.1 figures. "Found now" counts the tests whose name carries a BM04 ID
(`node scripts/committed-tests.mjs`). A test that already checks a criterion counts as soon as its name starts with
the ID, for example `FE-11-TC01 (F-10): the last owner cannot be demoted or removed`. Status on 21/11/2026, `Develop`
at `b421690`: **48 found, 52 needed in CI.**

| Workflow | Owner | Committed | In CI (BM04) | Found now | Still without an ID | Test file(s) |
| --- | --- | --- | --- | --- | --- | --- |
| WF-01 Onboard a repository | Công | 22 | 11 | 0 | FE-03-TC01..03, FE-06-TC01..03, SM-01 ×8, SM-02 ×5, DS-01a, DS-01b, N-03, N-06 | |
| WF-02 Analyse architecture evolution | Trường | 8 | 4 | 3: DS-02a, N-02 ×2 | FE-04-TC01..03, FE-07-TC01..03, DS-02b | `wf02-architecture-evolution.test.mjs` |
| WF-03 Organize a team | Công (F-02: Bảo) | 13 | 7 | 7: FE-02-TC01..03, SM-03 ×3, SM-04 | FE-11-TC01..03, DS-03a, DS-03b, WF-03 end to end | `f02-projects-team.test.mjs` |
| WF-04 Govern the architecture | Bảo | 9 | 5 | 12 (all, + F-07 extras) | none | `wf04-govern-architecture.test.mjs` |
| WF-05 Onboard a newcomer with a learning path | Đức | 10 | 5 | 0 | FE-12-TC01..03, FE-13-TC01..03, SM-06 ×2, DS-05a, DS-05b, N-01 | |
| WF-06 Operate the platform | Bảo | 14 | 7 | 16 (all, + N-04, N-05) | none | `wf06-operate-platform.test.mjs` |
| WF-07 Track project work against architecture changes | Trường | 10 | 5 | 9: SM-09 ×4, SM-10 ×2, DS-07a ×2, DS-07b | FE-14-TC01..03 | `wf07-*.test.mjs`, `task-impact.test.mjs`, `jira-export-parser.test.mjs` |
| WF-08 Check architecture conformance of new commits | Đức | 8 | 4 | 2: N-07 ×2 | FE-15-TC01..03, SM-11 ×3, DS-08a, DS-08b | `nfr-n07-n08.test.mjs`, `conformance.test.mjs` |
| WF-09 Give AI coding agents the architecture context | Đức | 7 | 4 | 1: N-08 | FE-16-TC01..03, SM-12 ×2, DS-09a, DS-09b | `nfr-n07-n08.test.mjs` |
| **Total** | | **101** | **≥ 52** | **48** | | |

### Existing tests that only need the ID in their name

These already check a committed criterion; renaming them is enough to count them.

| ID | Test today | File |
| --- | --- | --- |
| FE-11 (F-10) | "Organization: the last owner cannot be demoted or removed" (MSG16) | `organizations.test.mjs` |
| FE-11 (F-10) | "Organization: removing a member also removes them from every project of the organization" | `organizations.test.mjs` |
| FE-14 (F-13) | "WF07-02 importing the same export again creates no duplicate task or sprint" | `wf07-task-tracking.test.mjs` |
| FE-07 (F-06) | "Mentor labels: a citation to a commit that was never mined is removed, and its FACT downgraded" | `mentor-claim-labels.test.mjs` |
| FE-16 / SM-12 (F-15) | covered inside "N-08: a project token reads only its own project, … stops when revoked or expired" | `nfr-n07-n08.test.mjs` |

## WF-04 and WF-06 in detail

| ID | What is checked |
| --- | --- |
| FE-08-TC01 | Save from an older revision → 409 (MSG11), the newer save kept |
| FE-08-TC02 | A forbidden dependency in the diagram is reported by the rule check |
| FE-08-TC03 | Deciding an already decided approval → 400 (MSG12) |
| F-07 (extra) | Path prefixes saved with the confirmed components; overlapping prefixes → 400; a confirmed diagram is locked (409 DIAGRAM_LOCKED) |
| SM-05 ×2 | pending → approved (proposal applied and confirmed); pending → rejected (reason required) |
| SM-07 ×3 | Proposed → Accepted, Accepted → Deprecated, Proposed → Deprecated (history with author; unknown status → 400) |
| WF-04 end to end | DS-04a: confirm diagram, add rule, member proposes, maintainer approves, ADR accepted |
| DS-04b | Two tabs: the later save gets 409, the earlier one is kept |
| FE-09-TC01..03 | One default model; the model API key never returned; a benchmark leaves the stored map unchanged |
| FE-10-TC01..03 | Last administrator not demoted (DS-06b); suspended user rejected on the next request; admin API key shown once |
| FE-01-TC01..03 | Wrong password → 401 MSG03; 11th failed sign-in in 15 min → 429; e-mail code expires after 10 min |
| SM-02 | running → cancelled, audited; cancelling again changes nothing |
| SM-08 ×3 | Unverified → Active, Active → Suspended (sessions end), Suspended → Active (old token stays revoked) |
| WF-06 end to end | DS-06a: add and default a model, cancel a running job, suspend a user who is signed out |
| N-04 | 10 failed sign-ins per 15 minutes (with FE-01-TC02); access token lasts 60 minutes |
| N-05 | Two organizations: a foreign project answers 404 on every project route tried, and is not listed |

## F-02 Projects & team (Bảo, part of WF-03)

| ID | What is checked |
| --- | --- |
| FE-02-TC01 | A private repository without a token or credential → 400, nothing created; with a token it is created and the token not returned |
| FE-02-TC02 | An invitation expires 7 days after it is sent; accepting it later → 400, no membership |
| FE-02-TC03 | A Member changing a role (their own or a colleague's) or inviting → 403, the role stays; the maintainer may |
| SM-03 ×3 | Invitation pending → accepted (joins with the invited role, single use), pending → declined, pending → expired (final) |
| SM-04 | Organization membership invited → active: no access while invited, active member after accepting |

Both files run the whole back end (`src/app.ts` with the Mongo repositories) on a throwaway database through
`BE/tests/workflow-harness.mjs`.
