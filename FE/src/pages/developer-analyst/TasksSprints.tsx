import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Empty, Input, Progress as Bar, Segmented, Select, Spin, Switch, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { FileSearch, GitCommitHorizontal, Link2, Upload } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Details } from '@/components/PageHeader';
import { getManagedProjects, getReadableProjects, type ProjectSummary } from '@/features/project-data';
import {
  STATUS_COLORS, edgeLabel, fetchTaskBoard, fetchTaskImpact, filterTasks, impactSummary, importJiraExport, importSummary, progressLabel, relinkCommits,
} from '@/features/tasks';
import type { Sprint, Task, TaskBoard, TaskFilter, TaskImpact } from '@/features/tasks';
import { ApiError } from '@/api/client';
import { formatDate, formatDateTime } from '@/i18n/format';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';
import type { Params } from '@/i18n';

const MSG = defineMessages({
  sprintRemoved: 'The latest export no longer has this sprint.', removed: 'removed', progress: '{name} progress', points: ' · {done} / {total} points',
  impactFailed: 'Could not load the impact.', unconfirmed: ' (components from an unconfirmed diagram)', trailer: ' · Task: trailer', notMined: 'no longer in the mined history',
  deps: '+{added} / −{removed} dependencies', inside: 'inside {list}', openEvidence: 'Open the evidence of commit {hash}', viewEvidence: 'View evidence',
  tasksFailed: 'Could not load the tasks.', tooLarge: 'The file is larger than 2 MB. Export fewer issues at a time.', importFailed: 'The import failed.',
  linked: '{linked} new commit links from {count} mined commits.', linked_one: '{linked} new commit links from 1 mined commit.', linkFailed: 'Linking failed.', retry: 'Retry',
  key: 'Key', summary: 'Summary', noSummary: 'No summary', notInExport: 'Not in the export imported on {date}.', status: 'Status', noStatus: 'No status', assignee: 'Assignee', unassigned: 'Unassigned',
  pointsCol: 'Points', sprint: 'Sprint', backlog: 'Backlog', commits: 'Commits', notImported: 'The export was not imported',
  tasks: '{count} tasks', tasks_one: '1 task', removedN: ', {n} removed', linkedCommits: ' · {count} linked commits', linkedCommits_one: ' · 1 linked commit', lastImport: ' · last import {date}', noTasks: 'No tasks imported yet.',
  exportFile: 'Jira export file', linkTip: 'Links every mined commit whose message names a task key (ARCH-12, T22) to that task. Mining does this after every batch.', linkAgain: 'Link commits again', importJira: 'Import Jira export',
  emptyMaintainer: "Import a Jira JSON export (the issue search format) to see this workspace's tasks and sprints.", emptyReader: 'No tasks yet. A maintainer of this workspace imports them from Jira.', sprints: 'Sprints',
  allTasks: 'All tasks', pickSprint: 'Pick a sprint above', searchPlaceholder: 'Key, summary or assignee', searchLabel: 'Search tasks', showRemoved: 'Show removed tasks', noMatch: 'No task matches.',
  workspacesFailed: 'Could not load workspaces.', title: 'Tasks & Sprints', intro: 'Jira tasks, the commits that name them, and sprint progress.',
  details: 'Tasks come from a Jira JSON export (the issue search format). A commit is linked to a task when its message names the task key. Sprint progress is Done / all tasks of the sprint; removed tasks are not counted.',
  workspace: 'Workspace', noWorkspace: 'No workspace yet.',
}, {
  sprintRemoved: 'Bản xuất mới nhất không còn sprint này.', removed: 'đã xoá', progress: 'Tiến độ {name}', points: ' · {done} / {total} điểm',
  impactFailed: 'Không tải được ảnh hưởng.', unconfirmed: ' (thành phần lấy từ sơ đồ chưa xác nhận)', trailer: ' · Task: trailer', notMined: 'không còn trong lịch sử đã mining',
  deps: '+{added} / −{removed} phụ thuộc', inside: 'trong {list}', openEvidence: 'Mở bằng chứng của commit {hash}', viewEvidence: 'Xem bằng chứng',
  tasksFailed: 'Không tải được các task.', tooLarge: 'Tệp lớn hơn 2 MB. Hãy xuất ít issue hơn mỗi lần.', importFailed: 'Nhập thất bại.',
  linked: '{linked} liên kết commit mới từ {count} commit đã mining.', linkFailed: 'Liên kết thất bại.', retry: 'Thử lại',
  key: 'Mã', summary: 'Tóm tắt', noSummary: 'Không có tóm tắt', notInExport: 'Không có trong bản xuất được nhập ngày {date}.', status: 'Trạng thái', noStatus: 'Không có trạng thái', assignee: 'Người nhận', unassigned: 'Chưa giao',
  pointsCol: 'Điểm', sprint: 'Sprint', backlog: 'Backlog', commits: 'Commit', notImported: 'Bản xuất chưa được nhập',
  tasks: '{count} task', removedN: ', {n} đã xoá', linkedCommits: ' · {count} commit được liên kết', lastImport: ' · lần nhập gần nhất {date}', noTasks: 'Chưa nhập task nào.',
  exportFile: 'Tệp xuất Jira', linkTip: 'Liên kết mọi commit đã mining có thông điệp nhắc tới mã task (ARCH-12, T22) với task đó. Mining tự làm việc này sau mỗi đợt.', linkAgain: 'Liên kết commit lại', importJira: 'Nhập bản xuất Jira',
  emptyMaintainer: 'Hãy nhập bản xuất JSON của Jira (định dạng issue search) để xem task và sprint của không gian làm việc này.', emptyReader: 'Chưa có task nào. Người bảo trì không gian làm việc này sẽ nhập chúng từ Jira.', sprints: 'Sprint',
  allTasks: 'Mọi task', pickSprint: 'Chọn một sprint ở trên', searchPlaceholder: 'Mã, tóm tắt hoặc người nhận', searchLabel: 'Tìm task', showRemoved: 'Hiện task đã xoá', noMatch: 'Không có task nào khớp.',
  workspacesFailed: 'Không tải được các không gian làm việc.', title: 'Task & Sprint', intro: 'Task Jira, các commit nhắc tới chúng, và tiến độ sprint.',
  details: 'Task lấy từ bản xuất JSON của Jira (định dạng issue search). Commit được liên kết với task khi thông điệp của nó nhắc tới mã task. Tiến độ sprint là Done / tổng task của sprint; task đã xoá không được tính.',
  workspace: 'Không gian làm việc', noWorkspace: 'Chưa có không gian làm việc nào.',
});
const tx = (key: Parameters<typeof translate<typeof MSG.en>>[1], params?: Params) => translate(MSG, key, params);

