import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { LogIn, ShieldAlert, UserCog, Trash2, KeyRound, Filter } from 'lucide-react';

const fontFamily = {
  mono: '"JetBrains Mono", monospace',
};

type EventType = 'login' | 'role_change' | 'security' | 'deletion' | 'key_rotation';

const eventMeta: Record<EventType, { label: string; color: string; icon: typeof LogIn }> = {
  login: { label: 'LOGIN', color: '#38bdf8', icon: LogIn },
  role_change: { label: 'ROLE CHANGE', color: '#ffb03a', icon: UserCog },
  security: { label: 'SECURITY', color: '#ef4444', icon: ShieldAlert },
  deletion: { label: 'DELETION', color: '#ef4444', icon: Trash2 },
  key_rotation: { label: 'KEY ROTATION', color: '#00f0ff', icon: KeyRound },
};

const mockAuditEvents: { type: EventType; actor: string; description: string; ts: string; ip: string }[] = [
  { type: 'login', actor: 'd.hoang', description: 'Signed in successfully', ts: '2026-09-21 14:32:08', ip: '10.20.4.11' },
  { type: 'security', actor: 'unknown', description: '5 failed login attempts for account k.pham', ts: '2026-09-21 13:58:41', ip: '203.0.113.44' },
  { type: 'role_change', actor: 'd.hoang', description: 'Changed a.le role: developer-analyst → project-maintainer', ts: '2026-09-21 11:20:15', ip: '10.20.4.11' },
  { type: 'key_rotation', actor: 'd.hoang', description: 'Rotated Pipeline API Key', ts: '2026-09-20 09:05:33', ip: '10.20.4.11' },
  { type: 'deletion', actor: 'd.hoang', description: 'Removed repository connection: legacy-billing', ts: '2026-09-19 16:44:02', ip: '10.20.4.11' },
  { type: 'login', actor: 'a.le', description: 'Signed in successfully', ts: '2026-09-19 09:12:50', ip: '10.20.4.28' },
  { type: 'role_change', actor: 'd.hoang', description: 'Suspended account: k.pham', ts: '2026-09-18 17:30:09', ip: '10.20.4.11' },
];

const filterOptions: { key: 'all' | EventType; label: string }[] = [
  { key: 'all', label: 'All Events' },
  { key: 'login', label: 'Login' },
  { key: 'role_change', label: 'Role Change' },
  { key: 'security', label: 'Security' },
  { key: 'deletion', label: 'Deletion' },
  { key: 'key_rotation', label: 'Key Rotation' },
];

const AuditLog: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState<'all' | EventType>('all');

  const filtered = mockAuditEvents.filter((e) => activeFilter === 'all' || e.type === activeFilter);

  return (
    <DashboardLayout>
      <div className="max-w-[1100px] mx-auto space-y-8">

        {/* HEADER */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Audit Log</h2>
          <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
            Security-relevant events across the ArchTime platform: sign-ins, role changes, and administrative actions.
          </p>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#222c37] to-transparent mt-8"></div>
        </div>

        {/* FILTERS */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-[#5f636b] mr-1" />
          {filterOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setActiveFilter(opt.key)}
              className={`h-8 px-3 text-[10px] font-bold uppercase tracking-widest border transition-colors ${
                activeFilter === opt.key
                  ? 'bg-[#38bdf8]/10 border-[#38bdf8]/40 text-[#38bdf8]'
                  : 'bg-[#161d24] border-[#222c37] text-[#94a3b8] hover:text-[#f4f4f6]'
              }`}
              style={{ fontFamily: fontFamily.mono }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* EVENT TIMELINE */}
        <div className="relative pl-6 space-y-5">
          <div className="absolute left-[3px] top-1 bottom-1 w-px bg-[#222c37]"></div>
          {filtered.map((event, i) => {
            const meta = eventMeta[event.type];
            const EventIcon = meta.icon;
            return (
              <div key={i} className="relative">
                <div
                  className="absolute -left-6 top-1 w-[7px] h-[7px] rounded-full"
                  style={{ backgroundColor: meta.color, boxShadow: `0 0 6px ${meta.color}` }}
                ></div>
                <div className="bg-[#11161b] border border-[#222c37] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <EventIcon size={12} style={{ color: meta.color }} />
                    <span className="text-[9px] font-bold uppercase tracking-widest" style={{ fontFamily: fontFamily.mono, color: meta.color }}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-[#5f636b]" style={{ fontFamily: fontFamily.mono }}>{event.ts}</span>
                  </div>
                  <p className="text-sm text-[#f4f4f6] mb-1">{event.description}</p>
                  <div className="text-xs text-[#5f636b]" style={{ fontFamily: fontFamily.mono }}>
                    actor: {event.actor} &middot; ip: {event.ip}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-[#5f636b] pl-2">No events match this filter.</p>
          )}
        </div>

        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
};

export default AuditLog;
