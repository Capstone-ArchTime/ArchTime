import { useEffect, useState } from 'react';
import { Alert, App, Button, Descriptions, Drawer, Empty, Input, Modal, Skeleton, Table, Tag } from 'antd';
import FeaturePage from '@/components/FeaturePage';
import { tablePanel } from './admin-ui';
import PaginationBar from '@/components/PaginationBar';
import {
  getAdminOrganization, listAdminOrganizations, personLabel, reactivateOrganization, suspendOrganization, suspensionReasonError, SUSPENSION_REASON,
  type AdminOrganization, type AdminOrganizationDetail,
} from '@/features/admin-organizations';

import { formatDate, formatDateTime } from '@/i18n/format';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  suspended: 'Suspended', active: 'Active', isSuspended: '{name} is suspended.', suspendFailed: 'Could not suspend the organization.', reactivateTitle: 'Reactivate {name}?',
  reactivateBody: 'Its members get their workspaces back as they were, and its owners can manage it again.', reactivate: 'Reactivate', activeAgain: '{name} is active again.', reactivateFailed: 'Could not reactivate the organization.',
  suspension: 'Suspension', since: 'Since {date} by {by}. Reason: {reason}', closed: 'Its workspaces are closed to every member, owners included, until it is reactivated. Nothing was deleted.',
  reactivateOrg: 'Reactivate organization', suspendOrg: 'Suspend organization', suspendTitle: 'Suspend {name}?', suspend: 'Suspend',
  suspendBody: 'All {workspaces} of this organization close for its {members}, owners included, and its owners cannot change it until you reactivate it. No data is deleted.',
  workspaces: '{count} workspaces', workspaces_one: '1 workspace', members: '{count} members', members_one: '1 member', reason: 'Reason (recorded in the audit log)',
  loadOneFailed: 'Could not load this organization.', organization: 'Organization', metadata: 'Metadata only',
  metadataBody: 'System Administrators see who belongs to an organization and how its workspaces are doing, never their repositories, code, evidence, maps or decisions.',
  status: 'Status', description: 'Description', created: 'Created', createdBy: '{date} by {by}', size: 'Size', sizeValue: '{members}, {workspaces}', membersTitle: 'Members', name: 'Name', deleted: 'Deleted account',
  email: 'Email', role: 'Role', owner: 'Owner', member: 'Member', joined: 'Joined', workspacesTitle: 'Workspaces', noWorkspaces: 'No workspaces yet', mining: 'Mining', visibility: 'Visibility', commits: 'Commits',
  loadFailed: 'Could not load organizations.', title: 'Organizations', intro: 'Every organization on the platform, its owner and its size.', refresh: 'Refresh', search: 'Search organizations',
  searchPlaceholder: 'Organization name', noMatch: 'No organization matches this name', none: 'No organizations yet', owners: 'Owners', noOwner: 'No owner', details: 'Details',
}, {
  suspended: 'Bị tạm ngưng', active: 'Hoạt động', isSuspended: 'Đã tạm ngưng {name}.', suspendFailed: 'Không tạm ngưng được tổ chức.', reactivateTitle: 'Kích hoạt lại {name}?',
  reactivateBody: 'Thành viên lấy lại các không gian làm việc như trước, và chủ sở hữu quản lý lại được.', reactivate: 'Kích hoạt lại', activeAgain: '{name} đã hoạt động lại.', reactivateFailed: 'Không kích hoạt lại được tổ chức.',
  suspension: 'Tạm ngưng', since: 'Từ {date} bởi {by}. Lý do: {reason}', closed: 'Các không gian làm việc bị đóng với mọi thành viên, kể cả chủ sở hữu, cho tới khi được kích hoạt lại. Không có gì bị xoá.',
  reactivateOrg: 'Kích hoạt lại tổ chức', suspendOrg: 'Tạm ngưng tổ chức', suspendTitle: 'Tạm ngưng {name}?', suspend: 'Tạm ngưng',
  suspendBody: 'Toàn bộ {workspaces} của tổ chức sẽ đóng với {members}, kể cả chủ sở hữu, và chủ sở hữu không thay đổi được cho tới khi bạn kích hoạt lại. Không dữ liệu nào bị xoá.',
  workspaces: '{count} không gian làm việc', members: '{count} thành viên', reason: 'Lý do (ghi vào nhật ký kiểm toán)',
  loadOneFailed: 'Không tải được tổ chức này.', organization: 'Tổ chức', metadata: 'Chỉ siêu dữ liệu',
  metadataBody: 'Quản trị viên hệ thống thấy ai thuộc tổ chức và tình trạng các không gian làm việc, không bao giờ thấy repository, mã, bằng chứng, bản đồ hay quyết định.',
  status: 'Trạng thái', description: 'Mô tả', created: 'Tạo', createdBy: '{date} bởi {by}', size: 'Quy mô', sizeValue: '{members}, {workspaces}', membersTitle: 'Thành viên', name: 'Tên', deleted: 'Tài khoản đã xoá',
  email: 'Email', role: 'Vai trò', owner: 'Chủ sở hữu', member: 'Thành viên', joined: 'Tham gia', workspacesTitle: 'Không gian làm việc', noWorkspaces: 'Chưa có không gian làm việc nào', mining: 'Mining', visibility: 'Hiển thị', commits: 'Commit',
  loadFailed: 'Không tải được các tổ chức.', title: 'Tổ chức', intro: 'Mọi tổ chức trên nền tảng, chủ sở hữu và quy mô.', refresh: 'Làm mới', search: 'Tìm tổ chức',
  searchPlaceholder: 'Tên tổ chức', noMatch: 'Không có tổ chức nào khớp tên này', none: 'Chưa có tổ chức nào', owners: 'Chủ sở hữu', noOwner: 'Không có chủ', details: 'Chi tiết',
});

