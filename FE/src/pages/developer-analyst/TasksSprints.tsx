import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Empty, Input, Popconfirm, Progress as Bar, Segmented, Select, Spin, Switch, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ChevronRight, FileSearch, GitCommitHorizontal, Link2, Trash2, Upload } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Details } from '@/components/PageHeader';
import { getManagedProjects, getReadableProjects, type ProjectSummary } from '@/features/project-data';
import {
  STATUS_COLORS, clearTasks, edgeLabel, fetchTaskBoard, fetchTaskImpact, filterTasks, impactSummary, importJiraExport, importSummary, progressLabel, relinkCommits,
} from '@/features/tasks';
import type { Sprint, Task, TaskBoard, TaskFilter, TaskImpact } from '@/features/tasks';
import { ApiError } from '@/api/client';
import JiraSync from './JiraSync';
import { formatDate, formatDateTime } from '@/i18n/format';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';
import type { Params } from '@/i18n';

const MSG = defineMessages({
  sprintRemoved: 'The latest export no longer has this sprint.', removed: 'removed', progress: '{name} progress', points: ' · {done} / {total} points',
  impactFailed: 'Could not load the impact.', notMined: 'no longer in the mined history',
  depsChange: '{change} dependencies', openEvidence: 'Open the evidence of commit {hash}', viewEvidence: 'View evidence',
  tasksFailed: 'Could not load the tasks.', tooLarge: 'The file is larger than 20 MB. Export fewer issues at a time.', importFailed: 'The import failed.',
  linked: '{linked} new commit links from {count} mined commits.', linked_one: '{linked} new commit links from 1 mined commit.', linkFailed: 'Linking failed.', retry: 'Retry',
  key: 'Key', summary: 'Summary', noSummary: 'No summary', notInExport: 'Not in the export imported on {date}.', status: 'Status', noStatus: 'No status', assignee: 'Assignee', unassigned: 'Unassigned',
  pointsCol: 'Points', pointsTip: 'Story points from Jira (Story point estimate).', showCommits: 'Show the commits of {key}', hideCommits: 'Hide the commits of {key}', sprint: 'Sprint', backlog: 'Backlog', commits: 'Commits', notImported: 'The export was not imported',
  tasks: '{count} tasks', tasks_one: '1 task', removedN: ', {n} removed', linkedCommits: ' · {count} linked commits', linkedCommits_one: ' · 1 linked commit', lastImport: ' · last import {date}', noTasks: 'No tasks imported yet.',
  exportFile: 'Jira export file', linkTip: 'Links mined commits to the tasks their messages name (KAN-12).', linkAgain: 'Link commits again', importJira: 'Import Jira export',
  emptyMaintainer: "Connect Jira, or import a Jira JSON export, to see this workspace's tasks and sprints.", emptyReader: 'No tasks yet. A maintainer of this workspace imports them from Jira.', sprints: 'Sprints',
  allTasks: 'All tasks', pickSprint: 'Pick a sprint above', searchPlaceholder: 'Key, summary or assignee', searchLabel: 'Search tasks', showRemoved: 'Show removed tasks', noMatch: 'No task matches.',
  workspacesFailed: 'Could not load workspaces.', title: 'Tasks & Sprints', intro: 'Jira tasks, the commits that name them, and sprint progress.',
  details: 'Tasks come from Jira. A commit is linked to a task when its message names the task key. Sprint progress = Done / all tasks.',
  workspace: 'Workspace', noWorkspace: 'No workspace yet.',
  deleteImport: 'Delete imported tasks', deleteTitle: 'Delete all imported tasks?',
  deleteBody: 'Deletes {count} tasks with their sprints and commit links. Mined commits stay.',
  deleteConfirm: 'Delete', cancel: 'Cancel', deleted: 'Deleted {tasks} tasks and {sprints} sprints.', deleteFailed: 'Could not delete the tasks.',
}, {
  sprintRemoved: 'Bản xuất mới nhất không còn sprint này.', removed: 'đã xoá', progress: 'Tiến độ {name}', points: ' · {done} / {total} điểm',
  impactFailed: 'Không tải được ảnh hưởng.', notMined: 'không còn trong lịch sử đã mining',
  depsChange: '{change} phụ thuộc', openEvidence: 'Mở bằng chứng của commit {hash}', viewEvidence: 'Xem bằng chứng',
  tasksFailed: 'Không tải được các task.', tooLarge: 'Tệp lớn hơn 20 MB. Hãy xuất ít issue hơn mỗi lần.', importFailed: 'Nhập thất bại.',
  linked: '{linked} liên kết commit mới từ {count} commit đã mining.', linkFailed: 'Liên kết thất bại.', retry: 'Thử lại',
  key: 'Mã', summary: 'Tóm tắt', noSummary: 'Không có tóm tắt', notInExport: 'Không có trong bản xuất được nhập ngày {date}.', status: 'Trạng thái', noStatus: 'Không có trạng thái', assignee: 'Người nhận', unassigned: 'Chưa giao',
  pointsCol: 'Điểm', pointsTip: 'Story point lấy từ Jira (trường Story point estimate).', showCommits: 'Hiện commit của {key}', hideCommits: 'Ẩn commit của {key}', sprint: 'Sprint', backlog: 'Backlog', commits: 'Commit', notImported: 'Bản xuất chưa được nhập',
  tasks: '{count} task', removedN: ', {n} đã xoá', linkedCommits: ' · {count} commit được liên kết', lastImport: ' · lần nhập gần nhất {date}', noTasks: 'Chưa nhập task nào.',
  exportFile: 'Tệp xuất Jira', linkTip: 'Liên kết commit đã mining với task được nhắc trong message (KAN-12).', linkAgain: 'Liên kết commit lại', importJira: 'Nhập bản xuất Jira',
  emptyMaintainer: 'Hãy kết nối Jira, hoặc nhập bản xuất JSON của Jira, để xem task và sprint của không gian làm việc này.', emptyReader: 'Chưa có task nào. Người bảo trì không gian làm việc này sẽ nhập chúng từ Jira.', sprints: 'Sprint',
  allTasks: 'Mọi task', pickSprint: 'Chọn một sprint ở trên', searchPlaceholder: 'Mã, tóm tắt hoặc người nhận', searchLabel: 'Tìm task', showRemoved: 'Hiện task đã xoá', noMatch: 'Không có task nào khớp.',
  workspacesFailed: 'Không tải được các không gian làm việc.', title: 'Task & Sprint', intro: 'Task Jira, các commit nhắc tới chúng, và tiến độ sprint.',
  details: 'Task lấy từ Jira. Commit được liên kết với task khi message nhắc tới mã task. Tiến độ sprint = Done / tổng task.',
  workspace: 'Không gian làm việc', noWorkspace: 'Chưa có không gian làm việc nào.',
  deleteImport: 'Xoá dữ liệu đã nhập', deleteTitle: 'Xoá mọi task đã nhập?',
  deleteBody: 'Xoá {count} task cùng sprint và liên kết commit. Commit đã mining vẫn giữ nguyên.',
  deleteConfirm: 'Xoá', cancel: 'Huỷ', deleted: 'Đã xoá {tasks} task và {sprints} sprint.', deleteFailed: 'Không xoá được các task.',
});
const tx = (key: Parameters<typeof translate<typeof MSG.en>>[1], params?: Params) => translate(MSG, key, params);

