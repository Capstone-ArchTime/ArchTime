import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Progress, Skeleton, Tag } from 'antd';
import { Building2, FolderKanban, GraduationCap } from 'lucide-react';
import FeaturePage, { featurePanel } from '@/components/FeaturePage';
import { useAuth } from '@/auth/auth-context';
import { canAccess } from '@/auth/permissions';
import { getMyPaths } from '@/features/onboarding-api';
import type { MyPath } from '@/features/onboarding-api';
import { progressText } from '@/features/onboarding-view';
import {
  MAX_WORKSPACES, ORGANIZATION_ROLE_LABELS, WORKSPACE_ROLE_LABELS, getMyOrganizations, getMyWorkspaces, groupWorkspaces, orderPaths,
  statusView, summarizeLearning, workspaceRoleBreakdown, workspacesPerOrganization,
} from '@/features/my-work';
import type { MyOrganization, MyWorkspace } from '@/features/my-work';

type Load<T> = { data: T | null; error: string | null; retry: () => void };

/** Loads one source on its own, so one failing does not hide the others. */
function useLoad<T>(fetcher: (signal: AbortSignal) => Promise<T>, what: string): Load<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetcher(controller.signal)
      .then(setData)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : `Could not load ${what}.`); });
    return () => controller.abort();
    // The fetchers are module functions; only a retry starts a new load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  return { data, error, retry: () => { setError(null); setData(null); setAttempt(a => a + 1); } };
}

function Section({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold">{icon}{title}</h3>
        {hint && <span className="text-xs text-[#94a3b8]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Failed({ load }: { load: Load<unknown> }) {
  return <Alert type="error" showIcon title={load.error} action={<Button size="small" onClick={load.retry}>Retry</Button>} />;
}

function Tile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className={featurePanel}>
      <p className="text-xs uppercase tracking-wider text-[#94a3b8]">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {detail && <p className="mt-1 text-xs text-[#94a3b8]">{detail}</p>}
    </div>
  );
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : null);

