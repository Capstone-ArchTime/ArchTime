import { lazy, Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import { App as AntApp, ConfigProvider } from 'antd';
import { useLanguage } from '@/i18n';
import { antdLocaleFor } from '@/i18n/antd-locale';
import { StyleProvider } from '@ant-design/cssinjs';
import { MotionConfig } from 'motion/react';
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider, Outlet, Navigate, useLocation } from 'react-router-dom';
import AuthProvider from '@/auth/AuthProvider';
import { useAuth } from '@/auth/auth-context';
import { setUiTheme, themeFor, useThemeChoice, useThemeDefinition } from '@/features/ui-theme';
import { antdThemeFor } from '@/theme/antd';
import RouteGuard from '@/auth/RouteGuard';
import PageLoading from '@/components/PageLoading';
import PageErrorBoundary from '@/components/PageErrorBoundary';

const AuthPage = lazy(() => import("@/pages/Login"));
const ApprovalQueue = lazy(() => import("@/pages/project-maintainer/ApprovalQueue"));
const ProposeChange = lazy(() => import("@/pages/developer-analyst/ProposeChange"));
const Team = lazy(() => import("@/pages/project-maintainer/Team"));
const UserManagement = lazy(() => import("@/pages/system-administrator/UserManagement"));
const AdminOrganizations = lazy(() => import("@/pages/system-administrator/Organizations"));
const AuditLog = lazy(() => import("@/pages/system-administrator/AuditLog"));
const HomePage = lazy(() => import("@/pages/HomePage"));
const Dashboard = lazy(() => import("@/pages/developer-analyst/Dashboard"));
const Projects = lazy(() => import("@/pages/developer-analyst/Projects"));
const Organizations = lazy(() => import("@/pages/organizations/Organizations"));
const OrganizationDetail = lazy(() => import("@/pages/organizations/OrganizationDetail"));
const ArchitectureMap = lazy(() => import("@/pages/developer-analyst/ArchitectureMap"));
const Compare = lazy(() => import("@/pages/developer-analyst/Compare"));
const Evidence = lazy(() => import("@/pages/developer-analyst/Evidence"));
const TasksSprints = lazy(() => import("@/pages/developer-analyst/TasksSprints"));
const Insights = lazy(() => import("@/pages/developer-analyst/Insights"));
const ProjectDetail = lazy(() => import("@/pages/developer-analyst/ProjectDetail"));
const ProjectMaintainerDashboard = lazy(() => import("@/pages/project-maintainer/Dashboard"));
const ProjectMaintainerReports = lazy(() => import("@/pages/project-maintainer/Reports"));
const ComponentDiagram = lazy(() => import("@/pages/project-maintainer/ComponentDiagram"));
const ArchitectureRules = lazy(() => import("@/pages/project-maintainer/ArchitectureRules"));
const ConformanceFindings = lazy(() => import("@/pages/project-maintainer/ConformanceFindings"));
const AgentAccess = lazy(() => import("@/pages/project-maintainer/AgentAccess"));
const DesignDecisions = lazy(() => import("@/pages/project-maintainer/DesignDecisions"));
const SystemAdministratorDashboard = lazy(() => import("@/pages/system-administrator/Dashboard"));
const SystemSettings = lazy(() => import("@/pages/system-administrator/SystemSettings"));
const MiningJobsMonitor = lazy(() => import("@/pages/system-administrator/MiningJobsMonitor"));
const AiModels = lazy(() => import("@/pages/system-administrator/AiModels"));
const AiMetrics = lazy(() => import("@/pages/system-administrator/AiMetrics"));
const AiUsage = lazy(() => import("@/pages/developer-analyst/AiUsage"));
const Learning = lazy(() => import("@/pages/developer-analyst/Learning"));
const LearningPath = lazy(() => import("@/pages/developer-analyst/LearningPath"));
const PathEditor = lazy(() => import("@/pages/developer-analyst/PathEditor"));
const Profile = lazy(() => import("@/pages/Profile"));
const MyWork = lazy(() => import("@/pages/MyWork"));
const Settings = lazy(() => import("@/pages/Settings"));
const ArchitectureWorkspace = lazy(() => import("@/pages/developer-analyst/ArchitectureWorkspace"));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const VerifyEmail = lazy(() => import('@/pages/VerifyEmail'));
const AcceptInvitation = lazy(() => import('@/pages/AcceptInvitation'));
const GitHubCallback = lazy(() => import('@/pages/GitHubCallback'));
const NotFound = lazy(() => import('@/pages/NotFound'));

