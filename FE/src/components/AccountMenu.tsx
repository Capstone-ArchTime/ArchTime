import { Dropdown } from 'antd';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { roleHome } from '@/auth/permissions';
import { initials } from '@/features/profile-view';
import { useT } from '@/i18n';

export default function AccountMenu({ onNavigate }: { onNavigate: () => void }) {
  const { user, signOut } = useAuth();
  const t = useT();
  if (!user) return null;
  return (              <Dropdown
                trigger={['click']}
                placement="bottomRight"
                menu={{ items: [
                  { key: 'identity', label: <div className="max-w-60 py-1 normal-case"><p className="truncate font-semibold">{user.name}</p><p className="truncate text-xs text-slate-400">{user.email}</p></div>, disabled: true },
                  { type: 'divider' },
                  { key: 'my-work', label: <Link to="/my-work" onClick={() => onNavigate()}>{t('nav:/my-work')}</Link> },
                  { key: 'profile', label: <Link to="/profile" onClick={() => onNavigate()}>{t('nav:/profile')}</Link> },
                  { key: 'settings', label: <Link to="/settings" onClick={() => onNavigate()}>{t('nav:/settings')}</Link> },
                  { key: 'dashboard', label: <Link to={roleHome[user.role]} onClick={() => onNavigate()}>{t('nav:/dashboard')}</Link> },
                  { key: 'logout', label: t('common.signOut'), onClick: () => { onNavigate(); signOut(); } },
                ] }}
              >
                <button
                  type="button"
                  aria-label={t('layout.openAccountMenuFor', { name: user.name })}
                  title={user.name}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--at-fill)] text-sm font-semibold text-[var(--at-on-fill)] transition-colors hover:bg-[var(--at-fill-hover)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--at-accent)]"
                >
                  <span aria-hidden="true">{initials(user.name)}</span>
                </button>
              </Dropdown>);
}
