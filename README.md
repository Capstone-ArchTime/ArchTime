# ArchTime

Evidence-based software architecture evolution reconstruction — mining Git history and source code to rebuild how a system's architecture changed over time, with every explanation traceable back to a commit.

## Problem

Software architecture drifts significantly over a project's lifetime — monoliths split into microservices, module boundaries shift, dependencies get restructured — but the *reasoning* behind those decisions is usually lost once docs go stale or key contributors leave. Git history still holds the evidence (commits, authors, timestamps, diffs), but it's scattered and hard to turn into a coherent picture. Static analysis tools only show the current architecture; LLM-based tools can produce plausible-sounding explanations that aren't actually grounded in real evidence.

## Approach

ArchTime combines deterministic source-history analysis with AI-assisted reasoning to automatically reconstruct a system's architectural evolution. The AI never invents an architecture or a reason — it only narrates evidence the pipeline has already established, and labels every claim as:

- **FACT** — directly confirmed by source code or Git history
- **INFERENCE** — reasoned from available evidence
- **UNKNOWN** — not determinable from what the repository provides

### Pipeline

1. **Repository Mining** — parses source code via AST (Abstract Syntax Tree) to extract modules, packages, classes and their dependencies, and collects Git metadata (commits, authors, timestamps, file changes, diffs) to build a historical **Knowledge Graph**.
2. **Evolution Analysis** — compares architecture snapshots across versions using graph comparison (approximate Graph Edit Distance) to produce an **Architectural Diff**: module boundary changes, splits/merges, dependency shifts, package restructuring.
3. **Evidence-Based Reasoning** — a locally-deployed LLM synthesizes the Architectural Diff, commit messages and code changes into a readable narrative, always traceable back to specific evidence.

```text
Git History + Source Code → AST/Git Analysis → Knowledge Graph → Architectural Diff → Evidence → AI Reasoning → Architecture Narrative
```

## Scope (Capstone)

- Java / Spring Boot repositories
- Git history + AST + dependency analysis
- Module/service-level evolution
- Knowledge Graph, Architectural Diff, Evidence-Based Reasoning (local LLM)
- Benchmark & accuracy evaluation

Real-time analysis, multi-language support beyond Java/Spring Boot, and a production-scale dashboard are out of scope for this capstone and considered future work.

## Evaluation

- **Module Detection Precision / Recall**
- **Architectural Change Detection Accuracy**
- **Evidence Coverage Score** — proportion of AI claims backed by evidence
- **LLM Hallucination Rate** — proportion of claims without supporting evidence

## Project structure

```text
ArchTime/
  BE/    # Backend — repository mining, AST/Git analysis, knowledge graph, reasoning pipeline
  FE/    # Frontend — React app
```

## Frontend

### GitHub sign-in (local development)

Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and
`GITHUB_CALLBACK_URL=http://localhost:4000/api/auth/github/callback` in `BE/.env`.
The GitHub OAuth app's authorization callback URL must match that callback.
Use `CORS_ORIGIN=http://localhost:5173` and open `http://localhost:5173/login`.
If overriding `VITE_API_URL`, point it to the backend's `/api` URL; keep frontend
and backend on the same site for the HTTP-only OAuth cookie (do not mix
`localhost` and `127.0.0.1`). Never put the client secret in frontend variables.

Choose **Continue with GitHub** and complete GitHub authorization. The backend
uses state and PKCE, reads a verified GitHub email, and creates a verified
`developer-analyst` account on first sign-in. Existing GitHub identities retain
their account and role. A matching email on a different existing account is
rejected; use that account's email/password login instead of automatic linking.
The frontend verifies the resulting application session and restores an allowed
destination, honoring Remember me. GitHub tokens are not stored in the browser.

