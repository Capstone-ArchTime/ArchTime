import { useSyncExternalStore } from 'react';

// Which look the app wears. "frost" (frosted glass, ice-blue accents, Montserrat) is the look of the public pages
// (landing page, sign-in, sign-up and their follow-ups) and of every signed-in role: the developer-analyst workspace
// and the system administrators' console. The default look is left for a guarded page before the session is known.
// The theme is a set of CSS variables (index.css, --at-*) plus the matching antd theme (App.tsx), switched by an
// attribute on <html>.

export type UiTheme = 'default' | 'frost';

/** Pages anyone can open signed out: they wear the frost look for every visitor, signed in or not. */
const PUBLIC_PATHS = ['/', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password', '/invitations/accept', '/auth/github/callback'];

export function themeFor(role: string | undefined, pathname: string): UiTheme {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (PUBLIC_PATHS.includes(path)) return 'frost';
  return role === 'developer-analyst' || role === 'system-administrator' ? 'frost' : 'default';
}

let current: UiTheme = 'default';
const listeners = new Set<() => void>();

/** Sets the theme on <html> (for the CSS variables) and tells the antd theme to follow. */
export function setUiTheme(next: UiTheme) {
  if (typeof document !== 'undefined') {
    if (next === 'default') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  }
  if (next === current) return;
  current = next;
  listeners.forEach(listener => listener());
}

export function useUiTheme(): UiTheme {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current, () => 'default');
}
