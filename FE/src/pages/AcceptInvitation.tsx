import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button } from 'antd';
import { MailPlus } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/auth/auth-context';
import { acceptInvitation, declineInvitation, InvitationError } from '@/features/invitations';
import { projectRoleLabel } from '@/features/role-labels';

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
  const [state, setState] = useState<State>(token ? { step: 'ready' } : { step: 'error', message: 'This invitation link is incomplete. Open it again from your email.', needsAccount: false });
  const request = useRef<AbortController | null>(null);
  useEffect(() => { document.title = 'Workspace invitation · ArchTime'; return () => request.current?.abort(); }, []);

  async function answer(action: 'accept' | 'decline') {
    const controller = new AbortController(); request.current = controller;
    setState({ step: 'busy', action });
    try {
      if (action === 'accept') setState({ step: 'accepted', role: (await acceptInvitation(token, controller.signal)).role });
      else { await declineInvitation(token, controller.signal); setState({ step: 'declined' }); }
    } catch (cause) {
      if (controller.signal.aborted) return;
      setState({ step: 'error', message: cause instanceof Error ? cause.message : 'The invitation could not be answered.', needsAccount: cause instanceof InvitationError && cause.needsAccount });
    }
  }

  const busy = state.step === 'busy';
  return <main className="min-h-dvh bg-[#080b0e] flex items-center justify-center p-5">
    <div className="w-full max-w-md"><Logo className="mb-10" /><div className="border border-[#242527] bg-[#11161b] p-6 sm:p-8 rounded-lg">
      <MailPlus size={30} className="text-[#3b82f6] mb-5" aria-hidden="true" />
      {state.step === 'accepted' ? <>
        <h1 className="text-2xl font-semibold mb-3">You joined the workspace</h1>
        <p className="text-sm text-[#94a3b8] leading-relaxed mb-6">You are now a {projectRoleLabel(state.role).toLowerCase()} of this workspace.{user ? '' : ' Sign in with the email address the invitation was sent to to open it.'}</p>
        <Link to={user ? '/projects' : '/login'}><Button type="primary" block size="large">{user ? 'Open your workspaces' : 'Sign in'}</Button></Link>
      </> : state.step === 'declined' ? <>
        <h1 className="text-2xl font-semibold mb-3">Invitation declined</h1>
        <p className="text-sm text-[#94a3b8] leading-relaxed mb-6">You will not be added to the workspace. Ask its owner for a new invitation if you change your mind.</p>
        <Link to={user ? '/dashboard' : '/'} className="block text-center text-sm text-[#94a3b8] hover:text-white">{user ? 'Back to your dashboard' : 'Go to the home page'}</Link>
      </> : <>
        <h1 className="text-2xl font-semibold mb-3">You've been invited to a workspace</h1>
        <p className="text-sm text-[#94a3b8] leading-relaxed mb-6">Accept to join it with the role your invitation gives you. The invitation belongs to the email address it was sent to.</p>
        {state.step === 'error' && <Alert type="error" showIcon role="alert" className="mb-5" title={state.message}
          description={state.needsAccount ? <span>Use the email address the invitation was sent to: <Link to="/register">create an account</Link> or <Link to="/login">sign in</Link>, then open the link from your email again.</span> : undefined} />}
        {token && <div className="flex gap-3">
          <Button type="primary" size="large" className="flex-1" loading={busy && state.action === 'accept'} disabled={busy} onClick={() => void answer('accept')}>Accept invitation</Button>
          <Button size="large" loading={busy && state.action === 'decline'} disabled={busy} onClick={() => void answer('decline')}>Decline</Button>
        </div>}
        <Link to={user ? '/dashboard' : '/login'} className="block text-center text-sm text-[#94a3b8] hover:text-white mt-5">{user ? 'Back to your dashboard' : 'Back to sign in'}</Link>
      </>}
    </div></div>
  </main>;
}