Pending OAuth requests and single-use handoff codes are held in backend memory
(10 minutes and 60 seconds respectively). Run one backend instance for this
setup; restarting it requires restarting sign-in. Use a shared expiring store
before deploying multiple backend instances. HTTPS is required outside local
development. Protocol reference: [GitHub OAuth web application flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

React frontend for ArchTime.

### Stack

- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS v4**
- **shadcn/ui** — component primitives (`FE/src/components/ui`)
- **Ant Design (antd)** — dark theme, used alongside shadcn/ui
- **Motion** (framer-motion) — scroll reveals, hover effects, particle/typewriter animations
- **@iconify/react** — icon set

### Getting started

```bash
cd FE
npm install
npm run dev
```

The dev server opens automatically in your browser (configured in `FE/vite.config.ts`).

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc -b`) and build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run Oxlint |

### Frontend structure

```text
FE/src/
  pages/
    HomePage.tsx              # Landing page
    developer-analyst/        # Pages for the Developer / Analyst role
    project-maintainer/       # Pages for the Project Maintainer role
    system-administrator/     # Pages for the System Administrator role
  components/
    ui/                       # shadcn/ui components
  lib/
    utils.ts                  # cn() class-merge helper (shadcn)
  App.tsx
  main.tsx
```

Role folders are organized by the user roles defined for the project (Developer/Analyst, Project Maintainer, System Administrator) — each owns the pages for its own set of features.

### Import alias

`@/*` resolves to `FE/src/*` (configured in `FE/vite.config.ts` and `FE/tsconfig.json`), e.g. `import { Button } from "@/components/ui/button"`.

### Adding shadcn/ui components

```bash
npx shadcn@2.10.0 add <component>
```

Pinned to `2.10.0` — newer versions of the shadcn CLI generate components against a different import convention (`radix-ui`/`cn` unified packages) that doesn't match this project's classic setup (`@radix-ui/react-*` + `@/lib/utils`). If you add a component and see imports like `from "cn"` or `from "radix-ui"`, fix them to use `@/lib/utils` and the matching `@radix-ui/react-*` package instead.

## Backend

Node.js backend for ArchTime focusing on authentication, architectural graph processing, and system management.

### Stack

- **Node.js** + **Express** + **TypeScript**
- **MongoDB** + **Mongoose** — document database for storing users, OTPs, and future architectural metadata.
- **JWT (JSON Web Tokens)** — secure stateless authentication.
- **Nodemailer** — email service for verification codes and password resets.
- **Swagger / OpenAPI** — API documentation UI.
- **Domain-Driven Design (Clean Architecture)** — strict separation of concerns into Domain, Application, Infrastructure, and Presentation layers.

### Getting started

```bash
cd BE
npm install
npm run dev
```

You must have MongoDB running (either locally or via Atlas) and a `.env` file configured. The server will start on port `4000`.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the backend development server using `tsx watch` |
| `npm run build` | Compile TypeScript into the `dist/` directory |
| `npm start` | Run the compiled production server |
| `npm run lint` | Run ESLint |

### Backend structure

```text
BE/src/
  application/
    use-cases/                # Business logic workflows (e.g., RegisterUserUseCase, LoginUseCase)
  domain/
    entities/                 # Core domain models
    interfaces/               # Abstractions (e.g., IUserRepository, IEmailService)
  infrastructure/
    database/                 # MongoDB connection logic
    repositories/             # Mongoose implementations of IRepositories
    services/                 # External service implementations (Nodemailer, Bcrypt, JWT)
  presentation/
    controllers/              # Express route handlers
    middlewares/              # Auth, validation, error handlers
    routes/                   # Express router definitions and Swagger tags
  container.ts                # Dependency Injection setup
  server.ts                   # Application entry point
```

The backend groups workflows into use cases, persistence into repositories, and HTTP handling into controllers and routes. Dependencies are assembled in `container.ts`.

### Batch mining

Large repositories are mined in steps instead of one long run:

1. **Scan** (`POST /api/projects/:id/scan`) clones (or fetches) the repository into `BE/mining-cache/<projectId>` and records the commit history. Nothing is analyzed yet.
2. **Choose what to mine** (`POST /api/projects/:id/mine`):
   - `{ "mode": "range", "since": "2024-02-01", "until": "2024-02-29" }` mines only that author-date range (a date-only `until` includes the whole day; add `"force": true` to re-mine commits already mined);
   - `{ "mode": "remaining" }` (also the default with no body) mines every commit not yet mined, so it doubles as "continue".
3. **Monitor / stop**: `GET /api/projects/:id/mining` returns coverage (history vs. mined per month, remaining, active job); `GET /api/projects/:id/mining/estimate?since=&until=` returns exact commit counts for a range; `POST /api/projects/jobs/:jobId/cancel` stops a job.

Commits are analyzed in batches (`MINING_BATCH_SIZE`, default 50) and each batch is saved before the next starts, so cancelling, a failure or a server restart keeps everything finished so far. Jobs expose `total`, `processed`, `batchIndex`/`batchCount` and `progress`. A project has one active job at a time; `MINING_MAX_CONCURRENT` (default 2) limits jobs running across projects. Project status is `PARTIAL` until every commit is mined, then `COMPLETED`.

Each snapshot is compared with the closest earlier *mined* snapshot, so after mining non-adjacent ranges the dependency counts at a gap reflect the whole gap; filling a gap recomputes the snapshot right after it. Private-repository tokens are sent as an HTTP header for the git process and are not written into the clone's remote URL. The FE entry point is **Manage mining** on each project card in Projects.

### AI-assisted architecture components

The Architecture Map groups a snapshot's files into 8-15 components with deterministic clustering. An AI model can then name and refine the grouping, but only after the server is configured for it: set `ANTHROPIC_API_KEY` in `BE/.env` (Claude, default model `claude-opus-5-5`), or `GEMINI_API_KEY` (Google Gemini, default model `gemini-3.6-flash`), or point `LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL` and `LLM_MODEL` at a model you host (for example Ollama). Only file paths and import relations are sent, never source code; for an external provider the UI asks before sending. Every answer is verified and the clustering result is kept when it fails. Details and all variables: `FE/src/features/architecture/README.md`.

Administrators can register more models at run time (**System Administrator → AI Models**), set their price, check their health and pick the default; users then choose a model next to *Refine with AI* and see the tokens (input/output/total), time and cost of every run under **AI Usage**. API keys entered there are stored encrypted with `LLM_SECRET_KEY` (falls back to `JWT_SECRET`; changing it means re-entering the keys). On first start the model configured in `.env` is registered as the default. **AI Usage & Metrics** compares models with a 0-100 score built from answer quality, stability, latency, cost and tokens, and can benchmark several models on the same snapshot. Formulas: `docs/ai-model-metrics-design.md`.

### Authentication merge compatibility

The auth branch is integrated with Develop's existing GitHub flow (browser-bound state, PKCE, and one-use token exchange), password-reset payload (`email`, `token`, `password`, `confirmPassword`), and session revocation. Its alternative Passport routes and OTP-based password-reset implementation are superseded by these existing flows; the proposed Passport account-link endpoints are not exposed.

`POST /api/auth/change-password` requires a Bearer token and `oldPassword`, `newPassword`, and `confirmNewPassword`. A successful change revokes existing sessions and outstanding reset codes. Registration and password changes require at least eight characters, uppercase and lowercase letters, a number, and a special character, with no whitespace and at most 72 UTF-8 bytes.