const PAGE_SIZE = 10;
const day = (iso: string) => (iso ? formatDate(iso) : '');

const StatusTag = ({ org }: { org: Pick<AdminOrganization, 'status'> }) =>
  org.status === 'suspended' ? <Tag color="red">{translate(MSG, 'suspended')}</Tag> : <Tag color="green">{translate(MSG, 'active')}</Tag>;

/**
 * Suspend (with a reason) or reactivate an organization (RF-14, UC-25), each behind a confirmation. The server checks
 * that the caller is a System Administrator; this only asks first and shows what happened.
 */
function SuspensionControls({ detail, onChanged }: { detail: AdminOrganizationDetail; onChanged: (next: AdminOrganizationDetail) => void }) {
  const { message, modal } = App.useApp();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonError = suspensionReasonError(reason);
  const m = useMessages(MSG);

  async function suspend() {
    setBusy(true); setError(null);
    try {
      onChanged(await suspendOrganization(detail.id, reason));
      message.success(m('isSuspended', { name: detail.name }));
      setAsking(false); setReason('');
    } catch (e) { setError(e instanceof Error ? e.message : m('suspendFailed')); }
    finally { setBusy(false); }
  }
  function reactivate() {
    modal.confirm({
      title: m('reactivateTitle', { name: detail.name }),
      content: m('reactivateBody'),
      okText: m('reactivate'),
      onOk: async () => {
        try { onChanged(await reactivateOrganization(detail.id)); message.success(m('activeAgain', { name: detail.name })); }
        catch (e) { message.error(e instanceof Error ? e.message : m('reactivateFailed')); throw e; }
      },
    });
  }

  return <section aria-label={m('suspension')} className="space-y-2">
    {detail.status === 'suspended' && detail.suspension && <Alert type="warning" showIcon title={m('suspended')}
      description={<>{m('since', { date: formatDateTime(detail.suspension.at), by: personLabel(detail.suspension.by), reason: detail.suspension.reason })}<br />{m('closed')}</>} />}
    {detail.status === 'suspended'
      ? <Button type="primary" onClick={reactivate}>{m('reactivateOrg')}</Button>
      : <Button danger onClick={() => { setAsking(true); setError(null); }}>{m('suspendOrg')}</Button>}
    <Modal open={asking} title={m('suspendTitle', { name: detail.name })} okText={m('suspend')} okButtonProps={{ danger: true, disabled: !!reasonError }} confirmLoading={busy}
      onOk={suspend} onCancel={() => { setAsking(false); setReason(''); setError(null); }} destroyOnHidden>
      <p className="text-sm mb-3">{m('suspendBody', { workspaces: m('workspaces', { count: detail.projectCount }), members: m('members', { count: detail.memberCount }) })}</p>
      <label htmlFor="suspension-reason" className="block text-xs text-[var(--at-muted)] mb-1">{m('reason')}</label>
      <Input.TextArea id="suspension-reason" rows={3} maxLength={SUSPENSION_REASON.max} showCount value={reason} onChange={e => setReason(e.target.value)} status={reason && reasonError ? 'error' : undefined} />
      {reason && reasonError && <p className="text-xs text-red-500 mt-1">{reasonError}</p>}
      {error && <Alert className="!mt-3" type="error" showIcon title={error} />}
    </Modal>
  </section>;
}

