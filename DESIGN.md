---
name: ArchTime
description: "Frosted-glass observatory for reading how software architecture evolves: misty slate, translucent glass panels with a light edge and a soft glow, ice-blue text, pearl pill buttons, Montserrat."
colors:
  slate-haze: "#2a3138"
  misty-slate: "#1b2228"
  slate-deep: "#151b21"
  night-veil: "rgb(14 19 24 / 0.5)"
  night-veil-dense: "rgb(14 19 24 / 0.78)"
  sidebar-veil: "rgb(12 17 22 / 0.6)"
  glass: "rgb(214 225 240 / 0.07)"
  glass-raised: "rgb(214 225 240 / 0.11)"
  frost-line: "rgb(220 230 245 / 0.17)"
  frost-edge: "rgb(225 234 248 / 0.26)"
  surface-container: "#222a32"
  surface-elevated: "#27303a"
  control-border: "#4a5662"
  snow-ink: "#eef2f8"
  mist-text: "#b4c0ce"
  ice-link: "#d3def3"
  ice-white: "#ffffff"
  periwinkle: "#9db3dc"
  pearl: "#e4eaf5"
  pearl-pressed: "#cdd8ea"
  on-pearl: "#18212c"
  starlight: "#eaf1ff"
  honey: "#f0c27e"
  status-success: "#4ade80"
  status-error: "#f87171"
typography:
  display:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "clamp(3rem, 6vw, 4.5rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0.005em"
  label:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.14em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  script:
    fontFamily: "Great Vibes, cursive"
    fontSize: "1.35em"
    fontWeight: 400
    lineHeight: 1
rounded:
  sm: "6px"
  control: "10px"
  node: "12px"
  glass: "14px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  panel: "20px"
  lg: "24px"
  page: "36px"
components:
  button-primary:
    backgroundColor: "{colors.pearl}"
    textColor: "{colors.on-pearl}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.ice-white}"
    textColor: "{colors.on-pearl}"
    rounded: "{rounded.pill}"
  button-primary-active:
    backgroundColor: "{colors.pearl-pressed}"
    textColor: "{colors.on-pearl}"
    rounded: "{rounded.pill}"
  button-secondary:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.snow-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  glass-panel:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.snow-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.glass}"
    padding: "{spacing.panel}"
  glass-panel-raised:
    backgroundColor: "{colors.glass-raised}"
    textColor: "{colors.snow-ink}"
    rounded: "{rounded.glass}"
    padding: "{spacing.panel}"
  text-input:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.snow-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.glass}"
    padding: "10px 14px"
    height: "44px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.mist-text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 12px"
  nav-item-active:
    backgroundColor: "{colors.glass-raised}"
    textColor: "{colors.snow-ink}"
    rounded: "{rounded.control}"
  section-label:
    backgroundColor: "transparent"
    textColor: "{colors.mist-text}"
    typography: "{typography.label}"
  diagram-node:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.snow-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.node}"
    width: "200px"
    height: "62px"
---

# Design System: ArchTime

## Overview

**Creative North Star: "The Frosted Observatory"**

ArchTime is where a team watches its architecture change over time, so the interface is an observatory at night seen through frosted glass. The floor is a misty slate gradient with a few faint four-point stars and two thin hanging light lines in the top right corner. Everything you work with floats above it as translucent glass: panels that let the mist show through, edged with a thin light line and a soft cold glow. The light in the room is ice blue and white, never warm and never neon.

The look belongs to the people who use the product: every page a signed-in user (the developer-analyst role) sees, and every public page (landing, sign-in, sign-up, email verification, password reset, invitations). The administrators' console keeps the earlier flat near-black look; it reads the same colour variables with their original defaults (see Colors). Density stays that of a working tool: tables, graphs, file lists and diffs are the content, and the glass is the frame around them, not decoration on top of them.

**Key Characteristics:**

- Misty slate background with sparse sparkles, always behind translucent glass panels.
- Ice-blue and white light; the one strong fill is a pearl-white pill with dark text.
- Montserrat for everything people read, small labels in spaced-out capitals, monospace only for hashes, paths and code.
- Soft cold glow instead of hard shadows; rounded, pill-shaped controls.
- Text at least 7:1 against the panels it sits on.

## Colors

A cold, nearly monochrome palette: slate for the floor, white-tinted glass for surfaces, ice blue for links and accents, pearl for the one strong action.

### Primary

- **Pearl** (`pearl`): the fill of the main action on a screen (primary buttons, "Create report", "Sign in"), always with **On-Pearl** text (`on-pearl`) on it; hover lightens to **Ice White** (`ice-white`), press dims to **Pearl Pressed** (`pearl-pressed`).
- **Periwinkle** (`periwinkle`): the accent for non-text marks: icons, focus rings, borders of selected things, the edge of diagram nodes, tints behind chips.

### Secondary

