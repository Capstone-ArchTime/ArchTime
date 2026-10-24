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

  useEffect(() => {
    const controller = new AbortController();
    getManagedProjects(controller.signal)
      .then(setProjects)
      .catch(cause => { if (!controller.signal.aborted) setProjectsError(cause instanceof Error ? cause.message : 'Could not load your workspaces.'); });
    return () => controller.abort();
  }, [attempt]);

  const requested = params.get('workspace');
  const projectId = projects?.find(p => p.id === requested)?.id ?? projects?.[0]?.id;

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    listPaths(projectId, controller.signal)
      .then(paths => { setListed({ projectId, paths }); setListError(null); })
      .catch(cause => { if (!controller.signal.aborted) setListError(cause instanceof Error ? cause.message : 'Could not load the learning paths.'); });
    return () => controller.abort();
  }, [projectId, reload]);

  const refresh = useCallback(() => setReload(v => v + 1), []);
  const paths = listed && listed.projectId === projectId ? listed.paths : null;

  async function remove(path: PathSummary) {
    if (!projectId) return;
    try {
      await deletePath(projectId, path.id);
      message.success('Path deleted.');
      refresh();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not delete the path. Please retry.');
    }
  }

  if (projectsError) return <Alert type="error" showIcon title={projectsError} action={<Button onClick={() => { setProjectsError(null); setAttempt(a => a + 1); }}>Retry</Button>} />;
  if (!projects) return <Skeleton active paragraph={{ rows: 4 }} />;
  if (!projects.length || !projectId) {
    return <div className={featurePanel}><Empty description="You are not a maintainer of any workspace yet. Owners and maintainers of a workspace can write learning paths for it." /></div>;
  }

  const columns: ColumnsType<PathSummary> = [
    { title: 'Path', render: (_, p) => <span><Link to={`/learning/manage/${encodeURIComponent(projectId)}/${encodeURIComponent(p.id)}`} className="font-medium text-[#3b82f6]">{p.title}</Link>{p.description && <span className="block text-[11px] text-[#94a3b8] line-clamp-1">{p.description}</span>}</span> },
    { title: 'Status', render: (_, p) => { const tag = pathStatusTag(p.status); return <Tag color={tag.color}>{tag.label}</Tag>; } },
    { title: 'Steps', dataIndex: 'stepCount', align: 'right' },
    { title: 'People', dataIndex: 'assigned', align: 'right' },
    { title: 'Finished', dataIndex: 'finished', align: 'right' },
    { title: 'Needs attention', render: (_, p) => { const text = attentionText(p); return text ? <Tag color={p.missingSteps ? 'red' : 'orange'}>{text}</Tag> : <span className="text-[#94a3b8]">–</span>; } },
    { title: 'Updated', render: (_, p) => new Date(p.updatedAt).toLocaleDateString() },
    {
      title: '', align: 'right', render: (_, p) => <div className="flex justify-end gap-1">
        <Button size="small" onClick={() => setPeople(p)}>People</Button>
        <Link to={`/learning/manage/${encodeURIComponent(projectId)}/${encodeURIComponent(p.id)}`}><Button size="small">Edit</Button></Link>
        <Popconfirm title="Delete this path?" description="What was given to people, and their progress, is deleted with it." okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => void remove(p)}>
          <Button size="small" danger>Delete</Button>
        </Popconfirm>
      </div>,
    },
  ];

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Select className="min-w-64" aria-label="Workspace" value={projectId} onChange={(v: string) => setParams({ tab: 'manage', workspace: v })} options={projects.map(p => ({ value: p.id, label: p.name }))} />
      <Link to={`/learning/manage/${encodeURIComponent(projectId)}/new`}><Button type="primary" icon={<Plus size={14} />}>New path</Button></Link>
    </div>
    {listError && <Alert type="error" showIcon title={listError} action={<Button onClick={() => { setListError(null); refresh(); }}>Retry</Button>} />}
    <div className={featurePanel}>
      {!paths && !listError ? <Skeleton active paragraph={{ rows: 3 }} /> : <Table<PathSummary> rowKey="id" size="small" columns={columns} dataSource={paths ?? []} pagination={false} scroll={{ x: 900 }}
        locale={{ emptyText: <Empty description="No learning paths for this workspace yet. Write the first one for the people you are onboarding." /> }} />}
    </div>
    {people && projectId && <PathPeopleModal projectId={projectId} path={people} onClose={() => setPeople(null)} onChanged={refresh} />}
  </div>;
}
