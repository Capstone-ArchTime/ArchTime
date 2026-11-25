import type { ThemeDefinition } from '../types.ts';
import { EMBER_LIGHT_DIAGRAM, emberTheme } from './ember.ts';

/**
 * Ember light: the same study desk by day. Warm cream paper with a faint grid, off-white cards with a thin beige line
 * and a soft brown-tinted drop, charcoal ink, the same coral accent. Links and accent chips use deep coral ink so they
 * keep 7:1 on the paper; status colours are the deep shades.
 */
export const emberLightTheme: ThemeDefinition = {
  ...emberTheme,
  id: 'ember-light',
  label: { en: 'Ember light', vi: 'Ember sáng' },
  hint: { en: 'Warm paper with a coral accent', vi: 'Nền giấy kem, điểm nhấn san hô' },
  tokens: {
    ...emberTheme.tokens,
    page: 'transparent', sidebar: 'rgb(247 244 238 / 0.92)', chrome: 'rgb(247 244 238 / 0.88)',
    panel: '#fbf9f5', 'panel-2': '#f3efe8', solid: '#fbf9f5', hover: 'rgb(43 44 48 / 0.05)', grid: '#e1dbd2',
    line: '#dfdbd2', 'line-strong': '#b9b2a6', 'panel-edge': '#dfdbd2', 'overlay-edge': '#cfc9bf',
    text: '#2a2b2f', 'text-strong': '#141518', muted: '#434247', link: '#9c3420', 'link-hover': '#7c2717',
    'selection-bg': '#f7cec0', 'selection-text': '#2a2b2f',
    accent: '#e2705a', fill: '#c94d33', 'fill-hover': '#b8432b', 'on-fill': '#ffffff', glow: '#e2705a',
    'headline-gradient': 'linear-gradient(to right, #2a2b2f, #9c3420, #d6624b)',
    success: '#15803d', danger: '#b91c1c', 'danger-text': '#9b1c1c', warn: '#7a4f00', 'home-warn': '#c94d33',
    'tag-bg': '#efebe4', 'tag-edge': '#dfdbd2', 'tag-text': '#2a2b2f',
    'tag-accent-bg': '#fae0d6', 'tag-accent-edge': '#f3bcae', 'tag-accent-text': '#7c2717',
    'tag-tint': '9%', 'tag-tint-edge': '35%',
    'shadow-card': 'inset 0 1px 0 rgb(255 255 255 / 0.75), 0 1px 2px rgb(74 58 40 / 0.04), 0 6px 14px -8px rgb(74 58 40 / 0.12)',
    'shadow-nested': 'inset 0 1px 0 rgb(255 255 255 / 0.8), 0 1px 2px rgb(74 58 40 / 0.05)',
    'shadow-action': 'inset 0 1px 0 rgb(255 255 255 / 0.22), 0 1px 2px rgb(160 60 40 / 0.28), 0 4px 10px -4px rgb(212 95 72 / 0.45)',
    'shadow-overlay': 'inset 0 1px 0 rgb(255 255 255 / 0.75), 0 2px 4px rgb(74 58 40 / 0.06), 0 30px 60px -22px rgb(74 58 40 / 0.45)',
    // Pictures drawn for a dark page turn into warm light prints.
    'illustration-filter': 'invert(0.9) hue-rotate(180deg) sepia(0.15)',
    'film-blend': 'multiply', 'film-filter': 'saturate(0.55) contrast(1.1) brightness(1.15)', 'film-opacity': '0.3',
    'color-scheme': 'light',
    'floor-color': '#f7f4ee',
    'floor-image': [
      'radial-gradient(ellipse 80% 70% at 50% 40%, rgb(247 244 238 / 0) 0%, rgb(247 244 238 / 0.55) 60%, #f7f4ee 100%)',
      'linear-gradient(to right, rgb(210 202 189 / 0.22) 1px, transparent 1px)',
      'linear-gradient(to bottom, rgb(210 202 189 / 0.22) 1px, transparent 1px)',
    ].join(', '),
  },
  antd: {
    ...emberTheme.antd,
    base: '#f7f4ee', container: '#fbf9f5', elevated: '#ffffff', border: '#cfc9bf', borderSecondary: '#e7e3db',
    textSecondary: '#434247', textTertiary: '#5c5a56', textQuaternary: '#77746f',
    fillActive: '#a83b24', primaryShadow: '0 4px 10px -4px rgba(212, 95, 72, 0.45)',
    defaultBg: '#fbf9f5', defaultBorder: '#cfc9bf',
    defaultHoverText: '#141518', defaultHoverBorder: '#c94d33', defaultHoverBg: '#ffffff', defaultActiveBorder: '#b8432b',
    tabSelected: '#9c3420', tabHover: '#7c2717', tabInk: '#d6624b',
    extra: {
      token: { colorBgLayout: '#f7f4ee' },
      components: {
        Modal: { contentBg: '#fbf9f5', headerBg: '#fbf9f5', footerBg: '#fbf9f5' },
        Segmented: { itemSelectedBg: '#fae0d6', itemSelectedColor: '#7c2717', trackBg: '#ece7df' },
        Table: { headerBg: '#f3efe8', rowHoverBg: '#f7f4ee' },
        Progress: { defaultColor: '#d6624b' },
      },
    },
  },
  diagram: { dark: EMBER_LIGHT_DIAGRAM, light: EMBER_LIGHT_DIAGRAM },
};
