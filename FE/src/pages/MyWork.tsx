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
import { organizationRoleLabel, projectRoleLabel } from '@/features/role-labels';
import { formatDate } from '@/i18n/format';
import { defineMessages, message, useMessages } from '@/i18n/define';

const MSG = defineMessages({
  title: 'My work', description: 'Your organizations, workspaces and learning progress.', couldNotLoad: 'Could not load {what}.', retry: 'Retry',
  whatOrgs: 'your organizations', whatWorkspaces: 'your workspaces', whatPaths: 'your learning paths',
  organizations: 'Organizations', workspaces: 'Workspaces', learning: 'Learning', youOwn: '{n} you own', pathsFinished: '{finished} of {assigned} paths finished',
  noOrg: 'You do not belong to an organization. Your workspaces are in your personal space.',
  members: '{count} members', members_one: '1 member', ofYourWorkspaces: ' · {n} of your workspaces',
  showingFirst: 'Showing the first {max} of {total}', noWorkspaces: 'No workspaces yet. Add a repository, or ask a maintainer to invite you to theirs.',
  workspaceCount: '{count} workspaces', workspaceCount_one: '1 workspace', commits: '{count} commits', commits_one: '1 commit', notScanned: 'History not scanned yet', lastCommit: ' · last commit {date}',
  learningProgress: 'Learning progress', learningHint: '{inProgress} in progress · {notStarted} not started', noPaths: 'No learning paths given to you yet.',
  workspace: 'Workspace', lastActivity: '{workspace} · last activity {date}',
}, {
  title: 'Việc của tôi', description: 'Các tổ chức, không gian làm việc và tiến độ học tập của bạn.', couldNotLoad: 'Không tải được {what}.', retry: 'Thử lại',
  whatOrgs: 'các tổ chức của bạn', whatWorkspaces: 'các không gian làm việc của bạn', whatPaths: 'các lộ trình học của bạn',
  organizations: 'Tổ chức', workspaces: 'Không gian làm việc', learning: 'Học tập', youOwn: 'bạn sở hữu {n}', pathsFinished: 'xong {finished}/{assigned} lộ trình',
  noOrg: 'Bạn chưa thuộc tổ chức nào. Các không gian làm việc của bạn nằm trong không gian cá nhân.',
  members: '{count} thành viên', ofYourWorkspaces: ' · {n} không gian làm việc của bạn',
  showingFirst: 'Hiển thị {max} đầu tiên trên {total}', noWorkspaces: 'Chưa có không gian làm việc nào. Hãy thêm một repository, hoặc nhờ người bảo trì mời bạn.',
  workspaceCount: '{count} không gian làm việc', commits: '{count} commit', notScanned: 'Chưa quét lịch sử', lastCommit: ' · commit gần nhất {date}',
  learningProgress: 'Tiến độ học tập', learningHint: '{inProgress} đang học · {notStarted} chưa bắt đầu', noPaths: 'Bạn chưa được giao lộ trình học nào.',
  workspace: 'Không gian làm việc', lastActivity: '{workspace} · hoạt động gần nhất {date}',
});

type Load<T> = { data: T | null; error: string | null; retry: () => void };

/** Loads one source on its own, so one failing does not hide the others. */
function useLoad<T>(fetcher: (signal: AbortSignal) => Promise<T>, what: 'whatOrgs' | 'whatWorkspaces' | 'whatPaths'): Load<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetcher(controller.signal)
      .then(setData)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : message(MSG, 'couldNotLoad', { what: message(MSG, what) })); });
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
        {hint && <span className="text-xs text-[var(--at-muted)]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Failed({ load }: { load: Load<unknown> }) {
  return <Alert type="error" showIcon title={load.error} action={<Button size="small" onClick={load.retry}>{message(MSG, 'retry')}</Button>} />;
}

function Tile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className={featurePanel}>
      <p className="text-xs uppercase tracking-wider text-[var(--at-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {detail && <p className="mt-1 text-xs text-[var(--at-muted)]">{detail}</p>}
    </div>
  );
}

const date = (iso: string | null) => (iso ? formatDate(iso) || null : null);

function WorkspaceRow({ workspace, link }: { workspace: MyWorkspace; link: string | null }) {
  const status = statusView(workspace.status);
  const last = date(workspace.lastCommitDate);
  const m = useMessages(MSG);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-medium break-words">{link ? <Link to={link} className="hover:text-[var(--at-link)]">{workspace.name}</Link> : workspace.name}</p>
        <p className="text-xs text-[var(--at-muted)]">
          {workspace.totalCommits !== null ? m('commits', { count: workspace.totalCommits }) : m('notScanned')}
          {last && m('lastCommit', { date: last })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Tag>{WORKSPACE_ROLE_LABELS[workspace.userRole] ? projectRoleLabel(workspace.userRole) : workspace.userRole}</Tag>
        <Tag color={status.color}>{status.label}</Tag>
      </div>
    </li>
  );
}

