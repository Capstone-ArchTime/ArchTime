import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Progress, Skeleton } from 'antd';
import { featurePanel } from '@/components/FeaturePage';
import { getMyPaths } from '@/features/onboarding-api';
import type { MyPath } from '@/features/onboarding-api';
import { learningHref, pathToContinue } from '@/features/onboarding-context';
import { progressText } from '@/features/onboarding-view';
import ContinueLearning from './ContinueLearning';
import { defineMessages, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  start: 'Start', review: 'Review', continue: 'Continue', loadFailed: 'Could not load your learning paths.', retry: 'Retry',
  empty: 'No learning paths yet. When a mentor of a workspace you belong to gives you one, it appears here.', workspace: 'Workspace', next: 'Next: {title}',
}, {
  start: 'Bắt đầu', review: 'Xem lại', continue: 'Học tiếp', loadFailed: 'Không tải được các lộ trình học của bạn.', retry: 'Thử lại',
  empty: 'Chưa có lộ trình học nào. Khi mentor của một không gian làm việc bạn tham gia giao lộ trình cho bạn, nó sẽ xuất hiện ở đây.', workspace: 'Không gian làm việc', next: 'Tiếp theo: {title}',
});

const verb = (path: MyPath) => (path.done === 0 ? 'start' : path.done >= path.total ? 'review' : 'continue');

/** The paths given to the signed-in person, with their own progress on each. */
export default function MyPaths() {
  const [paths, setPaths] = useState<MyPath[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const m = useMessages(MSG);

  useEffect(() => {
    const controller = new AbortController();
    getMyPaths(controller.signal)
      .then(setPaths)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : m('loadFailed')); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the message function changes with the language; reloading then is not needed
  }, [attempt]);

  if (error) return <Alert type="error" showIcon title={error} action={<Button onClick={() => { setError(null); setAttempt(a => a + 1); }}>{m('retry')}</Button>} />;
  if (!paths) return <Skeleton active paragraph={{ rows: 4 }} />;
  if (!paths.length) {
    return <div className={featurePanel}><Empty description={m('empty')} /></div>;
  }
  // The others are all in the grid below, so the card does not count them again.
  const current = pathToContinue(paths);
  return <div className="space-y-4">
    {current && <ContinueLearning path={current.path} others={0} />}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {paths.map(path => (
        <article key={path.pathId} className={`${featurePanel} flex flex-col gap-3`} aria-label={path.title}>
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--at-muted)]">{path.projectName ?? m('workspace')}</p>
            <h3 className="mt-1 text-lg font-semibold">{path.title}</h3>
            {path.description && <p className="mt-1 text-sm text-[var(--at-muted)] line-clamp-2">{path.description}</p>}
          </div>
          <div className="mt-auto space-y-1">
            <div className="flex items-center justify-between text-xs text-[var(--at-muted)]"><span>{progressText(path)}</span><span>{path.percent}%</span></div>
            <Progress percent={path.percent} showInfo={false} status={path.done >= path.total && path.total > 0 ? 'success' : 'active'} />
          </div>
          {path.nextStep && <p className="text-xs text-[var(--at-muted)] truncate">{m('next', { title: path.nextStep.title })}</p>}
          <Link to={learningHref(path.projectId, path.pathId, path.nextStep?.id)}><Button type={path.done === 0 ? 'primary' : 'default'} block>{m(verb(path))}</Button></Link>
        </article>
      ))}
    </div>
  </div>;
}
