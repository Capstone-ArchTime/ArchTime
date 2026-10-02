import { useState } from 'react';
import { App, Button, Empty, Form, Input, Modal, Select, Tag } from 'antd';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { useAuth } from '@/auth/auth-context';
import { demoProjects, useMaintainerDemo } from '@/features/maintainer-demo';
import type { Approval } from '@/features/maintainer-demo';
import { usePagination } from '@/hooks/usePagination';
import PaginationBar from '@/components/PaginationBar';

export default function ApprovalQueue() {
  const store = useMaintainerDemo();
  const { user } = useAuth();
  const { message } = App.useApp();
  const [status, setStatus] = useState('all');
  const [project, setProject] = useState('all');
  const [query, setQuery] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const [review, setReview] = useState<{ id: string; status: 'approved' | 'rejected' } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm<Approval>();
  const [reviewForm] = Form.useForm<{ reason: string }>();
  const rows = store.data.approvals.filter(a => (status === 'all' || a.status === status) && (project === 'all' || a.project === project) && `${a.title} ${a.commit} ${a.requestedBy}`.toLowerCase().includes(query.toLowerCase()));
  const pagination = usePagination(rows, JSON.stringify([status, project, query]));
  const current = store.data.approvals.find(a => a.id === viewing);
  function startReview(id: string, status: 'approved' | 'rejected') { reviewForm.resetFields(); setReview({ id, status }); }
  return <FeaturePage title="Approval Queue" description="Review proposed architectural changes and record your decision." error={store.error} actions={<Button disabled={!!store.error} onClick={() => { form.resetFields(); setCreating(true); }}>Add demo proposal</Button>}>
    <p className="text-sm text-[#94a3b8]">{store.data.approvals.filter(a => a.status === 'pending').length} proposals awaiting review</p>
    <div className="flex flex-wrap gap-3"><Input.Search aria-label="Search approvals" className="max-w-sm" placeholder="Title, commit or requester" value={query} onChange={e => setQuery(e.target.value)} allowClear /><Select aria-label="Approval status" className="min-w-36" value={status} onChange={setStatus} options={['all', 'pending', 'approved', 'rejected'].map(value => ({ value, label: value === 'all' ? 'All statuses' : value }))} /><Select aria-label="Approval project" className="min-w-60" value={project} onChange={setProject} options={['all', ...demoProjects].map(value => ({ value, label: value === 'all' ? 'All projects' : value }))} /></div>
    {!rows.length && <Empty description="No matching proposals" />}
    <div className="space-y-3">{pagination.items.map(a => <article key={a.id} className={featurePanel}><div className="flex flex-wrap justify-between gap-4"><div><Tag color={a.status === 'approved' ? 'green' : a.status === 'rejected' ? 'red' : 'gold'}>{a.status}</Tag><h3 className="font-semibold mt-2">{a.title}</h3><p className="text-xs text-[#94a3b8] mt-2">{a.project} · {a.commit} · {a.requestedBy}</p></div><div className="flex flex-wrap gap-2"><Button onClick={() => setViewing(a.id)}>Review details</Button>{a.status === 'pending' && <><Button disabled={!!store.error} danger onClick={() => startReview(a.id, 'rejected')}>Reject</Button><Button disabled={!!store.error} type="primary" onClick={() => startReview(a.id, 'approved')}>Approve</Button></>}</div></div>{a.reviewedAt && <p className="text-xs text-[#94a3b8] mt-4">{a.reviewedBy} · {new Date(a.reviewedAt).toLocaleString()} · {a.reason || 'No comment'}</p>}</article>)}</div><PaginationBar {...pagination} />
    <Modal title={current?.title ?? 'Proposal'} open={!!current} onCancel={() => setViewing(null)} footer={<Button onClick={() => setViewing(null)}>Close</Button>}>
      {current && <div className="space-y-4"><Tag>{current.status}</Tag><p>{current.project} · Commit {current.commit}</p><p className="whitespace-pre-wrap break-words">{current.description}</p><p>Requested by {current.requestedBy} on {new Date(current.requestedAt).toLocaleString()}</p><p className="text-xs text-[#94a3b8]">Demo proposal only. Source diff and evidence require the approval API.</p></div>}
    </Modal>
    <Modal title={review?.status === 'approved' ? 'Approve this demo proposal?' : 'Reject this demo proposal?'} open={!!review} onCancel={() => setReview(null)} onOk={() => reviewForm.submit()} okText="Record decision">
      <Form form={reviewForm} layout="vertical" onFinish={({ reason }) => {
        const target = store.data.approvals.find(a => a.id === review?.id);
        if (!review || target?.status !== 'pending') { message.error('This proposal has already been processed or removed.'); return; }
        if (store.save({ ...store.data, approvals: store.data.approvals.map(a => a.id === review.id ? { ...a, status: review.status, reason: reason?.trim() ?? '', reviewedBy: user!.name, reviewedAt: new Date().toISOString() } : a) })) { message.success('Review saved locally.'); setReview(null); }
      }}><Form.Item name="reason" label={review?.status === 'rejected' ? 'Reason for rejection' : 'Review comment (optional)'} rules={[{ required: review?.status === 'rejected', whitespace: true }]}><Input.TextArea rows={4} maxLength={2000} showCount /></Form.Item></Form>
    </Modal>
    <Modal title="Add demo proposal" open={creating} onCancel={() => setCreating(false)} onOk={() => form.submit()} okText="Create locally">
      <Form form={form} layout="vertical" initialValues={{ project: demoProjects[0] }} onFinish={values => {
        const proposal: Approval = { ...values, title: values.title.trim(), commit: values.commit.trim(), description: values.description.trim(), id: crypto.randomUUID(), requestedBy: user!.name, requestedAt: new Date().toISOString(), status: 'pending' };
        if (store.save({ ...store.data, approvals: [proposal, ...store.data.approvals] })) { setCreating(false); message.success('Demo proposal created.'); }
      }}><Form.Item name="project" label="Project" rules={[{ required: true }]}><Select options={demoProjects.map(value => ({ value, label: value }))} /></Form.Item><Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true }]}><Input maxLength={160} /></Form.Item><Form.Item name="commit" label="Commit SHA" rules={[{ required: true }, { pattern: /^[a-f\d]{7,40}$/i, message: 'Enter a 7–40 character hexadecimal commit SHA.' }]}><Input maxLength={40} /></Form.Item><Form.Item name="description" label="Proposed change and rationale" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={4} maxLength={5000} /></Form.Item></Form>
    </Modal>
  </FeaturePage>;
}
