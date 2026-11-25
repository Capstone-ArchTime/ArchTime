import type { DiagramTheme } from '../../features/architecture/theme.ts';
import { DIAGRAM_MONO } from '../../features/architecture/theme.ts';
import type { ThemeDefinition } from '../types.ts';
import { MONO_HERO, heroDarkCss } from '../heroDark.ts';

/** Paper with ink: white cards, black ink, deep muted role colours. */
export const INK_DIAGRAM: DiagramTheme = {
  name: 'light', background: '#fafaf8', grid: '#e4e4df', card: '#ffffff', cardStroke: '#b9b9b3', text: '#111111', muted: '#474747', edge: '#6b6b6b', edgeDim: '#e2e2de',
  cycle: '#b91c1c', route: '#7a4f00', focus: '#111111', badgeFill: '#eeeeea',
  role: { controller: '#2f4b7c', service: '#5b4b8a', repository: '#2f6b52', entity: '#7a5a12', gateway: '#8a3346', config: '#555555', util: '#3a5f85', external: '#8a4b20', other: '#666666' },
  tag: { FACT: '#15803d', INFERENCE: '#7a4f00', UNKNOWN: '#555555' }, sans: '"Inter", system-ui, sans-serif', mono: DIAGRAM_MONO,
};

/**
 * Halftone ink: a light print look. Paper with a dot screen that fades towards the middle, white cards with a thin
 * grey edge, black ink for text and actions, condensed headlines, black pill buttons. Status colours are the deep
 * shades that keep 7:1 on white; pictures drawn for the dark look print in greyscale.
 */
export const inkTheme: ThemeDefinition = {
  id: 'ink',
  label: { en: 'Halftone ink', vi: 'Mực in halftone' },
  hint: { en: 'Light, black on paper', vi: 'Nền sáng, mực đen trên giấy' },
  selectable: true,
  fonts: 'family=Archivo+Narrow:wght@500;600;700',
  tokens: {
    page: 'transparent', sidebar: 'rgb(246 246 243 / 0.88)', chrome: 'rgb(246 246 243 / 0.9)',
    panel: '#ffffff', 'panel-2': '#f4f4f1', solid: '#ffffff', hover: 'rgb(17 17 17 / 0.06)', grid: '#e4e4df',
    line: '#d9d9d4', 'line-strong': '#8f8f89', 'panel-edge': '#d9d9d4', 'overlay-edge': '#d9d9d4',
    text: '#111111', 'text-strong': '#000000', muted: '#474747', link: '#111111', 'link-hover': '#000000',
    'selection-bg': '#111111', 'selection-text': '#ffffff',
    accent: '#111111', fill: '#111111', 'fill-hover': '#333333', 'on-fill': '#ffffff', glow: '#111111',
    'headline-gradient': 'linear-gradient(#111111, #111111)',
    success: '#15803d', danger: '#b91c1c', 'danger-text': '#b91c1c', warn: '#7a4f00', 'home-warn': '#111111',
    'tag-bg': '#f1f1ee', 'tag-edge': '#d0d0ca', 'tag-text': '#111111',
    'tag-accent-bg': '#111111', 'tag-accent-edge': '#111111', 'tag-accent-text': '#ffffff',
    'tag-tint': '8%', 'tag-tint-edge': '35%',
    'font-sans': '"Inter", system-ui, sans-serif', 'font-display': '"Archivo Narrow", "Inter", system-ui, sans-serif',
    'font-mono': '"JetBrains Mono", ui-monospace, Menlo, monospace', 'font-label': '"Inter", system-ui, sans-serif',
    'label-weight': '600', 'label-tracking': '0.12em', 'body-size': '1rem', 'body-tracking': '0',
    'heading-tracking': '-0.015em', 'heading-shadow': 'none',
    'font-script': '"Archivo Narrow", sans-serif', 'script-size': '1em', 'script-weight': '600', 'script-style': 'italic', 'script-shadow': 'none',
    'radius-card': '14px', 'radius-action': '999px', 'radius-chip': '999px',
    'shadow-card': '0 1px 2px rgb(0 0 0 / 0.04), 0 10px 28px -18px rgb(0 0 0 / 0.18)',
    'shadow-nested': '0 1px 2px rgb(0 0 0 / 0.04), 0 10px 28px -18px rgb(0 0 0 / 0.18)',
    'nested-border-style': 'solid', 'shadow-action': 'none',
    'shadow-overlay': '0 12px 32px -16px rgb(0 0 0 / 0.25)', 'chrome-blur': 'blur(10px)',
    'illustration-filter': 'grayscale(1) invert(0.92) contrast(1.05)',
    'film-blend': 'normal', 'film-filter': 'none', 'film-opacity': '1',
    'color-scheme': 'light',
    'floor-color': '#f2f2ef',
    'floor-image': [
      'radial-gradient(ellipse 70% 60% at 50% 42%, #f2f2ef 30%, rgb(242 242 239 / 0.6) 55%, rgb(242 242 239 / 0) 85%)',
      'radial-gradient(rgb(17 17 17 / 0.16) 0.9px, transparent 1.3px)',
      'radial-gradient(rgb(17 17 17 / 0.08) 0.7px, transparent 1.1px)',
    ].join(', '),
    'floor-size': 'auto, 5px 5px, 9px 9px', 'floor-position': '0 0, 0 0, 2px 3px', 'floor-repeat': 'no-repeat, repeat, repeat',
  },
  antd: {
    base: '#f2f2ef', container: '#ffffff', elevated: '#ffffff', border: '#c9c9c3', borderSecondary: '#e2e2dd',
    textSecondary: '#3f3f3f', textTertiary: '#555555', textQuaternary: '#767676', fontFamily: '"Inter", system-ui, sans-serif', radius: 10,
    fillActive: '#000000', primaryShadow: 'none', defaultBg: '#ffffff', defaultBorder: '#c9c9c3',
    defaultHoverText: '#000000', defaultHoverBorder: '#111111', defaultHoverBg: '#ffffff', defaultActiveBorder: '#000000',
    tabSelected: '#111111', tabHover: '#000000', tabInk: '#111111',
    extra: {
      token: { colorBgLayout: '#f2f2ef', boxShadow: '0 12px 32px -16px rgb(0 0 0 / 0.25)', boxShadowSecondary: '0 12px 32px -16px rgb(0 0 0 / 0.25)' },
      components: {
        Segmented: { itemSelectedBg: '#111111', itemSelectedColor: '#ffffff', trackBg: '#e6e6e1' },
        Switch: { colorPrimary: '#111111', colorPrimaryHover: '#333333' },
        Table: { headerBg: '#f4f4f1', rowHoverBg: '#f7f7f4' },
        Progress: { defaultColor: '#111111' },
      },
    },
  },
  diagram: { dark: INK_DIAGRAM, light: INK_DIAGRAM },
  // The landing hero stays dark, so the film shows whole and in its own colours.
  css: heroDarkCss(MONO_HERO),
};
