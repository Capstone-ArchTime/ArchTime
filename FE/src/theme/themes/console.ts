import { DARK, LIGHT } from '../../features/architecture/theme.ts';
import type { ThemeDefinition } from '../types.ts';

/**
 * The plain console look: flat near-black, blue accents. It is the :root default of every variable, worn only by a
 * guarded page before the session is known, and not offered in the picker. Its shape tokens are flat because the
 * shared theme rules apply only under html[data-theme], which this look never sets.
 */
export const consoleTheme: ThemeDefinition = {
  id: 'console',
  label: { en: 'Console', vi: 'Console' },
  hint: { en: 'Flat dark', vi: 'Tối, phẳng' },
  selectable: false,
  tokens: {
    page: '#080b0e', sidebar: '#0c1015', chrome: '#0d1116', panel: '#11161b', 'panel-2': '#161d24', solid: '#11161b',
    hover: 'rgb(255 255 255 / 0.08)', grid: '#1c2530',
    line: '#242527', 'line-strong': '#5f636b', 'panel-edge': '#242527', 'overlay-edge': '#242527',
    text: '#f4f4f6', 'text-strong': '#ffffff', muted: '#94a3b8', link: '#93c5fd', 'link-hover': '#bfdbfe',
    'selection-bg': 'rgb(59 130 246 / 0.4)', 'selection-text': '#ffffff',
    accent: '#3b82f6', fill: '#1d4ed8', 'fill-hover': '#1e40af', 'on-fill': '#ffffff', glow: '#00f0ff',
    'headline-gradient': 'linear-gradient(to right, #ffffff, #bfdbfe, #93c5fd)',
    success: '#4ade80', danger: '#f87171', 'danger-text': '#fca5a5', warn: '#ffb03a', 'home-warn': '#ffb03a',
    'tag-bg': 'rgb(255 255 255 / 0.06)', 'tag-edge': '#242527', 'tag-text': '#f4f4f6',
    'tag-accent-bg': 'rgb(59 130 246 / 0.15)', 'tag-accent-edge': 'rgb(59 130 246 / 0.4)', 'tag-accent-text': '#93c5fd',
    'tag-tint': '12%', 'tag-tint-edge': '40%',
    'font-sans': '"Inter", system-ui, sans-serif', 'font-display': '"Inter", system-ui, sans-serif',
    'font-mono': '"JetBrains Mono", ui-monospace, Menlo, monospace', 'font-label': '"JetBrains Mono", ui-monospace, monospace',
    'label-weight': '500', 'label-tracking': '0.1em', 'body-size': '1rem', 'body-tracking': '0', 'heading-tracking': '-0.01em', 'heading-shadow': 'none',
    'font-script': '"Inter", system-ui, sans-serif', 'script-size': '1em', 'script-weight': '600', 'script-style': 'italic', 'script-shadow': 'none',
    'radius-card': '0', 'radius-action': '0', 'radius-chip': '4px',
    'shadow-card': 'none', 'shadow-nested': 'none', 'nested-border-style': 'solid', 'shadow-action': 'none',
    'shadow-overlay': '0 20px 50px -20px rgb(0 0 0 / 0.6)', 'chrome-blur': 'none',
    'illustration-filter': 'none', 'film-blend': 'screen', 'film-filter': 'none', 'film-opacity': '0.4',
    'color-scheme': 'dark', 'floor-color': '#080b0e', 'floor-image': 'none', 'floor-size': 'auto', 'floor-position': '0 0', 'floor-repeat': 'no-repeat',
  },
  antd: {
    base: '#080b0e', fontFamily: '"Space Grotesk", sans-serif', radius: 6, fillActive: '#1e3a8a',
    defaultHoverText: '#93c5fd', defaultHoverBorder: '#60a5fa', defaultActiveBorder: '#3b82f6',
    tabSelected: '#93c5fd', tabHover: '#bfdbfe', tabInk: '#60a5fa',
  },
  diagram: { dark: DARK, light: LIGHT },
};
