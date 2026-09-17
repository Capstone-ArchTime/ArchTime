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
