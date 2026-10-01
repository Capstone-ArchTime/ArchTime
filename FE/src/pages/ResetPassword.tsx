import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authRequest } from '@/auth/requests';
import { useAuth } from '@/auth/auth-context';
import { Logo } from '@/components/Logo';

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef<AbortController | null>(null);
  const { signOut } = useAuth();
  useEffect(() => {
    document.title = 'Reset password - ArchTime';
    return () => active.current?.abort();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(''); setNotice('');
    if (sent && password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const controller = new AbortController(); active.current = controller;
    try {
      const result = await authRequest(sent ? 'reset-password' : 'forgot-password', sent
        ? { email: email.trim(), token: token.trim(), password, confirmPassword }
        : { email: email.trim() }, controller.signal);
      if (sent) { signOut(); setDone(true); setPassword(''); setConfirmPassword(''); setToken(''); }
      else setSent(true);
      setNotice(result.message ?? 'Request completed.');
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Please try again.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const inputClass = 'w-full rounded border border-[#222c37] bg-[#11161b] p-3 text-white';
  return <main className="min-h-dvh bg-[#080b0e] text-slate-200 flex items-center justify-center p-6">
    <section className="w-full max-w-md space-y-6">
      <Logo />
      <h1 className="text-2xl font-bold">{done ? 'Password updated' : 'Reset your password'}</h1>
      {notice && <p role="status" className="text-sky-300">{notice}</p>}
      {error && <p role="alert" className="text-red-400">{error}</p>}
      {!done && <form onSubmit={submit} className="space-y-4">
        <label className="block">Email address<input className={inputClass} type="email" autoComplete="email" required maxLength={254} value={email} disabled={sent || busy} onChange={e => setEmail(e.target.value)} /></label>
        {sent && <>
          <p className="text-sm text-slate-400">Paste the reset code from your email. It expires after 10 minutes.</p>
          <label className="block">Reset code<input className={inputClass} autoComplete="one-time-code" required value={token} disabled={busy} onChange={e => setToken(e.target.value)} /></label>
          <label className="block">New password<input className={inputClass} type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} disabled={busy} onChange={e => setPassword(e.target.value)} /></label>
          <label className="block">Confirm new password<input className={inputClass} type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirmPassword} disabled={busy} onChange={e => setConfirmPassword(e.target.value)} /></label>
        </>}
        <button disabled={busy} className="w-full rounded bg-sky-400 p-3 font-bold text-slate-950 disabled:opacity-50">{busy ? 'Please wait...' : sent ? 'Update password' : 'Send reset code'}</button>
        {sent && <button type="button" disabled={busy} className="text-sm text-sky-300" onClick={() => { setSent(false); setToken(''); setError(''); setNotice(''); }}>Use another email or request a new code</button>}
      </form>}
      <Link className="block text-sky-300 hover:underline" to="/login">Back to sign in</Link>
    </section>
  </main>;
}
