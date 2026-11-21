import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authRequest } from '@/auth/requests';
import { useAuth } from '@/auth/auth-context';
import { Logo } from '@/components/Logo';
import PasswordRequirements from '@/components/PasswordRequirements';
import { checkNewPassword } from '@/features/profile-validation';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  pageTitle: 'Reset password · ArchTime', emailInvalid: 'Enter a valid email address.', pasteCode: 'Paste the reset code from your email.',
  mismatch: 'Passwords do not match.', sentNotice: 'If an account uses this email, a reset code has been sent to it.', doneNotice: 'Your password has been changed. Sign in with the new one.',
  failed: 'Please try again.', titleDone: 'Password updated', title: 'Reset your password', email: 'Email address',
  codeHint: 'Paste the reset code from your email. It expires after 10 minutes.', code: 'Reset code', newPassword: 'New password', confirm: 'Confirm new password',
  wait: 'Please wait...', update: 'Update password', send: 'Send reset code', another: 'Use another email or request a new code', back: 'Back to sign in',
}, {
  pageTitle: 'Đặt lại mật khẩu · ArchTime', emailInvalid: 'Địa chỉ email không hợp lệ.', pasteCode: 'Hãy dán mã đặt lại mật khẩu trong email.',
  mismatch: 'Mật khẩu xác nhận không khớp.', sentNotice: 'Nếu có tài khoản dùng email này, mã đặt lại mật khẩu đã được gửi tới đó.', doneNotice: 'Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới.',
  failed: 'Hãy thử lại.', titleDone: 'Đã cập nhật mật khẩu', title: 'Đặt lại mật khẩu', email: 'Địa chỉ email',
  codeHint: 'Hãy dán mã đặt lại mật khẩu trong email. Mã hết hạn sau 10 phút.', code: 'Mã đặt lại', newPassword: 'Mật khẩu mới', confirm: 'Xác nhận mật khẩu mới',
  wait: 'Vui lòng đợi...', update: 'Cập nhật mật khẩu', send: 'Gửi mã đặt lại', another: 'Dùng email khác hoặc yêu cầu mã mới', back: 'Quay lại đăng nhập',
});

export default function ResetPassword() {
  const [params] = useSearchParams();
  // ?email= comes from the profile page, so a person without a password does not have to type their address.
  const [email, setEmail] = useState(() => (params.get('email') ?? '').trim().slice(0, 254));
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
  const m = useMessages(MSG);
  useEffect(() => () => active.current?.abort(), []);
  const pageTitle = m('pageTitle');
  useEffect(() => { document.title = pageTitle; }, [pageTitle]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(''); setNotice('');
    // Checked here and written on the page, instead of the browser's own pop-ups.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError(m('emailInvalid')); return; }
    if (sent && !token.trim()) { setError(m('pasteCode')); return; }
    const rule = sent ? checkNewPassword(password) : null;
    if (rule) { setError(rule); return; }
    if (sent && password !== confirmPassword) { setError(m('mismatch')); return; }
    setBusy(true);
    const controller = new AbortController(); active.current = controller;
    try {
      const result = await authRequest(sent ? 'reset-password' : 'forgot-password', sent
        ? { email: email.trim(), token: token.trim(), password, confirmPassword }
        : { email: email.trim() }, controller.signal);
      if (sent) { signOut(); setDone(true); setPassword(''); setConfirmPassword(''); setToken(''); }
      else setSent(true);
      void result;
      setNotice(sent ? m('doneNotice') : m('sentNotice'));
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : m('failed'));
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const inputClass = 'w-full rounded border border-[var(--at-line)] bg-[var(--at-panel)] p-3 text-white';
  return <main className="min-h-dvh bg-[var(--at-page)] text-slate-200 flex items-center justify-center p-6">
    <section className="w-full max-w-md space-y-6">
      <Logo />
      <h1 className="text-2xl font-bold">{done ? m('titleDone') : m('title')}</h1>
      {notice && <p role="status" className="text-[var(--at-link)]">{notice}</p>}
      {error && <p role="alert" className="text-red-400">{error}</p>}
      {!done && <form onSubmit={submit} noValidate className="space-y-4">
        <label className="block">{m('email')}<input className={inputClass} type="email" autoComplete="email" maxLength={254} value={email} disabled={sent || busy} onChange={e => setEmail(e.target.value)} /></label>
        {sent && <>
          <p className="text-sm text-slate-400">{m('codeHint')}</p>
          <label className="block">{m('code')}<input className={inputClass} autoComplete="one-time-code" value={token} disabled={busy} onChange={e => setToken(e.target.value)} /></label>
          <div><label className="block">{m('newPassword')}<input className={inputClass} type="password" autoComplete="new-password" aria-describedby="reset-password-rules" value={password} disabled={busy} onChange={e => setPassword(e.target.value)} /></label>
          <PasswordRequirements id="reset-password-rules" password={password} /></div>
          <label className="block">{m('confirm')}<input className={inputClass} type="password" autoComplete="new-password" value={confirmPassword} disabled={busy} onChange={e => setConfirmPassword(e.target.value)} /></label>
        </>}
        <button disabled={busy} className="w-full rounded bg-[var(--at-fill)] hover:bg-[var(--at-fill-hover)] p-3 font-bold text-[var(--at-on-fill)] disabled:opacity-50">{busy ? m('wait') : sent ? m('update') : m('send')}</button>
        {sent && <button type="button" disabled={busy} className="text-sm text-[var(--at-link)]" onClick={() => { setSent(false); setToken(''); setError(''); setNotice(''); }}>{m('another')}</button>}
      </form>}
      <Link className="block text-[var(--at-link)] hover:underline" to="/login">{m('back')}</Link>
    </section>
  </main>;
}
