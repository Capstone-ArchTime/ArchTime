import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { exchangeGitHubTicket } from '@/auth/requests';
import { loginDestination } from '@/auth/permissions';
import { defineMessages, message, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  cancelled: 'GitHub sign-in was cancelled. Please try again.',
  invalid_state: 'This sign-in request expired or belongs to another browser. Please try again.',
  unavailable: 'GitHub sign-in is not configured or is temporarily unavailable.',
  email_exists: 'An account already uses your GitHub email. Sign in with your email and password.',
  failed: 'Unable to sign in with GitHub. Check that your GitHub account has a verified email and try again.',
  title: 'GitHub sign-in', completing: 'Completing your sign-in…', back: 'Back to sign in',
}, {
  cancelled: 'Đăng nhập bằng GitHub đã bị huỷ. Hãy thử lại.',
  invalid_state: 'Yêu cầu đăng nhập này đã hết hạn hoặc thuộc về trình duyệt khác. Hãy thử lại.',
  unavailable: 'Đăng nhập bằng GitHub chưa được cấu hình hoặc tạm thời không dùng được.',
  email_exists: 'Đã có tài khoản dùng email GitHub của bạn. Hãy đăng nhập bằng email và mật khẩu.',
  failed: 'Không đăng nhập được bằng GitHub. Hãy kiểm tra tài khoản GitHub có email đã xác minh rồi thử lại.',
  title: 'Đăng nhập bằng GitHub', completing: 'Đang hoàn tất đăng nhập…', back: 'Quay lại đăng nhập',
});
type Failure = 'cancelled' | 'invalid_state' | 'unavailable' | 'email_exists' | 'failed';
const failureText = (failure: string) => message(MSG, (['cancelled', 'invalid_state', 'unavailable', 'email_exists'].includes(failure) ? failure : 'failed') as Failure);

export default function GitHubCallback() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const task = useRef<Promise<string> | null>(null);
  const [error, setError] = useState('');
  const m = useMessages(MSG);
  useEffect(() => {
    let active = true;
    if (!task.current) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      window.history.replaceState(null, '', window.location.pathname);
      task.current = (async () => {
        const failure = params.get('error');
        if (failure) throw new Error(failureText(failure));
        const code = params.get('code');
        if (!code) throw new Error(failureText('invalid_state'));
        const preferences = JSON.parse(sessionStorage.getItem('github-login') ?? '{}');
        sessionStorage.removeItem('github-login');
        const tokens = await exchangeGitHubTicket(code);
        const user = await signIn(tokens, preferences?.rememberMe === true);
        return loginDestination(user.role, typeof preferences?.from === 'string' ? preferences.from : undefined);
      })();
    }
    task.current.then(path => { if (active) navigate(path, { replace: true }); }, cause => {
      if (active) setError(cause instanceof Error ? cause.message : failureText('failed'));
    });
    return () => { active = false; };
  }, [navigate, signIn]);
  return <main className="min-h-screen bg-[var(--at-page)] text-[var(--at-text-strong)] flex flex-col items-center justify-center gap-6 p-8">
    <h1 className="text-2xl font-semibold">{m('title')}</h1>
    <p role={error ? 'alert' : 'status'} className="max-w-lg text-center text-[var(--at-muted)]">{error || m('completing')}</p>
    {error && <Link to="/login" className="text-[var(--at-link)] underline">{m('back')}</Link>}
  </main>;
}