- **Ice Link** (`ice-link`): links and highlighted words on dark surfaces (nav item of the current group, "Changed in commits" hashes, help shortcuts); hover goes to **Ice White**.
- **Starlight** (`starlight`): glows and points of light: sparkles, pulsing status dots, the glow around pearl buttons.

### Tertiary

- **Honey** (`honey`): the only warm colour, and only for "changed" or "needs attention": changed folders on Compare, outdated learning steps, warnings. It never decorates.
- **Success** (`status-success`) and **Error** (`status-error`): added / removed / failed states only.

### Neutral

- **Misty Slate** (`misty-slate`), **Slate Haze** (`slate-haze`) and **Slate Deep** (`slate-deep`): the page floor, painted as a fixed gradient behind everything.
- **Glass** (`glass`) and **Glass Raised** (`glass-raised`): panels and nested panels; translucent so the floor shows through.
- **Night Veil** (`night-veil`), **Night Veil Dense** (`night-veil-dense`) and **Sidebar Veil** (`sidebar-veil`): darker translucent layers for page wells, the workspace header and the sidebar.
- **Frost Line** (`frost-line`): dividers and default borders; **Frost Edge** (`frost-edge`): the brighter edge of glass panels.
- **Surface Container** (`surface-container`), **Surface Elevated** (`surface-elevated`), **Control Border** (`control-border`): solid surfaces for antd controls, modals, dropdowns and diagram nodes, where translucency would make text hard to read.
- **Snow Ink** (`snow-ink`): headings and body text. **Mist Text** (`mist-text`): secondary text, captions, labels.

### Named Rules

**The Ice, Not Neon Rule.** No saturated blue, cyan or amber on these pages. Accents are pale ice; the strongest colour on a screen is the pearl button.

**The Variables Only Rule.** Pages paint with the `--at-*` CSS variables (`--at-page`, `--at-panel`, `--at-panel-2`, `--at-line`, `--at-text`, `--at-muted`, `--at-link`, `--at-accent`, `--at-fill`, `--at-on-fill`, `--at-warn`, `--at-glow`), never with literal hex. The variables' defaults are the old console colours and `html[data-theme="frost"]` turns them into this palette, so one class serves both looks.

**The Seven-to-One Rule.** Any text must keep at least 7:1 against the surface it sits on. Mist Text is the dimmest colour allowed for words; darker greys are for disabled controls and placeholders only.

## Typography

**Display Font:** Montserrat (with system-ui)
**Body Font:** Montserrat (with system-ui)
**Label/Mono Font:** JetBrains Mono for hashes, paths and code; Great Vibes as a rare handwritten accent

**Character:** One geometric face for everything people read, firm in headings and calm in body text; small capitals with wide spacing give labels the look of instrument markings.

### Hierarchy

- **Display** (700, clamp(3rem, 6vw, 4.5rem), 1.1): landing and sign-in hero lines only. Can carry a white-to-ice gradient on its last words.
- **Headline** (700, 30px, 1.2): page titles ("Repository Workspaces", "My profile").
- **Title** (700, 20px, 1.3): card and section titles, diagram node names (14px inside diagrams).
- **Body** (400, 14px, 1.6): running text, table cells, descriptions; keep paragraphs under about 75 characters wide.
- **Label** (600, 11px, 0.14em, uppercase): section labels and stat captions ("COMMITS FOUND", "CHANGED IN COMMITS").
- **Mono** (400, 12px): commit hashes, file paths, code, terminal lines.
- **Script** (400, 1.35em of its line): one or two words of flourish, such as the user's name in the dashboard greeting.

### Named Rules

**The One Face Rule.** Montserrat for everything readable. Monospace only where the text is literally code, a hash or a path; upper-case labels written in monospace are drawn in Montserrat automatically.

**The Two-Word Script Rule.** The handwritten Great Vibes face appears at most once per screen, on one or two words, never on anything a person must read to act.

## Layout

The signed-in workspace is a fixed frame: a 256px sidebar (hidden behind a menu button below 1024px), a 64px header, and a single scrolling content area padded 16px, 24px from 640px and 36px from 1280px. Content sits in a centred column up to 1400px wide with 24px between sections. The page itself never scrolls; only the content area does, so nothing may be positioned outside it.

Cards line up in 2 to 4 column grids that fall back to one column on phones. The Architecture Map is full-bleed with a 40px header and side panels that become drawers below 1100px; it has a full-screen mode with no header at all. The Compare page stacks its Before and After drawings until 1536px, then puts them side by side. Sign-in and sign-up split the screen 40/60 (form / illustration) from 768px and become one column below.

## Elevation & Depth

Depth comes from translucency and light, not from darkness. A panel is lighter than the floor because it is white-tinted glass, it has a brighter top edge, and it glows faintly; it does not cast a hard shadow.

### Shadow Vocabulary

