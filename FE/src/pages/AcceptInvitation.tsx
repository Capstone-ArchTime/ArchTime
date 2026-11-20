import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button } from 'antd';
import { MailPlus } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/auth/auth-context';
import { acceptInvitation, declineInvitation, InvitationError } from '@/features/invitations';
import { projectRoleLabel } from '@/features/role-labels';
import { defineMessages, message, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  incomplete: 'This invitation link is incomplete. Open it again from your email.', pageTitle: 'Workspace invitation · ArchTime', failed: 'The invitation could not be answered.',
  joined: 'You joined the workspace', nowRole: 'You are now a {role} of this workspace.', signInToOpen: ' Sign in with the email address the invitation was sent to to open it.',
  openWorkspaces: 'Open your workspaces', signIn: 'Sign in', declined: 'Invitation declined', declinedBody: 'You will not be added to the workspace. Ask its owner for a new invitation if you change your mind.',
  backDashboard: 'Back to your dashboard', homePage: 'Go to the home page', invited: "You've been invited to a workspace",
  invitedBody: 'Accept to join it with the role your invitation gives you. The invitation belongs to the email address it was sent to.',
  needsAccount: 'Use the email address the invitation was sent to: {create} or {signIn}, then open the link from your email again.', createAccount: 'create an account', signInLower: 'sign in',
  accept: 'Accept invitation', decline: 'Decline', backSignIn: 'Back to sign in',
}, {
  incomplete: 'Liên kết mời này không đầy đủ. Hãy mở lại từ email.', pageTitle: 'Lời mời tham gia · ArchTime', failed: 'Không phản hồi được lời mời.',
  joined: 'Bạn đã tham gia không gian làm việc', nowRole: 'Bạn hiện là {role} của không gian làm việc này.', signInToOpen: ' Hãy đăng nhập bằng email đã nhận lời mời để mở nó.',
  openWorkspaces: 'Mở không gian làm việc', signIn: 'Đăng nhập', declined: 'Đã từ chối lời mời', declinedBody: 'Bạn sẽ không được thêm vào không gian làm việc. Nếu đổi ý, hãy xin chủ sở hữu một lời mời mới.',
  backDashboard: 'Quay về Tổng quan', homePage: 'Về trang chủ', invited: 'Bạn được mời vào một không gian làm việc',
  invitedBody: 'Chấp nhận để tham gia với vai trò ghi trong lời mời. Lời mời thuộc về địa chỉ email đã nhận nó.',
  needsAccount: 'Hãy dùng email đã nhận lời mời: {create} hoặc {signIn}, rồi mở lại liên kết trong email.', createAccount: 'tạo tài khoản', signInLower: 'đăng nhập',
  accept: 'Chấp nhận lời mời', decline: 'Từ chối', backSignIn: 'Quay lại đăng nhập',
});

type State =
  | { step: 'ready' }
  | { step: 'busy'; action: 'accept' | 'decline' }
  | { step: 'accepted'; role: string }
  | { step: 'declined' }
  | { step: 'error'; message: string; needsAccount: boolean };

/**
 * The page a workspace invitation email links to (/invitations/accept?token=…). Nothing happens until the person
 * chooses: mail scanners open links on their own, and opening the link must not accept or decline it.
 */
export default function AcceptInvitation() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { user } = useAuth();
  const [state, setState] = useState<State>(token ? { step: 'ready' } : { step: 'error', message: message(MSG, 'incomplete'), needsAccount: false });
  const m = useMessages(MSG);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const pageTitle = m('pageTitle');
  useEffect(() => { document.title = pageTitle; }, [pageTitle]);

  async function answer(action: 'accept' | 'decline') {
    const controller = new AbortController(); request.current = controller;
    setState({ step: 'busy', action });
    try {
      if (action === 'accept') setState({ step: 'accepted', role: (await acceptInvitation(token, controller.signal)).role });
      else { await declineInvitation(token, controller.signal); setState({ step: 'declined' }); }
    } catch (cause) {
      if (controller.signal.aborted) return;
      setState({ step: 'error', message: cause instanceof Error ? cause.message : m('failed'), needsAccount: cause instanceof InvitationError && cause.needsAccount });
    }
  }

  const busy = state.step === 'busy';
  return <main className="min-h-dvh bg-[var(--at-page)] flex items-center justify-center p-5">
    <div className="w-full max-w-md"><Logo className="mb-10" /><div className="border border-[var(--at-line)] bg-[var(--at-panel)] p-6 sm:p-8 rounded-lg">
      <MailPlus size={30} className="text-[var(--at-link)] mb-5" aria-hidden="true" />
      {state.step === 'accepted' ? <>
        <h1 className="text-2xl font-semibold mb-3">{m('joined')}</h1>
        <p className="text-sm text-[var(--at-muted)] leading-relaxed mb-6">{m('nowRole', { role: projectRoleLabel(state.role).toLowerCase() })}{user ? '' : m('signInToOpen')}</p>
        <Link to={user ? '/projects' : '/login'}><Button type="primary" block size="large">{user ? m('openWorkspaces') : m('signIn')}</Button></Link>
      </> : state.step === 'declined' ? <>
        <h1 className="text-2xl font-semibold mb-3">{m('declined')}</h1>
        <p className="text-sm text-[var(--at-muted)] leading-relaxed mb-6">{m('declinedBody')}</p>
        <Link to={user ? '/dashboard' : '/'} className="block text-center text-sm text-[var(--at-muted)] hover:text-white">{user ? m('backDashboard') : m('homePage')}</Link>
      </> : <>
        <h1 className="text-2xl font-semibold mb-3">{m('invited')}</h1>
        <p className="text-sm text-[var(--at-muted)] leading-relaxed mb-6">{m('invitedBody')}</p>
        {state.step === 'error' && <Alert type="error" showIcon role="alert" className="mb-5" title={state.message}
          description={state.needsAccount ? <span>{m.rich('needsAccount', { create: <Link key="c" to="/register">{m('createAccount')}</Link>, signIn: <Link key="s" to="/login">{m('signInLower')}</Link> })}</span> : undefined} />}
        {token && <div className="flex gap-3">
          <Button type="primary" size="large" className="flex-1" loading={busy && state.action === 'accept'} disabled={busy} onClick={() => void answer('accept')}>{m('accept')}</Button>
          <Button size="large" loading={busy && state.action === 'decline'} disabled={busy} onClick={() => void answer('decline')}>{m('decline')}</Button>
        </div>}
        <Link to={user ? '/dashboard' : '/login'} className="block text-center text-sm text-[var(--at-muted)] hover:text-white mt-5">{user ? m('backDashboard') : m('backSignIn')}</Link>
      </>}
    </div></div>
  </main>;
}
