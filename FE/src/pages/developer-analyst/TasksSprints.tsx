import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Empty, Input, Progress as Bar, Segmented, Select, Spin, Switch, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { GitCommitHorizontal, Link2, Upload } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { getManagedProjects, getReadableProjects, type ProjectSummary } from '@/features/project-data';
import {
  STATUS_COLORS, edgeLabel, fetchTaskBoard, fetchTaskImpact, filterTasks, impactSummary, importJiraExport, importSummary, progressLabel, relinkCommits,
} from '@/features/tasks';
import type { Sprint, Task, TaskBoard, TaskFilter, TaskImpact } from '@/features/tasks';
import { ApiError } from '@/api/client';

// Tasks & Sprints (F-13, WF-07): the tasks of a workspace imported from Jira, the commits that name them, and sprint
// progress (Done / total). Everyone who can read the workspace sees it; maintainers import and relink.

const panel = 'rounded-xl border border-[var(--at-border)] bg-[var(--at-surface)] p-4';
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');
const MAX_FILE_BYTES = 2_000_000;

function SprintCard({ sprint, selected, onSelect }: { sprint: Sprint; selected: boolean; onSelect: () => void }) {
  const { progress } = sprint;
  return <button type="button" onClick={onSelect} aria-pressed={selected}
    className={`${panel} text-left w-full transition-colors ${selected ? 'ring-2 ring-[var(--at-link)]' : 'hover:border-[var(--at-link)]'}`}>
    <div className="flex items-center justify-between gap-2">
      <span className="font-semibold truncate">{sprint.name}</span>
      <span className="flex gap-1 shrink-0">
        {sprint.state && <Tag color={sprint.state === 'active' ? 'blue' : undefined}>{sprint.state}</Tag>}
        {sprint.removed && <Tooltip title="The latest export no longer has this sprint."><Tag>removed</Tag></Tooltip>}
      </span>
    </div>
    <p className="text-xs text-[var(--at-muted)] mt-1">{day(sprint.startDate)} → {day(sprint.endDate)}</p>
    <Bar percent={progress.percent ?? 0} size="small" showInfo={false} status={progress.total && progress.done === progress.total ? 'success' : 'normal'} aria-label={`${sprint.name} progress`} />
    <p className="text-sm">{progressLabel(progress)}{progress.pointsTotal ? ` · ${progress.pointsDone} / ${progress.pointsTotal} points` : ''}</p>
  </button>;
}

