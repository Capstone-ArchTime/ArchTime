// What a theme is made of. A theme is one ThemeDefinition (src/theme/themes/<id>.ts) listed in src/theme/registry.ts:
// its tokens become the --at-* CSS variables (src/theme/css.ts), its antd seeds the antd theme (src/theme/antd.ts) and
// its diagram palettes colour the architecture drawings. Pages never name a theme; they paint with the variables, e.g.
// text-[var(--at-text)], bg-[var(--at-panel)], border-[var(--at-danger)]/40.
import type { ThemeConfig } from 'antd';
import type { DiagramTheme } from '../features/architecture/theme.ts';

/** Every design token, written as the CSS variable --at-<name>. A theme must give a value for each one. */
export interface ThemeTokens {
  // ── Surfaces ──────────────────────────────────────────────────────────────────────────────
  /** Page wells over the floor (may be translucent or transparent). */
  page: string;
  /** The sidebar. */
  sidebar: string;
  /** Top bars and other chrome over content. */
  chrome: string;
  /** Cards and panels. */
  panel: string;
  /** A panel inside a panel. */
  'panel-2': string;
  /** An opaque surface for what floats over the page (drawers, popovers). Also the reference for contrast checks. */
  solid: string;
  /** Subtle hover / selected tint on rows, icon buttons and tracks. */
  hover: string;
  /** The dot grid behind diagrams and maps. */
  grid: string;

  // ── Lines ─────────────────────────────────────────────────────────────────────────────────
  /** Dividers and default borders. */
  line: string;
  /** A brighter border for hover on outlined controls; never a text colour. */
  'line-strong': string;
  /** The border of cards and panels that have one. */
  'panel-edge': string;
  /** The border of modals, drawers, menus and popovers. */
  'overlay-edge': string;

  // ── Text ──────────────────────────────────────────────────────────────────────────────────
  /** Headings and body text (at least 7:1 on `solid`). */
  text: string;
  /** The brightest text: emphasis, hover on links and nav items. */
  'text-strong': string;
  /** Secondary text, captions, labels (at least 7:1 on `solid`). */
  muted: string;
  link: string;
  'link-hover': string;
  'selection-bg': string;
  'selection-text': string;

  // ── Accents and actions ───────────────────────────────────────────────────────────────────
  /** Non-text marks: icons, focus rings, borders of selected things, tints behind chips. */
  accent: string;
  /** The one strong fill: primary buttons. */
  fill: string;
  'fill-hover': string;
  /** Text on `fill` (at least 4.5:1). */
  'on-fill': string;
  /** Points of light: glows, pulsing dots. */
  glow: string;
  /** A gradient for the highlighted words of hero headlines (used with bg-clip-text). */
  'headline-gradient': string;

  // ── States ────────────────────────────────────────────────────────────────────────────────
  /** Added / healthy / done. */
  success: string;
  /** Removed / failed. */
  danger: string;
  /** Words on a danger-tinted alert. */
  'danger-text': string;
  /** Changed / needs attention. */
  warn: string;
  /** What `warn` becomes on the landing and sign-in pages (their highlights). */
  'home-warn': string;

  // ── Chips (antd tags) ─────────────────────────────────────────────────────────────────────
  'tag-bg': string;
  'tag-edge': string;
  'tag-text': string;
  /** Accent tags (antd blue / processing). */
  'tag-accent-bg': string;
  'tag-accent-edge': string;
  'tag-accent-text': string;
  /** How much of a status colour tints a status chip's background and edge (e.g. 12%, 40%). */
  'tag-tint': string;
  'tag-tint-edge': string;

  // ── Type ──────────────────────────────────────────────────────────────────────────────────
  'font-sans': string;
  /** Page and section headings. */
  'font-display': string;
  'font-mono': string;
  /** Small upper-case labels that pages write in monospace. */
  'font-label': string;
  'label-weight': string;
  'label-tracking': string;
  'body-size': string;
  'body-tracking': string;
  'heading-tracking': string;
  'heading-shadow': string;
  /** The one- or two-word flourish (.at-script). */
  'font-script': string;
  'script-size': string;
  'script-weight': string;
  'script-style': string;
  'script-shadow': string;

  // ── Shape and depth ───────────────────────────────────────────────────────────────────────
  'radius-card': string;
  /** Solid action buttons. */
  'radius-action': string;
  'radius-chip': string;
  'shadow-card': string;
  'shadow-nested': string;
  /** Border style of nested panels (solid, dashed…). */
  'nested-border-style': string;
  'shadow-action': string;
  'shadow-overlay': string;
  /** backdrop-filter of the sidebar and top bars. */
  'chrome-blur': string;

  // ── Pictures ──────────────────────────────────────────────────────────────────────────────
  /** CSS filter for illustrations drawn for the dark look (.at-illustration), e.g. none or grayscale(1) invert(0.92). */
  'illustration-filter': string;
  /** The landing film: blend mode, filter and opacity. */
  'film-blend': string;
  'film-filter': string;
  'film-opacity': string;

  // ── Floor (the page background) ───────────────────────────────────────────────────────────
  'color-scheme': 'dark' | 'light';
  'floor-color': string;
  'floor-image': string;
  'floor-size': string;
  'floor-position': string;
  'floor-repeat': string;
}

export type TokenName = keyof ThemeTokens;

/** antd seeds that cannot be read from the tokens (antd mixes colours in JavaScript, so they must be literal). */
export interface AntdSeeds {
  /** colorBgBase; containers and elevated surfaces are derived from it unless given. */
  base: string;
  container?: string;
  elevated?: string;
  border?: string;
  borderSecondary?: string;
  textSecondary?: string;
  textTertiary?: string;
  textQuaternary?: string;
  fontFamily: string;
  radius: number;
  /** Primary button pressed. */
  fillActive: string;
  primaryShadow?: string;
  defaultBg?: string;
  defaultBorder?: string;
  defaultHoverText: string;
  defaultHoverBorder: string;
  defaultHoverBg?: string;
  defaultActiveBorder: string;
  tabSelected: string;
  tabHover: string;
  tabInk: string;
  /** Anything else, merged last (component tokens, extra global tokens). */
  extra?: ThemeConfig;
}

export interface ThemeDefinition {
  id: string;
  /** Shown in the theme picker. */
  label: { en: string; vi: string };
  hint: { en: string; vi: string };
  /** Offered in the theme picker. The default (console) theme is not. */
  selectable: boolean;
  tokens: ThemeTokens;
  antd: AntdSeeds;
  /** The architecture drawing in its dark and light modes (the viewer's own switch). */
  diagram: { dark: DiagramTheme; light: DiagramTheme };
  /** Google Fonts css2 query ("family=…&family=…") loaded when the theme is first worn. */
  fonts?: string;
  /** Other selectors that wear this theme's variables and floor whatever the theme on <html> (e.g. a page-only scope). */
  scopes?: string[];
  /**
   * Signature CSS that tokens cannot express (prompts, brackets…). Write `:scope` for the theme's root; it becomes
   * html[data-theme="<id>"]. Keep it short: anything colour, font, shape or depth belongs in the tokens.
   */
  css?: string;
}
