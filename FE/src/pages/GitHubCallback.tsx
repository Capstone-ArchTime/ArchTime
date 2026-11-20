import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { exchangeGitHubTicket } from '@/auth/requests';
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
        const tokens = await exchangeGitHubTicket(code);
        const user = await signIn(tokens, preferences?.rememberMe === true);
        return loginDestination(user.role, typeof preferences?.from === 'string' ? preferences.from : undefined);
      })();
    }
    task.current.then(path => { if (active) navigate(path, { replace: true }); }, cause => {
      if (active) setError(cause instanceof Error ? cause.message : errors.failed);
    });
    return () => { active = false; };
  }, [navigate, signIn]);
  return <main className="min-h-screen bg-[var(--at-page)] text-white flex flex-col items-center justify-center gap-6 p-8">
    <h1 className="text-2xl font-semibold">GitHub sign-in</h1>
    <p role={error ? 'alert' : 'status'} className="max-w-lg text-center text-slate-300">{error || 'Completing your sign-in…'}</p>
    {error && <Link to="/login" className="text-[var(--at-link)] underline">Back to sign in</Link>}
  </main>;
}
