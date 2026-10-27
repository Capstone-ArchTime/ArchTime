import { Dropdown } from 'antd';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { roleHome } from '@/auth/permissions';
import { initials } from '@/features/profile-view';
export default function AccountMenu({ onNavigate }: { onNavigate: () => void }) {
  const { user, signOut } = useAuth();
  if (!user) return null;
  return (              <Dropdown
                trigger={['click']}
                placement="bottomRight"
                menu={{ items: [
                  { key: 'identity', label: <div className="max-w-60 py-1 normal-case"><p className="truncate font-semibold">{user.name}</p><p className="truncate text-xs text-slate-400">{user.email}</p></div>, disabled: true },
                  { type: 'divider' },
                  { key: 'my-work', label: <Link to="/my-work" onClick={() => onNavigate()}>My work</Link> },
                  { key: 'profile', label: <Link to="/profile" onClick={() => onNavigate()}>My profile</Link> },
                  { key: 'dashboard', label: <Link to={roleHome[user.role]} onClick={() => onNavigate()}>Dashboard</Link> },
                  { key: 'logout', label: 'Sign out', onClick: () => { onNavigate(); signOut(); } },
                ] }}
              >
                <button
                  type="button"
                  aria-label={`Open account menu for ${user.name}`}
                  title={user.name}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1d4ed8] text-sm font-semibold text-white transition-colors hover:bg-[#1e40af] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3b82f6]"
                >
                  <span aria-hidden="true">{initials(user.name)}</span>
                </button>
              </Dropdown>);
}
