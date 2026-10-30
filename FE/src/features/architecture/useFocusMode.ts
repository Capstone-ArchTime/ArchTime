import { useCallback, useEffect, useRef, useState } from 'react';
import { syncFullscreen } from './panels';
import type { FocusSync } from './panels';

/**
 * Full screen for the Architecture Map. The in-page mode (no header, no side panels) always works; the browser's own full
 * screen is requested on top of it as an enhancement, and silently skipped when it is missing or refused. Leaving the
 * browser's full screen with Esc leaves the mode too (see syncFullscreen).
 */
export function useFocusMode() {
  const [focus, setFocus] = useState(false);
  const state = useRef<FocusSync>({ focus: false, withBrowser: false });
  const apply = useCallback((next: FocusSync) => { state.current = next; setFocus(next.focus); }, []);

  useEffect(() => {
    const onChange = () => apply(syncFullscreen(state.current, document.fullscreenElement === document.documentElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      // Leaving the page must not leave the browser stuck in full screen.
      if (document.fullscreenElement === document.documentElement) void document.exitFullscreen().catch(() => { /* already out */ });
    };
  }, [apply]);

  const set = useCallback((on: boolean) => {
    apply({ focus: on, withBrowser: on && state.current.withBrowser });
    const root = document.documentElement;
    if (on) {
      if (typeof root.requestFullscreen !== 'function') return; // unsupported: the in-page mode is enough
      // Refused (no user gesture, embedded frame) or throwing on an old engine: stay in the in-page mode.
      try { void Promise.resolve(root.requestFullscreen()).catch(() => { /* in-page mode only */ }); } catch { /* in-page mode only */ }
    } else if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => { /* already out */ });
    }
  }, [apply]);

  return { focus, set };
}
