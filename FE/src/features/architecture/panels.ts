// Which parts of the Architecture Map workspace are on screen: the two side panels, the in-page "full screen" (focus)
// mode and the browser's own full screen. Pure, so the rules can be tested without a browser.

/** Below this width a side panel would squeeze the artboard, so it becomes a drawer over it, closed by default. */
export const DRAWER_BELOW = 1100;
/**
 * From this width both panels start open. Below it (down to DRAWER_BELOW) only the right panel (issues, overview and
 * properties) starts open: with both open at 1500px the two panels take a third of the screen, and the layers list is the
 * one people can do without (find is on the toolbar, selecting a box works on the canvas).
 */
export const BOTH_OPEN_FROM = 1600;

export type PanelLayout = 'drawer' | 'compact' | 'roomy';
export type Side = 'left' | 'right';
/** A person's choice per side; a side that is absent follows the layout's default. */
export interface PanelChoice { left?: boolean; right?: boolean }
export interface PanelInput {
  width: number;
  /** In-page full screen: the artboard and its toolbar only. */
  focus: boolean;
  /** Remembered between visits; only changed while the panels sit beside the artboard. */
  saved: PanelChoice;
  /** Panels opened over the artboard (narrow screens, full screen); never remembered. */
  drawers: PanelChoice;
}
export interface PanelView {
  layout: PanelLayout;
  left: boolean;
  right: boolean;
  /** Panels are drawn over the artboard instead of beside it. */
  overlay: boolean;
}

export const panelLayout = (width: number): PanelLayout => (width < DRAWER_BELOW ? 'drawer' : width < BOTH_OPEN_FROM ? 'compact' : 'roomy');

export function resolvePanels({ width, focus, saved, drawers }: PanelInput): PanelView {
  const layout = panelLayout(width);
  if (focus || layout === 'drawer') return { layout, overlay: true, left: drawers.left === true, right: drawers.right === true };
  return { layout, overlay: false, left: saved.left ?? layout === 'roomy', right: saved.right ?? true };
}

/** Opens or closes one panel. Over the artboard only one drawer is open at a time; beside it the choice is remembered. */
export function setPanel(input: PanelInput, side: Side, open: boolean): Pick<PanelInput, 'saved' | 'drawers'> {
  if (resolvePanels(input).overlay) return { saved: input.saved, drawers: open ? { [side]: true } : { ...input.drawers, [side]: false } };
  return { saved: { ...input.saved, [side]: open }, drawers: input.drawers };
}

/** Ctrl + \ : hides whatever is open, or shows the panels when none is. Over the artboard that is just the right one. */
export function togglePanels(input: PanelInput): Pick<PanelInput, 'saved' | 'drawers'> {
  const now = resolvePanels(input);
  const show = !(now.left || now.right);
  if (now.overlay) return { saved: input.saved, drawers: show ? { right: true } : {} };
  return { saved: { left: show, right: show }, drawers: input.drawers };
}

// ---- remembered choice ----

export const PANEL_KEY = 'archtime.architecture.panels';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** localStorage can be missing or throw (private windows, blocked site data); the page must work without it. */
function browserStorage(): Store | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

export function parsePanelChoice(raw: string | null | undefined): PanelChoice {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const { left, right } = value as Record<string, unknown>;
    return { ...(typeof left === 'boolean' ? { left } : {}), ...(typeof right === 'boolean' ? { right } : {}) };
  } catch { return {}; }
}

export function loadPanelChoice(storage: Store | null = browserStorage()): PanelChoice {
  try { return parsePanelChoice(storage?.getItem(PANEL_KEY)); } catch { return {}; }
}

/** Returns whether it was stored; the caller does not need to care. */
export function savePanelChoice(choice: PanelChoice, storage: Store | null = browserStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(PANEL_KEY, JSON.stringify({ ...(choice.left === undefined ? {} : { left: choice.left }), ...(choice.right === undefined ? {} : { right: choice.right }) }));
    return true;
  } catch { return false; }
}

// ---- full screen ----

export interface FocusSync { focus: boolean; /** The in-page mode was entered together with the browser's full screen. */ withBrowser: boolean }

/**
 * Keeps the in-page mode and the browser's full screen in step: entering browser full screen turns the mode on, and
 * leaving it (Esc) turns it off again, but only when the browser's full screen was part of it. The mode started without
 * the browser's (refused or unsupported) stays on until the person leaves it.
 */
export function syncFullscreen(state: FocusSync, browserFullscreen: boolean): FocusSync {
  if (browserFullscreen) return { focus: true, withBrowser: true };
  if (state.withBrowser) return { focus: false, withBrowser: false };
  return state;
}

// ---- keys ----

export interface KeyLike { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }
const plain = (e: KeyLike) => !e.ctrlKey && !e.metaKey && !e.altKey;
/** Shift + F: full screen. (Plain F zooms to the selection, in the diagram.) */
export const isFocusKey = (e: KeyLike) => plain(e) && e.shiftKey === true && e.key.toLowerCase() === 'f';
export const isFrameKey = (e: KeyLike) => plain(e) && !e.shiftKey && e.key.toLowerCase() === 'f';

/** Menus, pickers and dialogs that close themselves on Esc; the press belongs to them, not to the viewer. */
export const OPEN_LAYER_SELECTOR = '.ant-dropdown, .ant-select-dropdown, .ant-popover, .ant-modal-wrap';
interface Rendered { getClientRects(): { length: number } }
/** True when Esc should be left alone: someone already handled it, or one of the layers above is on screen (hidden ones stay in the DOM with no box). */
export function escapeTaken(event: { defaultPrevented: boolean }, doc: { querySelectorAll(selector: string): Iterable<Rendered> }): boolean {
  if (event.defaultPrevented) return true;
  for (const el of doc.querySelectorAll(OPEN_LAYER_SELECTOR)) if (el.getClientRects().length > 0) return true;
  return false;
}

export type EscapeAction ='clear-selection' | 'close-detail' | 'exit-focus' | 'none';
/** What Esc does, one layer per press: the selection first, then the inner view, then full screen. */
export function escapeAction(s: { selection: boolean; detail: boolean; focus: boolean }): EscapeAction {
  if (s.selection) return 'clear-selection';
  if (s.detail) return 'close-detail';
  return s.focus ? 'exit-focus' : 'none';
}
