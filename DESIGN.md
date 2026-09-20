---
version: alpha
name: ArchTime-design-system
description: "Dark, evidence-driven developer-tool aesthetic for ArchTime — a Git-history architecture analysis platform. Near-black canvas with a four-step surface ladder, Inter for UI text, JetBrains Mono for code/data/evidence, and a single chromatic accent reserved for primary actions and key data points. Depth comes from surface contrast and hairline borders, never drop shadows. Product screenshots and evidence panels (diffs, dependency graphs, commit timelines) are the visual protagonist of every section — this is a tool for people who read logs, not a marketing site with atmosphere."
inspired_by: [linear, raycast, clickhouse, vercel]

colors:
  primary: "#3b82f6"
  primary-hover: "#60a5fa"
  primary-active: "#2563eb"
  on-primary: "#ffffff"
  accent-warn: "#f59e0b"
  accent-success: "#22c55e"
  accent-error: "#ef4444"
  ink: "#f4f4f6"
  body: "#c9c9cc"
  muted: "#8a8f98"
  muted-soft: "#5f636b"
  canvas: "#08090a"
  surface-1: "#111213"
  surface-2: "#161718"
  surface-3: "#1c1d1f"
  hairline: "#242527"
  hairline-strong: "#34363a"
  on-dark: "#ffffff"
  inverse-canvas: "#ffffff"
  inverse-ink: "#0a0a0a"

typography:
  display-xl:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 64px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -2px
  display-lg:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 44px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -1.2px
  display-md:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.6px
  heading:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.2px
  body-lg:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  body:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  body-sm:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.3px
  eyebrow:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 1.2px
    textTransform: uppercase
  button:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0
  code:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  code-sm:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 96px

components:
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    height: 56px
    borderColor: "{colors.hairline}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 8px 16px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 8px 16px
    borderColor: "{colors.hairline}"
  evidence-card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
    borderColor: "{colors.hairline}"
  code-panel:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: 16px
    borderColor: "{colors.hairline}"
  screenshot-frame:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: 0
    borderColor: "{colors.hairline}"
  stat-callout:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    typography: "{typography.display-md}"
  badge-pill:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 2px 10px
  text-input:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 8px 12px
    borderColor: "{colors.hairline}"
  cta-band:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.heading}"
    rounded: "{rounded.lg}"
    padding: 48px
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
    padding: 64px 32px
    borderColor: "{colors.hairline}"
---

## Overview