// Tasks & Sprints (F-13, WF-07): the tasks of a workspace imported from Jira, the commits that name them, and sprint
// progress (Done / total). Everyone who can read the workspace sees it; maintainers import and relink.

const panel = 'rounded-xl border border-[var(--at-border)] bg-[var(--at-surface)] p-4';
const day = (iso: string | null) => (iso ? formatDate(iso) : '—');
/** As the server accepts (TaskUseCases MAX_EXPORT_CHARS): a large project's Jira export is several MB. */
const MAX_FILE_BYTES = 20_000_000;

function SprintCard({ sprint, selected, onSelect }: { sprint: Sprint; selected: boolean; onSelect: () => void }) {
  const { progress } = sprint;
  return <button type="button" onClick={onSelect} aria-pressed={selected}
    className={`${panel} text-left w-full transition-colors ${selected ? 'ring-2 ring-[var(--at-link)]' : 'hover:border-[var(--at-link)]'}`}>
    <div className="flex items-center justify-between gap-2">
      <span className="font-semibold truncate">{sprint.name}</span>
      <span className="flex gap-1 shrink-0">
        {sprint.state && <Tag color={sprint.state === 'active' ? 'blue' : undefined}>{sprint.state}</Tag>}
        {sprint.removed && <Tooltip title={tx('sprintRemoved')}><Tag>{tx('removed')}</Tag></Tooltip>}
      </span>
    </div>
    <p className="text-xs text-[var(--at-muted)] mt-1">{day(sprint.startDate)} → {day(sprint.endDate)}</p>
    <Bar percent={progress.percent ?? 0} size="small" showInfo={false} status={progress.total && progress.done === progress.total ? 'success' : 'normal'} aria-label={tx('progress', { name: sprint.name })} />
    <p className="text-sm">{progressLabel(progress)}{progress.pointsTotal ? tx('points', { done: progress.pointsDone, total: progress.pointsTotal }) : ''}</p>
  </button>;
}

