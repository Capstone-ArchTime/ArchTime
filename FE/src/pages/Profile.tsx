import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, App, Button, Input, Progress, Skeleton, Tag, Tooltip } from 'antd';
import { Building2, CalendarDays, FolderKanban, GraduationCap, KeyRound, Sparkles } from 'lucide-react';
import { Icon } from '@iconify/react';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import PasswordRequirements from '@/components/PasswordRequirements';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { canAccess } from '@/auth/permissions';
import type { Role } from '@/auth/permissions';
import { setSignInNotice } from '@/auth/session';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { formatCost, formatTokens, getMyRuns } from '@/features/llm-api';
import { ORGANIZATION_ROLE_LABELS, summarizeLearning } from '@/features/my-work';
import { getMyPaths } from '@/features/onboarding-api';
import { listOrganizations } from '@/features/organizations-api';
import { githubLinkResult, startGitHubLink, unlinkGitHub } from '@/features/github-link';
import { changePassword, countProjects, setPassword, signOutEverywhere, updateProfile } from '@/features/profile-api';
import {
  accountTypeLabel, buildProfilePatch, checkName, checkPasswordForm, checkUsername,
} from '@/features/profile-validation';
import type { PasswordForm, PasswordProblems } from '@/features/profile-validation';
import {
  checkSetPasswordForm, forgotPasswordLink, initials, memberSince, needsPassword, organizationOverview, overviewTiles, parseSignInMethods,
  pathToContinue, workspaceOverview,
} from '@/features/profile-view';
import type { SetPasswordForm, SetPasswordProblems } from '@/features/profile-view';
import { Details } from '@/components/PageHeader';
import { organizationRoleLabel } from '@/features/role-labels';
import { defineMessages, message, useMessages } from '@/i18n/define';
import { translate } from '@/i18n';