/** The commits of one task with what each changed in the architecture (DS-07a), loaded when the row is opened. */
function TaskCommits({ project, task }: { project: string; task: Task }) {
  const [impact, setImpact] = useState<TaskImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchTaskImpact(project, task.key, controller.signal).then(setImpact)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the impact.'); });
    return () => controller.abort();
  }, [project, task.key]);
  const byHash = new Map((impact?.commits ?? []).map(c => [c.hash, c]));
  return <div className="space-y-2">
    {impact && <p className="text-xs text-[var(--at-muted)]">{impactSummary(impact)}{impact.diagram && !impact.diagram.confirmed ? ' (components from an unconfirmed diagram)' : ''}</p>}
    {error && <p className="text-xs text-[var(--at-warn)]">{error}</p>}
    <ul className="space-y-2 text-sm">
      {task.commits.map(c => {
        const i = byHash.get(c.hash);
        return <li key={c.hash} className="space-y-1">
          <div className="flex gap-2 items-baseline flex-wrap">
            <GitCommitHorizontal size={13} className="shrink-0 self-center" />
            <code>{c.hash}</code><span className="break-words">{c.title}</span>
            <span className="text-xs text-[var(--at-muted)] shrink-0">{c.author} · {day(c.date)}{c.source === 'trailer' ? ' · Task: trailer' : ''}</span>
          </div>
          {i && <div className="pl-5 flex flex-wrap items-center gap-1 text-xs">
            {!i.mined ? <Tag>no longer in the mined history</Tag> : <>
              <Tag color={i.depAdded || i.depRemoved ? 'gold' : undefined}>+{i.depAdded} / −{i.depRemoved} dependencies</Tag>
              {i.edges.map(e => <Tag key={`${e.source}>${e.target}`} color="purple">{edgeLabel(e)}</Tag>)}
              {!i.edges.length && i.components.length > 0 && <span className="text-[var(--at-muted)]">inside {i.components.join(', ')}</span>}
              {i.evidenceId && <Link className="text-[var(--at-link)] hover:underline" to={`/evidence?projectId=${encodeURIComponent(project)}&commit=${encodeURIComponent(c.hash)}`}>Evidence</Link>}
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

  useEffect(() => {
    const controller = new AbortController();
    fetchTaskBoard(project, controller.signal)
      .then(next => { setBoard(next); setError(null); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the tasks.'); });
    return () => controller.abort();
  }, [project, revision]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setRefusal('The file is larger than 2 MB. Export fewer issues at a time.'); return; }
    setImporting(true);
    setRefusal(null);
    try {
      const result = await importJiraExport(project, await file.text());
      message.success(importSummary(result), 6);
      setRevision(v => v + 1);
    } catch (cause) {
      // The server refuses the whole file (MSG22 or a malformed value) and says why; nothing was imported.
      setRefusal(cause instanceof ApiError || cause instanceof Error ? cause.message : 'The import failed.');
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function relink() {
    setLinking(true);
    try {
      const r = await relinkCommits(project);
      message.success(`${r.linked} new commit link${r.linked === 1 ? '' : 's'} from ${r.commits} mined commit${r.commits === 1 ? '' : 's'}.`);
      setRevision(v => v + 1);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Linking failed.');
    } finally { setLinking(false); }
  }

  if (error && !board) return <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => setRevision(v => v + 1)}>Retry</Button>} />;
  if (!board) return <div className="py-20 flex justify-center"><Spin /></div>;

  const rows = filterTasks(board.tasks, filter);
  const columns: ColumnsType<Task> = [
    { title: 'Key', dataIndex: 'key', width: 110, render: (key: string, t) => <span className={t.removed ? 'line-through text-[var(--at-muted)]' : 'font-mono'}>{key}</span> },
    { title: 'Summary', dataIndex: 'summary', render: (s: string, t) => <span className={t.removed ? 'text-[var(--at-muted)]' : ''}>{s || <em>No summary</em>}{t.removed && <Tooltip title={`Not in the export imported on ${day(t.removedAt)}.`}><Tag className="!ml-2">removed</Tag></Tooltip>}</span> },
    { title: 'Status', dataIndex: 'status', width: 140, render: (s: string | null, t) => <Tag color={STATUS_COLORS[t.statusCategory]}>{s ?? 'No status'}</Tag> },
    { title: 'Assignee', dataIndex: 'assignee', width: 150, render: (a: string | null) => a ?? <span className="text-[var(--at-muted)]">Unassigned</span> },
    { title: 'Points', dataIndex: 'storyPoints', width: 80, align: 'right', render: (p: number | null) => p ?? '—' },
    { title: 'Sprint', dataIndex: 'sprintName', width: 140, render: (s: string | null) => s ?? <span className="text-[var(--at-muted)]">Backlog</span> },
    { title: 'Commits', key: 'commits', width: 90, align: 'right', render: (_: unknown, t) => t.commits.length || <span className="text-[var(--at-muted)]">0</span> },
  ];

  return <div className="space-y-5">
    {refusal && <Alert type="error" showIcon closable onClose={() => setRefusal(null)} title="The export was not imported" description={refusal} />}
    {error && <Alert type="error" showIcon closable title={error} onClose={() => setError(null)} />}

    <div className="flex flex-wrap items-end justify-between gap-3">
      <p className="text-sm text-[var(--at-muted)]">
        {board.lastImportedAt ? <>{board.totals.tasks} task{board.totals.tasks === 1 ? '' : 's'}{board.totals.removed ? `, ${board.totals.removed} removed` : ''} · {board.totals.linkedCommits} linked commit{board.totals.linkedCommits === 1 ? '' : 's'} · last import {new Date(board.lastImportedAt).toLocaleString()}</> : 'No tasks imported yet.'}
      </p>
      {maintains && <div className="flex flex-wrap gap-2">
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" aria-label="Jira export file" onChange={e => onFile(e.target.files?.[0])} />
        <Tooltip title="Links every mined commit whose message names a task key (ARCH-12, T22) to that task. Mining does this after every batch.">
          <Button icon={<Link2 size={14} />} loading={linking} disabled={!board.tasks.length} onClick={relink}>Link commits again</Button>
        </Tooltip>
        <Button type="primary" icon={<Upload size={14} />} loading={importing} onClick={() => fileInput.current?.click()}>Import Jira export</Button>
      </div>}
    </div>

    {!board.tasks.length
      ? <div className={panel}><Empty description={maintains ? 'Import a Jira JSON export (the issue search format) to see this workspace\'s tasks and sprints.' : 'No tasks yet. A maintainer of this workspace imports them from Jira.'} /></div>
      : <>
        <section aria-label="Sprints" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {board.sprints.map(s => <SprintCard key={s.sprintId} sprint={s} selected={filter.sprint === s.sprintId} onSelect={() => setFilter(f => ({ ...f, sprint: f.sprint === s.sprintId ? 'all' : s.sprintId }))} />)}
          <button type="button" aria-pressed={filter.sprint === 'backlog'} onClick={() => setFilter(f => ({ ...f, sprint: f.sprint === 'backlog' ? 'all' : 'backlog' }))}
            className={`${panel} text-left ${filter.sprint === 'backlog' ? 'ring-2 ring-[var(--at-link)]' : ''}`}>
            <span className="font-semibold">Backlog</span>
            <p className="text-sm mt-2">{progressLabel(board.backlog)}</p>
          </button>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Segmented aria-label="Sprint" value={filter.sprint === 'all' ? 'all' : 'one'} onChange={v => v === 'all' && setFilter(f => ({ ...f, sprint: 'all' }))}
            options={[{ value: 'all', label: 'All tasks' }, { value: 'one', label: filter.sprint === 'all' ? 'Pick a sprint above' : filter.sprint === 'backlog' ? 'Backlog' : board.sprints.find(s => s.sprintId === filter.sprint)?.name ?? 'Sprint', disabled: filter.sprint === 'all' }]} />
          <Input.Search allowClear placeholder="Key, summary or assignee" className="!w-64" value={filter.query} onChange={e => setFilter(f => ({ ...f, query: e.target.value }))} aria-label="Search tasks" />
          <label className="flex items-center gap-2 text-sm"><Switch size="small" checked={filter.showRemoved} onChange={v => setFilter(f => ({ ...f, showRemoved: v }))} /> Show removed tasks</label>
        </div>

        <Table<Task> rowKey="key" size="small" columns={columns} dataSource={rows} pagination={{ pageSize: 25, hideOnSinglePage: true }}
          expandable={{
            rowExpandable: t => t.commits.length > 0,
            expandedRowRender: t => <TaskCommits project={project} task={t} />,
          }}
          locale={{ emptyText: 'No task matches.' }} />
      </>}
  </div>;
}

export default function TasksSprints() {
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [managed, setManaged] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const project = params.get('projectId') ?? projects?.[0]?.id ?? null;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getReadableProjects(controller.signal), getManagedProjects(controller.signal).catch(() => [])])
      .then(([readable, mine]) => { setProjects(readable); setManaged(new Set(mine.map(p => p.id))); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load workspaces.'); });
    return () => controller.abort();
  }, []);

  return <DashboardLayout>
    <div className="max-w-[1400px] mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tasks & Sprints</h1>
          <p className="text-sm text-[var(--at-muted)] max-w-2xl">Work imported from Jira, the commits that name each task, and how far each sprint has come (Done / all tasks of the sprint; removed tasks are not counted).</p>
        </div>
        {projects && projects.length > 0 && <div className="w-full sm:w-72">
          <label htmlFor="tasks-workspace" className="block text-xs text-[var(--at-muted)] mb-1">Workspace</label>
          <Select id="tasks-workspace" className="w-full" value={project ?? undefined} onChange={id => setParams({ projectId: id })} options={projects.map(p => ({ value: p.id, label: p.name }))} />
        </div>}
      </header>
      {error && <Alert type="error" showIcon title={error} />}
      {!projects && !error && <div className="py-20 flex justify-center"><Spin /></div>}
      {projects && !projects.length && <div className={panel}><Empty description="No workspace yet." /></div>}
      {project && projects?.length ? <Board key={project} project={project} maintains={managed.has(project)} /> : null}
    </div>
  </DashboardLayout>;
}
