import { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Empty, Input, Skeleton, Table, Tag } from 'antd';
import FeaturePage from '@/components/FeaturePage';
import PaginationBar from '@/components/PaginationBar';
import {
  getAdminOrganization, listAdminOrganizations, personLabel,
  type AdminOrganization, type AdminOrganizationDetail,
} from '@/features/admin-organizations';

const PAGE_SIZE = 10;
const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString() : '');

/** Who runs an organization and how big it is. The content of its workspaces stays with its members. */
function OrganizationDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  // What was loaded, and for which organization: anything loaded for another id reads as "still loading".
  const [loaded, setLoaded] = useState<{ id: string; detail: AdminOrganizationDetail | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    getAdminOrganization(id, controller.signal)
      .then(detail => setLoaded({ id, detail, error: null }))
      .catch(e => { if (!controller.signal.aborted) setLoaded({ id, detail: null, error: e instanceof Error ? e.message : 'Could not load this organization.' }); });
    return () => controller.abort();
  }, [id]);
  const current = loaded && loaded.id === id ? loaded : null;
  const detail = current?.detail ?? null;
  const error = current?.error ?? null;

  return <Drawer open={!!id} onClose={onClose} size="large" title={detail?.name ?? 'Organization'} destroyOnHidden>
    {error && <Alert type="error" showIcon title={error} />}
    {!detail && !error && <Skeleton active />}
    {detail && <div className="space-y-6">
      <Alert type="info" showIcon title="Metadata only"
        description="System Administrators see who belongs to an organization and how its workspaces are doing, never their repositories, code, evidence, maps or decisions." />
      <Descriptions column={1} size="small" bordered items={[
        { key: 'desc', label: 'Description', children: detail.description || '—' },
        { key: 'created', label: 'Created', children: `${day(detail.createdAt)} by ${personLabel(detail.createdBy)}` },
        { key: 'counts', label: 'Size', children: `${detail.memberCount} member${detail.memberCount === 1 ? '' : 's'}, ${detail.projectCount} workspace${detail.projectCount === 1 ? '' : 's'}` },
      ]} />
      <section aria-label="Members">
        <h3 className="mb-2 font-medium">Members</h3>
        <Table rowKey="userId" size="small" pagination={false} dataSource={detail.members} columns={[
          { title: 'Name', render: (_, m) => m.name ?? 'Deleted account' },
          { title: 'Email', dataIndex: 'email' },
          { title: 'Role', dataIndex: 'role', render: (role: string) => <Tag color={role === 'owner' ? 'gold' : 'default'}>{role === 'owner' ? 'Owner' : 'Member'}</Tag> },
          { title: 'Joined', dataIndex: 'joinedAt', render: day },
        ]} />
      </section>
      <section aria-label="Workspaces">
        <h3 className="mb-2 font-medium">Workspaces</h3>
        {detail.projects.length === 0 ? <Empty description="No workspaces yet" /> :
          <Table rowKey="id" size="small" pagination={false} dataSource={detail.projects} columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Mining', dataIndex: 'status', render: (s: string) => <Tag>{s}</Tag> },
            { title: 'Visibility', dataIndex: 'visibility' },
            { title: 'Commits', dataIndex: 'totalCommits', render: (n: number | null) => (n ?? '—') },
            { title: 'Created', dataIndex: 'createdAt', render: day },
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
  // The last answer and the request it answered; loading is "the answer is for another request".
  const request = `${search}\u0000${page}\u0000${revision}`;
  const [answer, setAnswer] = useState<{ request: string; rows: AdminOrganization[]; total: number; error: string | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listAdminOrganizations({ search, page, limit: PAGE_SIZE }, controller.signal)
      .then(res => setAnswer({ request, rows: res.items, total: res.total, error: null }))
      .catch(e => { if (!controller.signal.aborted) setAnswer(prev => ({ request, rows: prev?.rows ?? [], total: prev?.total ?? 0, error: e instanceof Error ? e.message : 'Could not load organizations.' })); });
    return () => controller.abort();
  }, [request, search, page]);
  const loading = answer?.request !== request;
  const rows = answer?.rows ?? [];
  const total = answer?.total ?? 0;
  const error = answer?.error ?? null;

  return <FeaturePage title="Organizations" description="Every organization on the platform: who owns it, how many members and workspaces it has." error={error}
    actions={<Button loading={loading} onClick={() => setRevision(v => v + 1)}>Refresh</Button>}>
    <Input.Search className="max-w-sm" aria-label="Search organizations" placeholder="Organization name" allowClear
      onSearch={value => { setPage(1); setSearch(value); }} />
    <Table<AdminOrganization> rowKey="id" loading={loading} dataSource={rows} pagination={false}
      locale={{ emptyText: <Empty description={search ? 'No organization matches this name' : 'No organizations yet'} /> }}
      onRow={org => ({ onClick: () => setOpen(org.id), className: 'cursor-pointer' })}
      columns={[
        { title: 'Organization', render: (_, o) => <div><p className="font-medium">{o.name}</p>{o.description && <p className="text-xs text-[#94a3b8] line-clamp-1">{o.description}</p>}</div> },
        { title: 'Owners', render: (_, o) => o.owners.length ? o.owners.map(personLabel).join(', ') : <Tag color="red">No owner</Tag> },
        { title: 'Members', dataIndex: 'memberCount', align: 'right' },
        { title: 'Workspaces', dataIndex: 'projectCount', align: 'right' },
        { title: 'Created', dataIndex: 'createdAt', render: day },
        { title: '', render: (_, o) => <Button size="small" onClick={e => { e.stopPropagation(); setOpen(o.id); }}>Details</Button> },
      ]} />
    {total > PAGE_SIZE && <PaginationBar current={page} pageSize={PAGE_SIZE} total={total} onChange={p => setPage(p)} />}
    <OrganizationDrawer id={open} onClose={() => setOpen(null)} />
  </FeaturePage>;
}
