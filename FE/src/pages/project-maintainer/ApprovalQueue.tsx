import { useEffect, useState } from 'react';
import { App, Button, Empty, Form, Input, Modal, Select, Spin, Tag } from 'antd';
import { CheckCircle2, XCircle, Clock, Filter, GitCommit } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import type { ProjectSummary } from '@/features/project-data';
import { ManagedWorkspaces } from './managed';
import { describeAccessError, pickWorkspace } from './managed-access';
import {
  getProjectApprovals,
  createApproval,
  approveRequest,
  rejectRequest,
} from '@/features/pm-api';
import type { Approval } from '@/features/pm-api';

const fontFamily = { mono: '"JetBrains Mono", monospace' };

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

import { formatDate, formatDateTime } from '@/i18n/format';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', all: 'All', pendingF: 'Pending', approvedF: 'Approved', rejectedF: 'Rejected', pending: 'pending', approved: 'approved', rejected: 'rejected',
  title: 'Approval Queue', loadFailed: 'This workspace could not be loaded.', created: 'Proposal created.', createFailed: 'Failed to create proposal.', approvedMsg: 'Proposal approved.', rejectedMsg: 'Proposal rejected.',
  reviewFailed: 'Failed to process review.', intro: 'Review architectural changes proposed across the workspaces you maintain', awaiting: '{n} awaiting your review',
  selectWorkspace: 'Select workspace', selectPlaceholder: 'Select a workspace', newProposal: 'New proposal', refresh: 'Refresh', loading: 'Loading approvals...', noMatch: 'No proposals match this filter',
  requestedBy: 'requested by {name}', details: 'Details', reject: 'REJECT', approve: 'APPROVE', proposal: 'Proposal', close: 'Close', commit: '{project} · Commit {commit}',
  requestedOn: 'Requested by {name} on {date}', reviewedOn: 'Reviewed by {name} on {date}', reason: 'Reason: {reason}', approveTitle: 'Approve this proposal?', rejectTitle: 'Reject this proposal?',
  submit: 'Submit', rejectReason: 'Reason for rejection', comment: 'Comment (optional)', createTitle: 'Create proposal', create: 'Create', titleLabel: 'Title', sha: 'Commit SHA',
  shaInvalid: 'Enter a 7–40 character hexadecimal commit SHA.', description: 'Description',
}, {
  PENDING: 'ĐANG CHỜ', APPROVED: 'ĐÃ DUYỆT', REJECTED: 'BỊ TỪ CHỐI', all: 'Tất cả', pendingF: 'Đang chờ', approvedF: 'Đã duyệt', rejectedF: 'Bị từ chối', pending: 'đang chờ', approved: 'đã duyệt', rejected: 'bị từ chối',
  title: 'Hàng đợi phê duyệt', loadFailed: 'Không tải được không gian làm việc này.', created: 'Đã tạo đề xuất.', createFailed: 'Không tạo được đề xuất.', approvedMsg: 'Đã duyệt đề xuất.', rejectedMsg: 'Đã từ chối đề xuất.',
  reviewFailed: 'Không xử lý được việc duyệt.', intro: 'Duyệt các thay đổi kiến trúc được đề xuất trong các không gian làm việc bạn bảo trì', awaiting: '{n} đang chờ bạn duyệt',
  selectWorkspace: 'Chọn không gian làm việc', selectPlaceholder: 'Chọn không gian làm việc', newProposal: 'Đề xuất mới', refresh: 'Làm mới', loading: 'Đang tải phê duyệt...', noMatch: 'Không có đề xuất nào khớp bộ lọc',
  requestedBy: 'do {name} yêu cầu', details: 'Chi tiết', reject: 'TỪ CHỐI', approve: 'DUYỆT', proposal: 'Đề xuất', close: 'Đóng', commit: '{project} · Commit {commit}',
  requestedOn: '{name} yêu cầu lúc {date}', reviewedOn: '{name} duyệt lúc {date}', reason: 'Lý do: {reason}', approveTitle: 'Duyệt đề xuất này?', rejectTitle: 'Từ chối đề xuất này?',
  submit: 'Gửi', rejectReason: 'Lý do từ chối', comment: 'Nhận xét (không bắt buộc)', createTitle: 'Tạo đề xuất', create: 'Tạo', titleLabel: 'Tiêu đề', sha: 'SHA của commit',
  shaInvalid: 'Hãy nhập SHA commit dạng thập lục phân dài 7–40 ký tự.', description: 'Mô tả',
});

