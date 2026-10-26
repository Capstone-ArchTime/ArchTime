import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Spin } from 'antd';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { getManagedProjects, getReadableProjects, type ProjectSummary } from '@/features/project-data';
import { describeAccessError } from './managed-access';
import { useAuth } from '@/auth/auth-context';
import { rememberMaintains } from '@/hooks/useMaintainsWorkspaces';

export function NoManagedWorkspaces() {
  return <Empty description={<span>You do not maintain any workspace yet. <Link to="/projects">Create a workspace</Link>, or ask a workspace owner to make you a maintainer.</span>} />;
}

function NoWorkspaces() {
  return <Empty description={<span>You are not in any workspace yet. <Link to="/projects">Create a workspace</Link>, or ask a workspace owner to invite you.</span>} />;
}

type LoadState = { status: 'loading' | 'ready' | 'error'; projects: ProjectSummary[]; managed: ReadonlySet<string>; error?: string };
const nothing: ReadonlySet<string> = new Set();

/**
 * Loads the workspaces this account maintains (or, with `scope="readable"`, every workspace it can see, plus which of
 * them it maintains) and renders the page only when there is at least one. Loading, errors and "no workspace" are
 * shown in the layout instead, so the page itself always has a workspace to work on.
 */
export function ManagedWorkspaces({ title, scope = 'managed', children }: { title: string; scope?: 'managed' | 'readable'; children: (projects: ProjectSummary[], managed: ReadonlySet<string>) => ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: 'loading', projects: [], managed: nothing });
  const [attempt, setAttempt] = useState(0);
  const userId = useAuth().user?.id;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getManagedProjects(controller.signal), scope === 'readable' ? getReadableProjects(controller.signal) : null])
      .then(([managed, readable]) => {
        // The navigation shows the Maintain group from the same answer, so it never offers pages this one calls empty.
        if (userId) rememberMaintains(userId, managed.length > 0);
        setState({ status: 'ready', projects: readable ?? managed, managed: new Set(managed.map(p => p.id)) });
      })
      .catch(error => { if (!controller.signal.aborted) setState({ status: 'error', projects: [], managed: nothing, error: describeAccessError(error, 'Your workspaces could not be loaded.') }); });
    return () => controller.abort();
  }, [attempt, userId, scope]);

  if (state.status === 'ready' && state.projects.length) return <>{children(state.projects, state.managed)}</>;
  return <DashboardLayout><div className="max-w-[1100px] mx-auto space-y-6">
    <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6]">{title}</h2>
    {state.status === 'loading' && <div className="p-12 text-center" role="status"><Spin /><p className="mt-3 text-[#94a3b8]">Loading your workspaces…</p></div>}
    {state.status === 'error' && <Alert type="error" showIcon title={state.error} action={<Button size="small" onClick={() => { setState({ status: 'loading', projects: [], managed: nothing }); setAttempt(n => n + 1); }}>Retry</Button>} />}
    {state.status === 'ready' && (scope === 'readable' ? <NoWorkspaces /> : <NoManagedWorkspaces />)}
  </div></DashboardLayout>;
}
