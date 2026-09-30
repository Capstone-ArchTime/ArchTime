import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from './auth-context';
import type { AuthUser } from './permissions';
import { clearTokens, InvalidSessionError, verifySession } from './session';
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
  async function signIn(tokens: Tokens) {
    signingIn.current = true;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    try {
      const verified = await verifySession(tokens, controller.signal);
      controller.signal.throwIfAborted();
      try {
        localStorage.setItem('refreshToken', tokens.refreshToken);
        localStorage.setItem('accessToken', verified.accessToken);
      } catch { clearTokens(); throw new Error('Browser storage is unavailable. Enable it to sign in.'); }
      setUser(verified.user); setError(null); setLoading(false);
      return verified.user;
    } finally { signingIn.current = false; }
  }

  useEffect(() => {
    let running = false;
    let disposed = false;
    async function restore() {
      if (running || disposed || signingIn.current) return;
      running = true;
      const controller = new AbortController();
      active.current?.abort(); active.current = controller;
      try {
        const accessToken = localStorage.getItem('accessToken');
        const refreshToken = localStorage.getItem('refreshToken') ?? '';
        if (!accessToken && !refreshToken) { setUser(null); setError(null); return; }
        const verified = await verifySession({ accessToken: accessToken ?? '', refreshToken }, controller.signal);
        controller.signal.throwIfAborted();
        localStorage.setItem('accessToken', verified.accessToken);
        setUser(verified.user); setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setUser(null);
        if (cause instanceof InvalidSessionError) { clearTokens(); setError(null); }
        else setError(cause instanceof Error ? cause.message : 'Unable to verify your session.');
      } finally {
        running = false;
        if (!disposed && !controller.signal.aborted) setLoading(false);
      }
    }
    void restore();
    const interval = window.setInterval(() => { void restore(); }, 60_000);
    const onFocus = () => { void restore(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'accessToken' || event.key === 'refreshToken') {
        active.current?.abort(); running = false; setUser(null); setLoading(true); void restore();
      }
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    return () => { disposed = true; active.current?.abort(); clearInterval(interval); window.removeEventListener('focus', onFocus); window.removeEventListener('storage', onStorage); };
  }, [revision]);

  return <AuthContext.Provider value={{ user, loading, error, signIn, signOut, retry: () => { setLoading(true); setRevision(value => value + 1); } }}>{children}</AuthContext.Provider>;
}