- **Glass panel** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.07), 0 12px 32px -14px rgb(0 0 0 / 0.5), 0 0 24px -10px rgb(205 222 255 / 0.22)`): every card and panel.
- **Pearl glow** (`box-shadow: 0 0 16px rgb(214 228 255 / 0.32), inset 0 -1px 0 rgb(24 33 44 / 0.12)`): primary pill buttons.
- **Overlay** (`box-shadow: 0 0 28px -8px rgb(205 222 255 / 0.25), 0 20px 50px -20px rgb(0 0 0 / 0.6)` with a 1px Frost Edge border): modals, drawers, dropdowns, popovers.
- **Heading halo** (`text-shadow: 0 0 22px rgb(220 232 255 / 0.22)`): page headings.
- **Frosted chrome** (`backdrop-filter: blur(14px)`): the sidebar and the workspace header only.

### Named Rules

**The Glow, Not Drop Rule.** Elevation is a cold glow and a light edge. A dark offset shadow is allowed only as the soft, wide ambient layer above, never as a crisp drop shadow.

## Shapes

Everything is gently rounded. Glass panels and inputs use soft corners (14px); antd controls such as selects and small buttons use 10px; diagram nodes 12px. Every solid action button is a full pill (999px), and so are tinted chip-like buttons and status tags. Square corners belong to the old console look only.

## Components

### Buttons

- **Shape:** full pill (999px).
- **Primary:** Pearl fill with On-Pearl text, label typography in capitals or title case, padding 10px 20px, Pearl glow.
- **Hover / Focus:** hover turns Ice White; keyboard focus shows a 2px Periwinkle outline 3px away.
- **Secondary:** Glass fill, Snow Ink text, Frost Edge border; hover brightens the glass and the border to Ice Link.
- **Danger:** outlined in Error with Error text (for example "Sign out of all devices").

### Chips

- **Style:** small pill with a faint tint of their colour behind same-colour text: Success for added, Error for removed, Honey for changed, Periwinkle for neutral tags (antd blue tags render in Ice Link).
- **State:** status chips are read-only; filter chips use the selected Glass Raised fill.

### Cards / Containers

- **Corner Style:** soft (14px).
- **Background:** Glass, or Glass Raised for a panel inside a panel.
- **Shadow Strategy:** Glass panel glow (see Elevation & Depth).
- **Border:** 1px Frost Edge.
- **Internal Padding:** 20px; stat cards 24px.

### Inputs / Fields

- **Style:** Glass fill, 1px Frost Line border, soft corners (14px), 44px tall on sign-in forms.
- **Focus:** border turns Periwinkle; antd fields show their own focus ring in the same colour.
- **Error / Disabled:** red-tinted border with the message in Error-coloured text directly under the field; never a pop-up toast for a field problem.

### Navigation

- **Sidebar:** Sidebar Veil with frosted blur; items in Mist Text with an icon, hover brightens the glass; the current page is a Glass Raised rounded item with Snow Ink text and a Frost Edge border. Groups (Analyze, Maintain) fold and unfold.
- **Header:** 64px, Frost Line bottom border, page name with its group label above it, "Find a page" search and the account avatar (pearl circle with the person's initials).
- **Mobile:** the sidebar becomes a drawer from a menu button.

### Diagram Nodes (signature)

Architecture and Compare drawings use rounded nodes (12px) on Surface Elevated with a coloured left mark or dot by role, Snow Ink names and Mist Text details. On Compare a node's edge says what happened to its folder: Success added, Error removed, Honey changed, Frost Line unchanged, dashed when the folder exists only in the other revision. Selected nodes get an Ice White edge and glow; nodes are buttons that open their files.

### Sparkle Field (signature)

The background carries three four-point stars and two thin hanging light lines at fixed positions, part of the page floor, never interactive and never animated.

## Do's and Don'ts

### Do:

- **Do** paint with the `--at-*` variables so the same component works in the frost look and the console look.
- **Do** keep one Pearl pill as the main action of an area, with dark On-Pearl text.
- **Do** put content on Glass panels with the soft 14px corners, the Frost Edge border and the glass glow.
- **Do** use Honey only for "changed / needs attention", Success and Error only for added/removed/failed.
- **Do** keep text at 7:1 or better; use Mist Text for secondary text.
- **Do** write labels in spaced-out capitals and keep monospace for hashes, paths and code.

### Don't:

- **Don't** use saturated blue, cyan or amber (the old `#3b82f6`, `#00f0ff`, `#ffb03a` accents) on frost pages.
- **Don't** put white text on a light fill or dark text on a saturated blue fill.
- **Don't** use dark greys such as `#5f636b` or `#64748b` for words.
- **Don't** use square corners on buttons, cards or inputs in the frost look.
- **Don't** add hard, crisp drop shadows; depth is glow and translucency.
- **Don't** use the script face for more than one or two words per screen.
