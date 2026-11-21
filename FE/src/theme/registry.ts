// Every theme the app knows. To add one: write src/theme/themes/<id>.ts (copy the closest theme and change its tokens),
// then list it here. Nothing else needs to change: the CSS variables, the antd theme, the diagram colours and the theme
// picker all come from this list.
import type { ThemeDefinition } from './types.ts';
import { consoleTheme } from './themes/console.ts';
import { frostTheme } from './themes/frost.ts';
import { inkTheme } from './themes/ink.ts';

/** The look of every :root variable; worn by a guarded page before the session is known. */
export const BASE_THEME = consoleTheme;
/** The look people get until they pick another. */
export const DEFAULT_CHOICE = frostTheme.id;

export const THEMES: readonly ThemeDefinition[] = [consoleTheme, frostTheme, inkTheme];

/** The themes offered in the picker, in order. */
export const SELECTABLE_THEMES = THEMES.filter(theme => theme.selectable);

export function getTheme(id: string | undefined): ThemeDefinition {
  return THEMES.find(theme => theme.id === id) ?? BASE_THEME;
}
