# Frontend audit and improvements

Scope: React 19, Vite 8, React Router 7, Ant Design 6, and Tailwind 4 in `FE`. Existing APIs were read to verify authentication contracts. No backend behavior or application dependencies were changed.

Applied skills: React performance, existing-project redesign, accessibility, Web Interface Guidelines, frontend security review, and JavaScript testing. Diagram generation, image generation, academic/document tools, and deployment skills do not contribute to this frontend audit. The browser MCP reported no connected apps or browsers; no visual or live browser pass is claimed.

## Findings addressed

| Finding | Change | Main files |
| --- | --- | --- |
| Every page was imported eagerly into one initial bundle | Lazy page imports, Suspense loading state, data router, page error boundary | `src/App.tsx`, `src/components/PageLoading.tsx`, `src/components/PageErrorBoundary.tsx` |
| Registration stopped after sending an OTP | Verification form, resend flow with UI cooldown, role-aware redirect, request timeouts/cancellation and useful errors | `src/pages/Login.tsx`, `src/pages/VerifyEmail.tsx`, `src/auth/requests.ts` |
| Workspace search and account controls did not perform useful actions | Role-scoped page search, keyboard shortcut, real account information, sign-out confirmation | `src/components/layout/DashboardLayout.tsx`, `navigation.ts` |
| Mobile navigation and fixed-height content were hard to use | Navigation drawer, dynamic viewport sizing, scrollable page content, responsive architecture panels | Layout, history, compare and project detail pages |
| Navigation lacked a skip link and current-page semantics; many labels had low contrast | Main landmark, skip link, `aria-current`, keyboard focus, lighter muted text, reduced-motion support, native dark color scheme | Layout, `src/index.css`, `index.html`, pages |
| Forms had missing autofill hints and garbled password placeholders | Input names/autocomplete, corrected placeholders, focus on first invalid field, mode reset by route key | `src/pages/Login.tsx`, `src/App.tsx` |
| Diagram's document click listener missed browser Back navigation | Router blocker plus before-unload handler, contextual confirmation dialogs, dependency removal confirmation | `src/hooks/useUnsavedChanges.ts`, maintainer workspace and diagram |
| Another tab refreshing its access token could unmount an edited form | Keep an already verified view mounted during access-token refresh; still clear identity for account changes/sign-out; guard stale request cleanup | `src/auth/AuthProvider.tsx` |
| Unknown object-prototype role names could throw in permission lookup | Explicit own-key check; reject empty user IDs | `src/auth/permissions.ts`, permission tests |
| Search/filter inputs on lists had no effect | Filter before pagination, reset through existing pagination hook, empty results, user-list pagination | Projects, Evidence, Reports, User Management |
| Many native buttons had no handlers and appeared operational | Real links to implemented destinations; disabled unavailable server actions; sample-data notices; repository-connect preview no longer pretends to save | Legacy analysis/admin/team/approval pages |
| Duplicate SVG filter IDs and pointer-only timeline interaction | Per-project SVG IDs and keyboard-operable revision selection | Projects, Architecture History |
| Nested main landmarks and framework lint warnings | One home-page main landmark; remove unused UI export and login state-reset effect | HomePage, Login, UI button |

## Validation

- TypeScript and Vite production build.
- Oxlint: no errors or warnings.
- 23 automated tests: pagination boundaries, permission matrix, session/refresh failures, OTP request contract, API errors/cancellation, server-rendered layout landmarks, and role-scoped navigation.
- Manifest-based build measurement after vendor splitting: entry dependency graph about 641 KB raw / 211 KB gzip; including the landing page about 845 KB raw / 276 KB gzip. The prior single bundle was about 1,322 KB raw / 379 KB gzip. Landing-page JavaScript gzip is approximately 27% smaller. These are build artifact sizes, excluding images, fonts and CSS, not Lighthouse timings.
- The former 581 KB shared chunk combined React DOM, React Router and Ant Design core. `vite.config.ts` now keeps React/runtime and router in separate cacheable chunks, while UI libraries retain automatic splitting. Largest chunk: about 269 KB; React runtime: 219 KB; router: 93 KB. Vite no longer reports an oversized chunk, with its default warning threshold unchanged.
- `npm run check:bundle` validates per-chunk and aggregate download budgets, 23 lazy page modules, and absence of static chunk cycles. Total application code is not represented by the entry chunk alone; vendor splitting itself keeps the overall initial download approximately unchanged.

## Remaining boundaries and follow-up

1. **Live browser checks remain outstanding.** Verify 360/768/1440px layouts, keyboard search/drawer operation, OTP success/error flows against a running backend, browser Back/discard/cancel behavior, and cross-tab session changes. Server rendering cannot verify focus movement, CSS layout, or browser timing.
2. **Most domain pages still use samples.** Repository connection, actual analyses, invitations, approval mutations, exports and administrator changes need backend endpoints and integration. Local maintainer saves remain browser-local; notices now make this distinction visible. No simulated success was added for server operations.
3. **Session token storage is still browser-readable (medium architectural risk).** `src/auth/AuthProvider.tsx` persists access/refresh tokens through localStorage. Any future same-origin script injection could expose them; the current code review did not establish an exploitable injection sink. Migrating refresh sessions to HttpOnly cookies requires a coordinated backend change and CSRF design, so this FE-only task preserves the current contract.
4. **Server security remains authoritative.** Route guards and the resend cooldown are UX controls, not API authorization or rate limiting. Review server role/project membership checks and OTP attempt limits separately. CSP, anti-framing and other deployed response headers were not verified against a live deployment.
5. **Accessibility improvements are not a WCAG certification.** Screen-reader behavior, all chart descriptions, third-party widgets, and every color/state combination still need runtime verification. The revision timeline and primary navigation now have keyboard paths.
6. **Pagination is client-side.** Filter state is not yet URL-persisted and very large result sets should use a paginated API or virtualization.

## References used during review

- [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
- [React lazy loading](https://react.dev/reference/react/lazy)
- [React Router navigation blocking](https://reactrouter.com/api/hooks/useBlocker)
- Project-local React, accessibility, security and testing skill references under `.agents/skills`.
