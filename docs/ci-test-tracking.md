# Committed tests in CI (BM04 §8)

BM04 commits the team to 101 tests, at least 52 of them automated in CI. This page says how a test counts, how to see
the current count, and where each workflow stands. Owner of this page: Bảo (B9).

## How a test counts

1. **It runs in CI.** `.github/workflows/ci.yml` runs `npm test` in `BE/` (with a MongoDB 8 service) and in `FE/` on every
   push to `Develop` / `main` and every pull request. Every `*.test.mjs` file under `BE/tests` and `FE/tests` is included,
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

Fill in your row when your tests are merged (committed / automated in CI are the BM04 figures).

| Workflow | Owner | Committed | In CI (BM04) | Found in CI now | Test file(s) |
| --- | --- | --- | --- | --- | --- |
| WF-01 | | | | | |
| WF-02 | | | | | |
| WF-03 | Công | | | | |
| WF-04 Govern the architecture | Bảo | 9 | 5 | 10 + 2 extra (F-07 path prefix, diagram lock) | `BE/tests/wf04-govern-architecture.test.mjs` |
| WF-05 | Đức | | | | |
| WF-06 Operate the platform | Bảo | 14 | 7 | 14 + N-04, N-05 | `BE/tests/wf06-operate-platform.test.mjs` |
| WF-07 | Trường | | | | |
| WF-08 | Đức | | | | |
| WF-09 | Đức | | | | |
| **Total** | | **101** | **≥ 52** | | |

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

Both files run the whole back end (`src/app.ts` with the Mongo repositories) on a throwaway database through
`BE/tests/workflow-harness.mjs`.