const MSG = defineMessages({
  couldNotLoad: 'Could not load {what}.', whatOrgs: 'your organizations', whatWorkspaces: 'your workspaces', whatPaths: 'your learning paths', whatAi: 'your AI usage',
  invalidTotals: 'The server returned invalid usage totals.', retry: 'Retry',
  linkFailed: 'Could not start linking GitHub.', unlinkTitle: 'Unlink GitHub?', unlinkBody: 'You will sign in with your email and password only. You can link GitHub again at any time.',
  unlink: 'Unlink', unlinked: 'GitHub is unlinked.', unlinkFailed: 'Could not unlink GitHub.',
  setUsernameTitle: 'Set your username to "{username}"?', setUsernameBody: 'You can sign in with it instead of your email. It cannot be changed or removed later.', setUsername: 'Set username', notYet: 'Not yet',
  saved: 'Profile updated.', saveFailed: 'Could not save your profile. Please retry.',
  passwordChanged: 'Password changed. For your security you were signed out of all devices. Sign in again with your new password.', changeFailed: 'Could not change your password. Please retry.',
  passwordSet: 'Password set. You can now also sign in with your email and this password.', setFailed: 'Could not set your password. Please retry.',
  signOutAllTitle: 'Sign out of all devices?', signOutAllBody: 'This ends every session of your account, including this one. You will need to sign in again everywhere.',
  signOutEverywhere: 'Sign out everywhere', signedOutAll: 'You were signed out of all devices.', signOutAllFailed: 'Could not sign you out of all devices. Please retry.',
  title: 'My profile', description: 'Your account, memberships and sign-in.', yourAccount: 'Your account', overview: 'Overview',
  organizations: 'Organizations', noOrgYet: 'You do not belong to an organization yet.', startOne: 'Start one', seeAllMore: 'See all ({more} more)', seeAll: 'See all',
  workspaces: 'Workspaces', openWorkspaces: 'Open workspaces', myWork: 'My work', learning: 'Learning', noPaths: 'No learning paths given to you yet.',
  stepsDone: 'Steps done across your learning paths', pathsFinished: '{finished} of {count} paths finished', pathsFinished_one: '{finished} of 1 path finished', continue: 'Continue: {title}',
  aiUsage: 'AI usage', runs: '{count} runs', runs_one: '1 run', usageLine: '{tokens} tokens · {cost} · all time', seeDetails: 'See details',
  personal: 'Personal information', name: 'Name', username: 'Username', usernameSetHint: 'You sign in with it or your email. A username cannot be changed.',
  usernameOptional: 'Username (optional)', usernameHint: 'You can sign in with it instead of your email. You set it once: it cannot be changed later.', rules: 'Rules',
  email: 'Email', emailHint: 'The email cannot be changed here.', saveChanges: 'Save changes', discard: 'Discard changes',
  security: 'Security', howSignIn: 'How you sign in', emailPassword: 'Email and password', set: 'Set', notSet: 'Not set', linked: 'Linked', notLinked: 'Not linked',
  githubOnly: 'GitHub is the only way you sign in. Set a password below first.', linkGithub: 'Link GitHub',
  setPassword: 'Set a password', githubNoPassword: 'You sign in with GitHub and your account has no password yet.', noPassword: 'Your account has no password yet.',
  setOneToo: 'Set one to also sign in with your email and a password. You stay signed in.', newPassword: 'New password', repeatPassword: 'Repeat the new password',
  setPasswordButton: 'Set password', orReset: 'Or {link} and choose a password there. Doing it that way signs you out of all devices.', resetLink: 'get a reset code by email',
  password: 'Password', changeSignsOut: 'Changing it signs you out of every device.', changePassword: 'Change password',
  githubCannotChange: 'If you signed up with GitHub and never set a password, this form cannot change it.', currentPassword: 'Current password', cancel: 'Cancel',
  signOutAll: 'Sign out of all devices', signOutAllHint: 'Ends every session of your account, this one included.',
}, {
  couldNotLoad: 'Không tải được {what}.', whatOrgs: 'các tổ chức của bạn', whatWorkspaces: 'các không gian làm việc của bạn', whatPaths: 'các lộ trình học của bạn', whatAi: 'mức dùng AI của bạn',
  invalidTotals: 'Máy chủ trả về số liệu sử dụng không hợp lệ.', retry: 'Thử lại',
  linkFailed: 'Không bắt đầu liên kết GitHub được.', unlinkTitle: 'Huỷ liên kết GitHub?', unlinkBody: 'Bạn sẽ chỉ đăng nhập bằng email và mật khẩu. Bạn có thể liên kết GitHub lại bất cứ lúc nào.',
  unlink: 'Huỷ liên kết', unlinked: 'Đã huỷ liên kết GitHub.', unlinkFailed: 'Không huỷ liên kết GitHub được.',
  setUsernameTitle: 'Đặt tên đăng nhập là "{username}"?', setUsernameBody: 'Bạn có thể đăng nhập bằng tên này thay cho email. Sau này không thể đổi hay xoá.', setUsername: 'Đặt tên đăng nhập', notYet: 'Để sau',
  saved: 'Đã cập nhật hồ sơ.', saveFailed: 'Không lưu được hồ sơ. Hãy thử lại.',
  passwordChanged: 'Đã đổi mật khẩu. Để bảo mật, bạn đã được đăng xuất khỏi mọi thiết bị. Hãy đăng nhập lại bằng mật khẩu mới.', changeFailed: 'Không đổi được mật khẩu. Hãy thử lại.',
  passwordSet: 'Đã đặt mật khẩu. Giờ bạn cũng có thể đăng nhập bằng email và mật khẩu này.', setFailed: 'Không đặt được mật khẩu. Hãy thử lại.',
  signOutAllTitle: 'Đăng xuất khỏi mọi thiết bị?', signOutAllBody: 'Mọi phiên đăng nhập của tài khoản sẽ kết thúc, kể cả phiên này. Bạn sẽ phải đăng nhập lại ở mọi nơi.',
  signOutEverywhere: 'Đăng xuất mọi nơi', signedOutAll: 'Bạn đã được đăng xuất khỏi mọi thiết bị.', signOutAllFailed: 'Không đăng xuất khỏi mọi thiết bị được. Hãy thử lại.',
  title: 'Hồ sơ của tôi', description: 'Tài khoản, tư cách thành viên và cách đăng nhập của bạn.', yourAccount: 'Tài khoản của bạn', overview: 'Tổng quan',
  organizations: 'Tổ chức', noOrgYet: 'Bạn chưa thuộc tổ chức nào.', startOne: 'Tạo một tổ chức', seeAllMore: 'Xem tất cả (thêm {more})', seeAll: 'Xem tất cả',
  workspaces: 'Không gian làm việc', openWorkspaces: 'Mở không gian làm việc', myWork: 'Việc của tôi', learning: 'Học tập', noPaths: 'Bạn chưa được giao lộ trình học nào.',
  stepsDone: 'Số bước đã xong trên các lộ trình học', pathsFinished: 'Xong {finished}/{count} lộ trình', continue: 'Học tiếp: {title}',
  aiUsage: 'Mức dùng AI', runs: '{count} lượt chạy', usageLine: '{tokens} token · {cost} · từ trước tới nay', seeDetails: 'Xem chi tiết',
  personal: 'Thông tin cá nhân', name: 'Tên', username: 'Tên đăng nhập', usernameSetHint: 'Bạn đăng nhập bằng tên này hoặc email. Không thể đổi tên đăng nhập.',
  usernameOptional: 'Tên đăng nhập (không bắt buộc)', usernameHint: 'Bạn có thể đăng nhập bằng tên này thay cho email. Chỉ đặt một lần: sau này không thể đổi.', rules: 'Quy tắc',
  email: 'Email', emailHint: 'Không thể đổi email ở đây.', saveChanges: 'Lưu thay đổi', discard: 'Bỏ thay đổi',
  security: 'Bảo mật', howSignIn: 'Cách bạn đăng nhập', emailPassword: 'Email và mật khẩu', set: 'Đã đặt', notSet: 'Chưa đặt', linked: 'Đã liên kết', notLinked: 'Chưa liên kết',
  githubOnly: 'GitHub là cách đăng nhập duy nhất của bạn. Hãy đặt mật khẩu bên dưới trước.', linkGithub: 'Liên kết GitHub',
  setPassword: 'Đặt mật khẩu', githubNoPassword: 'Bạn đăng nhập bằng GitHub và tài khoản chưa có mật khẩu.', noPassword: 'Tài khoản của bạn chưa có mật khẩu.',
  setOneToo: 'Đặt mật khẩu để có thể đăng nhập bằng email và mật khẩu. Bạn vẫn giữ phiên đăng nhập hiện tại.', newPassword: 'Mật khẩu mới', repeatPassword: 'Nhập lại mật khẩu mới',
  setPasswordButton: 'Đặt mật khẩu', orReset: 'Hoặc {link} rồi chọn mật khẩu ở đó. Cách này sẽ đăng xuất bạn khỏi mọi thiết bị.', resetLink: 'nhận mã đặt lại qua email',
  password: 'Mật khẩu', changeSignsOut: 'Đổi mật khẩu sẽ đăng xuất bạn khỏi mọi thiết bị.', changePassword: 'Đổi mật khẩu',
  githubCannotChange: 'Nếu bạn đăng ký bằng GitHub và chưa từng đặt mật khẩu, biểu mẫu này không đổi được.', currentPassword: 'Mật khẩu hiện tại', cancel: 'Huỷ',
  signOutAll: 'Đăng xuất khỏi mọi thiết bị', signOutAllHint: 'Kết thúc mọi phiên đăng nhập của tài khoản, kể cả phiên này.',
});
type What = 'whatOrgs' | 'whatWorkspaces' | 'whatPaths' | 'whatAi';

