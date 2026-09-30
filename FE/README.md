# ArchTime frontend

## Run and validate

```sh
npm install
npm run dev
npm run build
npm run lint
npm test
```

Tests use the Node.js test runner with native TypeScript stripping (Node 22.18+ or 24+). Configure `VITE_API_URL` in `.env.local` if the API is not at `http://localhost:4000/api`.

## Access control

The home page, login and registration are public. All workspace routes require a server-verified session. Each role has its own workspace; administrator access does not implicitly grant project-maintainer or analyst permissions.

| Role from API | Workspace |
| --- | --- |
| `developer-analyst` | Dashboard, Projects, Architecture History, Compare, Evidence, Insights, Reports, Project Detail |
| `project-maintainer` | Overview, Approval Queue, Team, Component Diagram, Architecture Rules, Design Decisions, Evolution Reports |
| `system-administrator` | Overview, User Management, System Settings, Audit Log, Mining Jobs Monitor |

The backend authentication implementation is included from Develop and exposes `/auth/login`, `/auth/register`, `/auth/me`, and `/auth/refresh`. Run the backend with its database and email configuration for real login and registration. Frontend unit tests mock these endpoints; they do not verify a live backend.

The FE obtains identity from `GET /auth/me`; it does not trust role values in localStorage or URL prefixes. A 401 triggers one `POST /auth/refresh` attempt and a new identity check. Unsupported roles and revoked sessions fail closed. Network failures show a retry screen. Sessions are rechecked on window focus and every minute, and token changes/sign-out synchronize between tabs. Login returns to an authorized requested route or the role's home. Direct access to another workspace shows 403.

Route authorization is centralized in `src/auth/permissions.ts`. New workspace routes must be added both to the router under `RouteGuard` and to that permission map. API endpoints must still enforce their own authentication, role, and project membership rules: frontend guards are not a server security boundary. The current backend has no project membership API, so FE permissions are role-level only.

Maintainer local workspaces use `archtime:maintainer:v2:<userId>:<project>`. Earlier unowned `v1` data is left untouched and is not automatically assigned to the next signed-in account. Browser-local data is not encrypted or synchronized to the server. Signing out removes authentication tokens, not saved workspace records.

## Pagination

`usePagination` and `PaginationBar` provide client-side paging for Projects, Architecture History, Evidence, analyst Reports, maintainer Reports, Architecture Rules, Design Decisions, and Mining Jobs. The default page size is 10 (5 for the timeline); users can select 5, 10, 20, or 50. Filtering happens before paging. Changing an active filter or page size resets the current page; removing the last item on a page clamps to the last available page. Empty lists display `0–0 of 0`.

These lists currently contain local/sample data. This pagination does not request paged backend results. Dashboard summaries and diagram canvases intentionally retain their complete overview.

## Manual smoke checks

1. Without tokens, open a workspace URL: expect login and no workspace content.
2. Sign in with each backend role: expect the correct landing page and navigation. Open another role's URL directly: expect 403.
3. Reload a protected route, expire the access token, and sign out in another tab: verify restore, refresh, and sign-out behavior.
4. With the API offline, open a protected page: expect Retry, with no protected content.
5. Add more than 10 rules or decisions; change pages and page size, filter the list, and remove the last record on the last page.
6. Switch accounts: each account sees its own saved maintainer records.
