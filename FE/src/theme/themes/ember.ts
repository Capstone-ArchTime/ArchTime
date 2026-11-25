import { DIAGRAM_MONO } from '../../features/architecture/theme.ts';
import type { DiagramTheme } from '../../features/architecture/theme.ts';
import type { ThemeDefinition } from '../types.ts';

const SANS = '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Charcoal stage, raised slate cards, coral for what is selected or in focus, warm off-white text. */
const EMBER_DIAGRAM: DiagramTheme = {
  name: 'dark', background: '#141518', grid: '#26282d', card: '#1f2125', cardStroke: '#383b42', text: '#f2f0eb', muted: '#c8c5bf', edge: '#7c7e87', edgeDim: '#2e3036',
  cycle: '#f07a5f', route: '#e6c477', focus: '#e8694e', badgeFill: '#24262b',
  role: { controller: '#f08a6d', service: '#b9a7e8', repository: '#93cfc6', entity: '#e6c477', gateway: '#f39aac', config: '#c8c5bf', util: '#9fbde6', external: '#f2b083', other: '#908d87' },
  tag: { FACT: '#86d9a6', INFERENCE: '#e6c477', UNKNOWN: '#c8c5bf' }, sans: SANS, mono: DIAGRAM_MONO,
};

/** The same drawing on warm paper, for the viewer's light mode. */
export const EMBER_LIGHT_DIAGRAM: DiagramTheme = {
  name: 'light', background: '#f9f7f2', grid: '#e1dbd2', card: '#ffffff', cardStroke: '#cfc9bf', text: '#2a2b2f', muted: '#434247', edge: '#77746f', edgeDim: '#e7e3db',
  cycle: '#b8432b', route: '#8a6100', focus: '#c94d33', badgeFill: '#e9e3da',
  role: { controller: '#b8432b', service: '#5b4b8a', repository: '#2f6b62', entity: '#7a5a12', gateway: '#8a3346', config: '#555555', util: '#3a5f85', external: '#8a4b20', other: '#666666' },
  tag: { FACT: '#15803d', INFERENCE: '#7a4f00', UNKNOWN: '#555555' }, sans: SANS, mono: DIAGRAM_MONO,
};

/**
 * Ember: a dark study desk. A near-black page, flat charcoal cards with a thin line and a soft drop, Inter with heavy
 * headings, compact 8px controls and one warm coral for the main action, the current page and focus. Status colours are
 * the soft shades that keep 7:1 on the cards; the coral fill is deepened so white text on it keeps 4.5:1.
 */
