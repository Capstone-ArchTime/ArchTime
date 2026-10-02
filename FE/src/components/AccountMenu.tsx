import { Dropdown } from 'antd';
import { UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { roleHome } from '@/auth/permissions';
export default function AccountMenu({ onNavigate }: { onNavigate: () => void }) {
  const { user, signOut } = useAuth();
  if (!user) return null;
  return (              <Dropdown
                trigger={['click']}
                placement="bottomRight"
                menu={{ items: [
                  { key: 'identity', label: <div className="max-w-60 py-1 normal-case"><p className="truncate font-semibold">{user.name}</p><p className="truncate text-xs text-slate-400">{user.email}</p></div>, disabled: true },
                  { type: 'divider' },
                  { key: 'dashboard', label: <Link to={roleHome[user.role]} onClick={() => onNavigate()}>Dashboard</Link> },
                  { key: 'logout', label: 'Sign out', onClick: () => { onNavigate(); signOut(); } },
                ] }}
              >
                <button
                  type="button"
                  aria-label={`Open account menu for ${user.name}`}
                  title={user.name}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#38bdf8]/40 bg-[#11161b] text-[#38bdf8] transition-colors hover:border-[#00f0ff] hover:text-[#00f0ff] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#38bdf8]"
                >
                  <UserRound size={20} aria-hidden="true" />
                </button>
              </Dropdown>);
}
