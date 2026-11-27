import { useSyncExternalStore } from 'react';
import { BASE_THEME, DEFAULT_CHOICE, SELECTABLE_THEMES, getTheme } from '../theme/registry.ts';
import { ensureThemeFonts } from '../theme/css.ts';
import type { ThemeDefinition } from '../theme/types.ts';

// Which look the app wears. People pick one per browser with the theme button (components/ThemeSwitch.tsx, the selectable themes of
// src/theme/registry.ts); it applies to the public pages (landing page, sign-in, sign-up and their follow-ups) and to
// every signed-in role. The base theme is left for a guarded page before the session is known. Wearing a theme sets
// data-theme on <html> (the CSS variables, src/theme/css.ts) and the matching antd theme (App.tsx).

/** A theme id from the registry. */
export type UiTheme = string;

/** Pages anyone can open signed out: they wear the chosen look for every visitor, signed in or not. */
const PUBLIC_PATHS = ['/', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password', '/invitations/accept', '/auth/github/callback'];

export function themeFor(role: string | undefined, pathname: string, choice: string = DEFAULT_CHOICE): UiTheme {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (PUBLIC_PATHS.includes(path)) return choice;
  return role === 'developer-analyst' || role === 'system-administrator' ? choice : BASE_THEME.id;
}

const CHOICE_KEY = 'archtime.theme';
/** A stored choice, or the default when it names no selectable theme. */
export function parseThemeChoice(value: unknown): string {
  return SELECTABLE_THEMES.some(theme => theme.id === value) ? (value as string) : DEFAULT_CHOICE;
}
function readChoice(): string {
  try { return parseThemeChoice(globalThis.localStorage?.getItem(CHOICE_KEY)); } catch { return DEFAULT_CHOICE; }
}

let current: UiTheme = BASE_THEME.id;
let choice = readChoice();
const listeners = new Set<() => void>();
const choiceListeners = new Set<() => void>();
const subscribe = (set: Set<() => void>) => (listener: () => void) => { set.add(listener); return () => { set.delete(listener); }; };

/** Wears a theme: data-theme on <html> (none for the base theme), its fonts, and tells the antd theme to follow. */
export function setUiTheme(next: UiTheme) {
  if (typeof document !== 'undefined') {
    if (next === BASE_THEME.id) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  }
  ensureThemeFonts(getTheme(next));
  if (next === current) return;
  current = next;
  listeners.forEach(listener => listener());
}

export function useUiTheme(): UiTheme {
  return useSyncExternalStore(subscribe(listeners), () => current, () => BASE_THEME.id);
}

/** The definition of the theme being worn (tokens, antd seeds, diagram palettes, effects). */
export function useThemeDefinition(): ThemeDefinition {
  return getTheme(useUiTheme());
}

/** Remembers the look picked in this browser; pages switch to it at once. */
export function setThemeChoice(next: string) {
  const valid = parseThemeChoice(next);
  try { globalThis.localStorage?.setItem(CHOICE_KEY, valid); } catch { /* storage blocked: the choice lasts until reload */ }
  if (valid === choice) return;
  choice = valid;
  choiceListeners.forEach(listener => listener());
}

export function useThemeChoice(): string {
  return useSyncExternalStore(subscribe(choiceListeners), () => choice, () => DEFAULT_CHOICE);
}