export const emberTheme: ThemeDefinition = {
  id: 'ember',
  label: { en: 'Ember', vi: 'Ember' },
  hint: { en: 'Charcoal with a coral accent', vi: 'Nền than, điểm nhấn san hô' },
  selectable: true,
  tokens: {
    page: 'transparent', sidebar: '#0f1012', chrome: 'rgb(11 12 14 / 0.86)',
    panel: '#141518', 'panel-2': '#1a1b1f', solid: '#1a1b1f', hover: 'rgb(255 255 255 / 0.06)', grid: '#26282d',
    line: '#26282d', 'line-strong': '#4a4d55', 'panel-edge': '#26282d', 'overlay-edge': '#383b42',
    text: '#f2f0eb', 'text-strong': '#ffffff', muted: '#c8c5bf', link: '#f6ab98', 'link-hover': '#fcd2c6',
    'selection-bg': 'rgb(232 105 78 / 0.35)', 'selection-text': '#ffffff',
    accent: '#e8694e', fill: '#c94d33', 'fill-hover': '#b8432b', 'on-fill': '#ffffff', glow: '#e8694e',
    'headline-gradient': 'linear-gradient(to right, #f2f0eb, #f6ab98, #e8694e)',
    success: '#86d9a6', danger: '#f58b7a', 'danger-text': '#f8b1a6', warn: '#e6c477', 'home-warn': '#e8694e',
    'tag-bg': '#24262b', 'tag-edge': '#383b42', 'tag-text': '#f2f0eb',
    'tag-accent-bg': '#4c2219', 'tag-accent-edge': '#94402e', 'tag-accent-text': '#f6ab98',
    'tag-tint': '14%', 'tag-tint-edge': '40%',
    'font-sans': SANS, 'font-display': SANS, 'font-mono': MONO, 'font-label': SANS,
    'label-weight': '600', 'label-tracking': '0.1em', 'body-size': '15px', 'body-tracking': '0',
    'heading-tracking': '-0.02em', 'heading-shadow': 'none',
    'font-script': SANS, 'script-size': '1em', 'script-weight': '800', 'script-style': 'normal', 'script-shadow': 'none',
    'radius-card': '14px', 'radius-action': '8px', 'radius-chip': '7px',
    'shadow-card': 'inset 0 1px 0 rgb(255 255 255 / 0.035), 0 10px 24px -14px rgb(0 0 0 / 0.7)',
    'shadow-nested': 'inset 0 1px 0 rgb(255 255 255 / 0.05), 0 1px 2px rgb(0 0 0 / 0.4)',
    'nested-border-style': 'solid',
    'shadow-action': 'inset 0 1px 0 rgb(255 255 255 / 0.18), 0 1px 2px rgb(0 0 0 / 0.5), 0 6px 16px -6px rgb(232 105 78 / 0.5)',
    'shadow-overlay': 'inset 0 1px 0 rgb(255 255 255 / 0.05), 0 0 0 1px rgb(0 0 0 / 0.5), 0 30px 70px -20px rgb(0 0 0 / 0.85)',
    'chrome-blur': 'blur(10px)',
    'illustration-filter': 'none', 'film-blend': 'screen', 'film-filter': 'saturate(0.8)', 'film-opacity': '0.35',
    'color-scheme': 'dark',
    'floor-color': '#0b0c0e',
    // A faint square grid, like a drafting stage, fading out under the content.
    'floor-image': [
      'radial-gradient(ellipse 80% 70% at 50% 40%, rgb(11 12 14 / 0) 0%, rgb(11 12 14 / 0.6) 60%, #0b0c0e 100%)',
      'linear-gradient(to right, rgb(255 255 255 / 0.028) 1px, transparent 1px)',
      'linear-gradient(to bottom, rgb(255 255 255 / 0.028) 1px, transparent 1px)',
    ].join(', '),
    'floor-size': 'auto, 32px 32px, 32px 32px', 'floor-position': '0 0, 0 0, 0 0', 'floor-repeat': 'no-repeat, repeat, repeat',
  },
  antd: {
    base: '#0b0c0e', container: '#141518', elevated: '#1a1b1f', border: '#383b42', borderSecondary: '#26282d',
    textSecondary: '#c8c5bf', textTertiary: '#a9a6a0', fontFamily: SANS, radius: 8,
    fillActive: '#a83b24', primaryShadow: '0 6px 16px -6px rgba(232, 105, 78, 0.5)',
    defaultBg: '#1a1b1f', defaultBorder: '#383b42',
    defaultHoverText: '#ffffff', defaultHoverBorder: '#e8694e', defaultHoverBg: '#24262b', defaultActiveBorder: '#f07a5f',
    tabSelected: '#f6ab98', tabHover: '#fcd2c6', tabInk: '#e8694e',
    extra: {
      components: {
        Modal: { contentBg: '#1a1b1f', headerBg: '#1a1b1f', footerBg: '#1a1b1f' },
        Segmented: { itemSelectedBg: '#4c2219', itemSelectedColor: '#f6ab98', trackBg: '#141518' },
        Table: { headerBg: '#1a1b1f', rowHoverBg: '#1f2125' },
        Progress: { defaultColor: '#e8694e' },
      },
    },
  },
  diagram: { dark: EMBER_DIAGRAM, light: EMBER_LIGHT_DIAGRAM },
};
