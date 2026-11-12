import { useSyncExternalStore } from 'react';

// Which look the app wears. "frost" (frosted glass, ice-blue accents, Montserrat) is the look of the landing page and
// of the developer-analyst role's workspace; administrators and the other public pages keep the default look. The
// theme is a set of CSS variables (index.css, --at-*) plus the matching antd theme (App.tsx), switched by an attribute
// on <html>.

export type UiTheme = 'default' | 'frost';

/** Pages anyone can open signed out: they keep the default look even when the visitor happens to be signed in. */
const PUBLIC_PATHS = ['/login', '/register', '/verify-email', '/forgot-password', '/reset-password', '/invitations/accept', '/auth/github/callback'];

export function themeFor(role: string | undefined, pathname: string): UiTheme {
  const path = pathname.replace(/\/+$/, '') || '/';
  // The landing page wears the frost look for every visitor, signed in or not.
  if (path === '/') return 'frost';
  if (role !== 'developer-analyst') return 'default';
  return PUBLIC_PATHS.includes(path) ? 'default' : 'frost';
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
