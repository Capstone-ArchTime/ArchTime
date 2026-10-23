import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Modal, Popconfirm, Progress, Select, Skeleton, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { assignPath, getAssignableMembers, getPathProgress, unassignPath } from '@/features/onboarding-api';
import type { LearnerProgress, PathProgress, PathSummary, ProjectMember } from '@/features/onboarding-api';
import { learnerState, progressText, struggled } from '@/features/onboarding-view';

const STATE_COLOR = { 'not started': 'default', 'in progress': 'blue', finished: 'green' } as const;

/** Who has a path and how far each person has got, and giving it to more people. Only for the project's mentors. */
export default function PathPeopleModal({ projectId, path, onClose, onChanged }: { projectId: string; path: PathSummary; onClose: () => void; onChanged: () => void }) {
  const { message } = App.useApp();
  const [data, setData] = useState<{ progress: PathProgress; members: ProjectMember[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getPathProgress(projectId, path.id, controller.signal), getAssignableMembers(projectId, controller.signal)])
      .then(([progress, members]) => setData({ progress, members }))
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the people of this path.'); });
    return () => controller.abort();
  }, [projectId, path.id, attempt]);

  const refresh = () => { setAttempt(a => a + 1); onChanged(); };

  async function give() {
    setBusy(true);
    try {
      await assignPath(projectId, path.id, chosen);
      message.success(chosen.length === 1 ? 'Path given.' : `Path given to ${chosen.length} people.`);
      setChosen([]);
      refresh();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not give the path. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  async function takeBack(learner: LearnerProgress) {
    try {
      await unassignPath(projectId, path.id, learner.userId);
      message.success('Path taken back.');
      refresh();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not take the path back. Please retry.');
    }
  }

  const steps = data?.progress.path.steps ?? [];
  const taken = new Set(data?.progress.learners.map(l => l.userId));
  const candidates = (data?.members ?? []).filter(m => !taken.has(m.userId));

  const columns: ColumnsType<LearnerProgress> = [
    { title: 'Person', render: (_, l) => <span>{l.name ?? 'Unknown person'}<span className="block text-[11px] text-[#94a3b8]">{l.email}</span></span> },
    { title: 'Progress', render: (_, l) => <div className="min-w-32"><Progress percent={l.percent} size="small" showInfo={false} /><span className="text-xs text-[#94a3b8]">{progressText(l)}</span></div> },
    {
      title: 'Steps', render: (_, l) => <div className="flex flex-wrap gap-1" role="list" aria-label="State of each step">
        {l.steps.map((s, i) => {
          const hard = struggled(s.attempts, s.completed);
          const label = `${i + 1}. ${steps[i]?.title ?? 'Step'}: ${s.completed ? 'done' : s.attempts ? `not done, ${s.attempts} attempt${s.attempts === 1 ? '' : 's'}` : 'not started'}`;
          return <Tooltip key={s.stepId} title={label}><span role="listitem" aria-label={label} className={`h-3 w-3 rounded-sm ${s.completed ? 'bg-green-500' : hard ? 'bg-red-500' : s.attempts ? 'bg-amber-500' : 'bg-[#2a3038]'}`} /></Tooltip>;
        })}
      </div>,
    },
    { title: 'State', render: (_, l) => { const state = learnerState(l); return <Tag color={STATE_COLOR[state]}>{state}</Tag>; } },
    { title: 'Last activity', render: (_, l) => new Date(l.lastActivityAt).toLocaleDateString() },
    {
      title: '', align: 'right', render: (_, l) => (
        <Popconfirm title={`Take this path back from ${l.name ?? 'this person'}?`} description="Their progress on it is lost." okText="Take back" okButtonProps={{ danger: true }} onConfirm={() => void takeBack(l)}>
          <Button size="small" danger>Take back</Button>
        </Popconfirm>
      ),
    },
  ];

  return <Modal open title={`People on "${path.title}"`} onCancel={onClose} footer={<Button onClick={onClose}>Close</Button>} width={900}>
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => { setError(null); setAttempt(a => a + 1); }}>Retry</Button>} />}
    {!error && !data && <Skeleton active paragraph={{ rows: 4 }} />}
    {data && <div className="space-y-4">
      {path.status !== 'published'
        ? <Alert type="info" showIcon title="Publish this path to give it to people." />
        : <div className="flex flex-wrap items-center gap-2">
          <Select mode="multiple" className="min-w-72 flex-1" placeholder={candidates.length ? 'Choose people to give this path to' : 'Everyone in the workspace already has it'} aria-label="People to give the path to"
            value={chosen} onChange={setChosen} disabled={!candidates.length} optionFilterProp="label"
            options={candidates.map(m => ({ value: m.userId, label: `${m.name} (${m.email})` }))} />
          <Button type="primary" disabled={!chosen.length} loading={busy} onClick={() => void give()}>Give path</Button>
        </div>}
      <Table<LearnerProgress> rowKey="userId" size="small" columns={columns} dataSource={data.progress.learners} pagination={false} scroll={{ x: 760 }}
        locale={{ emptyText: <Empty description="Nobody has this path yet." /> }} />
    </div>}
  </Modal>;
}
