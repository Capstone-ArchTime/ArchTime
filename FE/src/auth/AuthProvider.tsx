import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from './auth-context';
import type { AuthUser } from './permissions';
import { clearTokens, readTokens, saveTokens, tokenStorage, InvalidSessionError, verifySession } from './session';
import type { Tokens } from './session';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const active = useRef<AbortController | null>(null);
  const signingIn = useRef(false);

  function signOut() {
    active.current?.abort();
    try { clearTokens(); } finally { setUser(null); setError(null); setLoading(false); }
  }
  async function signIn(tokens: Tokens, rememberMe = false) {
    signingIn.current = true;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    try {
      const verified = await verifySession(tokens, controller.signal);
      controller.signal.throwIfAborted();
      try {
        saveTokens({ ...tokens, accessToken: verified.accessToken }, rememberMe);
      } catch { clearTokens(); throw new Error('Browser storage is unavailable. Enable it to sign in.'); }
      setUser(verified.user); setError(null); setLoading(false);
      return verified.user;
    } finally { if (active.current === controller) signingIn.current = false; }
  }

  useEffect(() => {
    let running: AbortController | null = null;
    let disposed = false;
    async function restore() {
      if ((running && !running.signal.aborted) || disposed || signingIn.current) return;
      const controller = new AbortController();
      running = controller;
      active.current?.abort(); active.current = controller;
      try {
        const { accessToken, refreshToken } = readTokens();
        if (!accessToken && !refreshToken) { setUser(null); setError(null); return; }
        const verified = await verifySession({ accessToken: accessToken ?? '', refreshToken }, controller.signal);
        controller.signal.throwIfAborted();
        tokenStorage().setItem('accessToken', verified.accessToken);
        setUser(verified.user); setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setUser(null);
        if (cause instanceof InvalidSessionError) { clearTokens(); setError(null); }
        else setError(cause instanceof Error ? cause.message : 'Unable to verify your session.');
      } finally {
        if (running === controller) running = null;
        if (!disposed && !controller.signal.aborted) setLoading(false);
      }
    }
    void restore();
    const interval = window.setInterval(() => { void restore(); }, 60_000);
    const onFocus = () => { void restore(); };
    const onStorage = (event: StorageEvent) => {
      if (sessionStorage.getItem('refreshToken')) return;
      if (event.key === null || event.key === 'accessToken' || event.key === 'refreshToken') {
        active.current?.abort();
        signingIn.current = false;
        // Access-token refreshes in another tab must not unmount an edited form.
        // Account changes and sign-out still hide the previous identity immediately.
        if (event.key !== 'accessToken' || !event.newValue) { setUser(null); setLoading(true); }
        void restore();
      }
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    return () => { disposed = true; active.current?.abort(); clearInterval(interval); window.removeEventListener('focus', onFocus); window.removeEventListener('storage', onStorage); };
  }, [revision]);

  return <AuthContext.Provider value={{ user, loading, error, signIn, signOut, retry: () => { setLoading(true); setRevision(value => value + 1); } }}>{children}</AuthContext.Provider>;
}