const label = 'mb-1 block text-xs text-[var(--at-muted)]';
const link = 'text-[var(--at-link)] hover:text-[var(--at-link-hover)]';
const problem = (id: string, text?: string) => (text ? <p id={id} role="alert" className="mt-1 text-xs text-red-400">{text}</p> : null);

type Load<T> = { data: T | null; error: string | null; retry: () => void };

/** Loads one tile's numbers on its own, so one failing request leaves the rest of the page alone. Nothing loads while disabled. */
function useLoad<T>(fetcher: (signal: AbortSignal) => Promise<T>, what: What, enabled: boolean): Load<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetcher(controller.signal)
      .then(setData)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : message(MSG, 'couldNotLoad', { what: message(MSG, what) })); });
    return () => controller.abort();
    // The fetchers are module functions; only a retry (or the tile becoming allowed) starts a new load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, enabled]);
  return { data, error, retry: () => { setError(null); setData(null); setAttempt(a => a + 1); } };
}

// "managed" includes the workspaces the person created, so the parts are shown side by side, never added up.
const loadWorkspaces = async (signal: AbortSignal) => {
  const [all, owned, managed, participating] = await Promise.all((['all', 'owned', 'managed', 'participating'] as const).map(scope => countProjects(scope, signal)));
  return { all, owned, managed, participating };
};
const loadAiTotals = async (signal: AbortSignal) => {
  const totals = (await getMyRuns({ limit: 1 }, signal)).totals;
  if (!totals || typeof totals.runs !== 'number') throw new Error(message(MSG, 'invalidTotals'));
  return totals;
};