/** Who runs an organization and how big it is. The content of its workspaces stays with its members. */
function OrganizationDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  // What was loaded, and for which organization: anything loaded for another id reads as "still loading".
  const [loaded, setLoaded] = useState<{ id: string; detail: AdminOrganizationDetail | null; error: string | null } | null>(null);
  const m = useMessages(MSG);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    getAdminOrganization(id, controller.signal)
      .then(detail => setLoaded({ id, detail, error: null }))
      .catch(e => { if (!controller.signal.aborted) setLoaded({ id, detail: null, error: e instanceof Error ? e.message : translate(MSG, 'loadOneFailed') }); });
    return () => controller.abort();
  }, [id]);
  const current = loaded && loaded.id === id ? loaded : null;
  const detail = current?.detail ?? null;
  const error = current?.error ?? null;

  return <Drawer open={!!id} onClose={onClose} size="large" title={detail?.name ?? m('organization')} destroyOnHidden>
    {error && <Alert type="error" showIcon title={error} />}
    {!detail && !error && <Skeleton active />}
    {detail && <div className="space-y-6">
      <Alert type="info" showIcon title={m('metadata')}
        description={m('metadataBody')} />
      <SuspensionControls detail={detail} onChanged={next => { setLoaded({ id: detail.id, detail: next, error: null }); onChanged(); }} />
      <Descriptions column={1} size="small" bordered items={[
        { key: 'status', label: m('status'), children: <StatusTag org={detail} /> },
        { key: 'desc', label: m('description'), children: detail.description || '—' },
        { key: 'created', label: m('created'), children: m('createdBy', { date: day(detail.createdAt), by: personLabel(detail.createdBy) }) },
        { key: 'counts', label: m('size'), children: m('sizeValue', { members: m('members', { count: detail.memberCount }), workspaces: m('workspaces', { count: detail.projectCount }) }) },
      ]} />
      <section aria-label={m('membersTitle')}>
        <h3 className="mb-2 text-base font-bold">{m('membersTitle')}</h3>
        <Table rowKey="userId" size="small" pagination={false} dataSource={detail.members} columns={[
          { title: m('name'), render: (_, x) => x.name ?? m('deleted') },
          { title: m('email'), dataIndex: 'email' },
          { title: m('role'), dataIndex: 'role', render: (role: string) => <Tag color={role === 'owner' ? 'blue' : 'default'}>{role === 'owner' ? m('owner') : m('member')}</Tag> },
          { title: m('joined'), dataIndex: 'joinedAt', render: day },
        ]} />
      </section>
      <section aria-label={m('workspacesTitle')}>
        <h3 className="mb-2 text-base font-bold">{m('workspacesTitle')}</h3>
        {detail.projects.length === 0 ? <Empty description={m('noWorkspaces')} /> :
          <Table rowKey="id" size="small" pagination={false} dataSource={detail.projects} columns={[
            { title: m('name'), dataIndex: 'name' },
            { title: m('mining'), dataIndex: 'status', render: (s: string) => <Tag>{s}</Tag> },
            { title: m('visibility'), dataIndex: 'visibility' },
            { title: m('commits'), dataIndex: 'totalCommits', render: (n: number | null) => (n ?? '—') },
            { title: m('created'), dataIndex: 'createdAt', render: day },
          ]} />}
      </section>
    </div>}
  </Drawer>;
}

export default function Organizations() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const m = useMessages(MSG);
  // The last answer and the request it answered; loading is "the answer is for another request".
  const request = `${search}\u0000${page}\u0000${revision}`;
  const [answer, setAnswer] = useState<{ request: string; rows: AdminOrganization[]; total: number; error: string | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listAdminOrganizations({ search, page, limit: PAGE_SIZE }, controller.signal)
      .then(res => setAnswer({ request, rows: res.items, total: res.total, error: null }))
      .catch(e => { if (!controller.signal.aborted) setAnswer(prev => ({ request, rows: prev?.rows ?? [], total: prev?.total ?? 0, error: e instanceof Error ? e.message : translate(MSG, 'loadFailed') })); });
    return () => controller.abort();
  }, [request, search, page]);
  const loading = answer?.request !== request;
  const rows = answer?.rows ?? [];
  const total = answer?.total ?? 0;
  const error = answer?.error ?? null;

  return <FeaturePage title={m('title')} description={m('intro')} error={error}
    actions={<Button loading={loading} onClick={() => setRevision(v => v + 1)}>{m('refresh')}</Button>}>
    <Input.Search className="max-w-sm" aria-label={m('search')} placeholder={m('searchPlaceholder')} allowClear
      onSearch={value => { setPage(1); setSearch(value); }} />
    <div className={tablePanel}>
      <Table<AdminOrganization> rowKey="id" loading={loading} dataSource={rows} pagination={false}
        locale={{ emptyText: <Empty description={search ? m('noMatch') : m('none')} /> }}
        onRow={org => ({ onClick: () => setOpen(org.id), className: 'cursor-pointer' })}
        columns={[
          { title: m('organization'), render: (_, o) => <div><p className="font-medium">{o.name}</p>{o.description && <p className="text-xs text-[var(--at-muted)] line-clamp-1">{o.description}</p>}</div> },
          { title: m('status'), render: (_, o) => <StatusTag org={o} /> },
          { title: m('owners'), render: (_, o) => o.owners.length ? o.owners.map(personLabel).join(', ') : <Tag color="red">{m('noOwner')}</Tag> },
          { title: m('membersTitle'), dataIndex: 'memberCount', align: 'right' },
          { title: m('workspacesTitle'), dataIndex: 'projectCount', align: 'right' },
          { title: m('created'), dataIndex: 'createdAt', render: day },
          { title: '', render: (_, o) => <Button size="small" onClick={e => { e.stopPropagation(); setOpen(o.id); }}>{m('details')}</Button> },
        ]} />
    </div>
    {total > PAGE_SIZE && <PaginationBar current={page} pageSize={PAGE_SIZE} total={total} onChange={p => setPage(p)} />}
    <OrganizationDrawer id={open} onClose={() => setOpen(null)} onChanged={() => setRevision(v => v + 1)} />
  </FeaturePage>;
}
