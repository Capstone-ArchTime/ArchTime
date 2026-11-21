import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Modal, Popconfirm, Progress, Select, Skeleton, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { assignPath, getAssignableMembers, getPathProgress, unassignPath } from '@/features/onboarding-api';
import type { LearnerProgress, PathProgress, PathSummary, ProjectMember } from '@/features/onboarding-api';
import { learnerState, learnerStateLabel, progressText, struggled } from '@/features/onboarding-view';
import { formatDate } from '@/i18n/format';
import { defineMessages, message as translate, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  loadFailed: 'Could not load the people of this path.', given: 'Path given.', givenTo: 'Path given to {n} people.', giveFailed: 'Could not give the path. Please retry.',
  takenBack: 'Path taken back.', takeFailed: 'Could not take the path back. Please retry.', person: 'Person', unknown: 'Unknown person', progress: 'Progress', steps: 'Steps',
  stepStates: 'State of each step', step: 'Step', done: 'done', notDone: 'not done, {count} attempts', notDone_one: 'not done, 1 attempt', notStarted: 'not started',
  state: 'State', lastActivity: 'Last activity', takeTitle: 'Take this path back from {name}?', thisPerson: 'this person', takeBody: 'Their progress on it is lost.', takeBack: 'Take back',
  title: 'People on "{title}"', close: 'Close', retry: 'Retry', publishFirst: 'Publish this path to give it to people.', choose: 'Choose people to give this path to',
  everyone: 'Everyone in the workspace already has it', peopleLabel: 'People to give the path to', give: 'Give path', nobody: 'Nobody has this path yet.',
}, {
  loadFailed: 'Không tải được danh sách người học của lộ trình này.', given: 'Đã giao lộ trình.', givenTo: 'Đã giao lộ trình cho {n} người.', giveFailed: 'Không giao được lộ trình. Vui lòng thử lại.',
  takenBack: 'Đã thu hồi lộ trình.', takeFailed: 'Không thu hồi được lộ trình. Vui lòng thử lại.', person: 'Người học', unknown: 'Không rõ người dùng', progress: 'Tiến độ', steps: 'Các bước',
  stepStates: 'Trạng thái từng bước', step: 'Bước', done: 'đã xong', notDone: 'chưa xong, {count} lần thử', notStarted: 'chưa bắt đầu',
  state: 'Trạng thái', lastActivity: 'Hoạt động gần nhất', takeTitle: 'Thu hồi lộ trình này từ {name}?', thisPerson: 'người này', takeBody: 'Tiến độ của họ trên lộ trình sẽ mất.', takeBack: 'Thu hồi',
  title: 'Người học "{title}"', close: 'Đóng', retry: 'Thử lại', publishFirst: 'Hãy xuất bản lộ trình này để giao cho mọi người.', choose: 'Chọn người để giao lộ trình',
  everyone: 'Mọi người trong không gian làm việc đều đã có lộ trình này', peopleLabel: 'Người được giao lộ trình', give: 'Giao lộ trình', nobody: 'Chưa ai có lộ trình này.',
});

const STATE_COLOR = { 'not started': 'default', 'in progress': 'blue', finished: 'green' } as const;