/** A summary that links to the page with the details; it shows its own loading and error state. */
function Tile<T>({ icon, title, load, children }: { icon: ReactNode; title: string; load: Load<T>; children: (data: T) => ReactNode }) {
  return <article aria-label={title} className={`${featurePanel} flex flex-col gap-2`}>
    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--at-muted)]">{icon}{title}</h3>
    {load.error ? <div className="space-y-2"><p role="alert" className="text-sm text-red-400">{load.error}</p><Button size="small" onClick={load.retry}>{message(MSG, 'retry')}</Button></div>
      : load.data === null ? <Skeleton active title={false} paragraph={{ rows: 2 }} /> : children(load.data)}
  </article>;
}

/** The tile's links, leaving out any page this account cannot open. */
function TileLinks({ role, links }: { role: Role; links: [string, string][] }) {
  const open = links.filter(([to]) => canAccess(role, to));
  if (!open.length) return null;
  return <p className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">{open.map(([to, text]) => <Link key={to} to={to} className={link}>{text}</Link>)}</p>;
}

function PasswordField({ id, text, autoComplete, value, error, rules, onChange }: { id: string; text: string; autoComplete: string; value: string; error?: string; rules?: boolean; onChange: (value: string) => void }) {
  return <div>
    <label htmlFor={id} className={label}>{text}</label>
    <Input.Password id={id} value={value} autoComplete={autoComplete} status={error ? 'error' : undefined} aria-describedby={error ? `${id}-problem` : undefined}
      onChange={e => onChange(e.target.value)} />
    {problem(`${id}-problem`, error)}
    {/* The checklist appears once typing starts, so an empty form stays short. */}
    {rules && value && <PasswordRequirements id={`${id}-rules`} password={value} />}
  </div>;
}

