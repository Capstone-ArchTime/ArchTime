import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Search, UserPlus, Shield, Code2, ClipboardCheck, MoreVertical } from 'lucide-react';

const fontFamily = {
  mono: '"JetBrains Mono", monospace',
};

type Role = 'developer-analyst' | 'project-maintainer' | 'system-administrator';
type AccountStatus = 'active' | 'suspended' | 'invited';

const roleMeta: Record<Role, { label: string; color: string; icon: typeof Code2 }> = {
  'developer-analyst': { label: 'Developer / Analyst', color: '#38bdf8', icon: Code2 },
  'project-maintainer': { label: 'Project Maintainer', color: '#ffb03a', icon: ClipboardCheck },
  'system-administrator': { label: 'System Administrator', color: '#00f0ff', icon: Shield },
};

const statusMeta: Record<AccountStatus, { label: string; color: string }> = {
  active: { label: 'ACTIVE', color: '#22c55e' },
  suspended: { label: 'SUSPENDED', color: '#ef4444' },
  invited: { label: 'INVITED', color: '#94a3b8' },
};

const mockUsers: { name: string; email: string; role: Role; status: AccountStatus; lastActive: string }[] = [
  { name: 'j.tran', email: 'j.tran@archtime.io', role: 'developer-analyst', status: 'active', lastActive: '2 hours ago' },
  { name: 'm.nguyen', email: 'm.nguyen@archtime.io', role: 'developer-analyst', status: 'active', lastActive: 'Yesterday' },
  { name: 'k.pham', email: 'k.pham@archtime.io', role: 'developer-analyst', status: 'suspended', lastActive: '9 days ago' },
  { name: 'a.le', email: 'a.le@archtime.io', role: 'project-maintainer', status: 'active', lastActive: '5 hours ago' },
  { name: 'h.vo', email: 'h.vo@archtime.io', role: 'project-maintainer', status: 'active', lastActive: '1 hour ago' },
  { name: 'd.hoang', email: 'd.hoang@archtime.io', role: 'system-administrator', status: 'active', lastActive: 'Just now' },
  { name: 't.bui', email: 't.bui@archtime.io', role: 'developer-analyst', status: 'invited', lastActive: 'Never' },
];

const UserManagement: React.FC = () => {
  const [query, setQuery] = useState('');

  const filtered = mockUsers.filter(
    (u) => u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-8">

        {/* HEADER */}
        <div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">User Management</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Manage accounts, roles, and access across the ArchTime platform.
              </p>
            </div>
            <button className="shrink-0 h-10 px-5 bg-[#38bdf8] hover:bg-[#38bdf8]/90 text-[#080b0e] font-bold text-xs transition-colors flex items-center gap-2" style={{ fontFamily: fontFamily.mono }}>
              <UserPlus size={16} />
              INVITE USER
            </button>
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#222c37] to-transparent mt-8"></div>
        </div>

        {/* ROLE SUMMARY */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.keys(roleMeta) as Role[]).map((role) => {
            const meta = roleMeta[role];
            const RoleIcon = meta.icon;
            const count = mockUsers.filter((u) => u.role === role).length;
            return (
              <div key={role} className="bg-[#161d24] border border-[#222c37] p-5 flex items-center gap-4">
                <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}1A`, border: `1px solid ${meta.color}33` }}>
                  <RoleIcon size={18} style={{ color: meta.color }} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#f4f4f6]" style={{ fontFamily: fontFamily.mono }}>{count}</div>
                  <div className="text-xs text-[#94a3b8]">{meta.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* SEARCH */}
        <div className="relative w-full max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f636b]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full h-9 bg-[#11161b] border border-[#222c37] pl-9 pr-4 text-xs text-[#f4f4f6] placeholder:text-[#5f636b] focus:outline-none focus:border-[#38bdf8]/50 transition-colors"
            style={{ fontFamily: fontFamily.mono }}
          />
        </div>

        {/* USER TABLE */}
        <div className="bg-[#11161b] border border-[#222c37] overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#161d24] border-b border-[#222c37] text-[10px] text-[#94a3b8] uppercase tracking-wider" style={{ fontFamily: fontFamily.mono }}>
              <tr>
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Last Active</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222c37]">
              {filtered.map((user) => {
                const role = roleMeta[user.role];
                const status = statusMeta[user.status];
                return (
                  <tr key={user.email} className="hover:bg-[#161d24]/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#161d24] border border-[#222c37] flex items-center justify-center text-[10px] font-bold text-[#94a3b8]" style={{ fontFamily: fontFamily.mono }}>
                          {user.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-[#f4f4f6] font-medium text-sm">{user.name}</div>
                          <div className="text-[10px] text-[#5f636b]" style={{ fontFamily: fontFamily.mono }}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold border"
                        style={{ fontFamily: fontFamily.mono, color: role.color, borderColor: `${role.color}33`, backgroundColor: `${role.color}1A` }}
                      >
                        {role.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold" style={{ fontFamily: fontFamily.mono, color: status.color }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: status.color }}></div>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[#94a3b8] text-xs" style={{ fontFamily: fontFamily.mono }}>{user.lastActive}</td>
                    <td className="px-5 py-4 text-right">
                      <button className="text-[#5f636b] hover:text-[#f4f4f6] transition-colors">
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
};

export default UserManagement;
