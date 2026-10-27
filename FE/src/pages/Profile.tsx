import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, App, Button, Input, Progress, Skeleton, Tag } from 'antd';
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
import { changePassword, countProjects, setPassword, signOutEverywhere, updateProfile } from '@/features/profile-api';
import {
  USERNAME_HINT, accountTypeLabel, buildProfilePatch, checkName, checkPasswordForm, checkUsername,
} from '@/features/profile-validation';
import type { PasswordForm, PasswordProblems } from '@/features/profile-validation';
import {
  checkSetPasswordForm, forgotPasswordLink, initials, memberSince, needsPassword, organizationOverview, overviewTiles, parseSignInMethods,
  pathToContinue, plural, workspaceOverview,
} from '@/features/profile-view';
import type { SetPasswordForm, SetPasswordProblems } from '@/features/profile-view';

const label = 'mb-1 block text-xs text-[#94a3b8]';
const link = 'text-[#93c5fd] hover:text-[#bfdbfe]';
const problem = (id: string, text?: string) => (text ? <p id={id} role="alert" className="mt-1 text-xs text-red-400">{text}</p> : null);

type Load<T> = { data: T | null; error: string | null; retry: () => void };

/** Loads one tile's numbers on its own, so one failing request leaves the rest of the page alone. Nothing loads while disabled. */
function useLoad<T>(fetcher: (signal: AbortSignal) => Promise<T>, what: string, enabled: boolean): Load<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetcher(controller.signal)
      .then(setData)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : `Could not load ${what}.`); });
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
  if (!totals || typeof totals.runs !== 'number') throw new Error('The server returned invalid usage totals.');
  return totals;
};