/** Who has a path and how far each person has got, and giving it to more people. Only for the project's mentors. */
export default function PathPeopleModal({ projectId, path, onClose, onChanged }: { projectId: string; path: PathSummary; onClose: () => void; onChanged: () => void }) {
  const { message } = App.useApp();
  const [data, setData] = useState<{ progress: PathProgress; members: ProjectMember[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const m = useMessages(MSG);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getPathProgress(projectId, path.id, controller.signal), getAssignableMembers(projectId, controller.signal)])
      .then(([progress, members]) => setData({ progress, members }))
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : translate(MSG, 'loadFailed')); });
    return () => controller.abort();
  }, [projectId, path.id, attempt]);

  const refresh = () => { setAttempt(a => a + 1); onChanged(); };

  async function give() {
    setBusy(true);
    try {
      await assignPath(projectId, path.id, chosen);
      message.success(chosen.length === 1 ? m('given') : m('givenTo', { n: chosen.length }));
      setChosen([]);
      refresh();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('giveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function takeBack(learner: LearnerProgress) {
    try {
      await unassignPath(projectId, path.id, learner.userId);
      message.success(m('takenBack'));
      refresh();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : m('takeFailed'));
    }
  }

  const steps = data?.progress.path.steps ?? [];
  const taken = new Set(data?.progress.learners.map(l => l.userId));
  const candidates = (data?.members ?? []).filter(member => !taken.has(member.userId));

  const columns: ColumnsType<LearnerProgress> = [
    { title: m('person'), render: (_, l) => <span>{l.name ?? m('unknown')}<span className="block text-[11px] text-[var(--at-muted)]">{l.email}</span></span> },
    { title: m('progress'), render: (_, l) => <div className="min-w-32"><Progress percent={l.percent} size="small" showInfo={false} /><span className="text-xs text-[var(--at-muted)]">{progressText(l)}</span></div> },
    {
      title: m('steps'), render: (_, l) => <div className="flex flex-wrap gap-1" role="list" aria-label={m('stepStates')}>
        {l.steps.map((s, i) => {
          const hard = struggled(s.attempts, s.completed);
          const label = `${i + 1}. ${steps[i]?.title ?? m('step')}: ${s.completed ? m('done') : s.attempts ? m('notDone', { count: s.attempts }) : m('notStarted')}`;
          return <Tooltip key={s.stepId} title={label}><span role="listitem" aria-label={label} className={`h-3 w-3 rounded-sm ${s.completed ? 'bg-[var(--at-success)]' : hard ? 'bg-[var(--at-danger)]' : s.attempts ? 'bg-[var(--at-warn)]' : 'bg-[var(--at-line)]'}`} /></Tooltip>;
        })}
      </div>,
    },
    { title: m('state'), render: (_, l) => { const state = learnerState(l); return <Tag color={STATE_COLOR[state]}>{learnerStateLabel(state)}</Tag>; } },
    { title: m('lastActivity'), render: (_, l) => formatDate(l.lastActivityAt) },
    {
      title: '', align: 'right', render: (_, l) => (
        <Popconfirm title={m('takeTitle', { name: l.name ?? m('thisPerson') })} description={m('takeBody')} okText={m('takeBack')} okButtonProps={{ danger: true }} onConfirm={() => void takeBack(l)}>
          <Button size="small" danger>{m('takeBack')}</Button>
        </Popconfirm>
      ),
    },
  ];

  return <Modal open title={m('title', { title: path.title })} onCancel={onClose} footer={<Button onClick={onClose}>{m('close')}</Button>} width={900}>
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => { setError(null); setAttempt(a => a + 1); }}>{m('retry')}</Button>} />}
    {!error && !data && <Skeleton active paragraph={{ rows: 4 }} />}
    {data && <div className="space-y-4">
      {path.status !== 'published'
        ? <Alert type="info" showIcon title={m('publishFirst')} />
        : <div className="flex flex-wrap items-center gap-2">
          <Select mode="multiple" className="min-w-72 flex-1" placeholder={candidates.length ? m('choose') : m('everyone')} aria-label={m('peopleLabel')}
            value={chosen} onChange={setChosen} disabled={!candidates.length} optionFilterProp="label"
            options={candidates.map(member => ({ value: member.userId, label: `${member.name} (${member.email})` }))} />
          <Button type="primary" disabled={!chosen.length} loading={busy} onClick={() => void give()}>{m('give')}</Button>
        </div>}
      <Table<LearnerProgress> rowKey="userId" size="small" columns={columns} dataSource={data.progress.learners} pagination={false} scroll={{ x: 760 }}
        locale={{ emptyText: <Empty description={m('nobody')} /> }} />
    </div>}
  </Modal>;
}
