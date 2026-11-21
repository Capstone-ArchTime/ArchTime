import { DIAGRAM_MONO, LIGHT } from '../../features/architecture/theme.ts';
import type { DiagramTheme } from '../../features/architecture/theme.ts';
import type { ThemeDefinition } from '../types.ts';

/** A four-point star for the floor, as a data URI. */
const star = (opacity: number) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z' fill='%23f2f6ff' fill-opacity='${opacity}'/%3E%3C/svg%3E")`;

/** The dark diagram inside frost: misty slate, light edges, softer role colours. */
const FROST_DIAGRAM: DiagramTheme = {
  name: 'dark', background: '#1d242a', grid: '#323c45', card: '#273038', cardStroke: '#5a6773', text: '#eef2f8', muted: '#b4c0ce', edge: '#8a9aac', edgeDim: '#38424c',
  cycle: '#f87171', route: '#f0c27e', focus: '#e4eaf5', badgeFill: '#2f3943',
  role: { controller: '#9db3dc', service: '#bca9f2', repository: '#7fd8b6', entity: '#f0cf7a', gateway: '#f39aac', config: '#b4c0ce', util: '#a9c6ee', external: '#f2b083', other: '#8f9cab' },
  tag: { FACT: '#86efac', INFERENCE: '#f0c27e', UNKNOWN: '#b4c0ce' }, sans: '"Montserrat", system-ui, sans-serif', mono: DIAGRAM_MONO,
};

/**
 * Frost (DESIGN.md, "The Frosted Observatory"): a misty slate floor with a few sparkles, frosted-glass panels with a
 * thin light edge and a soft glow, ice-blue text, pearl pill buttons with dark text, Montserrat. Panels are translucent
 * so the floor shows through; every text colour keeps at least 7:1 against the panels.
 */