const statusMeta: Record<ApprovalStatus, { label: 'PENDING' | 'APPROVED' | 'REJECTED'; color: string; icon: typeof Clock }> = {
  pending: { label: 'PENDING', color: 'var(--at-warn)', icon: Clock },
  approved: { label: 'APPROVED', color: 'var(--at-success)', icon: CheckCircle2 },
  rejected: { label: 'REJECTED', color: 'var(--at-danger)', icon: XCircle },
};

const filterOptions: { key: 'all' | ApprovalStatus; label: 'all' | 'pendingF' | 'approvedF' | 'rejectedF' }[] = [
  { key: 'all', label: 'all' },
  { key: 'pending', label: 'pendingF' },
  { key: 'approved', label: 'approvedF' },
  { key: 'rejected', label: 'rejectedF' },
];

export default function ApprovalQueue() {
  const m = useMessages(MSG);
  return <ManagedWorkspaces title={m('title')}>{projects => <ApprovalQueueView projects={projects} />}</ManagedWorkspaces>;
}

function ApprovalQueueView({ projects }: { projects: ProjectSummary[] }) {
  const { message } = App.useApp();
  const [selectedProject, setSelectedProject] = useState(() => pickWorkspace(projects));
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
  const m = useMessages(MSG);

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
        if (!controller.signal.aborted) setError(describeAccessError(e, translate(MSG, 'loadFailed')));
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
      message.success(m('created'));
      setCreating(false);
      form.resetFields();
      refresh();
    } catch (e) {
      message.error(describeAccessError(e, m('createFailed')));
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
        message.success(m('approvedMsg'));
      } else {
        await rejectRequest(selectedProject, review.approval.id, values.reason.trim());
        message.success(m('rejectedMsg'));
      }
      setReview(null);
      reviewForm.resetFields();
      refresh();
    } catch (e) {
      message.error(describeAccessError(e, m('reviewFailed')));
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
          <h2 className="text-3xl font-bold tracking-tight text-[var(--at-text)] mb-2">{m('title')}</h2>
          <p className="text-[var(--at-muted)] text-sm max-w-xl leading-relaxed">
            {m('intro')}
            {pendingCount > 0 && (
              <> &mdash; <span className="text-[var(--at-warn)] font-semibold">{m('awaiting', { n: pendingCount })}</span></>
            )}.
          </p>
          <div className="h-[1px] w-full bg-gradient-to-r from-[var(--at-line)] to-transparent mt-8"></div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Select
            aria-label={m('selectWorkspace')}
            value={selectedProject}
            onChange={setSelectedProject}
            className="min-w-60"
            options={projects.map(p => ({ value: p.id, label: p.name }))}
            placeholder={m('selectPlaceholder')}
          />
          <Button type="primary" onClick={() => { form.resetFields(); setCreating(true); }} disabled={!selectedProject}>
            {m('newProposal')}
          </Button>
          <Button loading={loading} onClick={refresh}>{m('refresh')}</Button>
        </div>

        {error && <p className="text-red-400">{error}</p>}

        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-[var(--at-muted)] mr-1" />
          {filterOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setActiveFilter(opt.key)}
              className={`h-8 px-3 text-[10px] font-bold uppercase tracking-widest border transition-colors ${
                activeFilter === opt.key
                  ? 'bg-[var(--at-accent)]/10 border-[var(--at-accent)]/40 text-[var(--at-link)]'
                  : 'bg-[var(--at-panel-2)] border-[var(--at-line)] text-[var(--at-muted)] hover:text-[var(--at-text)]'
              }`}
              style={{ fontFamily: fontFamily.mono }}
            >
              {m(opt.label)}
            </button>
          ))}
        </div>

        {loading && !approvals.length ? (
          <div className="p-12 text-center"><Spin /><p className="mt-3 text-[var(--at-muted)]">{m('loading')}</p></div>
        ) : filtered.length === 0 ? (
          <Empty description={m('noMatch')} />
        ) : (
          <div className="space-y-3">
            {filtered.map(item => {
              const meta = statusMeta[item.status];
              const StatusIcon = meta.icon;
              return (
                <div key={item.id} className="bg-[var(--at-panel)] border border-[var(--at-line)] p-5">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest px-2 py-1 border"
                          style={{ fontFamily: fontFamily.mono, color: meta.color, borderColor: `color-mix(in srgb, ${meta.color} 20%, transparent)`, backgroundColor: `color-mix(in srgb, ${meta.color} 10%, transparent)` }}
                        >
                          <StatusIcon size={11} />
                          {m(meta.label)}
                        </span>
                        <span className="text-[10px] text-[var(--at-muted)]" style={{ fontFamily: fontFamily.mono }}>
                          {formatDate(item.requestedAt)}
                        </span>
                      </div>
                      <h4 className="text-[var(--at-text)] font-bold text-sm mb-2">{item.title}</h4>
                      <div className="flex items-center gap-2 text-xs text-[var(--at-muted)]" style={{ fontFamily: fontFamily.mono }}>
                        <GitCommit size={12} />
                        <span>{item.project}</span>
                        <span>&middot;</span>
                        <span>{item.commit}</span>
                        <span>&middot;</span>
                        <span>{m('requestedBy', { name: item.requestedBy })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="small" onClick={() => setViewing(item)}>{m('details')}</Button>
                      {item.status === 'pending' && (
                        <>
                          <Button
                            size="small"
                            danger
                            onClick={() => startReview(item, 'reject')}
                            style={{ fontFamily: fontFamily.mono }}
                          >
                            {m('reject')}
                          </Button>
                          <Button
                            size="small"
                            type="primary"
                            onClick={() => startReview(item, 'approve')}
                            style={{ fontFamily: fontFamily.mono, background: 'var(--at-success)', borderColor: 'var(--at-success)' }}
                          >
                            {m('approve')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {item.reviewedAt && (
                    <p className="text-xs text-[var(--at-muted)] pt-3 border-t border-[var(--at-line)]">
                      {item.reviewedBy} · {formatDateTime(item.reviewedAt)}
                      {item.reason && ` · ${item.reason}`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Modal
          title={viewing?.title ?? m('proposal')}
          open={!!viewing}
          onCancel={() => setViewing(null)}
          footer={<Button onClick={() => setViewing(null)}>{m('close')}</Button>}
        >
          {viewing && (
            <div className="space-y-4">
              <Tag color={statusMeta[viewing.status].color}>{m(viewing.status)}</Tag>
              <p>{m('commit', { project: viewing.project, commit: viewing.commit })}</p>
              <p className="whitespace-pre-wrap break-words">{viewing.description}</p>
              <p>{m('requestedOn', { name: viewing.requestedBy, date: formatDateTime(viewing.requestedAt) })}</p>
              {viewing.reviewedAt && (
                <p className="text-sm text-[var(--at-muted)]">
                  {m('reviewedOn', { name: viewing.reviewedBy ?? '', date: formatDateTime(viewing.reviewedAt) })}
                  {viewing.reason && <><br />{m('reason', { reason: viewing.reason })}</>}
                </p>
              )}
            </div>
          )}
        </Modal>

        <Modal
          title={review?.action === 'approve' ? m('approveTitle') : m('rejectTitle')}
          open={!!review}
          onCancel={() => setReview(null)}
          onOk={() => reviewForm.submit()}
          okText={m('submit')}
          confirmLoading={submitting}
        >
          <Form form={reviewForm} layout="vertical" onFinish={handleReview}>
            <Form.Item
              name="reason"
              label={review?.action === 'reject' ? m('rejectReason') : m('comment')}
              rules={[{ required: review?.action === 'reject', whitespace: true }]}
            >
              <Input.TextArea rows={4} maxLength={2000} showCount />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title={m('createTitle')}
          open={creating}
          onCancel={() => setCreating(false)}
          onOk={() => form.submit()}
          okText={m('create')}
          confirmLoading={submitting}
        >
          <Form form={form} layout="vertical" onFinish={handleCreate}>
            <Form.Item name="title" label={m('titleLabel')} rules={[{ required: true, whitespace: true }]}>
              <Input maxLength={160} />
            </Form.Item>
            <Form.Item
              name="commit"
              label={m('sha')}
              rules={[
                { required: true },
                { pattern: /^[a-f\d]{7,40}$/i, message: m('shaInvalid') },
              ]}
            >
              <Input maxLength={40} />
            </Form.Item>
            <Form.Item name="description" label={m('description')} rules={[{ required: true, whitespace: true }]}>
              <Input.TextArea rows={4} maxLength={5000} />
            </Form.Item>
          </Form>
        </Modal>

        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
}