/** The commits of one task with what each changed in the architecture (DS-07a), loaded when the row is opened. */
function TaskCommits({ project, task }: { project: string; task: Task }) {
  const [impact, setImpact] = useState<TaskImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchTaskImpact(project, task.key, controller.signal).then(setImpact)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : tx('impactFailed')); });
    return () => controller.abort();
  }, [project, task.key]);
  const byHash = new Map((impact?.commits ?? []).map(c => [c.hash, c]));
  // One line per commit: what matters is which commit, when, what it changed between components, and its evidence.
  // The author and the full message are in the tooltip; the summary line only adds something for several commits.
  const several = task.commits.length > 1;
  return <div className="space-y-1.5">
    {impact && several && <p className="text-xs text-[var(--at-muted)]">{impactSummary(impact)}</p>}
    {error && <p className="text-xs text-[var(--at-warn)]">{error}</p>}
    <ul className="space-y-1 text-sm">
      {task.commits.map(c => {
        const i = byHash.get(c.hash);
        const change = i?.mined ? [i.depAdded ? `+${i.depAdded}` : '', i.depRemoved ? `−${i.depRemoved}` : ''].filter(Boolean).join(' ') : '';
        return <li key={c.hash} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <GitCommitHorizontal size={13} className="shrink-0 text-[var(--at-muted)]" aria-hidden="true" />
          <code className="text-xs text-[var(--at-muted)]">{c.hash}</code>
          <span className="min-w-0 max-w-[36rem] truncate" title={`${c.title}\n${c.author} · ${day(c.date)}`}>{c.title}</span>
          <span className="min-w-0 truncate text-xs text-[var(--at-muted)]">{c.author ? `${c.author} · ` : ''}{day(c.date)}</span>
          {i && !i.mined && <Tag className="!m-0">{tx('notMined')}</Tag>}
          {i?.edges.length
            ? i.edges.map(e => <Tag key={`${e.source}>${e.target}`} color="purple" className="!m-0">{edgeLabel(e)}</Tag>)
            : change && <Tag color="gold" className="!m-0">{tx('depsChange', { change })}</Tag>}
          {i?.evidenceId && <Link to={`/evidence?projectId=${encodeURIComponent(project)}&commit=${encodeURIComponent(c.hash)}`}
            aria-label={tx('openEvidence', { hash: c.hash })}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--at-link)] px-2 py-0.5 text-xs font-semibold text-[var(--at-link)] hover:bg-[var(--at-link)] hover:text-[var(--at-page)] transition-colors">
            <FileSearch size={12} /> {tx('viewEvidence')}
          </Link>}
        </li>;
      })}
    </ul>
  </div>;
}