export const frostTheme: ThemeDefinition = {
  id: 'frost',
  label: { en: 'Frost', vi: 'Frost' },
  hint: { en: 'Dark frosted glass', vi: 'Kính mờ tông tối' },
  selectable: true,
  // The 404 page wears frost whatever the chosen look.
  scopes: ['.at-frost-scope'],
  tokens: {
    page: 'rgb(14 19 24 / 0.5)', sidebar: 'rgb(12 17 22 / 0.6)', chrome: 'rgb(14 19 24 / 0.78)',
    panel: 'rgb(214 225 240 / 0.07)', 'panel-2': 'rgb(214 225 240 / 0.11)', solid: '#222a32',
    hover: 'rgb(255 255 255 / 0.08)', grid: '#323c45',
    line: 'rgb(220 230 245 / 0.17)', 'line-strong': 'rgb(225 234 248 / 0.42)', 'panel-edge': 'rgb(225 234 248 / 0.26)', 'overlay-edge': 'rgb(225 234 248 / 0.22)',
    text: '#eef2f8', 'text-strong': '#ffffff', muted: '#b4c0ce', link: '#d3def3', 'link-hover': '#ffffff',
    'selection-bg': 'rgb(212 224 245 / 0.35)', 'selection-text': '#ffffff',
    accent: '#9db3dc', fill: '#e4eaf5', 'fill-hover': '#ffffff', 'on-fill': '#18212c', glow: '#eaf1ff',
    'headline-gradient': 'linear-gradient(to right, #ffffff, #d3def3, #9db3dc)',
    success: '#4ade80', danger: '#f87171', 'danger-text': '#fca5a5', warn: '#f0c27e', 'home-warn': '#c9d7f2',
    'tag-bg': 'rgb(214 225 240 / 0.08)', 'tag-edge': 'rgb(220 230 245 / 0.22)', 'tag-text': '#eef2f8',
    'tag-accent-bg': 'rgb(157 179 220 / 0.14)', 'tag-accent-edge': 'rgb(157 179 220 / 0.4)', 'tag-accent-text': '#d3def3',
    'tag-tint': '12%', 'tag-tint-edge': '40%',
    'font-sans': '"Montserrat", system-ui, sans-serif', 'font-display': '"Montserrat", system-ui, sans-serif',
    'font-mono': '"JetBrains Mono", ui-monospace, Menlo, monospace', 'font-label': '"Montserrat", system-ui, sans-serif',
    'label-weight': '600', 'label-tracking': '0.14em', 'body-size': '1rem', 'body-tracking': '0.005em',
    'heading-tracking': '-0.01em', 'heading-shadow': '0 0 22px rgb(220 232 255 / 0.22)',
    'font-script': '"Great Vibes", cursive', 'script-size': '1.35em', 'script-weight': '400', 'script-style': 'normal', 'script-shadow': '0 0 18px rgb(230 238 255 / 0.45)',
    'radius-card': '14px', 'radius-action': '999px', 'radius-chip': '999px',
    'shadow-card': 'inset 0 1px 0 rgb(255 255 255 / 0.07), 0 12px 32px -14px rgb(0 0 0 / 0.5), 0 0 24px -10px rgb(205 222 255 / 0.22)',
    'shadow-nested': 'inset 0 1px 0 rgb(255 255 255 / 0.07), 0 12px 32px -14px rgb(0 0 0 / 0.5), 0 0 24px -10px rgb(205 222 255 / 0.22)',
    'nested-border-style': 'solid',
    'shadow-action': '0 0 16px rgb(214 228 255 / 0.32), inset 0 -1px 0 rgb(24 33 44 / 0.12)',
    'shadow-overlay': '0 0 28px -8px rgb(205 222 255 / 0.25), 0 20px 50px -20px rgb(0 0 0 / 0.6)',
    'chrome-blur': 'blur(14px)',
    'illustration-filter': 'none', 'film-blend': 'screen', 'film-filter': 'none', 'film-opacity': '0.4',
    'color-scheme': 'dark',
    'floor-color': '#1b2228',
    'floor-image': [
      star(0.55), star(0.35), star(0.3),
      'linear-gradient(to bottom, rgb(240 245 255 / 0.28), rgb(240 245 255 / 0))',
      'linear-gradient(to bottom, rgb(240 245 255 / 0.22), rgb(240 245 255 / 0))',
      'radial-gradient(900px 520px at 12% 8%, rgb(120 140 160 / 0.32), transparent 65%)',
      'radial-gradient(760px 480px at 88% 22%, rgb(96 118 140 / 0.3), transparent 62%)',
      'radial-gradient(1000px 640px at 70% 100%, rgb(70 92 112 / 0.38), transparent 60%)',
      'linear-gradient(160deg, #2a3138 0%, #1b2228 45%, #151b21 100%)',
    ].join(', '),
    'floor-size': '22px 22px, 14px 14px, 16px 16px, 1px 160px, 1px 110px, auto, auto, auto, auto',
    'floor-position': 'right 7% top 34%, right 15% bottom 26%, left 3% bottom 14%, right 4% top 0, right 6.5% top 0, 0 0, 0 0, 0 0, 0 0',
    'floor-repeat': 'no-repeat',
  },
  antd: {
    base: '#161c22', container: '#222a32', elevated: '#27303a', border: '#4a5662', borderSecondary: '#38424d',
    textSecondary: '#c3cdd9', textTertiary: '#a9b5c3', fontFamily: '"Montserrat", system-ui, sans-serif', radius: 10,
    fillActive: '#cdd8ea', primaryShadow: '0 0 14px rgba(214, 228, 255, 0.35)',
    defaultBg: 'rgba(214, 225, 240, 0.06)', defaultBorder: 'rgba(220, 230, 245, 0.32)',
    defaultHoverText: '#ffffff', defaultHoverBorder: '#d3def3', defaultHoverBg: 'rgba(214, 225, 240, 0.12)', defaultActiveBorder: '#e4eaf5',
    tabSelected: '#ffffff', tabHover: '#e4eaf5', tabInk: '#d3def3',
    extra: { components: { Modal: { contentBg: '#222a32', headerBg: '#222a32', footerBg: '#222a32' } } },
  },
  diagram: { dark: FROST_DIAGRAM, light: LIGHT },
};
