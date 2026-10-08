# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two overlapping audiences:

1. **Developer / Analyst** — engineers and tech leads on a product team who want to understand how their own codebase's architecture evolved over time; used during code reviews, architecture audits, sprint retrospectives, and onboarding.
2. **Consultant / Auditor** — external reviewers hired to assess a client system; they need evidence-backed, shareable architecture snapshots and diff reports.

Secondary users: **Project Maintainers** who govern component diagrams, rules, and approval queues; **System Administrators** who configure AI models, monitor mining jobs, and manage users.

Operating environment: desktop browser, internal network or cloud-hosted, always authenticated. No mobile-first requirement, though the layout adapts.

## Product Purpose

ArchTime reconstructs how a Java/Spring Boot codebase's architecture evolved from its Git history. It mines commits with AST analysis, clusters source into 8–15 meaningful components, computes graph-level diffs between snapshots, and produces evidence-backed narratives where every AI claim is labeled FACT, INFERENCE, or UNKNOWN — eliminating guesswork from architecture reviews.

Success: a developer can open ArchTime, pick any two snapshots of their repo, and immediately read an accurate, cited account of what changed architecturally and why.

## Positioning

Every architectural explanation traces back to a specific commit. Competing tools produce diagrams; ArchTime produces evidence. The FACT / INFERENCE / UNKNOWN labeling model is the mechanism no adjacent product could truthfully copy without rebuilding the evidence pipeline.

## Operating Context

- Users have Git access to the target repository and submit it for mining via the UI.
- Mining jobs run server-side; users monitor progress and receive structured results (architecture map, component diff, evidence panels).
- Analysts compare snapshots from the Evolution Comparison view; maintainers confirm or edit the mined component diagram before it becomes canonical.
- The product is used alongside an IDE or PR review — a parallel tab, not a standalone workspace.

## Capabilities and Constraints

**Confirmed capabilities:**
- Batch repository mining (scan → mine range → cancel/monitor)
- Architecture Map with deterministic component clustering; optional AI refinement pass
- Evolution comparison (approximate Graph Edit Distance across snapshot pairs)
- Evidence panels tied to specific commits (diffs, authors, timestamps)
- AI model management: register, health-check, price/quality benchmarking, 0–100 quality score
- Role-based dashboards, reports, approval queues, audit log
- GitHub OAuth + email/password auth; JWT sessions

**Confirmed constraints:**
- Scope: Java / Spring Boot repositories only (current version)
- AI providers: Anthropic Claude, Google Gemini, or any OpenAI-compatible / Ollama endpoint
- No drop shadows — depth from surface ladder + hairline borders only

**Undecided:**
- Multi-tenant SaaS pricing model (if deployed beyond Capstone context)
- Support for other language ecosystems

## Brand Commitments

- **Name:** ArchTime — do not shorten or reorder.
- **Tagline candidates** (in-code copy, not yet formally locked): "Reconstruct how your architecture evolved." / "Architecture Evolution Observatory."
- **Logo:** animated dot + ARCHTIME wordmark in JetBrains Mono — preserve.
- **Colour anchor:** primary blue #3b82f6 is the single chromatic accent; the near-black canvas (#08090a) and hairline system are load-bearing identity elements.

## Evidence on Hand

- Working full-stack implementation (React 19 + Node.js/Express + MongoDB)
- DESIGN.md with complete token system (colors, typography, spacing, components)
- Sample architecture data for ShopHub (13 components, 35 dependencies) used in UI demos
- No real customer testimonials or production usage data yet

## Product Principles

1. **Evidence over assertion.** Every architectural claim must be traceable to a commit. FACT / INFERENCE / UNKNOWN is non-negotiable.
2. **Tool, not decoration.** The interface recedes; the architecture data is the protagonist. Product screenshots and evidence panels lead every section.
3. **Precision over atmosphere.** Flat surfaces, hairline borders, monospace for factual content — the design language mirrors how developers read logs and diffs.
4. **Role clarity.** Three distinct role contexts (Analyst, Maintainer, Admin) each get a dedicated workspace — no context switching within a role session.
5. **Verifiability first.** AI contributions are always disclosed and bounded; the system must remain useful and correct even when AI is unavailable.

## Accessibility & Inclusion

WCAG AA contrast minimum. Keyboard navigation required (skip-link implemented). Focus rings on all interactive elements. Reduced-motion media query honored.
