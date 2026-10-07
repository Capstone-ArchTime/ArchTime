import { useEffect, useState } from 'react';
import { App, Button, Empty, Form, Input, Modal, Select, Spin, Tag } from 'antd';
import { CheckCircle2, XCircle, Clock, Filter, GitCommit } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { getProjects } from '@/features/project-data';
import type { ProjectSummary } from '@/features/project-data';
import {
  getProjectApprovals,
  getApprovalDetail,
  createApproval,
  approveRequest,
  rejectRequest,
} from '@/features/pm-api';
import type { Approval } from '@/features/pm-api';

const fontFamily = { mono: '"JetBrains Mono", monospace' };

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

const statusMeta: Record<ApprovalStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'PENDING', color: '#ffb03a', icon: Clock },
  approved: { label: 'APPROVED', color: '#22c55e', icon: CheckCircle2 },
  rejected: { label: 'REJECTED', color: '#ef4444', icon: XCircle },
};

const filterOptions: { key: 'all' | ApprovalStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

export default function ApprovalQueue() {
  const { message, modal } = App.useApp();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | ApprovalStatus>('all');
  const [viewing, setViewing] = useState<Approval | null>(null);
  const [creating, setCreating] = useState(false);
  const [review, setReview] = useState<{ approval: Approval; action: 'approve' | 'reject' } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [reviewForm] = Form.useForm<{ reason: string }>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getProjects(controller.signal)
      .then(res => {
        setProjects(res);
        if (res.length > 0 && !selectedProject) {
          setSelectedProject(res[0].id);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    const controller = new AbortController();
    setLoading(true);
    getProjectApprovals(selectedProject, { status: activeFilter !== 'all' ? activeFilter : undefined }, controller.signal)
      .then(res => {
        setApprovals(res.data.approvals);
        setError(null);
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedProject, activeFilter, revision]);

  function refresh() {
    setRevision(v => v + 1);
  }

  const pendingCount = approvals.filter(a => a.status === 'pending').length;
  const filtered = approvals.filter(a => activeFilter === 'all' || a.status === activeFilter);

  async function handleCreate(values: { title: string; commit: string; description: string }) {
    if (!selectedProject) return;
    setSubmitting(true);
    try {
      await createApproval(selectedProject, {
        title: values.title.trim(),
        description: values.description.trim(),
        commit: values.commit.trim(),
      });
      message.success('Proposal created.');
      setCreating(false);
      form.resetFields();
      refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to create proposal.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReview(values: { reason: string }) {
    if (!review || !selectedProject) return;
    setSubmitting(true);
    try {
      if (review.action === 'approve') {
        await approveRequest(selectedProject, review.approval.id, values.reason?.trim());
        message.success('Proposal approved.');
      } else {
        await rejectRequest(selectedProject, review.approval.id, values.reason.trim());
        message.success('Proposal rejected.');
      }
      setReview(null);
      reviewForm.resetFields();
      refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to process review.');
    } finally {
      setSubmitting(false);
    }
  }

  function startReview(approval: Approval, action: 'approve' | 'reject') {
    reviewForm.resetFields();
    setReview({ approval, action });
  }

  return (
    <DashboardLayout>
      <div className="max-w-[1100px] mx-auto space-y-8">
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

        <div className="flex flex-wrap items-center gap-4">
          <Select
            aria-label="Select project"
            value={selectedProject}
            onChange={setSelectedProject}
            className="min-w-60"
            options={projects.map(p => ({ value: p.id, label: p.name }))}
            placeholder="Select a project"
          />
          <Button type="primary" onClick={() => { form.resetFields(); setCreating(true); }} disabled={!selectedProject}>
            New proposal
          </Button>
          <Button loading={loading} onClick={refresh}>Refresh</Button>
        </div>

        {error && <p className="text-red-400">{error}</p>}

        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-[#94a3b8] mr-1" />
          {filterOptions.map(opt => (
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

        {loading && !approvals.length ? (
          <div className="p-12 text-center"><Spin /><p className="mt-3 text-[#94a3b8]">Loading approvals...</p></div>
        ) : filtered.length === 0 ? (
          <Empty description="No proposals match this filter" />
        ) : (
          <div className="space-y-3">
            {filtered.map(item => {
              const meta = statusMeta[item.status];
              const StatusIcon = meta.icon;
              return (
                <div key={item.id} className="bg-[#11161b] border border-[#222c37] p-5">
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
                        <span className="text-[10px] text-[#94a3b8]" style={{ fontFamily: fontFamily.mono }}>
                          {new Date(item.requestedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="text-[#f4f4f6] font-bold text-sm mb-2">{item.title}</h4>
                      <div className="flex items-center gap-2 text-xs text-[#94a3b8]" style={{ fontFamily: fontFamily.mono }}>
                        <GitCommit size={12} />
                        <span>{item.project}</span>
                        <span>&middot;</span>
                        <span>{item.commit}</span>
                        <span>&middot;</span>
                        <span>requested by {item.requestedBy}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="small" onClick={() => setViewing(item)}>Details</Button>
                      {item.status === 'pending' && (
                        <>
                          <Button
                            size="small"
                            danger
                            onClick={() => startReview(item, 'reject')}
                            style={{ fontFamily: fontFamily.mono }}
                          >
                            REJECT
                          </Button>
                          <Button
                            size="small"
                            type="primary"
                            onClick={() => startReview(item, 'approve')}
                            style={{ fontFamily: fontFamily.mono, background: '#22c55e', borderColor: '#22c55e' }}
                          >
                            APPROVE
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {item.reviewedAt && (
                    <p className="text-xs text-[#94a3b8] pt-3 border-t border-[#222c37]">
                      {item.reviewedBy} · {new Date(item.reviewedAt).toLocaleString()}
                      {item.reason && ` · ${item.reason}`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Modal
          title={viewing?.title ?? 'Proposal'}
          open={!!viewing}
          onCancel={() => setViewing(null)}
          footer={<Button onClick={() => setViewing(null)}>Close</Button>}
        >
          {viewing && (
            <div className="space-y-4">
              <Tag color={statusMeta[viewing.status].color}>{viewing.status}</Tag>
              <p>{viewing.project} · Commit {viewing.commit}</p>
              <p className="whitespace-pre-wrap break-words">{viewing.description}</p>
              <p>Requested by {viewing.requestedBy} on {new Date(viewing.requestedAt).toLocaleString()}</p>
              {viewing.reviewedAt && (
                <p className="text-sm text-[#94a3b8]">
                  Reviewed by {viewing.reviewedBy} on {new Date(viewing.reviewedAt).toLocaleString()}
                  {viewing.reason && <><br />Reason: {viewing.reason}</>}
                </p>
              )}
            </div>
          )}
        </Modal>

        <Modal
          title={review?.action === 'approve' ? 'Approve this proposal?' : 'Reject this proposal?'}
          open={!!review}
          onCancel={() => setReview(null)}
          onOk={() => reviewForm.submit()}
          okText="Submit"
          confirmLoading={submitting}
        >
          <Form form={reviewForm} layout="vertical" onFinish={handleReview}>
            <Form.Item
              name="reason"
              label={review?.action === 'reject' ? 'Reason for rejection' : 'Comment (optional)'}
              rules={[{ required: review?.action === 'reject', whitespace: true }]}
            >
              <Input.TextArea rows={4} maxLength={2000} showCount />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="Create proposal"
          open={creating}
          onCancel={() => setCreating(false)}
          onOk={() => form.submit()}
          okText="Create"
          confirmLoading={submitting}
        >
          <Form form={form} layout="vertical" onFinish={handleCreate}>
            <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true }]}>
              <Input maxLength={160} />
            </Form.Item>
            <Form.Item
              name="commit"
              label="Commit SHA"
              rules={[
                { required: true },
                { pattern: /^[a-f\d]{7,40}$/i, message: 'Enter a 7–40 character hexadecimal commit SHA.' },
              ]}
            >
              <Input maxLength={40} />
            </Form.Item>
            <Form.Item name="description" label="Description" rules={[{ required: true, whitespace: true }]}>
              <Input.TextArea rows={4} maxLength={5000} />
            </Form.Item>
          </Form>
        </Modal>

        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
}