function SignInMethod({ icon, name, on, onText, offText, action }: { icon: ReactNode; name: string; on: boolean; onText: string; offText: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
    <dt className="flex items-center gap-2 text-sm">{icon}{name}</dt>
    <dd className="flex items-center gap-2"><Tag color={on ? 'green' : undefined}>{on ? onText : offText}</Tag>{action}</dd>
  </div>;
}

const noPasswords: SetPasswordForm = { newPassword: '', confirmNewPassword: '' };

/** The signed-in person's own account: who they are, what they are part of, their details, and how they sign in. */
export default function Profile() {
  const { user, updateUser, signOut } = useAuth();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const m = useMessages(MSG);

  const [form, setForm] = useState({ name: user?.name ?? '', username: user?.username ?? '' });
  const [formProblems, setFormProblems] = useState<{ name?: string; username?: string; general?: string }>({});
  const [saving, setSaving] = useState(false);

  const [passwords, setPasswords] = useState<PasswordForm>({ oldPassword: '', newPassword: '', confirmNewPassword: '' });
  const [passwordProblems, setPasswordProblems] = useState<PasswordProblems & { general?: string }>({});
  const [changing, setChanging] = useState(false);
  // The change-password form stays folded behind its button until asked for (or while it shows a problem).
  const [changeOpen, setChangeOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [firstPassword, setFirstPassword] = useState<SetPasswordForm>(noPasswords);
  const [firstPasswordProblems, setFirstPasswordProblems] = useState<SetPasswordProblems & { general?: string }>({});
  const [settingPassword, setSettingPassword] = useState(false);
  // The set form (and the button just pressed) goes away once a password exists; focus then moves to the change form's heading.
  const focusChangeForm = useRef(false);

  const tiles = user ? overviewTiles(user.role) : [];
  const organizations = useLoad(listOrganizations, 'whatOrgs', tiles.includes('organizations'));
  const workspaces = useLoad(loadWorkspaces, 'whatWorkspaces', tiles.includes('workspaces'));
  const paths = useLoad(getMyPaths, 'whatPaths', tiles.includes('learning'));
  const aiTotals = useLoad(loadAiTotals, 'whatAi', tiles.includes('ai'));

  const patch = user ? buildProfilePatch({ name: user.name, username: user.username }, form) : null;
  useUnsavedChanges(!!patch);

  const [githubBusy, setGithubBusy] = useState(false);
  // Back from GitHub after linking (UC-35): say how it went once, then drop it from the address. The page was loaded
  // afresh, so the session check already brought the new sign-in methods.
  useEffect(() => {
    const result = githubLinkResult(window.location.hash);
    if (!result) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (result.ok) message.success(result.text); else message.error(result.text);
  }, [message]);

  if (!user) return null;

  const role = user.role;
  const methods = parseSignInMethods(user.signInMethods);
  const since = memberSince(user.createdAt);
  const canOpen = (to: string) => canAccess(role, to);

  /** Ends this session here and goes to sign-in, which can say why (the page itself may be gone by the time anything is read). */
  const leave = (notice?: string) => { if (notice) setSignInNotice(notice); signOut(); navigate('/login', { replace: true }); };

  async function linkGitHub() {
    setGithubBusy(true);
    try { await startGitHubLink(); } // leaves the page for GitHub
    catch (cause) { message.error(cause instanceof Error ? cause.message : m('linkFailed')); setGithubBusy(false); }
  }
  function confirmUnlinkGitHub() {
    modal.confirm({
      title: m('unlinkTitle'), content: m('unlinkBody'),
      okText: m('unlink'), cancelText: m('cancel'), okButtonProps: { danger: true },
      onOk: async () => {
        setGithubBusy(true);
        try {
          const now = await unlinkGitHub();
          updateUser({ signInMethods: now ?? { password: true, github: false } });
          message.success(m('unlinked'));
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : m('unlinkFailed'));
        } finally { setGithubBusy(false); }
      },
    });
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!patch || saving) return;
    const found = { name: patch.name !== undefined ? checkName(form.name) ?? undefined : undefined, username: patch.username !== undefined ? checkUsername(form.username) ?? undefined : undefined };
    if (found.name || found.username) { setFormProblems(found); return; }
    setFormProblems({});
    // A username is set once (the server refuses to change it afterwards), so choosing one is confirmed first.
    if (patch.username && !user?.username) {
      modal.confirm({
        title: m('setUsernameTitle', { username: patch.username.trim().toLowerCase() }),
        content: m('setUsernameBody'),
        okText: m('setUsername'), cancelText: m('notYet'), onOk: () => persistProfile(),
      });
      return;
    }
    await persistProfile();
  }

  async function persistProfile() {
    if (!patch) return;
    setSaving(true);
    try {
      const saved = await updateProfile(patch);
      updateUser(saved);
      setForm({ name: saved.name, username: saved.username ?? '' });
      message.success(m('saved'));
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : m('saveFailed');
      // Which field a problem belongs to is read from the server's English wording (the shown text may be translated).
      const raw = cause instanceof ApiError ? cause.raw ?? text : text;
      if (cause instanceof ApiError && cause.status === 409) setFormProblems({ username: text });
      else if (cause instanceof ApiError && cause.status === 400 && /username/i.test(raw)) setFormProblems({ username: text });
      else if (cause instanceof ApiError && cause.status === 400 && /name/i.test(raw)) setFormProblems({ name: text });
      else setFormProblems({ general: text });
    } finally {
      setSaving(false);
    }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (changing) return;
    const found = checkPasswordForm(passwords);
    if (Object.keys(found).length) { setPasswordProblems(found); return; }
    setPasswordProblems({});
    setChanging(true);
    try {
      await changePassword(passwords);
      setPasswords({ oldPassword: '', newPassword: '', confirmNewPassword: '' });
      // The server ended every session of the account, this one too, so there is nothing to carry on with here.
      leave(m('passwordChanged'));
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : m('changeFailed');
      const raw = cause instanceof ApiError ? cause.raw ?? text : text;
      if (cause instanceof ApiError && cause.status === 401) leave();
      else if (cause instanceof ApiError && /old password/i.test(raw)) setPasswordProblems({ oldPassword: text });
      else if (cause instanceof ApiError && cause.status === 400 && /^password /i.test(raw)) setPasswordProblems({ newPassword: text });
      else setPasswordProblems({ general: text });
    } finally {
      setChanging(false);
    }
  }

  async function submitFirstPassword(event: FormEvent) {
    event.preventDefault();
    if (settingPassword) return;
    const found = checkSetPasswordForm(firstPassword);
    if (Object.keys(found).length) { setFirstPasswordProblems(found); return; }
    setFirstPasswordProblems({});
    setSettingPassword(true);
    const github = methods?.github ?? false;
    try {
      const now = await setPassword(firstPassword);
      setFirstPassword(noPasswords);
      // The sessions stay, so the page carries on and shows the change form from now on.
      focusChangeForm.current = true;
      updateUser({ signInMethods: now ?? { password: true, github } });
      message.success(m('passwordSet'));
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : m('setFailed');
      const raw = cause instanceof ApiError ? cause.raw ?? text : text;
      if (cause instanceof ApiError && cause.status === 401) leave();
      // A password was set meanwhile (another tab, or the reset page): offer the change form instead.
      else if (cause instanceof ApiError && cause.status === 409) { setFirstPassword(noPasswords); focusChangeForm.current = true; updateUser({ signInMethods: { password: true, github } }); message.info(text); }
      else if (cause instanceof ApiError && cause.status === 400 && /^password /i.test(raw)) setFirstPasswordProblems({ newPassword: text });
      else if (cause instanceof ApiError && cause.status === 400 && /do not match/i.test(raw)) setFirstPasswordProblems({ confirmNewPassword: text });
      else setFirstPasswordProblems({ general: text });
    } finally {
      setSettingPassword(false);
    }
  }

  function confirmSignOutEverywhere() {
    modal.confirm({
      title: m('signOutAllTitle'),
      content: m('signOutAllBody'),
      okText: m('signOutEverywhere'), cancelText: m('cancel'), okButtonProps: { danger: true },
      onOk: async () => {
        setSigningOut(true);
        try {
          await signOutEverywhere();
          leave(m('signedOutAll'));
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) { leave(); return; }
          message.error(cause instanceof Error ? cause.message : m('signOutAllFailed'));
        } finally {
          setSigningOut(false);
        }
      },
    });
  }

  const iconClass = 'text-[var(--at-link)]';

  return <FeaturePage title={m('title')} description={m('description')} demo={false}>
    <section aria-label={m('yourAccount')} className={`${featurePanel} flex flex-wrap items-center gap-5`}>
      <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--at-fill)] text-xl font-semibold text-[var(--at-on-fill)]">{initials(user.name)}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-2xl font-bold break-words">{user.name}</h3>
          <Tag color={role === 'system-administrator' ? 'gold' : 'blue'}>{accountTypeLabel(role)}</Tag>
        </div>
        {user.username && <p className="text-sm text-slate-300">@{user.username}</p>}
        <p className="text-sm text-[var(--at-muted)] break-all">{user.email}</p>
        {since && <p className="flex items-center gap-1.5 text-xs text-[var(--at-muted)]"><CalendarDays size={14} aria-hidden="true" />{since}</p>}
      </div>
    </section>

    {tiles.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={m('overview')} role="group">
      {tiles.includes('organizations') && <Tile icon={<Building2 size={16} className={iconClass} />} title={m('organizations')} load={organizations}>{orgs => {
        const o = organizationOverview(orgs);
        return <>
          <p className="text-2xl font-bold">{o.count}</p>
          <p className="text-xs text-[var(--at-muted)]">{o.count ? o.ownedText : m('noOrgYet')}</p>
          {o.shown.length > 0 && <ul className="flex flex-wrap gap-2">{o.shown.map(org => {
            const to = `/organizations/${encodeURIComponent(org.id)}`;
            const chip = <><span className="max-w-40 truncate">{org.name}</span><span className="text-[var(--at-muted)]">{ORGANIZATION_ROLE_LABELS[org.myRole] ? organizationRoleLabel(org.myRole) : org.myRole}</span></>;
            const chipClass = 'inline-flex max-w-full items-center gap-1.5 rounded border border-[var(--at-line)] px-2 py-1 text-xs text-slate-200';
            return <li key={org.id} className="max-w-full">{canOpen(to) ? <Link to={to} className={`${chipClass} hover:border-[var(--at-accent)] hover:text-[var(--at-link-hover)]`}>{chip}</Link> : <span className={chipClass}>{chip}</span>}</li>;
          })}</ul>}
          <TileLinks role={role} links={[['/organizations', !o.count ? m('startOne') : o.more ? m('seeAllMore', { more: o.more }) : m('seeAll')]]} />
        </>;
      }}</Tile>}

      {tiles.includes('workspaces') && <Tile icon={<FolderKanban size={16} className={iconClass} />} title={m('workspaces')} load={workspaces}>{w => <>
        <p className="text-2xl font-bold">{w.all}</p>
        <p className="text-xs text-[var(--at-muted)]">{workspaceOverview(w)}</p>
        <TileLinks role={role} links={[['/projects', m('openWorkspaces')], ['/my-work', m('myWork')]]} />
      </>}</Tile>}

      {tiles.includes('learning') && <Tile icon={<GraduationCap size={16} className={iconClass} />} title={m('learning')} load={paths}>{list => {
        if (!list.length) return <>
          <p className="text-sm text-[var(--at-muted)]">{m('noPaths')}</p>
          <TileLinks role={role} links={[['/learning', m('learning')]]} />
        </>;
        const s = summarizeLearning(list);
        const next = pathToContinue(list);
        const to = next ? `/learning/${encodeURIComponent(next.projectId)}/${encodeURIComponent(next.pathId)}` : null;
        return <>
          <p className="text-2xl font-bold">{s.percent}%</p>
          <Progress percent={s.percent} showInfo={false} size="small" aria-label={m('stepsDone')} />
          <p className="text-xs text-[var(--at-muted)]">{m('pathsFinished', { finished: s.finished, count: s.assigned })}</p>
          {next && to && canOpen(to) && <Link to={to} className={`${link} text-sm break-words`}>{m('continue', { title: next.title })}</Link>}
          <TileLinks role={role} links={[['/learning', m('seeAll')]]} />
        </>;
      }}</Tile>}

      {tiles.includes('ai') && <Tile icon={<Sparkles size={16} className={iconClass} />} title={m('aiUsage')} load={aiTotals}>{t => <>
        <p className="text-2xl font-bold">{m('runs', { count: t.runs })}</p>
        <p className="text-xs text-[var(--at-muted)]">{m('usageLine', { tokens: formatTokens(t.totalTokens), cost: formatCost(t.cost) })}</p>
        <TileLinks role={role} links={[['/ai-usage', m('seeDetails')]]} />
      </>}</Tile>}
    </div>}

    <div className="grid items-start gap-6 lg:grid-cols-2">
      <form onSubmit={e => void saveProfile(e)} className={`${featurePanel} space-y-4`} aria-labelledby="profile-heading" noValidate>
        <h3 id="profile-heading" className="text-lg font-semibold">{m('personal')}</h3>
        {formProblems.general && <Alert type="error" showIcon title={formProblems.general} />}
        <div>
          <label htmlFor="profile-name" className={label}>{m('name')}</label>
          <Input id="profile-name" value={form.name} maxLength={100} autoComplete="name" status={formProblems.name ? 'error' : undefined} aria-describedby={formProblems.name ? 'profile-name-problem' : undefined}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          {problem('profile-name-problem', formProblems.name)}
        </div>
        <div>
          {user.username ? <>
            <label htmlFor="profile-username" className={label}>{m('username')}</label>
            <Input id="profile-username" value={user.username} readOnly aria-describedby="profile-username-hint" />
            <p id="profile-username-hint" className="mt-1 text-xs text-[var(--at-muted)]">{m('usernameSetHint')}</p>
          </> : <>
            <label htmlFor="profile-username" className={label}>{m('usernameOptional')}</label>
            <Input id="profile-username" value={form.username} maxLength={40} autoComplete="username" status={formProblems.username ? 'error' : undefined}
              aria-describedby={formProblems.username ? 'profile-username-problem' : 'profile-username-hint'} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            <p id="profile-username-hint" className="mt-1 text-xs text-[var(--at-muted)]">{m('usernameHint')}</p>
            <Details label={m('rules')} className="mt-1" bodyClassName="text-xs"><p>{translate('profile.usernameHint')}</p></Details>
          </>}
          {problem('profile-username-problem', formProblems.username)}
        </div>
        <div>
          <label htmlFor="profile-email" className={label}>{m('email')}</label>
          <Input id="profile-email" value={user.email} readOnly aria-describedby="profile-email-hint" />
          <p id="profile-email-hint" className="mt-1 text-xs text-[var(--at-muted)]">{m('emailHint')}</p>
        </div>
        <div className="flex gap-2">
          <Button type="primary" htmlType="submit" loading={saving} disabled={!patch}>{m('saveChanges')}</Button>
          <Button disabled={!patch || saving} onClick={() => { setForm({ name: user.name, username: user.username ?? '' }); setFormProblems({}); }}>{m('discard')}</Button>
        </div>
      </form>

      <section className={`${featurePanel} space-y-5`} aria-labelledby="security-heading">
        <h3 id="security-heading" className="text-lg font-semibold">{m('security')}</h3>

        {methods && <div className="space-y-2">
          <h4 id="methods-heading" className="text-sm font-semibold">{m('howSignIn')}</h4>
          <dl aria-labelledby="methods-heading" className="divide-y divide-[var(--at-line)] rounded border border-[var(--at-line)]">
            <SignInMethod icon={<KeyRound size={16} className={iconClass} aria-hidden="true" />} name={m('emailPassword')} on={methods.password} onText={m('set')} offText={m('notSet')} />
            <SignInMethod icon={<Icon icon="mdi:github" width="16" height="16" className={iconClass} aria-hidden="true" />} name="GitHub" on={methods.github} onText={m('linked')} offText={m('notLinked')}
              action={methods.github
                ? <Tooltip title={methods.password ? undefined : m('githubOnly')}>
                  <Button size="small" disabled={!methods.password} loading={githubBusy} onClick={() => confirmUnlinkGitHub()}>{m('unlink')}</Button>
                </Tooltip>
                : <Button size="small" loading={githubBusy} onClick={() => void linkGitHub()}>{m('linkGithub')}</Button>} />
          </dl>
        </div>}

        {needsPassword(methods) ? (
          <form onSubmit={e => void submitFirstPassword(e)} className="space-y-4 border-t border-[var(--at-line)] pt-5" aria-labelledby="set-password-heading" noValidate>
            <h4 id="set-password-heading" className="text-base font-semibold">{m('setPassword')}</h4>
            <p className="text-sm text-[var(--at-muted)]">
              {methods?.github ? m('githubNoPassword') : m('noPassword')}{' '}
              {m('setOneToo')}
            </p>
            {firstPasswordProblems.general && <Alert type="error" showIcon title={firstPasswordProblems.general} />}
            <PasswordField id="setpw-newPassword" text={m('newPassword')} autoComplete="new-password" value={firstPassword.newPassword} error={firstPasswordProblems.newPassword} rules
              onChange={value => setFirstPassword(p => ({ ...p, newPassword: value }))} />
            <PasswordField id="setpw-confirmNewPassword" text={m('repeatPassword')} autoComplete="new-password" value={firstPassword.confirmNewPassword} error={firstPasswordProblems.confirmNewPassword}
              onChange={value => setFirstPassword(p => ({ ...p, confirmNewPassword: value }))} />
            <Button type="primary" htmlType="submit" loading={settingPassword}>{m('setPasswordButton')}</Button>
            <p className="text-xs text-[var(--at-muted)]">
              {m.rich('orReset', { link: <Link key="r" to={forgotPasswordLink(user.email)} className={link}>{m('resetLink')}</Link> })}
            </p>
          </form>
        ) : (
          <div className="border-t border-[var(--at-line)] pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 id="password-heading" tabIndex={-1} className="text-base font-semibold outline-none"
                  ref={el => { if (el && focusChangeForm.current) { focusChangeForm.current = false; el.focus(); } }}>{m('password')}</h4>
                <p className="text-sm text-[var(--at-muted)]">{m('changeSignsOut')}</p>
              </div>
              {!changeOpen && <Button onClick={() => setChangeOpen(true)} aria-controls="change-password-form" aria-expanded={false}>{m('changePassword')}</Button>}
            </div>
            {changeOpen && <form id="change-password-form" onSubmit={e => void submitPassword(e)} className="mt-4 space-y-4" aria-labelledby="password-heading" noValidate>
              {!methods && <p className="text-xs text-[var(--at-muted)]">{m('githubCannotChange')}</p>}
              {passwordProblems.general && <Alert type="error" showIcon title={passwordProblems.general} />}
              {(['oldPassword', 'newPassword', 'confirmNewPassword'] as const).map(field => {
                const copy = { oldPassword: [m('currentPassword'), 'current-password'], newPassword: [m('newPassword'), 'new-password'], confirmNewPassword: [m('repeatPassword'), 'new-password'] }[field];
                return <PasswordField key={field} id={`pw-${field}`} text={copy[0]} autoComplete={copy[1]} value={passwords[field]} error={passwordProblems[field]} rules={field === 'newPassword'}
                  onChange={value => setPasswords(p => ({ ...p, [field]: value }))} />;
              })}
              <div className="flex gap-2">
                <Button type="primary" htmlType="submit" loading={changing}>{m('changePassword')}</Button>
                <Button disabled={changing} onClick={() => { setChangeOpen(false); setPasswords({ oldPassword: '', newPassword: '', confirmNewPassword: '' }); setPasswordProblems({}); }}>{m('cancel')}</Button>
              </div>
            </form>}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--at-line)] pt-5" role="group" aria-labelledby="sessions-heading">
          <div className="min-w-0">
            <h4 id="sessions-heading" className="text-base font-semibold">{m('signOutAll')}</h4>
            <p className="text-sm text-[var(--at-muted)]">{m('signOutAllHint')}</p>
          </div>
          <Button danger loading={signingOut} onClick={confirmSignOutEverywhere}>{m('signOutEverywhere')}</Button>
        </div>
      </section>
    </div>
  </FeaturePage>;
}
