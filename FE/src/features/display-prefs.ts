import { PANEL_KEY } from './architecture/panels';

// Display choices kept in this browser (the Settings page edits them; the sidebar and diagram read them). Storage can be
// missing or throw (private windows, blocked site data): reads then give the default and writes last for the page only.

export const SIDEBAR_COLLAPSED_KEY = 'archtime.sidebar.collapsed';
export const DIAGRAM_THEME_KEY = 'archtime.diagram.theme';
export type DiagramTheme = 'dark' | 'light';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* page only */ }
}

/** Sent on window when the sidebar choice changes, so a sidebar already on screen follows at once. */
export const SIDEBAR_EVENT = 'archtime:sidebar';
export const readSidebarCollapsed = (): boolean => read(SIDEBAR_COLLAPSED_KEY) === '1';
export function writeSidebarCollapsed(collapsed: boolean) {
  write(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<boolean>(SIDEBAR_EVENT, { detail: collapsed }));
}

/** How diagrams open; the diagram toolbar can still switch for the moment without changing this. */
export const readDiagramTheme = (): DiagramTheme => (read(DIAGRAM_THEME_KEY) === 'light' ? 'light' : 'dark');
export const writeDiagramTheme = (theme: DiagramTheme) => write(DIAGRAM_THEME_KEY, theme);

/** Forgets which side panels of the architecture workspace were closed, so they open as at first. */
export const resetDiagramPanels = () => write(PANEL_KEY, null);
