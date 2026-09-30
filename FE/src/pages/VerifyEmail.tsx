import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert, App, Button, Form, Input } from 'antd';
import { MailCheck } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/auth/auth-context';
import { authRequest } from '@/auth/requests';
import { loginDestination } from '@/auth/permissions';

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm<{ email: string; otp: string }>();
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => { document.title = 'Verify email · ArchTime'; return () => request.current?.abort(); }, []);
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
      if (resend) { setCooldown(60); void message.success('A new verification code has been sent.'); }
      else {
        if (typeof result.accessToken !== 'string' || typeof result.refreshToken !== 'string') throw new Error('Verification response is missing authentication tokens. Try signing in.');
        const user = await signIn({ accessToken: result.accessToken, refreshToken: result.refreshToken });
        const from = typeof location.state?.from === 'string' ? location.state.from : undefined;
        navigate(loginDestination(user.role, from), { replace: true });
      }
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to verify email.'); }
    finally { if (!controller.signal.aborted) setBusy(null); }
  }

  return <main className="min-h-dvh bg-[#080b0e] flex items-center justify-center p-5">
    <div className="w-full max-w-md"><Logo className="mb-10" /><div className="border border-[#222c37] bg-[#11161b] p-6 sm:p-8 rounded-lg">
      <MailCheck size={30} className="text-[#38bdf8] mb-5" aria-hidden="true" /><h1 className="text-2xl font-semibold mb-3">Verify your email</h1>
      <p className="text-sm text-[#94a3b8] leading-relaxed mb-6">Enter the six-digit code sent to your email to activate your account.</p>
      {error && <Alert type="error" showIcon title={error} className="mb-5" role="alert" />}
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ email: typeof location.state?.email === 'string' ? location.state.email : '' }} onFinish={() => void submit(false)}>
        <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email', transform: value => value?.trim(), message: 'Enter a valid email address.' }]}><Input type="email" autoComplete="email" name="email" spellCheck={false} disabled={!!busy} /></Form.Item>
        <Form.Item name="otp" label="Verification code" rules={[{ required: true, pattern: /^\d{6}$/, message: 'Enter the six-digit code from your email.' }]}><Input inputMode="numeric" autoComplete="one-time-code" name="otp" maxLength={6} placeholder="123456" disabled={!!busy} className="tracking-[0.3em]" /></Form.Item>
        <Button type="primary" htmlType="submit" block size="large" loading={busy === 'verify'} disabled={!!busy}>Verify email</Button>
      </Form>
      <Button type="link" block className="mt-3" loading={busy === 'resend'} disabled={!!busy || cooldown > 0} onClick={() => void submit(true)}>{cooldown ? `Resend in ${cooldown}s` : 'Resend verification code'}</Button>
      <Link to="/login" className="block text-center text-sm text-[#94a3b8] hover:text-white mt-5">Back to sign in</Link>
    </div></div>
  </main>;
}