function Board({ project, maintains }: { project: string; maintains: boolean }) {
  const { message } = App.useApp();
  const [board, setBoard] = useState<TaskBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState<TaskFilter>({ sprint: 'all', showRemoved: false, query: '' });
  const [importing, setImporting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const m = useMessages(MSG);

  useEffect(() => {
    const controller = new AbortController();
    fetchTaskBoard(project, controller.signal)
      .then(next => { setBoard(next); setError(null); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : tx('tasksFailed')); });
    return () => controller.abort();
  }, [project, revision]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setRefusal(m('tooLarge')); return; }
    setImporting(true);
    setRefusal(null);
    try {
      const result = await importJiraExport(project, await file.text());
      message.success(importSummary(result), 6);
      setRevision(v => v + 1);
    } catch (cause) {
      // The server refuses the whole file (MSG22 or a malformed value) and says why; nothing was imported.
      setRefusal(cause instanceof ApiError || cause instanceof Error ? cause.message : m('importFailed'));
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function relink() {
    setLinking(true);
    try {
      const r = await relinkCommits(project);
      message.success(m('linked', { linked: r.linked, count: r.commits }));
      setRevision(v => v + 1);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('linkFailed'));
    } finally { setLinking(false); }
  }

  async function deleteImport() {
    setDeleting(true);
    try {
      const r = await clearTasks(project);
      message.success(m('deleted', { tasks: r.tasks, sprints: r.sprints }));
      setRefusal(null);
      setFilter({ sprint: 'all', showRemoved: false, query: '' });
      setRevision(v => v + 1);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('deleteFailed'));
    } finally { setDeleting(false); }
  }

  if (error && !board) return <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => setRevision(v => v + 1)}>{m('retry')}</Button>} />;
  if (!board) return <div className="py-20 flex justify-center"><Spin /></div>;

  const rows = filterTasks(board.tasks, filter);
  const columns: ColumnsType<Task> = [
    { title: m('key'), dataIndex: 'key', width: 110, render: (key: string, t) => <span className={t.removed ? 'line-through text-[var(--at-muted)]' : 'font-mono'}>{key}</span> },
    { title: m('summary'), dataIndex: 'summary', render: (s: string, t) => <span className={t.removed ? 'text-[var(--at-muted)]' : ''}>{s || <em>{m('noSummary')}</em>}{t.removed && <Tooltip title={m('notInExport', { date: day(t.removedAt) })}><Tag className="!ml-2">{m('removed')}</Tag></Tooltip>}</span> },
    { title: m('status'), dataIndex: 'status', width: 140, render: (s: string | null, t) => <Tag color={STATUS_COLORS[t.statusCategory]}>{s ?? m('noStatus')}</Tag> },
    { title: m('assignee'), dataIndex: 'assignee', width: 150, render: (a: string | null) => a ?? <span className="text-[var(--at-muted)]">{m('unassigned')}</span> },
    // Story points come from Jira's "Story point estimate"; a board where no task has any does not show the column.
    ...(board.tasks.some(t => t.storyPoints !== null) ? [{
      title: <Tooltip title={m('pointsTip')}>{m('pointsCol')}</Tooltip>, dataIndex: 'storyPoints', width: 80, align: 'right' as const,
      render: (p: number | null) => p ?? <span className="text-[var(--at-muted)]">—</span>,
    }] : []),
    { title: m('sprint'), dataIndex: 'sprintName', width: 140, render: (s: string | null) => s ?? <span className="text-[var(--at-muted)]">{m('backlog')}</span> },
    { title: m('commits'), key: 'commits', width: 90, align: 'right', render: (_: unknown, t) => t.commits.length || <span className="text-[var(--at-muted)]">0</span> },
  ];

  return <div className="space-y-5">
    {refusal && <Alert type="error" showIcon closable onClose={() => setRefusal(null)} title={m('notImported')} description={refusal} />}
    {error && <Alert type="error" showIcon closable title={error} onClose={() => setError(null)} />}

    <div className="flex flex-wrap items-end justify-between gap-3">
      <p className="text-sm text-[var(--at-muted)]">
        {board.lastImportedAt ? <>{m('tasks', { count: board.totals.tasks })}{board.totals.removed ? m('removedN', { n: board.totals.removed }) : ''}{m('linkedCommits', { count: board.totals.linkedCommits })}{m('lastImport', { date: formatDateTime(board.lastImportedAt) })}</> : m('noTasks')}
      </p>
      {maintains && <div className="flex flex-wrap gap-2">
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" aria-label={m('exportFile')} onChange={e => onFile(e.target.files?.[0])} />
        <Tooltip title={m('linkTip')}>
          <Button icon={<Link2 size={14} />} loading={linking} disabled={!board.tasks.length} onClick={relink}>{m('linkAgain')}</Button>
        </Tooltip>
        <Button icon={<Upload size={14} />} loading={importing} onClick={() => fileInput.current?.click()}>{m('importJira')}</Button>
        <JiraSync project={project} onSynced={() => setRevision(v => v + 1)} beforeSync={board.tasks.length > 0 &&
          <Popconfirm title={m('deleteTitle')} description={<p className="max-w-xs">{m('deleteBody', { count: board.tasks.length })}</p>}
            okText={m('deleteConfirm')} cancelText={m('cancel')} okButtonProps={{ danger: true }} onConfirm={deleteImport}>
            <Button danger icon={<Trash2 size={14} />} loading={deleting} disabled={importing}>{m('deleteImport')}</Button>
          </Popconfirm>} />
      </div>}
    </div>

    {!board.tasks.length
      ? <div className={panel}><Empty description={maintains ? m('emptyMaintainer') : m('emptyReader')} /></div>
      : <>
        <section aria-label={m('sprints')} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {board.sprints.map(s => <SprintCard key={s.sprintId} sprint={s} selected={filter.sprint === s.sprintId} onSelect={() => setFilter(f => ({ ...f, sprint: f.sprint === s.sprintId ? 'all' : s.sprintId }))} />)}
          <button type="button" aria-pressed={filter.sprint === 'backlog'} onClick={() => setFilter(f => ({ ...f, sprint: f.sprint === 'backlog' ? 'all' : 'backlog' }))}
            className={`${panel} text-left ${filter.sprint === 'backlog' ? 'ring-2 ring-[var(--at-link)]' : ''}`}>
            <span className="font-semibold">{m('backlog')}</span>
            <p className="text-sm mt-2">{progressLabel(board.backlog)}</p>
          </button>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Segmented aria-label={m('sprint')} value={filter.sprint === 'all' ? 'all' : 'one'} onChange={v => v === 'all' && setFilter(f => ({ ...f, sprint: 'all' }))}
            options={[{ value: 'all', label: m('allTasks') }, { value: 'one', label: filter.sprint === 'all' ? m('pickSprint') : filter.sprint === 'backlog' ? m('backlog') : board.sprints.find(s => s.sprintId === filter.sprint)?.name ?? m('sprint'), disabled: filter.sprint === 'all' }]} />
          <Input.Search allowClear placeholder={m('searchPlaceholder')} className="!w-64" value={filter.query} onChange={e => setFilter(f => ({ ...f, query: e.target.value }))} aria-label={m('searchLabel')} />
          <label className="flex items-center gap-2 text-sm"><Switch size="small" checked={filter.showRemoved} onChange={v => setFilter(f => ({ ...f, showRemoved: v }))} /> {m('showRemoved')}</label>
        </div>

        <Table<Task> rowKey="key" size="small" columns={columns} dataSource={rows} pagination={{ pageSize: 25, hideOnSinglePage: true }}
          expandable={{
            rowExpandable: t => t.commits.length > 0,
            expandRowByClick: true,
            expandedRowRender: t => <TaskCommits project={project} task={t} />,
            expandIcon: ({ expanded, onExpand, record, expandable }) => expandable
              ? <button type="button" aria-expanded={expanded} aria-label={m(expanded ? 'hideCommits' : 'showCommits', { key: record.key })}
                onClick={e => { e.stopPropagation(); onExpand(record, e); }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--at-muted)] transition-colors hover:bg-[var(--at-panel-2)] hover:text-[var(--at-text)]">
                <ChevronRight size={15} aria-hidden="true" className={`transition-transform duration-200 ${expanded ? 'rotate-90 text-[var(--at-link)]' : ''}`} />
              </button>
              : null,
          }}
          locale={{ emptyText: m('noMatch') }} />
      </>}
  </div>;
}

