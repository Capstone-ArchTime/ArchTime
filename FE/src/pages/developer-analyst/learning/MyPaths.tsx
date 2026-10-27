import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Progress, Skeleton } from 'antd';
import { featurePanel } from '@/components/FeaturePage';
import { getMyPaths } from '@/features/onboarding-api';
import type { MyPath } from '@/features/onboarding-api';
import { learningHref, pathToContinue } from '@/features/onboarding-context';
import { progressText } from '@/features/onboarding-view';
import ContinueLearning from './ContinueLearning';

const verb = (path: MyPath) => (path.done === 0 ? 'Start' : path.done >= path.total ? 'Review' : 'Continue');

/** The paths given to the signed-in person, with their own progress on each. */
export default function MyPaths() {
  const [paths, setPaths] = useState<MyPath[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getMyPaths(controller.signal)
      .then(setPaths)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load your learning paths.'); });
    return () => controller.abort();
  }, [attempt]);

  if (error) return <Alert type="error" showIcon title={error} action={<Button onClick={() => { setError(null); setAttempt(a => a + 1); }}>Retry</Button>} />;
  if (!paths) return <Skeleton active paragraph={{ rows: 4 }} />;
  if (!paths.length) {
    return <div className={featurePanel}><Empty description="No learning paths yet. When a mentor of a workspace you belong to gives you one, it appears here." /></div>;
  }
  // The others are all in the grid below, so the card does not count them again.
  const current = pathToContinue(paths);
  return <div className="space-y-4">
    {current && <ContinueLearning path={current.path} others={0} />}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {paths.map(path => (
        <article key={path.pathId} className={`${featurePanel} flex flex-col gap-3`} aria-label={path.title}>
          <div>
            <p className="text-xs uppercase tracking-wider text-[#94a3b8]">{path.projectName ?? 'Workspace'}</p>
            <h3 className="mt-1 text-lg font-semibold">{path.title}</h3>
            {path.description && <p className="mt-1 text-sm text-[#94a3b8] line-clamp-2">{path.description}</p>}
          </div>
          <div className="mt-auto space-y-1">
            <div className="flex items-center justify-between text-xs text-[#94a3b8]"><span>{progressText(path)}</span><span>{path.percent}%</span></div>
            <Progress percent={path.percent} showInfo={false} status={path.done >= path.total && path.total > 0 ? 'success' : 'active'} />
          </div>
          {path.nextStep && <p className="text-xs text-slate-300 truncate">Next: {path.nextStep.title}</p>}
          <Link to={learningHref(path.projectId, path.pathId, path.nextStep?.id)}><Button type={path.done === 0 ? 'primary' : 'default'} block>{verb(path)}</Button></Link>
        </article>
      ))}
    </div>
  </div>;
}