function WorkspaceRow({ workspace, link }: { workspace: MyWorkspace; link: string | null }) {
  const status = statusView(workspace.status);
  const last = date(workspace.lastCommitDate);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-medium break-words">{link ? <Link to={link} className="hover:text-[#93c5fd]">{workspace.name}</Link> : workspace.name}</p>
        <p className="text-xs text-[#94a3b8]">
          {workspace.totalCommits !== null ? `${workspace.totalCommits} commits` : 'History not scanned yet'}
          {last && ` · last commit ${last}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Tag>{WORKSPACE_ROLE_LABELS[workspace.userRole] ?? workspace.userRole}</Tag>
        <Tag color={status.color}>{status.label}</Tag>
      </div>
    </li>
  );
}

/** The signed-in person's organizations, workspaces and learning progress. */
export default function MyWork() {
  const { user } = useAuth();
  const organizations = useLoad(getMyOrganizations, 'your organizations');
  const workspaces = useLoad(getMyWorkspaces, 'your workspaces');
  const paths = useLoad(getMyPaths, 'your learning paths');
  if (!user) return null;

  const orgs = organizations.data ?? [];
  const list = workspaces.data?.workspaces ?? [];
  const perOrg = workspacesPerOrganization(list);
  const learning = paths.data ? summarizeLearning(paths.data) : null;
  const workspaceLink = (id: string) => (canAccess(user.role, `/workspace/${id}`) ? `/workspace/${encodeURIComponent(id)}` : null);
  const pathLink = (p: MyPath) => {
    const to = `/learning/${encodeURIComponent(p.projectId)}/${encodeURIComponent(p.pathId)}`;
    return canAccess(user.role, to) ? to : null;
  };
  const roleBreakdown = workspaceRoleBreakdown(list);

  return (
    <FeaturePage title="My work" description="The organizations you belong to, the workspaces you can open, and how far you are in the learning paths given to you." demo={false}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Organizations" value={organizations.data ? orgs.length : '–'}
          detail={organizations.data ? `${orgs.filter(o => o.myRole === 'owner').length} you own` : null} />
        <Tile label="Workspaces" value={workspaces.data ? workspaces.data.total : '–'}
          detail={workspaces.data ? roleBreakdown : null} />
        <Tile label="Learning" value={learning ? `${learning.percent}%` : '–'}
          detail={learning ? `${learning.finished} of ${learning.assigned} paths finished` : null} />
      </div>

      <Section icon={<Building2 size={18} className="text-[#93c5fd]" />} title="Organizations">
        {organizations.error ? <Failed load={organizations} /> : !organizations.data ? <Skeleton active paragraph={{ rows: 2 }} /> : !orgs.length ? (
          <div className={featurePanel}><Empty description="You do not belong to an organization. Your workspaces are in your personal space." /></div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {orgs.map((o: MyOrganization) => (
              <article key={o.id} className={featurePanel} aria-label={o.name}>
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-semibold break-words">{o.name}</h4>
                  <Tag color={o.myRole === 'owner' ? 'blue' : undefined}>{ORGANIZATION_ROLE_LABELS[o.myRole]}</Tag>
                </div>
                {o.description && <p className="mt-1 text-sm text-[#94a3b8] line-clamp-2">{o.description}</p>}
                <p className="mt-3 text-xs text-[#94a3b8]">
                  {o.memberCount} {o.memberCount === 1 ? 'member' : 'members'}
                  {workspaces.data && ` · ${perOrg.get(o.id) ?? 0} of your workspaces`}
                </p>
              </article>
            ))}
          </div>
        )}
      </Section>

      <Section icon={<FolderKanban size={18} className="text-[#93c5fd]" />} title="Workspaces"
        hint={workspaces.data && workspaces.data.total > list.length ? `Showing the first ${MAX_WORKSPACES} of ${workspaces.data.total}` : undefined}>
        {workspaces.error ? <Failed load={workspaces} /> : !workspaces.data ? <Skeleton active paragraph={{ rows: 4 }} /> : !list.length ? (
          <div className={featurePanel}><Empty description="No workspaces yet. Add a repository, or ask a maintainer to invite you to theirs." /></div>
        ) : (
          <div className="space-y-3">
            {groupWorkspaces(list, orgs).map(group => (
              <div key={group.key} className={featurePanel}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#242527] pb-2">
                  <h4 className="font-semibold">{group.title}</h4>
                  <span className="text-xs text-[#94a3b8]">{group.workspaces.length} {group.workspaces.length === 1 ? 'workspace' : 'workspaces'}</span>
                </div>
                <ul className="divide-y divide-[#242527]">
                  {group.workspaces.map(w => <WorkspaceRow key={w.id} workspace={w} link={workspaceLink(w.id)} />)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={<GraduationCap size={18} className="text-[#93c5fd]" />} title="Learning progress"
        hint={learning && learning.assigned > 0 ? `${learning.inProgress} in progress · ${learning.notStarted} not started` : undefined}>
        {paths.error ? <Failed load={paths} /> : !paths.data ? <Skeleton active paragraph={{ rows: 3 }} /> : !paths.data.length ? (
          <div className={featurePanel}><Empty description="No learning paths given to you yet." /></div>
        ) : (
          <ul className={`${featurePanel} divide-y divide-[#242527]`}>
            {orderPaths(paths.data).map(p => {
              const link = pathLink(p);
              const finished = p.total > 0 && p.done >= p.total;
              return (
                <li key={`${p.projectId}:${p.pathId}`} className="grid gap-2 py-3 md:grid-cols-[1fr_minmax(160px,240px)] md:items-center">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{link ? <Link to={link} className="hover:text-[#93c5fd]">{p.title}</Link> : p.title}</p>
                    <p className="text-xs text-[#94a3b8]">{p.projectName ?? 'Workspace'} · last activity {date(p.lastActivityAt)}</p>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-[#94a3b8]"><span>{progressText(p)}</span><span>{p.percent}%</span></div>
                    <Progress percent={p.percent} showInfo={false} size="small" status={finished ? 'success' : 'active'} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </FeaturePage>
  );
}