/** The signed-in person's organizations, workspaces and learning progress. */
export default function MyWork() {
  const { user } = useAuth();
  const m = useMessages(MSG);
  const organizations = useLoad(getMyOrganizations, 'whatOrgs');
  const workspaces = useLoad(getMyWorkspaces, 'whatWorkspaces');
  const paths = useLoad(getMyPaths, 'whatPaths');
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
    <FeaturePage title={m('title')} description={m('description')} demo={false}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label={m('organizations')} value={organizations.data ? orgs.length : '–'}
          detail={organizations.data ? m('youOwn', { n: orgs.filter(o => o.myRole === 'owner').length }) : null} />
        <Tile label={m('workspaces')} value={workspaces.data ? workspaces.data.total : '–'}
          detail={workspaces.data ? roleBreakdown : null} />
        <Tile label={m('learning')} value={learning ? `${learning.percent}%` : '–'}
          detail={learning ? m('pathsFinished', { finished: learning.finished, assigned: learning.assigned }) : null} />
      </div>

      <Section icon={<Building2 size={18} className="text-[var(--at-link)]" />} title={m('organizations')}>
        {organizations.error ? <Failed load={organizations} /> : !organizations.data ? <Skeleton active paragraph={{ rows: 2 }} /> : !orgs.length ? (
          <div className={featurePanel}><Empty description={m('noOrg')} /></div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {orgs.map((o: MyOrganization) => (
              <article key={o.id} className={featurePanel} aria-label={o.name}>
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-semibold break-words">{o.name}</h4>
                  <Tag color={o.myRole === 'owner' ? 'blue' : undefined}>{ORGANIZATION_ROLE_LABELS[o.myRole] ? organizationRoleLabel(o.myRole) : o.myRole}</Tag>
                </div>
                {o.description && <p className="mt-1 text-sm text-[var(--at-muted)] line-clamp-2">{o.description}</p>}
                <p className="mt-3 text-xs text-[var(--at-muted)]">
                  {m('members', { count: o.memberCount })}
                  {workspaces.data && m('ofYourWorkspaces', { n: perOrg.get(o.id) ?? 0 })}
                </p>
              </article>
            ))}
          </div>
        )}
      </Section>

      <Section icon={<FolderKanban size={18} className="text-[var(--at-link)]" />} title={m('workspaces')}
        hint={workspaces.data && workspaces.data.total > list.length ? m('showingFirst', { max: MAX_WORKSPACES, total: workspaces.data.total }) : undefined}>
        {workspaces.error ? <Failed load={workspaces} /> : !workspaces.data ? <Skeleton active paragraph={{ rows: 4 }} /> : !list.length ? (
          <div className={featurePanel}><Empty description={m('noWorkspaces')} /></div>
        ) : (
          <div className="space-y-3">
            {groupWorkspaces(list, orgs).map(group => (
              <div key={group.key} className={featurePanel}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--at-line)] pb-2">
                  <h4 className="font-semibold">{group.title}</h4>
                  <span className="text-xs text-[var(--at-muted)]">{m('workspaceCount', { count: group.workspaces.length })}</span>
                </div>
                <ul className="divide-y divide-[var(--at-line)]">
                  {group.workspaces.map(w => <WorkspaceRow key={w.id} workspace={w} link={workspaceLink(w.id)} />)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={<GraduationCap size={18} className="text-[var(--at-link)]" />} title={m('learningProgress')}
        hint={learning && learning.assigned > 0 ? m('learningHint', { inProgress: learning.inProgress, notStarted: learning.notStarted }) : undefined}>
        {paths.error ? <Failed load={paths} /> : !paths.data ? <Skeleton active paragraph={{ rows: 3 }} /> : !paths.data.length ? (
          <div className={featurePanel}><Empty description={m('noPaths')} /></div>
        ) : (
          <ul className={`${featurePanel} divide-y divide-[var(--at-line)]`}>
            {orderPaths(paths.data).map(p => {
              const link = pathLink(p);
              const finished = p.total > 0 && p.done >= p.total;
              return (
                <li key={`${p.projectId}:${p.pathId}`} className="grid gap-2 py-3 md:grid-cols-[1fr_minmax(160px,240px)] md:items-center">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{link ? <Link to={link} className="hover:text-[var(--at-link)]">{p.title}</Link> : p.title}</p>
                    <p className="text-xs text-[var(--at-muted)]">{m('lastActivity', { workspace: p.projectName ?? m('workspace'), date: date(p.lastActivityAt) ?? '' })}</p>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-[var(--at-muted)]"><span>{progressText(p)}</span><span>{p.percent}%</span></div>
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