/** Redirects to another page, keeping the query (such as ?projectId=) and the hash. */
function KeepQuery({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

/** Puts on the chosen look (before paint, so pages never flash in the other theme). */
function RoleTheme() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const theme = themeFor(user?.role, pathname, useThemeChoice());
  useLayoutEffect(() => { setUiTheme(theme); }, [theme]);
  return null;
}

function RootLayout() {
  const location = useLocation();
  useEffect(() => {
    if (location.pathname === '/') document.title = 'ArchTime · Architecture Observatory';
  }, [location.pathname]);
  return <AuthProvider><RoleTheme /><PageErrorBoundary key={location.pathname}><Suspense fallback={<PageLoading />}><Outlet /></Suspense></PageErrorBoundary></AuthProvider>;
}

const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<RootLayout />}>

    <Route path="/" element={<HomePage />} />
    <Route path="/login" element={<AuthPage key="login" />} />
    <Route path="/auth/github/callback" element={<GitHubCallback />} />
    <Route path="/register" element={<AuthPage key="register" />} />
    <Route path="/forgot-password" element={<ResetPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/verify-email" element={<VerifyEmail />} />
    <Route path="/invitations/accept" element={<AcceptInvitation />} />
    <Route element={<RouteGuard />}>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/organizations" element={<Organizations />} />
      <Route path="/organizations/:orgId" element={<OrganizationDetail />} />
      {/* Architecture History was folded into Compare; old links (with their ?projectId=) still land there. */}
      <Route path="/history" element={<KeepQuery to="/compare" />} />
      <Route path="/architecture" element={<ArchitectureMap />} />
      <Route path="/compare" element={<Compare />} />
      <Route path="/evidence" element={<Evidence />} />
      <Route path="/tasks" element={<TasksSprints />} />
      <Route path="/insights" element={<Insights />} />
      <Route path="/propose-change" element={<ProposeChange />} />
      <Route path="/reports" element={<ProjectMaintainerReports />} />
      <Route path="/ai-usage" element={<AiUsage />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/my-work" element={<MyWork />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/learning" element={<Learning />} />
      <Route path="/learning/manage/:projectId/new" element={<PathEditor />} />
      <Route path="/learning/manage/:projectId/:pathId" element={<PathEditor />} />
      <Route path="/learning/:projectId/:pathId" element={<LearningPath />} />
      <Route path="/workspace/sample/:sampleId" element={<ArchitectureWorkspace />} />
      <Route path="/workspace/:projectId" element={<ArchitectureWorkspace />} />
      <Route path="/project" element={<ProjectDetail />} />
      <Route path="/project-maintainer" element={<ProjectMaintainerDashboard />} />
      <Route path="/project-maintainer/approvals" element={<ApprovalQueue />} />
      <Route path="/project-maintainer/team" element={<Team />} />
      <Route path="/project-maintainer/reports" element={<Navigate to="/reports" replace />} />
      <Route path="/project-maintainer/component-diagram" element={<ComponentDiagram />} />
      <Route path="/project-maintainer/architecture-rules" element={<ArchitectureRules />} />
      <Route path="/project-maintainer/conformance" element={<ConformanceFindings />} />
      <Route path="/project-maintainer/agent-access" element={<AgentAccess />} />
      <Route path="/project-maintainer/design-decisions" element={<DesignDecisions />} />
      <Route path="/system-administrator" element={<SystemAdministratorDashboard />} />
      <Route path="/system-administrator/users" element={<UserManagement />} />
      <Route path="/system-administrator/organizations" element={<AdminOrganizations />} />
      <Route path="/system-administrator/audit-log" element={<AuditLog />} />
      <Route path="/system-administrator/settings" element={<SystemSettings />} />
      <Route path="/system-administrator/mining-jobs" element={<MiningJobsMonitor />} />
      <Route path="/system-administrator/ai-models" element={<AiModels />} />
      <Route path="/system-administrator/ai-metrics" element={<AiMetrics />} />
    </Route>
    <Route path="*" element={<NotFound />} />

  </Route>
));

export default function App() {
  // The antd theme of the look being worn, built from its definition (src/theme).
  const definition = useThemeDefinition();
  const antdTheme = useMemo(() => antdThemeFor(definition), [definition]);
  // antd's own texts (date pickers, tables, pagination, "OK"/"Cancel") follow the page language.
  const language = useLanguage();
  return <PageErrorBoundary><StyleProvider layer><ConfigProvider locale={antdLocaleFor(language)} theme={antdTheme}>
    <AntApp><MotionConfig reducedMotion="user"><RouterProvider router={router} /></MotionConfig></AntApp>
  </ConfigProvider></StyleProvider></PageErrorBoundary>;
}
