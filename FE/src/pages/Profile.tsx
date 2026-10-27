import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App, Button, Input } from 'antd';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import PasswordRequirements from '@/components/PasswordRequirements';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { setSignInNotice } from '@/auth/session';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { changePassword, signOutEverywhere, updateProfile } from '@/features/profile-api';
import {
  USERNAME_HINT, accountTypeLabel, buildProfilePatch, checkName, checkPasswordForm, checkUsername,
} from '@/features/profile-validation';
import type { PasswordForm, PasswordProblems } from '@/features/profile-validation';

const label = 'mb-1 block text-xs text-[#94a3b8]';
const problem = (id: string, text?: string) => (text ? <p id={id} role="alert" className="mt-1 text-xs text-red-400">{text}</p> : null);

/** The signed-in person's own account: name and username, password, and signing out everywhere. */
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

  const patch = user ? buildProfilePatch({ name: user.name, username: user.username }, form) : null;
  useUnsavedChanges(!!patch);
  if (!user) return null;

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

  return <FeaturePage title="My profile" description="Your account details and how you sign in." demo={false}>
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
          <Input id="profile-type" value={accountTypeLabel(user.role)} readOnly />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="primary" htmlType="submit" loading={saving} disabled={!patch}>Save changes</Button>
        <Button disabled={!patch || saving} onClick={() => { setForm({ name: user.name, username: user.username ?? '' }); setFormProblems({}); }}>Discard changes</Button>
      </div>
    </form>

    <form onSubmit={e => void submitPassword(e)} className={`${featurePanel} space-y-4`} aria-labelledby="password-heading" noValidate>
      <h3 id="password-heading" className="text-lg font-semibold">Change password</h3>
            <p className="text-sm text-[#94a3b8]">Changing it signs you out of every device, this one included. If you signed up with GitHub and never set a password, this form cannot change it.</p>
      {passwordProblems.general && <Alert type="error" showIcon title={passwordProblems.general} />}
      {(['oldPassword', 'newPassword', 'confirmNewPassword'] as const).map(field => {
        const copy = { oldPassword: ['Current password', 'current-password'], newPassword: ['New password', 'off'], confirmNewPassword: ['Repeat the new password', 'off'] }[field];
        return <div key={field}>
          <label htmlFor={`pw-${field}`} className={label}>{copy[0]}</label>
          <Input.Password id={`pw-${field}`} value={passwords[field]} autoComplete={copy[1]} status={passwordProblems[field] ? 'error' : undefined} aria-describedby={passwordProblems[field] ? `pw-${field}-problem` : undefined}
            onChange={e => setPasswords(p => ({ ...p, [field]: e.target.value }))} />
          {problem(`pw-${field}-problem`, passwordProblems[field])}
          {field === 'newPassword' && <PasswordRequirements id="pw-newPassword-rules" password={passwords.newPassword} />}
        </div>;
      })}
      <Button type="primary" htmlType="submit" loading={changing}>Change password</Button>
    </form>

    <section className={`${featurePanel} space-y-3`} aria-labelledby="sessions-heading">
      <h3 id="sessions-heading" className="text-lg font-semibold">Sign out of all devices</h3>
      <p className="text-sm text-[#94a3b8]">Use this if you lost a device or think someone else has your session. Every session of your account ends, including this one.</p>
      <Button danger loading={signingOut} onClick={confirmSignOutEverywhere}>Sign out of all devices</Button>
    </section>
  </FeaturePage>;
}
