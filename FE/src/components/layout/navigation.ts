import type { ElementType } from 'react';
import { LayoutDashboard, FolderKanban, GitCompare, FileSearch, Sparkles, FileBarChart, ShieldCheck, GitPullRequest, Users, Network, BookOpen, Users2, SlidersHorizontal, ScrollText, Activity, Boxes, Cpu, Gauge, Coins, GraduationCap, UserRound, ChartNetwork, Briefcase, Building2 } from 'lucide-react';
import type { Role } from '@/auth/permissions';

export type NavItem = { path: string; label: string; icon: ElementType };
/** A run of sidebar links; a labelled group can be folded away (see DashboardLayout). */
export type NavGroup = { label?: string; icon?: ElementType; items: readonly NavItem[] };

/** Ways of looking at one workspace's history; folded into one "Analyze" group so the sidebar stays short. */
export const analyzeNavItems: readonly NavItem[] = [
  { path: '/architecture', label: 'Architecture Map', icon: Boxes },
  { path: '/compare', label: 'Compare', icon: GitCompare },
  { path: '/evidence', label: 'Changes & Evidence', icon: FileSearch },
  { path: '/insights', label: 'AI Insights', icon: Sparkles },
];

/** Pages for the workspaces this account maintains; the server decides which those are. Reports live under Reports. */
export const maintainNavItems: readonly NavItem[] = [
  { path: '/project-maintainer', label: 'Maintainer overview', icon: ShieldCheck },
  { path: '/project-maintainer/approvals', label: 'Approval Queue', icon: GitPullRequest },
  { path: '/project-maintainer/team', label: 'Team', icon: Users },
  { path: '/project-maintainer/component-diagram', label: 'Component Diagram', icon: Network },
  { path: '/project-maintainer/architecture-rules', label: 'Architecture Rules', icon: ShieldCheck },
  { path: '/project-maintainer/design-decisions', label: 'Design Decisions', icon: BookOpen },
];

const adminNavItems: readonly NavItem[] = [
  { path: '/system-administrator', label: 'Overview', icon: LayoutDashboard },
  { path: '/system-administrator/users', label: 'User Management', icon: Users2 },
  { path: '/system-administrator/settings', label: 'System Settings', icon: SlidersHorizontal },
  { path: '/system-administrator/audit-log', label: 'Audit Log', icon: ScrollText },
  { path: '/system-administrator/mining-jobs', label: 'Mining Jobs Monitor', icon: Activity },
  { path: '/system-administrator/ai-models', label: 'AI Models', icon: Cpu },
  { path: '/system-administrator/ai-metrics', label: 'AI Usage & Metrics', icon: Gauge },
];

/** Personal pages, reached from the account menu in the header instead of the sidebar. */
export const accountMenuItems: Record<Role, readonly NavItem[]> = {
  'developer-analyst': [
    { path: '/my-work', label: 'My work', icon: Briefcase },
    { path: '/profile', label: 'My profile', icon: UserRound },
    { path: '/ai-usage', label: 'AI Usage', icon: Coins },
  ],
  'system-administrator': [
    { path: '/my-work', label: 'My work', icon: Briefcase },
    { path: '/profile', label: 'My profile', icon: UserRound },
  ],
};

/** The heading over a role's navigation, also shown above the page title. */
export const navHeadingByRole: Record<Role, string> = {
  'developer-analyst': 'Workspace',
  'system-administrator': 'Administration',
};

/** True for the maintainer pages, where the group shows while the server has not yet said whether it applies. */
export const isMaintainPath = (pathname: string) => pathname === '/project-maintainer' || pathname.startsWith('/project-maintainer/');

/**
 * The sidebar of a role. A developer-analyst gets Dashboard, Workspaces, the folded "Analyze" group, Learning and
 * Reports; one who maintains at least one workspace also gets a folded "Maintain" group, one who maintains none does
 * not, so they never see links to pages with nothing to show. `maintains` is undefined until the server has answered;
 * on a maintainer page the group shows in the meantime, so the page does not open without it.
 */
export function navGroupsFor(role: Role, { maintains, pathname = '' }: { maintains?: boolean; pathname?: string } = {}): NavGroup[] {
  if (role !== 'developer-analyst') return [{ items: adminNavItems }];
  const groups: NavGroup[] = [
    { items: [{ path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }, { path: '/projects', label: 'Workspaces', icon: FolderKanban }, { path: '/organizations', label: 'Organizations', icon: Building2 }] },
    { label: 'Analyze', icon: ChartNetwork, items: analyzeNavItems },
    { items: [{ path: '/learning', label: 'Learning', icon: GraduationCap }, { path: '/reports', label: 'Reports', icon: FileBarChart }] },
  ];
  if (maintains ?? isMaintainPath(pathname)) groups.push({ label: 'Maintain', icon: ShieldCheck, items: maintainNavItems });
  return groups;
}
