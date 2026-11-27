import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Progress, Segmented, Skeleton, Statistic, Table } from 'antd';
import { featurePanel } from '@/components/FeaturePage';
import { getOnboardingProgress, type OnboardingProgress } from '@/features/billing-api';
import type { Organization } from '@/features/organizations-api';
import { formatDateTime } from '@/i18n/format';
import { useMessages } from '@/i18n/define';
import { BILL } from '../billing/messages';

/** UC-34: onboarding progress across every workspace of the organization, for its owners. */
export default function OnboardingProgressTab({ organization }: { organization: Organization }) {
  const m = useMessages(BILL);
  const [data, setData] = useState<OnboardingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<'path' | 'learner'>('path');

  useEffect(() => {
    const controller = new AbortController();
    getOnboardingProgress(organization.id, controller.signal)
      .then(d => { setError(null); setData(d); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : m('progressFailed')); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization.id, attempt]);

  if (error) return <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => setAttempt(a => a + 1)}>{m('retry')}</Button>} />;
  if (!data) return <Skeleton active paragraph={{ rows: 4 }} />;
  if (!data.totals.paths) return <div className={featurePanel}><Empty description={m('noPaths')} /></div>;

  const pathRows = data.workspaces.flatMap(w => w.paths.map(p => ({ ...p, key: `${w.projectId}:${p.pathId}`, projectName: w.projectName })));
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--at-muted)]">{m('progressIntro')}</p>
      <div className={`${featurePanel} grid grid-cols-2 gap-4 sm:grid-cols-4`}>
        <Statistic title={m('people')} value={data.totals.people} />
        <Statistic title={m('assigned')} value={data.totals.assignments} />
        <Statistic title={m('completed')} value={data.totals.completed} />
        <Statistic title={m('average')} value={data.totals.averagePercent} suffix="%" />
      </div>
      <Segmented value={view} onChange={v => setView(v as 'path' | 'learner')} options={[{ value: 'path', label: m('byPath') }, { value: 'learner', label: m('byLearner') }]} />
      <div className={featurePanel}>
        {view === 'path' ? (
          <Table size="small" rowKey="key" pagination={false} dataSource={pathRows} scroll={{ x: true }}
            columns={[
              { title: m('workspace'), dataIndex: 'projectName' },
              { title: m('path'), dataIndex: 'title' },
              { title: m('learners'), dataIndex: 'learners', align: 'right' },
              { title: m('completed'), dataIndex: 'completed', align: 'right' },
              { title: m('average'), dataIndex: 'averagePercent', render: (v: number) => <Progress percent={v} size="small" /> },
            ]} />
        ) : (
          <Table size="small" rowKey={r => `${r.userId}:${r.pathId}`} dataSource={data.learners} pagination={{ pageSize: 20, hideOnSinglePage: true }} scroll={{ x: true }}
            columns={[
              { title: m('learner'), key: 'who', render: (_, r) => <span>{r.name ?? r.userId}<br /><span className="text-xs text-[var(--at-muted)]">{r.email}</span></span> },
              { title: m('workspace'), dataIndex: 'projectName' },
              { title: m('path'), dataIndex: 'pathTitle' },
              { title: m('progress'), key: 'p', render: (_, r) => <Progress percent={r.percent} size="small" format={() => `${r.done}/${r.total}`} /> },
              { title: m('lastActivity'), dataIndex: 'lastActivityAt', render: (v: string) => formatDateTime(v) },
            ]} />
        )}
      </div>
    </div>
  );
}
