import type { DiagramTheme } from '../../features/architecture/theme.ts';
import { DIAGRAM_MONO } from '../../features/architecture/theme.ts';
import type { ThemeDefinition } from '../types.ts';
import { MONO_HERO, heroDarkCss } from '../heroDark.ts';

const SANS = '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** The drawing on pure white: white cards with a hairline edge, near-black ink, deep muted role colours. */
export const PURE_DIAGRAM: DiagramTheme = {
  name: 'light', background: '#ffffff', grid: '#ececef', card: '#ffffff', cardStroke: '#d4d4d8', text: '#18181b', muted: '#52525b', edge: '#71717a', edgeDim: '#ececef',
  cycle: '#b91c1c', route: '#854d0e', focus: '#18181b', badgeFill: '#f4f4f5',
  role: { controller: '#2f4b7c', service: '#5b4b8a', repository: '#2f6b52', entity: '#7a5a12', gateway: '#8a3346', config: '#52525b', util: '#3a5f85', external: '#8a4b20', other: '#71717a' },
  tag: { FACT: '#15803d', INFERENCE: '#854d0e', UNKNOWN: '#52525b' }, sans: SANS, mono: DIAGRAM_MONO,
};

/**
 * Pure white: nothing but white, near-black ink and cool greys. The page, the sidebar and every card are #ffffff and are
 * told apart by hairline edges and the softest of shadows; the one action is a black pill with white text. No colour
 * except what a state needs (deep green, red and amber, 7:1 on white). Links are ink with a fine underline, so they read
 * as links without a hue.
 */
export const pureTheme: ThemeDefinition = {
  id: 'pure',
  label: { en: 'Pure white', vi: 'Trắng tinh khôi' },
  hint: { en: 'Pure white with black ink, no colour', vi: 'Trắng tinh khiết, chữ đen, không màu' },
  selectable: true,
  tokens: {
    page: 'transparent', sidebar: '#ffffff', chrome: 'rgb(255 255 255 / 0.86)',
    panel: '#ffffff', 'panel-2': '#fafafa', solid: '#ffffff', hover: 'rgb(24 24 27 / 0.045)', grid: '#ececef',
    line: '#ececef', 'line-strong': '#a1a1aa', 'panel-edge': '#e8e8ec', 'overlay-edge': '#e4e4e7',
    text: '#18181b', 'text-strong': '#09090b', muted: '#52525b', link: '#18181b', 'link-hover': '#000000',
    'selection-bg': '#18181b', 'selection-text': '#ffffff',
    accent: '#18181b', fill: '#18181b', 'fill-hover': '#3f3f46', 'on-fill': '#ffffff', glow: '#a1a1aa',
    'headline-gradient': 'linear-gradient(#09090b, #09090b)',
    success: '#15803d', danger: '#b91c1c', 'danger-text': '#991b1b', warn: '#854d0e', 'home-warn': '#18181b',
    'tag-bg': '#f4f4f5', 'tag-edge': '#e4e4e7', 'tag-text': '#18181b',
    'tag-accent-bg': '#18181b', 'tag-accent-edge': '#18181b', 'tag-accent-text': '#ffffff',
    'tag-tint': '7%', 'tag-tint-edge': '30%',
    'font-sans': SANS, 'font-display': SANS, 'font-mono': MONO, 'font-label': SANS,
    'label-weight': '600', 'label-tracking': '0.08em', 'body-size': '15px', 'body-tracking': '0',
    'heading-tracking': '-0.025em', 'heading-shadow': 'none',
    'font-script': SANS, 'script-size': '1em', 'script-weight': '300', 'script-style': 'italic', 'script-shadow': 'none',
    'radius-card': '16px', 'radius-action': '999px', 'radius-chip': '999px',
    'shadow-card': '0 1px 2px rgb(24 24 27 / 0.04), 0 8px 24px -16px rgb(24 24 27 / 0.12)',
    'shadow-nested': '0 1px 2px rgb(24 24 27 / 0.04)',
    'nested-border-style': 'solid',
    'shadow-action': '0 1px 2px rgb(0 0 0 / 0.14)',
    'shadow-overlay': '0 0 0 1px rgb(24 24 27 / 0.05), 0 24px 48px -20px rgb(24 24 27 / 0.22)',
    'chrome-blur': 'blur(12px)',
    // Pictures drawn for a dark page become soft grey prints on white.
    'illustration-filter': 'grayscale(1) invert(0.94) contrast(1.02)',
    'film-blend': 'normal', 'film-filter': 'none', 'film-opacity': '1',
    'color-scheme': 'light',
    'floor-color': '#ffffff',
    // Only a breath of light at the top, so the white has depth without a texture.
    'floor-image': 'radial-gradient(ellipse 90% 55% at 50% -12%, #f4f4f6 0%, rgb(255 255 255 / 0) 70%)',
    'floor-size': 'auto', 'floor-position': '0 0', 'floor-repeat': 'no-repeat',
  },
  antd: {
    base: '#ffffff', container: '#ffffff', elevated: '#ffffff', border: '#e4e4e7', borderSecondary: '#f0f0f2',
    textSecondary: '#3f3f46', textTertiary: '#52525b', textQuaternary: '#71717a', fontFamily: SANS, radius: 10,
    fillActive: '#000000', primaryShadow: 'none', defaultBg: '#ffffff', defaultBorder: '#e4e4e7',
    defaultHoverText: '#000000', defaultHoverBorder: '#18181b', defaultHoverBg: '#fafafa', defaultActiveBorder: '#000000',
    tabSelected: '#09090b', tabHover: '#000000', tabInk: '#18181b',
    extra: {
      token: {
        colorBgLayout: '#ffffff',
        boxShadow: '0 0 0 1px rgb(24 24 27 / 0.05), 0 24px 48px -20px rgb(24 24 27 / 0.22)',
        boxShadowSecondary: '0 0 0 1px rgb(24 24 27 / 0.05), 0 16px 32px -16px rgb(24 24 27 / 0.2)',
      },
      components: {
        Modal: { contentBg: '#ffffff', headerBg: '#ffffff', footerBg: '#ffffff' },
        Segmented: { itemSelectedBg: '#18181b', itemSelectedColor: '#ffffff', trackBg: '#f4f4f5' },
        Switch: { colorPrimary: '#18181b', colorPrimaryHover: '#3f3f46' },
        Table: { headerBg: '#fafafa', rowHoverBg: '#fafafa' },
        Progress: { defaultColor: '#18181b' },
        Tooltip: { colorBgSpotlight: '#18181b' },
      },
    },
  },
  diagram: { dark: PURE_DIAGRAM, light: PURE_DIAGRAM },
  // Links are ink like the text, so a plain text link gets a fine underline. Only those painted with the link colour all
  // the time (a whole class, not hover:…), and not navigation, button-shaped links (rounded) or emphasised names (font-…).
  css: (() => {
    const link = ':scope a[class~="text-[var(--at-link)]"]:not([aria-current]):not(nav a):not([class*="rounded"]):not([class*="font-"])';
    return [
      `${link} { text-decoration-line: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; text-decoration-color: rgb(24 24 27 / 0.3); }`,
      `${link}:hover { text-decoration-color: currentColor; }`,
      // The landing hero stays dark, so the film shows whole and in its own colours.
      heroDarkCss(MONO_HERO),
    ].join('\n');
  })(),
};