ArchTime is a tool for reconstructing how software architecture evolved from Git history — its audience reads diffs, dependency graphs, and commit timelines all day. The design system reflects that: a near-black canvas (`{colors.canvas}` #08090a) carries a three-step surface ladder for elevation, Inter handles all UI text, and JetBrains Mono renders every piece of evidence (commit hashes, file paths, code diffs, architecture-diff output). There is exactly one chromatic accent (`{colors.primary}` — blue #3b82f6), reserved for primary CTAs, active nav state, links, and the numbers in stat callouts. Semantic colors (warn/success/error) exist only for pipeline status indicators, never as decoration.

Depth is built from the surface ladder and 1px hairline borders — never drop shadows. This keeps the interface feeling like an inspection tool rather than a marketing site: flat, precise, evidence-first.

**Key principles pulled from the reference systems:**
- **Surface ladder over shadows** (from Linear, Raycast, ClickHouse): `{colors.canvas}` → `{colors.surface-1}` → `{colors.surface-2}` → `{colors.surface-3}`, each with 1px `{colors.hairline}` borders.
- **One scarce accent color** (from Linear's lavender, ClickHouse's yellow, Cursor's orange): `{colors.primary}` blue appears only on primary CTAs, active states, and stat numbers — never as a background fill for large surfaces.
- **Product evidence as the protagonist** (from Linear, Raycast): every section should lead with a real screenshot, code diff, or graph visualization inside a `{component.screenshot-frame}` or `{component.code-panel}` — not abstract illustration.
- **Monospace for anything factual** (from ClickHouse, Sentry, Cursor): commit hashes, file paths, diff output, and pipeline stage labels render in `{typography.code}`. Prose stays in Inter.
- **Negative tracking on display type** (universal across all seven references): headlines get -0.6px to -2px letter-spacing; body stays at 0.

## Colors

### Brand & Accent
- **Primary** (`{colors.primary}` — #3b82f6): the only chromatic accent. Primary CTA fill, active nav indicator, links, stat-callout numbers.
- **Primary Hover** (`{colors.primary-hover}` — #60a5fa) / **Primary Active** (`{colors.primary-active}` — #2563eb): interaction states.

### Surface
- **Canvas** (`{colors.canvas}` — #08090a): page floor.
- **Surface 1/2/3**: successive elevation steps for cards, code panels, and nested panels.
- **Hairline** (`{colors.hairline}` — #242527) / **Hairline Strong** (`{colors.hairline-strong}` — #34363a): the only depth cue — 1px borders on every card and divider.

### Text
- **Ink** (`{colors.ink}` — #f4f4f6): headings, emphasized body.
- **Body** (`{colors.body}` — #c9c9cc): default running text.
- **Muted** (`{colors.muted}` — #8a8f98) / **Muted Soft** (`{colors.muted-soft}` — #5f636b): captions, disabled, footer text.

### Semantic (pipeline status only)
- **Warn** (`{colors.accent-warn}` — #f59e0b), **Success** (`{colors.accent-success}` — #22c55e), **Error** (`{colors.accent-error}` — #ef4444): reserved for analysis-pipeline status badges (e.g. "Analysis running", "Evidence verified", "Parse failed"). Never used decoratively.

## Typography

**Inter** for all UI text (display, body, buttons, nav). **JetBrains Mono** for everything factual: code diffs, commit hashes, file paths, CLI output.

| Token | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| `{typography.display-xl}` | 64px | 600 | -2px | Hero headline |
| `{typography.display-lg}` | 44px | 600 | -1.2px | Section openers |
| `{typography.display-md}` | 30px | 600 | -0.6px | Sub-section heads, stat numbers |
| `{typography.heading}` | 20px | 600 | -0.2px | Card titles |
| `{typography.body-lg}` | 17px | 400 | 0 | Lead paragraphs |
| `{typography.body}` | 15px | 400 | 0 | Default body |
| `{typography.body-sm}` | 13px | 400 | 0 | Secondary copy, table cells |
| `{typography.caption}` | 12px | 500 | 0.3px | Badges, metadata |
| `{typography.eyebrow}` | 12px | 600 | 1.2px, uppercase | Section labels |
| `{typography.button}` | 14px | 500 | 0 | Button labels |
| `{typography.code}` | 13px | 400 | 0 | Diff output, commit hashes, file paths |
| `{typography.code-sm}` | 12px | 400 | 0 | Inline code, table code cells |

## Layout

- **Base unit**: 4px. Scale: `{spacing.xxs}` 4 · `{spacing.xs}` 8 · `{spacing.sm}` 12 · `{spacing.md}` 16 · `{spacing.lg}` 24 · `{spacing.xl}` 32 · `{spacing.xxl}` 48 · `{spacing.section}` 96px.
- **Max content width**: ~1280px.
- **Card grids**: 3-up desktop → 2-up tablet → 1-up mobile.
- Section rhythm: `{spacing.section}` (96px) between major bands; card interiors at `{spacing.lg}`–`{spacing.xl}` (24–32px).

## Elevation

No drop shadows anywhere. Depth = surface-ladder step + 1px hairline border.

| Level | Treatment | Use |
|---|---|---|
| 0 | Flat, no border | Canvas, hero text |
| 1 | `{colors.surface-1}` + `{colors.hairline}` | Default cards, evidence cards |
| 2 | `{colors.surface-2}` + `{colors.hairline}` | Code panels, nested content |
| 3 | `{colors.surface-3}` | Dropdowns, sub-nav |

## Shapes

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Badges |
| `{rounded.sm}` | 6px | Inline tags |
| `{rounded.md}` | 8px | Buttons, inputs |
| `{rounded.lg}` | 12px | Cards |
| `{rounded.xl}` | 16px | Screenshot/graph frames |
| `{rounded.pill}` | 9999px | Status pills |

## Components

**`button-primary`** — Background `{colors.primary}`, text white, `{rounded.md}`, padding 8px 16px. The only filled-blue element per viewport should stay scarce — one primary CTA per fold.

**`evidence-card`** — Default content card. Background `{colors.surface-1}`, 1px hairline, `{rounded.lg}`, padding 24px. Used for pipeline-stage cards (Repository Mining, Evolution Analysis, Knowledge Graph, etc.).

**`code-panel`** — Background `{colors.surface-2}`, `{typography.code}`, `{rounded.md}`, padding 16px. Renders commit diffs, CLI output, JSON evidence.

**`screenshot-frame`** — Background `{colors.surface-1}`, `{rounded.xl}`, no padding (content fills edge-to-edge). Frames actual product screenshots (dependency graph view, timeline view, diff view) — the visual protagonist of the homepage.

**`stat-callout`** — Transparent background, text `{colors.primary}`, `{typography.display-md}`. Used for credibility numbers (repos analyzed, commits processed).

**`badge-pill`** — Background `{colors.surface-2}`, text muted, `{rounded.pill}`, padding 2px 10px. Pipeline stage tags.

## Do's and Don'ts

### Do
- Keep `{colors.primary}` blue scarce — one solid-fill primary CTA per viewport.
- Lead every homepage section with a real product screenshot or evidence panel inside `{component.screenshot-frame}`.
- Render commit hashes, file paths, and diff output in `{typography.code}` (JetBrains Mono) — never in Inter.
- Build all elevation from the surface ladder + hairline border. No shadows.
- Apply negative letter-spacing on every display size.

### Don't
- Don't introduce a second chromatic accent — semantic colors are for pipeline status only, never decoration.
- Don't add drop shadows or glow effects.
- Don't use pill radius on cards — reserve `{rounded.pill}` for badges/status only.
- Don't set body copy in JetBrains Mono — mono is for factual/evidence content only.

## Sources

Synthesized from `getdesign` analyses of linear.app, vercel.com, cursor.com, warp.dev, raycast.com, sentry.io, and clickhouse.com (fetched via `npx getdesign@latest add <brand>`, archived under `.design-refs/`). This is an original token system for ArchTime, not a copy of any single source — customize freely as the product evolves.
