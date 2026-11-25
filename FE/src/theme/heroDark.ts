/**
 * The landing hero of a light theme, dark like the dark themes, so the film shows whole and in its own colours. A light
 * theme puts this in its `css`: inside `.at-hero` (the hero and the top bar while it floats over it) the variables turn
 * to light text on a dark stage. `--at-hero-floor` paints the stage; the page below keeps the theme's own floor.
 */
export interface HeroDark {
  floor: string;
  text: string;
  strong: string;
  muted: string;
  link: string;
  linkHover: string;
  fill: string;
  fillHover: string;
  onFill: string;
  accent: string;
  headline: string;
  /** The landing highlight (--at-warn on the landing page). */
  highlight: string;
}

export function heroDarkCss(h: HeroDark): string {
  return `:scope .at-hero {
  color-scheme: dark;
  --at-hero-floor: ${h.floor};
  --at-text: ${h.text}; --at-text-strong: ${h.strong}; --at-muted: ${h.muted};
  --at-link: ${h.link}; --at-link-hover: ${h.linkHover};
  --at-line: rgb(255 255 255 / 0.16); --at-line-strong: rgb(255 255 255 / 0.32);
  --at-panel: rgb(255 255 255 / 0.07); --at-panel-2: rgb(255 255 255 / 0.11); --at-hover: rgb(255 255 255 / 0.08);
  --at-solid: #18181b; --at-overlay-edge: rgb(255 255 255 / 0.14); --at-chrome: rgb(11 11 13 / 0.6);
  --at-fill: ${h.fill}; --at-fill-hover: ${h.fillHover}; --at-on-fill: ${h.onFill};
  --at-accent: ${h.accent}; --at-glow: ${h.accent};
  --at-headline-gradient: ${h.headline};
  --at-warn: ${h.highlight};
}`;
}

/** Black and white: white words and a white main action on the dark stage (Pure white, Halftone ink). */
export const MONO_HERO: HeroDark = {
  floor: '#0b0b0d', text: '#f4f4f5', strong: '#ffffff', muted: '#d4d4d8', link: '#ffffff', linkHover: '#e4e4e7',
  fill: '#ffffff', fillHover: '#e4e4e7', onFill: '#09090b', accent: '#ffffff',
  headline: 'linear-gradient(#ffffff, #ffffff)', highlight: '#ffffff',
};