export default function TasksSprints() {
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [managed, setManaged] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const project = params.get('projectId') ?? projects?.[0]?.id ?? null;
  const m = useMessages(MSG);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getReadableProjects(controller.signal), getManagedProjects(controller.signal).catch(() => [])])
      .then(([readable, mine]) => { setProjects(readable); setManaged(new Set(mine.map(p => p.id))); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : tx('workspacesFailed')); });
    return () => controller.abort();
  }, []);

  return <DashboardLayout>
    <div className="max-w-[1400px] mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{m('title')}</h2>
          <p className="mt-2 text-sm text-[var(--at-muted)] max-w-2xl">{m('intro')}</p>
          <Details className="mt-2"><p>{m('details')}</p></Details>
        </div>
        {projects && projects.length > 0 && <div className="w-full sm:w-72">
          <label htmlFor="tasks-workspace" className="block text-xs text-[var(--at-muted)] mb-1">{m('workspace')}</label>
          <Select id="tasks-workspace" className="w-full" value={project ?? undefined} onChange={id => setParams({ projectId: id })} options={projects.map(p => ({ value: p.id, label: p.name }))} />
        </div>}
      </header>
      {error && <Alert type="error" showIcon title={error} />}
      {!projects && !error && <div className="py-20 flex justify-center"><Spin /></div>}
      {projects && !projects.length && <div className={panel}><Empty description={m('noWorkspace')} /></div>}
      {project && projects?.length ? <Board key={project} project={project} maintains={managed.has(project)} /> : null}
    </div>
  </DashboardLayout>;
}
