import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { CheckCircle2, XCircle, Clock, Filter, GitCommit } from 'lucide-react';

const fontFamily = {
  mono: '"JetBrains Mono", monospace',
};

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

const statusMeta: Record<ApprovalStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'PENDING', color: '#ffb03a', icon: Clock },
  approved: { label: 'APPROVED', color: '#22c55e', icon: CheckCircle2 },
  rejected: { label: 'REJECTED', color: '#ef4444', icon: XCircle },
};

const mockApprovals: {
  status: ApprovalStatus;
  title: string;
  repo: string;
  commit: string;
  requestedBy: string;
  ago: string;
  filesChanged: number;
  dependenciesAdded: number;
  dependenciesRemoved: number;
}[] = [
  {
    status: 'pending',
    title: 'Extract notification-service from core-monolith',
    repo: 'ecomm-core',
    commit: 'd82f91a',
    requestedBy: 'j.tran',
    ago: '2 hours ago',
    filesChanged: 12,
    dependenciesAdded: 3,
    dependenciesRemoved: 1,
  },
  {
    status: 'pending',
    title: 'Reverse dependency: catalog-svc → pricing-svc',
    repo: 'catalog-service',
    commit: '8af31c2',
    requestedBy: 'm.nguyen',
    ago: 'Yesterday',
    filesChanged: 5,
    dependenciesAdded: 1,
    dependenciesRemoved: 1,
  },
  {
    status: 'pending',
    title: 'Introduce shared event-bus for settlement-core and order-service',
    repo: 'settlement-core',
    commit: 'f9b02e4',
    requestedBy: 'k.pham',
    ago: '2 days ago',
    filesChanged: 18,
    dependenciesAdded: 5,
    dependenciesRemoved: 0,
  },
  {
    status: 'approved',
    title: 'Split payment-gateway into auth and settlement modules',
    repo: 'payment-service',
    commit: 'c4199be',
    requestedBy: 'k.pham',
    ago: '2 days ago',
    filesChanged: 24,
    dependenciesAdded: 6,
    dependenciesRemoved: 2,
  },
  {
    status: 'rejected',
    title: 'Merge legacy-job into settlement-core',
    repo: 'settlement-core',
    commit: 'a028fa1',
    requestedBy: 'k.pham',
    ago: '3 days ago',
    filesChanged: 9,
    dependenciesAdded: 0,
    dependenciesRemoved: 4,
  },
];

const filterOptions: { key: 'all' | ApprovalStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const ApprovalQueue: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState<'all' | ApprovalStatus>('all');

  const filtered = mockApprovals.filter((a) => activeFilter === 'all' || a.status === activeFilter);
  const pendingCount = mockApprovals.filter((a) => a.status === 'pending').length;

  return (
    <DashboardLayout>
      <div className="max-w-[1100px] mx-auto space-y-8">

        {/* HEADER */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Approval Queue</h2>
          <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
            Review architectural changes proposed across the projects you maintain
            {pendingCount > 0 && (
              <> &mdash; <span className="text-[#ffb03a] font-semibold">{pendingCount} awaiting your review</span></>
            )}.
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

        {/* LIST */}
        <div className="space-y-3">
          {filtered.map((item) => {
            const meta = statusMeta[item.status];
            const StatusIcon = meta.icon;
            return (
              <div key={item.commit} className="bg-[#11161b] border border-[#222c37] p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2 py-1 border"
                        style={{ fontFamily: fontFamily.mono, color: meta.color, borderColor: `${meta.color}33`, backgroundColor: `${meta.color}1A` }}
                      >
                        <StatusIcon size={11} />
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-[#5f636b]" style={{ fontFamily: fontFamily.mono }}>{item.ago}</span>
                    </div>
                    <h4 className="text-[#f4f4f6] font-bold text-sm mb-2">{item.title}</h4>
                    <div className="flex items-center gap-2 text-xs text-[#5f636b]" style={{ fontFamily: fontFamily.mono }}>
                      <GitCommit size={12} />
                      <span>{item.repo}</span>
                      <span>&middot;</span>
                      <span>{item.commit}</span>
                      <span>&middot;</span>
                      <span>requested by {item.requestedBy}</span>
                    </div>
                  </div>
                  {item.status === 'pending' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button className="h-8 px-3 bg-[#161d24] border border-[#222c37] hover:border-[#ef4444]/50 text-[#ef4444] text-[10px] font-bold transition-colors" style={{ fontFamily: fontFamily.mono }}>
                        REJECT
                      </button>
                      <button className="h-8 px-3 bg-[#22c55e]/10 border border-[#22c55e]/30 hover:border-[#22c55e] text-[#22c55e] text-[10px] font-bold transition-colors" style={{ fontFamily: fontFamily.mono }}>
                        APPROVE
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs pt-3 border-t border-[#222c37]" style={{ fontFamily: fontFamily.mono }}>
                  <span className="text-[#94a3b8]"><span className="text-[#38bdf8]">{item.filesChanged}</span> files changed</span>
                  <span className="text-[#94a3b8]"><span className="text-[#22c55e]">+{item.dependenciesAdded}</span> dependencies</span>
                  {item.dependenciesRemoved > 0 && (
                    <span className="text-[#94a3b8]"><span className="text-[#ef4444]">-{item.dependenciesRemoved}</span> dependencies</span>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-[#5f636b]">No changes match this filter.</p>
          )}
        </div>

        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
};

export default ApprovalQueue;
