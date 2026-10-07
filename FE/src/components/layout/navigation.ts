import { LayoutDashboard, FolderKanban, History, GitCompare, FileSearch, Sparkles, FileBarChart, ShieldCheck, GitPullRequest, Users, Network, BookOpen, FileText, Users2, SlidersHorizontal, ScrollText, Activity, Boxes, Cpu, Gauge, Coins } from 'lucide-react';

export const navItemsByRole = {
  'developer-analyst': [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/projects', label: 'Projects', icon: FolderKanban },
    { path: '/history', label: 'Architecture History', icon: History },
    { path: '/architecture', label: 'Architecture Map', icon: Boxes },
    { path: '/compare', label: 'Compare', icon: GitCompare },
    { path: '/evidence', label: 'Changes & Evidence', icon: FileSearch },
    { path: '/insights', label: 'AI Insights', icon: Sparkles },
    { path: '/reports', label: 'Reports', icon: FileBarChart },
    { path: '/ai-usage', label: 'AI Usage', icon: Coins },
  ],
  'project-maintainer': [
    { path: '/project-maintainer', label: 'Overview', icon: ShieldCheck },
    { path: '/project-maintainer/approvals', label: 'Approval Queue', icon: GitPullRequest },
    { path: '/project-maintainer/team', label: 'Team', icon: Users },
    { path: '/project-maintainer/component-diagram', label: 'Component Diagram', icon: Network },
    { path: '/project-maintainer/architecture-rules', label: 'Architecture Rules', icon: ShieldCheck },
    { path: '/project-maintainer/design-decisions', label: 'Design Decisions', icon: BookOpen },
    { path: '/project-maintainer/reports', label: 'Evolution Reports', icon: FileText },
  ],
  'system-administrator': [
    { path: '/system-administrator', label: 'Overview', icon: LayoutDashboard },
    { path: '/system-administrator/users', label: 'User Management', icon: Users2 },
    { path: '/system-administrator/settings', label: 'System Settings', icon: SlidersHorizontal },
    { path: '/system-administrator/audit-log', label: 'Audit Log', icon: ScrollText },
    { path: '/system-administrator/mining-jobs', label: 'Mining Jobs Monitor', icon: Activity },
    { path: '/system-administrator/ai-models', label: 'AI Models', icon: Cpu },
    { path: '/system-administrator/ai-metrics', label: 'AI Usage & Metrics', icon: Gauge },
  ],
} as const;
