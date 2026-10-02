# FE workspace delivery

## Branch workflow

Only FE files were changed. Start a branch for each new feature before editing, using `Feature/<Function>-<Role>`. Preserve names specified by the project owner, including `Feature/Dasboard-ProjectMaintainer` (intentional spelling).

These local branches are **stacked**, starting from `Feature/LoginPage` at `40111ad`. Each row inherits the row above it; compare a feature against its preceding branch to review only that feature. No branch was pushed or merged.

| Order | Branch | Delivery |
| --- | --- | --- |
| 1 | `Feature/Shared-FE` | Authenticated API client; isolated, validated local demo storage; shared page states |
| 2 | `Feature/UserManagement-SystemAdministrator` | Search/filter/pagination, demo invitations, role editing, suspend/reactivate, audit capture |
| 3 | `Feature/SystemSettings-SystemAdministrator` | Validated local settings; reset; unsaved-change protection |
| 4 | `Feature/AuditLog-SystemAdministrator` | Actual local action history; actor/text/type/date filters |
| 5 | `Feature/MiningJobs-SystemAdministrator` | Existing jobs API integration, ID normalization, requester display, polling, errors/retry/pause |
| 6 | `Feature/Dashboard-SystemAdministrator` | Existing health API integration, admin shortcuts, local action summary |
| 7 | `Feature/Team-ProjectMaintainer` | Demo invitations, membership editing, revoke/remove, project/search filters |
| 8 | `Feature/ApprovalQueue-ProjectMaintainer` | Local proposals, detail view, approve/reject with rationale and reviewer history |
| 9 | `Feature/ComponentDiagram-ProjectMaintainer` | Existing editor retained; dependency editing, discard, JSON export |
| 10 | `Feature/ArchitectureRules-ProjectMaintainer` | Existing CRUD retained; result filtering, JSON export, shared rule evaluator |
| 11 | `Feature/DesignDecisions-ProjectMaintainer` | Existing ADR editor retained; Markdown export |
| 12 | `Feature/Reports-ProjectMaintainer` | Server project/snapshot selection; browser-generated comparison, HTML download and browser print/PDF; local history |
| 13 | `Feature/Dasboard-ProjectMaintainer` | Server project list, local diagram/rule/ADR summaries, pending approvals, team counts |
| 14 | `Feature/FE-Validation` | Build compatibility fixes, CSS layer order fix, lazy account menu, regression tests and this handoff |

`Feature/FE-Validation` contains the entire delivery plus final fixes. Earlier branch tips do not include those final fixes. Future independent features should start from the team's agreed integration branch, not assume these stacks have already been merged.

## What is live and what is local

- Existing live endpoints used: `GET /api/health`, `GET /api/projects`, `GET /api/projects/jobs`, `GET /api/projects/:id/snapshots`, plus existing session verification/refresh.
- Current project listing is owner-scoped by BE; it is not a managed-team project directory. Reports use only projects and revisions returned by that API.
- User management, settings, team, approvals, and their action history are explicit local demos. No invitation email, role change, account suspension, repository authorization, key rotation, or server configuration mutation occurs.
- Diagram/rules/ADRs keep the existing per-account, per-project browser storage. The three demo projects are separate from server projects. There is no automatic migration/upload of demo data.
- CPU/RAM/storage/queue-capacity metrics are shown as unavailable instead of fabricated values. Health only proves the existing health endpoint responded.
- Job cancellation remains disabled with an explanation because BE has no cancellation endpoint. Unknown statuses do not crash rendering; failed requests retain last successful data with an error notice.
- Reports are generated in FE from full snapshots. The diff uses component IDs and directed dependency `(source,target,type)` tuples; changes to properties of an existing component are not classified. It does not claim to analyze source code.
- PDF uses the browser's print dialog. There is no server-generated PDF binary or server report archive. Local export history retains at most 30 structured reports and does not claim a print dialog actually produced a saved file.

## BE handoff (proposed contracts, not existing endpoints)

All protected APIs must enforce role and project membership on the server. FE route guards and demo role checks are presentation behavior, not a security boundary. Use consistent string IDs, ISO timestamps, structured errors, and list metadata for server pagination.

| Area | Proposed API capability | FE data needs |
| --- | --- | --- |
| Users | List/search/filter, invite, update role, suspend/reactivate | id, name, email, platform role, account status, lastActive; conflict on duplicate email |
| Settings | Read/update pipeline limits | maxConcurrentJobs 1–16, maxRepoSizeGb 1–50; validation and applied revision |
| Credentials | Provider connection status/connect/disconnect; key issuance/rotation/revocation | Explicit connection state; masked metadata, never a reusable plaintext key in normal reads |
| Audit | Immutable event ingestion/query | id, type, actor, target, timestamp, description; trustworthy source/IP supplied by server |
| Metrics | Resource/service status and operational logs | Actual measured values, units, timestamps, service health and latency |
| Jobs | Scope listing and support atomic queued cancellation | Stable id (current lean response can expose `_id`), populated requester, cancellation state; worker honors cancellation |
| Projects/team | Managed project catalog, list/edit/remove members, invite/revoke/accept | projectId, memberId, membership role, invitation status; distinct from platform role |
| Diagram | Read/save/confirm by project | components, dependencies, revision, confirmedAt, confirmedBy; reject stale writes with 409 |
| Rules | CRUD/enable and evaluate against a saved revision | source/target component IDs, required/forbidden, severity, rationale, enabled, evaluated revision |
| ADR | List/create/edit and status changes | Server-assigned per-project number, context, decision, alternatives, consequences, component references, timestamps |
| Approval | Create/list/detail/approve/reject | Immutable commit/snapshot reference, proposal details, status, reviewer, reviewedAt, reason; atomic pending → reviewed |
| Reports | Optional server generation/storage/download | projectId, baseSnapshotId, targetSnapshotId, generation status and authorized download |

Decide with BE how approvals are created (manual proposals or mining/comparison events), whether multiple maintainers can approve their own proposals, and how removing components affects rules/historical ADR references. No architecture-health percentage is calculated without an agreed definition.

## Validation

Run from `FE`:

```text
npm.cmd run build
npm.cmd test
npm.cmd run lint
npm.cmd run check:bundle
```

- Production build passes.
- 32 unit/regression tests pass, including concurrent API token refresh, corrupt/stale local storage, job DTO normalization, rule directionality and HTML escaping in report exports.
- Lint exits successfully. Seven existing warnings remain in Developer Analyst pages; new Admin/Maintainer code adds no warnings.
- Bundle budget passes: initial graph about 646 kB raw; landing graph about 850 kB raw. Account dropdown loads separately for signed-in users.
- Browser smoke checks cover all 12 Admin/Maintainer routes at 1366×900, key persistence workflows, report preview/download, and dashboard widths at 390×844. API responses and sessions are intercepted fixtures; this does **not** verify a deployed BE or real permissions.
- Visual inspection caught and fixed the CSS cascade order so Tailwind's base reset no longer removes Ant Design table/button spacing.

Browser regression runner (start the FE dev server first):

```text
node scripts/test-workspaces.mjs
```

The runner needs an installed Playwright package and Chromium. If Playwright is installed outside FE, pass its package directory as the first argument. It creates isolated browser contexts and never uses a real account. Screenshots are written to the git-ignored `test-results/workspaces/` directory. Set `FE_TEST_URL` to test a production preview instead of the default `http://127.0.0.1:5173`.

Final validation changes also remove pre-existing unused imports, correct the Ant Design Modal `container` style key, and type two graph-preview callbacks so the existing full-FE TypeScript build succeeds. No BE files or database schemas were modified.
