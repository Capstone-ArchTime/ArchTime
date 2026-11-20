import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert, App, Button, Form, Input } from 'antd';
import { MailCheck } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/auth/auth-context';
import { AuthRequestError, authRequest } from '@/auth/requests';
import { loginDestination } from '@/auth/permissions';
import { deadlineFrom, formatCountdown, recallOtpDeadline, rememberOtpDeadline, resendLabel } from '@/features/otp-countdown';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  pageTitle: 'Verify email · ArchTime', resent: 'If this email is waiting to be verified, a new code has been sent.',
  noTokens: 'Verification response is missing authentication tokens. Try signing in.', failed: 'Unable to verify email.',
  title: 'Verify your email', intro: 'Enter the six-digit code sent to your email to activate your account.',
  email: 'Email address', emailInvalid: 'Enter a valid email address.', code: 'Verification code', codeInvalid: 'Enter the six-digit code from your email.',
  expired: 'This code has expired.', expiredBody: 'Send a new code below, then enter the new one.',
  expiresLabel: 'The code expires in {time}', expiresIn: 'Code expires in {time}', verify: 'Verify email', resend: 'Resend verification code', back: 'Back to sign in',
}, {
  pageTitle: 'Xác minh email · ArchTime', resent: 'Nếu email này đang chờ xác minh, một mã mới đã được gửi.',
  noTokens: 'Phản hồi xác minh thiếu mã xác thực. Hãy thử đăng nhập.', failed: 'Không xác minh được email.',
  title: 'Xác minh email', intro: 'Nhập mã 6 chữ số đã gửi tới email để kích hoạt tài khoản.',
  email: 'Địa chỉ email', emailInvalid: 'Địa chỉ email không hợp lệ.', code: 'Mã xác minh', codeInvalid: 'Hãy nhập mã 6 chữ số trong email.',
  expired: 'Mã này đã hết hạn.', expiredBody: 'Hãy gửi mã mới bên dưới rồi nhập mã mới.',
  expiresLabel: 'Mã hết hạn sau {time}', expiresIn: 'Mã hết hạn sau {time}', verify: 'Xác minh email', resend: 'Gửi lại mã xác minh', back: 'Quay lại đăng nhập',
});

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const { message } = App.useApp();
  const m = useMessages(MSG);
  const [form] = Form.useForm<{ email: string; otp: string }>();
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const request = useRef<AbortController | null>(null);
  const initialEmail = typeof location.state?.email === 'string' ? location.state.email : '';
  // When the code in the email stops working; unknown when the page was opened without one being sent from here.
  const [deadline, setDeadline] = useState<number | null>(() => (initialEmail ? recallOtpDeadline(initialEmail) : null));
  const [now, setNow] = useState(() => Date.now());
  const msLeft = deadline === null ? null : deadline - now;
  const expired = msLeft !== null && msLeft <= 0;
  useEffect(() => {
    if (deadline === null || expired) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline, expired]);
  useEffect(() => () => request.current?.abort(), []);
  const pageTitle = m('pageTitle');
  useEffect(() => { document.title = pageTitle; }, [pageTitle]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function submit(resend: boolean) {
    if (busy) return;
    let values;
    try { values = await form.validateFields(resend ? ['email'] : ['email', 'otp']); }
    catch { return; }
    const controller = new AbortController(); request.current = controller;
    setBusy(resend ? 'resend' : 'verify'); setError('');
    try {
      const email = values.email.trim();
      const result = await authRequest(resend ? 'resend-otp' : 'verify-email', resend ? { email } : { email, otp: values.otp.trim() }, controller.signal);
      if (resend) {
        const next = deadlineFrom(result.expiresAt);
        rememberOtpDeadline(email, next); setDeadline(next); setNow(Date.now());
        form.setFieldValue('otp', '');
        setCooldown(60); void message.success(m('resent'));
      }
      else {
        if (typeof result.accessToken !== 'string' || typeof result.refreshToken !== 'string') throw new Error(m('noTokens'));
        const user = await signIn({ accessToken: result.accessToken, refreshToken: result.refreshToken });
        const from = typeof location.state?.from === 'string' ? location.state.from : undefined;
        navigate(loginDestination(user.role, from), { replace: true });
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof AuthRequestError && cause.status === 429) {
        // Resend refused: the button waits exactly as long as the server says. A locked code is useless now, so the box is emptied.
        if (resend && cause.retryAfterSeconds) setCooldown(cause.retryAfterSeconds);
        if (!resend && cause.code === 'OTP_LOCKED') form.setFieldValue('otp', '');
      }
      setError(cause instanceof Error ? cause.message : m('failed'));
    }
    finally { if (!controller.signal.aborted) setBusy(null); }
  }

  return <main className="min-h-dvh bg-[var(--at-page)] flex items-center justify-center p-5">
    <div className="w-full max-w-md"><Logo className="mb-10" /><div className="border border-[var(--at-line)] bg-[var(--at-panel)] p-6 sm:p-8 rounded-lg">
      <MailCheck size={30} className="text-[var(--at-link)] mb-5" aria-hidden="true" /><h1 className="text-2xl font-semibold mb-3">{m('title')}</h1>
      <p className="text-sm text-[var(--at-muted)] leading-relaxed mb-6">{m('intro')}</p>
      {error && <Alert type="error" showIcon title={error} className="mb-5" role="alert" />}
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ email: initialEmail }} onFinish={() => void submit(false)}>
        <Form.Item name="email" label={m('email')} rules={[{ required: true, type: 'email', transform: value => value?.trim(), message: m('emailInvalid') }]}><Input type="email" autoComplete="email" name="email" spellCheck={false} disabled={!!busy} /></Form.Item>
        <Form.Item name="otp" label={m('code')} rules={[{ required: true, pattern: /^\d{6}$/, message: m('codeInvalid') }]}><Input inputMode="numeric" autoComplete="one-time-code" name="otp" maxLength={6} placeholder="123456" disabled={!!busy} className="tracking-[0.3em]" /></Form.Item>
        {msLeft !== null && (expired
          ? <Alert type="warning" showIcon className="mb-4" role="alert" title={m('expired')} description={m('expiredBody')} />
          : <p role="timer" aria-label={m('expiresLabel', { time: formatCountdown(msLeft) })} className={`-mt-2 mb-4 text-sm ${msLeft < 60_000 ? 'text-amber-300' : 'text-slate-300'}`}>
              {m.rich('expiresIn', { time: <span key="t" className="font-mono font-semibold">{formatCountdown(msLeft)}</span> })}
            </p>)}
        <Button type="primary" htmlType="submit" block size="large" loading={busy === 'verify'} disabled={!!busy || expired}>{m('verify')}</Button>
      </Form>
      <Button type="link" block className="mt-3" loading={busy === 'resend'} disabled={!!busy || cooldown > 0} onClick={() => void submit(true)}>{cooldown ? resendLabel(cooldown) : m('resend')}</Button>
      <Link to="/login" className="block text-center text-sm text-[var(--at-muted)] hover:text-white mt-5">{m('back')}</Link>
    </div></div>
  </main>;
}
