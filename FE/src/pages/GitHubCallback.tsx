import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { API_BASE_URL } from '@/auth/session';
import { loginDestination } from '@/auth/permissions';

const errors: Record<string, string> = {
  cancelled: 'GitHub sign-in was cancelled. Please try again.',
  invalid_state: 'This sign-in request expired or belongs to another browser. Please try again.',
  unavailable: 'GitHub sign-in is not configured or is temporarily unavailable.',
  email_exists: 'An account already uses your GitHub email. Sign in with your email and password.',
  failed: 'Unable to sign in with GitHub. Check that your GitHub account has a verified email and try again.',
};

export default function GitHubCallback() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const task = useRef<Promise<string> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!task.current) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      window.history.replaceState(null, '', window.location.pathname);
      task.current = (async () => {
        const failure = params.get('error');
        if (failure) throw new Error(errors[failure] ?? errors.failed);
        const code = params.get('code');
        if (!code) throw new Error(errors.invalid_state);
        const preferences = JSON.parse(sessionStorage.getItem('github-login') ?? '{}');
        sessionStorage.removeItem('github-login');
        const response = await fetch(`${API_BASE_URL}/auth/github/exchange`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }), signal: AbortSignal.timeout(15_000),
        });
        const tokens = await response.json();
        if (!response.ok || typeof tokens.accessToken !== 'string' || typeof tokens.refreshToken !== 'string') {
          throw new Error(tokens.message ?? 'Sign-in expired. Please try again.');
        }
        const user = await signIn(tokens, preferences?.rememberMe === true);
        return loginDestination(user.role, typeof preferences?.from === 'string' ? preferences.from : undefined);
      })();
    }
    task.current.then(path => { if (active) navigate(path, { replace: true }); }, cause => {
      if (active) setError(cause instanceof Error ? cause.message : errors.failed);
    });
    return () => { active = false; };
  }, [navigate, signIn]);
  return <main className="min-h-screen bg-[#080b0e] text-white flex flex-col items-center justify-center gap-6 p-8">
    <h1 className="text-2xl font-semibold">GitHub sign-in</h1>
    <p role={error ? 'alert' : 'status'} className="max-w-lg text-center text-slate-300">{error || 'Completing your sign-in…'}</p>
    {error && <Link to="/login" className="text-sky-400 underline">Back to sign in</Link>}
  </main>;
}
