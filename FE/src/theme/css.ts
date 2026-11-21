// Writes the themes' tokens as CSS: the base theme's values on :root, every other theme's on html[data-theme="<id>"]
// (plus its floor and its signature CSS). The shared rules that read the tokens live in index.css.
import { BASE_THEME, THEMES } from './registry.ts';
import type { ThemeDefinition, TokenName } from './types.ts';

export const cssVar = (name: TokenName) => `--at-${name}`;

function declarations(theme: ThemeDefinition): string {
  return (Object.entries(theme.tokens) as [TokenName, string][]).map(([name, value]) => `  ${cssVar(name)}: ${value};`).join('\n');
}

const FLOOR = `  color-scheme: var(--at-color-scheme);
  background-color: var(--at-floor-color);
  background-image: var(--at-floor-image);
  background-size: var(--at-floor-size);
  background-position: var(--at-floor-position);
  background-repeat: var(--at-floor-repeat);
  background-attachment: fixed;`;

export const themeSelector = (id: string) => `html[data-theme="${id}"]`;

/** The CSS of one theme. */
export function themeCss(theme: ThemeDefinition): string {
  if (theme === BASE_THEME) return `:root {\n${declarations(theme)}\n}`;
  const root = themeSelector(theme.id);
  const selectors = [root, ...(theme.scopes ?? [])].join(', ');
  const extra = theme.css ? `\n${theme.css.trim().replaceAll(':scope', root)}` : '';
  return `${selectors} {\n${declarations(theme)}\n${FLOOR}\n}${extra}`;
}

/** The CSS of every registered theme. */
export function themesStylesheet(themes: readonly ThemeDefinition[] = THEMES): string {
  return themes.map(themeCss).join('\n\n');
}

/** Puts the themes' CSS in <head> once, before the first render. */
export function installThemeStyles() {
  if (typeof document === 'undefined' || document.getElementById('at-themes')) return;
  const style = document.createElement('style');
  style.id = 'at-themes';
  style.textContent = themesStylesheet();
  document.head.prepend(style);
}

const loadedFonts = new Set<string>();
/** Loads the Google Fonts a theme asks for, the first time it is worn. */
export function ensureThemeFonts(theme: ThemeDefinition) {
  if (!theme.fonts || loadedFonts.has(theme.fonts) || typeof document === 'undefined') return;
  loadedFonts.add(theme.fonts);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${theme.fonts}&display=swap`;
  document.head.append(link);
}
