import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Empty, Popconfirm, Select, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Plus } from 'lucide-react';
import { featurePanel } from '@/components/FeaturePage';
import { deletePath, getManagedProjects, listPaths } from '@/features/onboarding-api';
import type { ManagedProject, PathSummary } from '@/features/onboarding-api';
import { attentionText, pathStatusTag } from '@/features/onboarding-view';
import PathPeopleModal from './PathPeopleModal';
import { formatDate } from '@/i18n/format';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  workspacesFailed: 'Could not load your workspaces.', pathsFailed: 'Could not load the learning paths.', deleted: 'Path deleted.', deleteFailed: 'Could not delete the path. Please retry.', retry: 'Retry',
  notMaintainer: 'You are not a maintainer of any workspace yet. Owners and maintainers of a workspace can write learning paths for it.',
  path: 'Path', status: 'Status', steps: 'Steps', people: 'People', finished: 'Finished', attention: 'Needs attention', updated: 'Updated', edit: 'Edit',
  deleteTitle: 'Delete this path?', deleteBody: 'What was given to people, and their progress, is deleted with it.', delete: 'Delete', workspace: 'Workspace', newPath: 'New path',
  empty: 'No learning paths for this workspace yet. Write the first one for the people you are onboarding.',
}, {
  workspacesFailed: 'Không tải được các không gian làm việc của bạn.', pathsFailed: 'Không tải được các lộ trình học.', deleted: 'Đã xoá lộ trình.', deleteFailed: 'Không xoá được lộ trình. Vui lòng thử lại.', retry: 'Thử lại',
  notMaintainer: 'Bạn chưa là người bảo trì của không gian làm việc nào. Chủ sở hữu và người bảo trì mới viết được lộ trình học cho không gian làm việc.',
  path: 'Lộ trình', status: 'Trạng thái', steps: 'Số bước', people: 'Người học', finished: 'Đã xong', attention: 'Cần chú ý', updated: 'Cập nhật', edit: 'Sửa',
  deleteTitle: 'Xoá lộ trình này?', deleteBody: 'Việc giao cho mọi người, cùng tiến độ của họ, sẽ bị xoá theo.', delete: 'Xoá', workspace: 'Không gian làm việc', newPath: 'Lộ trình mới',
  empty: 'Không gian làm việc này chưa có lộ trình học nào. Hãy viết lộ trình đầu tiên cho người mới bạn đang hướng dẫn.',
});

/** The learning paths of the workspaces the person maintains: write them, give them to people, see how far people have got. */
export default function ManagePaths() {
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<ManagedProject[] | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The list remembers which workspace it is for, so changing the workspace never shows the previous one's paths.
  const [listed, setListed] = useState<{ projectId: string; paths: PathSummary[] } | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [people, setPeople] = useState<PathSummary | null>(null);
  const m = useMessages(MSG);

  useEffect(() => {
    const controller = new AbortController();
    getManagedProjects(controller.signal)
      .then(setProjects)
      .catch(cause => { if (!controller.signal.aborted) setProjectsError(cause instanceof Error ? cause.message : translate(MSG, 'workspacesFailed')); });
    return () => controller.abort();
  }, [attempt]);

  const requested = params.get('workspace');
  const projectId = projects?.find(p => p.id === requested)?.id ?? projects?.[0]?.id;

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    listPaths(projectId, controller.signal)
      .then(paths => { setListed({ projectId, paths }); setListError(null); })
      .catch(cause => { if (!controller.signal.aborted) setListError(cause instanceof Error ? cause.message : translate(MSG, 'pathsFailed')); });
    return () => controller.abort();
  }, [projectId, reload]);

  const refresh = useCallback(() => setReload(v => v + 1), []);
  const paths = listed && listed.projectId === projectId ? listed.paths : null;

  async function remove(path: PathSummary) {
    if (!projectId) return;
    try {
      await deletePath(projectId, path.id);
      message.success(m('deleted'));
      refresh();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('deleteFailed'));
    }
  }

  if (projectsError) return <Alert type="error" showIcon title={projectsError} action={<Button onClick={() => { setProjectsError(null); setAttempt(a => a + 1); }}>{m('retry')}</Button>} />;
  if (!projects) return <Skeleton active paragraph={{ rows: 4 }} />;
  if (!projects.length || !projectId) {
    return <div className={featurePanel}><Empty description={m('notMaintainer')} /></div>;
  }

  const columns: ColumnsType<PathSummary> = [
    { title: m('path'), render: (_, p) => <span><Link to={`/learning/manage/${encodeURIComponent(projectId)}/${encodeURIComponent(p.id)}`} className="font-medium text-[var(--at-link)]">{p.title}</Link>{p.description && <span className="block text-[11px] text-[var(--at-muted)] line-clamp-1">{p.description}</span>}</span> },
    { title: m('status'), render: (_, p) => { const tag = pathStatusTag(p.status); return <Tag color={tag.color}>{tag.label}</Tag>; } },
    { title: m('steps'), dataIndex: 'stepCount', align: 'right' },
    { title: m('people'), dataIndex: 'assigned', align: 'right' },
    { title: m('finished'), dataIndex: 'finished', align: 'right' },
    { title: m('attention'), render: (_, p) => { const text = attentionText(p); return text ? <Tag color={p.missingSteps ? 'red' : 'orange'}>{text}</Tag> : <span className="text-[var(--at-muted)]">–</span>; } },
    { title: m('updated'), render: (_, p) => formatDate(p.updatedAt) },
    {
      title: '', align: 'right', render: (_, p) => <div className="flex justify-end gap-1">
        <Button size="small" onClick={() => setPeople(p)}>{m('people')}</Button>
        <Link to={`/learning/manage/${encodeURIComponent(projectId)}/${encodeURIComponent(p.id)}`}><Button size="small">{m('edit')}</Button></Link>
        <Popconfirm title={m('deleteTitle')} description={m('deleteBody')} okText={m('delete')} okButtonProps={{ danger: true }} onConfirm={() => void remove(p)}>
          <Button size="small" danger>{m('delete')}</Button>
        </Popconfirm>
      </div>,
    },
  ];

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Select className="min-w-64" aria-label={m('workspace')} value={projectId} onChange={(v: string) => setParams({ tab: 'manage', workspace: v })} options={projects.map(p => ({ value: p.id, label: p.name }))} />
      <Link to={`/learning/manage/${encodeURIComponent(projectId)}/new`}><Button type="primary" icon={<Plus size={14} />}>{m('newPath')}</Button></Link>
    </div>
    {listError && <Alert type="error" showIcon title={listError} action={<Button onClick={() => { setListError(null); refresh(); }}>{m('retry')}</Button>} />}
    <div className={featurePanel}>
      {!paths && !listError ? <Skeleton active paragraph={{ rows: 3 }} /> : <Table<PathSummary> rowKey="id" size="small" columns={columns} dataSource={paths ?? []} pagination={false} scroll={{ x: 900 }}
        locale={{ emptyText: <Empty description={m('empty')} /> }} />}
    </div>
    {people && projectId && <PathPeopleModal projectId={projectId} path={people} onClose={() => setPeople(null)} onChanged={refresh} />}
  </div>;
}