// Tasks & Sprints (F-13, WF-07): the tasks of a workspace imported from Jira, the commits that name them, and sprint
// progress (Done / total). Everyone who can read the workspace sees it; maintainers import and relink.

const panel = 'rounded-xl border border-[var(--at-border)] bg-[var(--at-surface)] p-4';
const day = (iso: string | null) => (iso ? formatDate(iso) : '—');
const MAX_FILE_BYTES = 2_000_000;

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
  return <div className="space-y-2">
    {impact && <p className="text-xs text-[var(--at-muted)]">{impactSummary(impact)}{impact.diagram && !impact.diagram.confirmed ? tx('unconfirmed') : ''}</p>}
    {error && <p className="text-xs text-[var(--at-warn)]">{error}</p>}
    <ul className="space-y-2 text-sm">
      {task.commits.map(c => {
        const i = byHash.get(c.hash);
        return <li key={c.hash} className="space-y-1">
          <div className="flex gap-2 items-baseline flex-wrap">
            <GitCommitHorizontal size={13} className="shrink-0 self-center" />
            <code>{c.hash}</code><span className="break-words">{c.title}</span>
            <span className="text-xs text-[var(--at-muted)] shrink-0">{c.author} · {day(c.date)}{c.source === 'trailer' ? tx('trailer') : ''}</span>
          </div>
          {i && <div className="pl-5 flex flex-wrap items-center gap-1 text-xs">
            {!i.mined ? <Tag>{tx('notMined')}</Tag> : <>
              <Tag color={i.depAdded || i.depRemoved ? 'gold' : undefined}>{tx('deps', { added: i.depAdded, removed: i.depRemoved })}</Tag>
              {i.edges.map(e => <Tag key={`${e.source}>${e.target}`} color="purple">{edgeLabel(e)}</Tag>)}
              {!i.edges.length && i.components.length > 0 && <span className="text-[var(--at-muted)]">{tx('inside', { list: i.components.join(', ') })}</span>}
              {i.evidenceId && <Link to={`/evidence?projectId=${encodeURIComponent(project)}&commit=${encodeURIComponent(c.hash)}`}
                aria-label={tx('openEvidence', { hash: c.hash })}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--at-link)] px-2 py-0.5 text-xs font-semibold text-[var(--at-link)] hover:bg-[var(--at-link)] hover:text-[var(--at-page)] transition-colors">
                <FileSearch size={12} /> {tx('viewEvidence')}
              </Link>}
            </>}
          </div>}
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

  if (error && !board) return <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => setRevision(v => v + 1)}>{m('retry')}</Button>} />;
  if (!board) return <div className="py-20 flex justify-center"><Spin /></div>;

  const rows = filterTasks(board.tasks, filter);
  const columns: ColumnsType<Task> = [
    { title: m('key'), dataIndex: 'key', width: 110, render: (key: string, t) => <span className={t.removed ? 'line-through text-[var(--at-muted)]' : 'font-mono'}>{key}</span> },
    { title: m('summary'), dataIndex: 'summary', render: (s: string, t) => <span className={t.removed ? 'text-[var(--at-muted)]' : ''}>{s || <em>{m('noSummary')}</em>}{t.removed && <Tooltip title={m('notInExport', { date: day(t.removedAt) })}><Tag className="!ml-2">{m('removed')}</Tag></Tooltip>}</span> },
    { title: m('status'), dataIndex: 'status', width: 140, render: (s: string | null, t) => <Tag color={STATUS_COLORS[t.statusCategory]}>{s ?? m('noStatus')}</Tag> },
    { title: m('assignee'), dataIndex: 'assignee', width: 150, render: (a: string | null) => a ?? <span className="text-[var(--at-muted)]">{m('unassigned')}</span> },
    { title: m('pointsCol'), dataIndex: 'storyPoints', width: 80, align: 'right', render: (p: number | null) => p ?? '—' },
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
        <Button type="primary" icon={<Upload size={14} />} loading={importing} onClick={() => fileInput.current?.click()}>{m('importJira')}</Button>
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
            expandedRowRender: t => <TaskCommits project={project} task={t} />,
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