/** A summary that links to the page with the details; it shows its own loading and error state. */
function Tile<T>({ icon, title, load, children }: { icon: ReactNode; title: string; load: Load<T>; children: (data: T) => ReactNode }) {
  return <article aria-label={title} className={`${featurePanel} flex flex-col gap-2`}>
    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">{icon}{title}</h3>
    {load.error ? <div className="space-y-2"><p role="alert" className="text-sm text-red-400">{load.error}</p><Button size="small" onClick={load.retry}>Retry</Button></div>
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
    {rules && <PasswordRequirements id={`${id}-rules`} password={value} />}
  </div>;
}

function SignInMethod({ icon, name, on, onText, offText }: { icon: ReactNode; name: string; on: boolean; onText: string; offText: string }) {
  return <div className="flex items-center justify-between gap-3 px-3 py-2">
    <dt className="flex items-center gap-2 text-sm">{icon}{name}</dt>
    <dd><Tag color={on ? 'green' : undefined}>{on ? onText : offText}</Tag></dd>
  </div>;
}

const noPasswords: SetPasswordForm = { newPassword: '', confirmNewPassword: '' };

/** The signed-in person's own account: who they are, what they are part of, their details, and how they sign in. */
export default function Profile() {
  const { user, updateUser, signOut } = useAuth();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: user?.name ?? '', username: user?.username ?? '' });
  const [formProblems, setFormProblems] = useState<{ name?: string; username?: string; general?: string }>({});
  const [saving, setSaving] = useState(false);

  const [passwords, setPasswords] = useState<PasswordForm>({ oldPassword: '', newPassword: '', confirmNewPassword: '' });
  const [passwordProblems, setPasswordProblems] = useState<PasswordProblems & { general?: string }>({});
  const [changing, setChanging] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [firstPassword, setFirstPassword] = useState<SetPasswordForm>(noPasswords);
  const [firstPasswordProblems, setFirstPasswordProblems] = useState<SetPasswordProblems & { general?: string }>({});
  const [settingPassword, setSettingPassword] = useState(false);
  // The set form (and the button just pressed) goes away once a password exists; focus then moves to the change form's heading.
  const focusChangeForm = useRef(false);

  const tiles = user ? overviewTiles(user.role) : [];
  const organizations = useLoad(listOrganizations, 'your organizations', tiles.includes('organizations'));
  const workspaces = useLoad(loadWorkspaces, 'your workspaces', tiles.includes('workspaces'));
  const paths = useLoad(getMyPaths, 'your learning paths', tiles.includes('learning'));
  const aiTotals = useLoad(loadAiTotals, 'your AI usage', tiles.includes('ai'));

  const patch = user ? buildProfilePatch({ name: user.name, username: user.username }, form) : null;
  useUnsavedChanges(!!patch);
  if (!user) return null;

  const role = user.role;
  const methods = parseSignInMethods(user.signInMethods);
  const since = memberSince(user.createdAt);
  const canOpen = (to: string) => canAccess(role, to);

  /** Ends this session here and goes to sign-in, which can say why (the page itself may be gone by the time anything is read). */
  const leave = (notice?: string) => { if (notice) setSignInNotice(notice); signOut(); navigate('/login', { replace: true }); };

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!patch || saving) return;
    const found = { name: patch.name !== undefined ? checkName(form.name) ?? undefined : undefined, username: patch.username !== undefined ? checkUsername(form.username) ?? undefined : undefined };
    if (found.name || found.username) { setFormProblems(found); return; }
    setFormProblems({});
    setSaving(true);
    try {
      const saved = await updateProfile(patch);
      updateUser(saved);
      setForm({ name: saved.name, username: saved.username ?? '' });
      message.success('Profile updated.');
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : 'Could not save your profile. Please retry.';
      if (cause instanceof ApiError && cause.status === 409) setFormProblems({ username: text });
      else if (cause instanceof ApiError && cause.status === 400 && /username/i.test(text)) setFormProblems({ username: text });
      else if (cause instanceof ApiError && cause.status === 400 && /name/i.test(text)) setFormProblems({ name: text });
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
      leave('Password changed. For your security you were signed out of all devices. Sign in again with your new password.');
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : 'Could not change your password. Please retry.';
      if (cause instanceof ApiError && cause.status === 401) leave();
      else if (cause instanceof ApiError && /old password/i.test(text)) setPasswordProblems({ oldPassword: text });
      else if (cause instanceof ApiError && cause.status === 400 && /^password /i.test(text)) setPasswordProblems({ newPassword: text });
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
      message.success('Password set. You can now also sign in with your email and this password.');
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : 'Could not set your password. Please retry.';
      if (cause instanceof ApiError && cause.status === 401) leave();
      // A password was set meanwhile (another tab, or the reset page): offer the change form instead.
      else if (cause instanceof ApiError && cause.status === 409) { setFirstPassword(noPasswords); focusChangeForm.current = true; updateUser({ signInMethods: { password: true, github } }); message.info(text); }
      else if (cause instanceof ApiError && cause.status === 400 && /^password /i.test(text)) setFirstPasswordProblems({ newPassword: text });
      else if (cause instanceof ApiError && cause.status === 400 && /do not match/i.test(text)) setFirstPasswordProblems({ confirmNewPassword: text });
      else setFirstPasswordProblems({ general: text });
    } finally {
      setSettingPassword(false);
    }
  }

  function confirmSignOutEverywhere() {
    modal.confirm({
      title: 'Sign out of all devices?',
      content: 'This ends every session of your account, including this one. You will need to sign in again everywhere.',
      okText: 'Sign out everywhere', okButtonProps: { danger: true },
      onOk: async () => {
        setSigningOut(true);
        try {
          await signOutEverywhere();
          leave('You were signed out of all devices.');
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) { leave(); return; }
          message.error(cause instanceof Error ? cause.message : 'Could not sign you out of all devices. Please retry.');
        } finally {
          setSigningOut(false);
        }
      },
    });
  }

  const iconClass = 'text-[#93c5fd]';

  return <FeaturePage title="My profile" description="Who you are in ArchTime, what you are part of, and how you sign in." demo={false}>
    <section aria-label="Your account" className={`${featurePanel} flex flex-wrap items-center gap-5`}>
      <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#1d4ed8] text-xl font-semibold text-white">{initials(user.name)}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-2xl font-bold break-words">{user.name}</h3>
          <Tag color={role === 'system-administrator' ? 'gold' : 'blue'}>{accountTypeLabel(role)}</Tag>
        </div>
        {user.username && <p className="text-sm text-slate-300">@{user.username}</p>}
        <p className="text-sm text-[#94a3b8] break-all">{user.email}</p>
        {since && <p className="flex items-center gap-1.5 text-xs text-[#94a3b8]"><CalendarDays size={14} aria-hidden="true" />{since}</p>}
      </div>
    </section>

    {tiles.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Overview" role="group">
      {tiles.includes('organizations') && <Tile icon={<Building2 size={16} className={iconClass} />} title="Organizations" load={organizations}>{orgs => {
        const o = organizationOverview(orgs);
        return <>
          <p className="text-2xl font-bold">{o.count}</p>
          <p className="text-xs text-[#94a3b8]">{o.count ? o.ownedText : 'You do not belong to an organization yet.'}</p>
          {o.shown.length > 0 && <ul className="flex flex-wrap gap-2">{o.shown.map(org => {
            const to = `/organizations/${encodeURIComponent(org.id)}`;
            const chip = <><span className="max-w-40 truncate">{org.name}</span><span className="text-[#94a3b8]">{ORGANIZATION_ROLE_LABELS[org.myRole]}</span></>;
            const chipClass = 'inline-flex max-w-full items-center gap-1.5 rounded border border-[#242527] px-2 py-1 text-xs text-slate-200';
            return <li key={org.id} className="max-w-full">{canOpen(to) ? <Link to={to} className={`${chipClass} hover:border-[#3b82f6] hover:text-[#bfdbfe]`}>{chip}</Link> : <span className={chipClass}>{chip}</span>}</li>;
          })}</ul>}
          <TileLinks role={role} links={[['/organizations', !o.count ? 'Start one' : o.more ? `See all (${o.more} more)` : 'See all']]} />
        </>;
      }}</Tile>}

      {tiles.includes('workspaces') && <Tile icon={<FolderKanban size={16} className={iconClass} />} title="Workspaces" load={workspaces}>{w => <>
        <p className="text-2xl font-bold">{w.all}</p>
        <p className="text-xs text-[#94a3b8]">{workspaceOverview(w)}</p>
        <TileLinks role={role} links={[['/projects', 'Open workspaces'], ['/my-work', 'My work']]} />
      </>}</Tile>}

      {tiles.includes('learning') && <Tile icon={<GraduationCap size={16} className={iconClass} />} title="Learning" load={paths}>{list => {
        if (!list.length) return <>
          <p className="text-sm text-[#94a3b8]">No learning paths given to you yet.</p>
          <TileLinks role={role} links={[['/learning', 'Learning']]} />
        </>;
        const s = summarizeLearning(list);
        const next = pathToContinue(list);
        const to = next ? `/learning/${encodeURIComponent(next.projectId)}/${encodeURIComponent(next.pathId)}` : null;
        return <>
          <p className="text-2xl font-bold">{s.percent}%</p>
          <Progress percent={s.percent} showInfo={false} size="small" aria-label="Steps done across your learning paths" />
          <p className="text-xs text-[#94a3b8]">{s.finished} of {plural(s.assigned, 'path', 'paths')} finished</p>
          {next && to && canOpen(to) && <Link to={to} className={`${link} text-sm break-words`}>Continue: {next.title}</Link>}
          <TileLinks role={role} links={[['/learning', 'See all']]} />
        </>;
      }}</Tile>}

      {tiles.includes('ai') && <Tile icon={<Sparkles size={16} className={iconClass} />} title="AI usage" load={aiTotals}>{t => <>
        <p className="text-2xl font-bold">{plural(t.runs, 'run', 'runs')}</p>
        <p className="text-xs text-[#94a3b8]">{formatTokens(t.totalTokens)} tokens · {formatCost(t.cost)} · all time</p>
        <TileLinks role={role} links={[['/ai-usage', 'See details']]} />
      </>}</Tile>}
    </div>}

    <div className="grid items-start gap-6 lg:grid-cols-2">
      <form onSubmit={e => void saveProfile(e)} className={`${featurePanel} space-y-4`} aria-labelledby="profile-heading" noValidate>
        <h3 id="profile-heading" className="text-lg font-semibold">Personal information</h3>
        {formProblems.general && <Alert type="error" showIcon title={formProblems.general} />}
        <div>
          <label htmlFor="profile-name" className={label}>Name</label>
          <Input id="profile-name" value={form.name} maxLength={100} autoComplete="name" status={formProblems.name ? 'error' : undefined} aria-describedby={formProblems.name ? 'profile-name-problem' : undefined}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          {problem('profile-name-problem', formProblems.name)}
        </div>
        <div>
          <label htmlFor="profile-username" className={label}>Username (optional)</label>
          <Input id="profile-username" value={form.username} maxLength={40} autoComplete="username" status={formProblems.username ? 'error' : undefined}
            aria-describedby={formProblems.username ? 'profile-username-problem' : 'profile-username-hint'} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
          <p id="profile-username-hint" className="mt-1 text-xs text-[#94a3b8]">You can sign in with it instead of your email. {USERNAME_HINT}</p>
          {problem('profile-username-problem', formProblems.username)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="profile-email" className={label}>Email</label>
            <Input id="profile-email" value={user.email} readOnly aria-describedby="profile-email-hint" />
            <p id="profile-email-hint" className="mt-1 text-xs text-[#94a3b8]">The email cannot be changed here.</p>
          </div>
          <div>
            <label htmlFor="profile-type" className={label}>Account type</label>
            <Input id="profile-type" value={accountTypeLabel(role)} readOnly />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="primary" htmlType="submit" loading={saving} disabled={!patch}>Save changes</Button>
          <Button disabled={!patch || saving} onClick={() => { setForm({ name: user.name, username: user.username ?? '' }); setFormProblems({}); }}>Discard changes</Button>
        </div>
      </form>

      <section className={`${featurePanel} space-y-5`} aria-labelledby="security-heading">
        <h3 id="security-heading" className="text-lg font-semibold">Security</h3>

        {methods && <div className="space-y-2">
          <h4 id="methods-heading" className="text-sm font-semibold">How you sign in</h4>
          <dl aria-labelledby="methods-heading" className="divide-y divide-[#242527] rounded border border-[#242527]">
            <SignInMethod icon={<KeyRound size={16} className={iconClass} aria-hidden="true" />} name="Email and password" on={methods.password} onText="Set" offText="Not set" />
            <SignInMethod icon={<Icon icon="mdi:github" width="16" height="16" className={iconClass} aria-hidden="true" />} name="GitHub" on={methods.github} onText="Linked" offText="Not linked" />
          </dl>
        </div>}

        {needsPassword(methods) ? (
          <form onSubmit={e => void submitFirstPassword(e)} className="space-y-4 border-t border-[#242527] pt-5" aria-labelledby="set-password-heading" noValidate>
            <h4 id="set-password-heading" className="text-base font-semibold">Set a password</h4>
            <p className="text-sm text-[#94a3b8]">
              {methods?.github ? 'You sign in with GitHub and your account has no password yet.' : 'Your account has no password yet.'}{' '}
              Set one to also sign in with your email and a password. You stay signed in.
            </p>
            {firstPasswordProblems.general && <Alert type="error" showIcon title={firstPasswordProblems.general} />}
            <PasswordField id="setpw-newPassword" text="New password" autoComplete="off" value={firstPassword.newPassword} error={firstPasswordProblems.newPassword} rules
              onChange={value => setFirstPassword(p => ({ ...p, newPassword: value }))} />
            <PasswordField id="setpw-confirmNewPassword" text="Repeat the new password" autoComplete="off" value={firstPassword.confirmNewPassword} error={firstPasswordProblems.confirmNewPassword}
              onChange={value => setFirstPassword(p => ({ ...p, confirmNewPassword: value }))} />
            <Button type="primary" htmlType="submit" loading={settingPassword}>Set password</Button>
            <p className="text-xs text-[#94a3b8]">
              Or <Link to={forgotPasswordLink(user.email)} className={link}>get a reset code by email</Link> and choose a password there. Doing it that way signs you out of all devices.
            </p>
          </form>
        ) : (
          <form onSubmit={e => void submitPassword(e)} className="space-y-4 border-t border-[#242527] pt-5" aria-labelledby="password-heading" noValidate>
            <h4 id="password-heading" tabIndex={-1} className="text-base font-semibold outline-none"
              ref={el => { if (el && focusChangeForm.current) { focusChangeForm.current = false; el.focus(); } }}>Change password</h4>
            <p className="text-sm text-[#94a3b8]">
              Changing it signs you out of every device, this one included.
              {!methods && ' If you signed up with GitHub and never set a password, this form cannot change it.'}
            </p>
            {passwordProblems.general && <Alert type="error" showIcon title={passwordProblems.general} />}
            {(['oldPassword', 'newPassword', 'confirmNewPassword'] as const).map(field => {
              const copy = { oldPassword: ['Current password', 'current-password'], newPassword: ['New password', 'off'], confirmNewPassword: ['Repeat the new password', 'off'] }[field];
              return <PasswordField key={field} id={`pw-${field}`} text={copy[0]} autoComplete={copy[1]} value={passwords[field]} error={passwordProblems[field]} rules={field === 'newPassword'}
                onChange={value => setPasswords(p => ({ ...p, [field]: value }))} />;
            })}
            <Button type="primary" htmlType="submit" loading={changing}>Change password</Button>
          </form>
        )}

        <div className="space-y-3 border-t border-[#242527] pt-5" role="group" aria-labelledby="sessions-heading">
          <h4 id="sessions-heading" className="text-base font-semibold">Sign out of all devices</h4>
          <p className="text-sm text-[#94a3b8]">Use this if you lost a device or think someone else has your session. Every session of your account ends, including this one.</p>
          <Button danger loading={signingOut} onClick={confirmSignOutEverywhere}>Sign out of all devices</Button>
        </div>
      </section>
    </div>
  </FeaturePage>;
}
