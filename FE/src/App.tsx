import { lazy, Suspense, useEffect } from 'react';
import { App as AntApp, ConfigProvider, Result, theme } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import { MotionConfig } from 'motion/react';
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider, Outlet, Link, useLocation } from 'react-router-dom';
import AuthProvider from '@/auth/AuthProvider';
import RouteGuard from '@/auth/RouteGuard';
import PageLoading from '@/components/PageLoading';
import PageErrorBoundary from '@/components/PageErrorBoundary';

const AuthPage = lazy(() => import("@/pages/Login"));
const ApprovalQueue = lazy(() => import("@/pages/project-maintainer/ApprovalQueue"));
const Team = lazy(() => import("@/pages/project-maintainer/Team"));
const UserManagement = lazy(() => import("@/pages/system-administrator/UserManagement"));
const AuditLog = lazy(() => import("@/pages/system-administrator/AuditLog"));
const HomePage = lazy(() => import("@/pages/HomePage"));
const Dashboard = lazy(() => import("@/pages/developer-analyst/Dashboard"));
const Projects = lazy(() => import("@/pages/developer-analyst/Projects"));
const ArchitectureHistory = lazy(() => import("@/pages/developer-analyst/ArchitectureHistory"));
const Compare = lazy(() => import("@/pages/developer-analyst/Compare"));
const Evidence = lazy(() => import("@/pages/developer-analyst/Evidence"));
const Insights = lazy(() => import("@/pages/developer-analyst/Insights"));
const Reports = lazy(() => import("@/pages/developer-analyst/Reports"));
const ProjectDetail = lazy(() => import("@/pages/developer-analyst/ProjectDetail"));
const ProjectMaintainerDashboard = lazy(() => import("@/pages/project-maintainer/Dashboard"));
const ProjectMaintainerReports = lazy(() => import("@/pages/project-maintainer/Reports"));
const ComponentDiagram = lazy(() => import("@/pages/project-maintainer/ComponentDiagram"));
const ArchitectureRules = lazy(() => import("@/pages/project-maintainer/ArchitectureRules"));
const DesignDecisions = lazy(() => import("@/pages/project-maintainer/DesignDecisions"));
const SystemAdministratorDashboard = lazy(() => import("@/pages/system-administrator/Dashboard"));
const SystemSettings = lazy(() => import("@/pages/system-administrator/SystemSettings"));
const MiningJobsMonitor = lazy(() => import("@/pages/system-administrator/MiningJobsMonitor"));
const VerifyEmail = lazy(() => import('@/pages/VerifyEmail'));

function RootLayout() {
  const location = useLocation();
  useEffect(() => {
    if (location.pathname === '/') document.title = 'ArchTime · Architecture Observatory';
  }, [location.pathname]);
  return <AuthProvider><PageErrorBoundary key={location.pathname}><Suspense fallback={<PageLoading />}><Outlet /></Suspense></PageErrorBoundary></AuthProvider>;
}

const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<RootLayout />}>

    <Route path="/" element={<HomePage />} />
    <Route path="/login" element={<AuthPage key="login" />} />
    <Route path="/register" element={<AuthPage key="register" />} />
    <Route path="/verify-email" element={<VerifyEmail />} />
    <Route element={<RouteGuard />}>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/history" element={<ArchitectureHistory />} />
      <Route path="/compare" element={<Compare />} />
      <Route path="/evidence" element={<Evidence />} />
      <Route path="/insights" element={<Insights />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/project" element={<ProjectDetail />} />
      <Route path="/project-maintainer" element={<ProjectMaintainerDashboard />} />
      <Route path="/project-maintainer/approvals" element={<ApprovalQueue />} />
      <Route path="/project-maintainer/team" element={<Team />} />
      <Route path="/project-maintainer/reports" element={<ProjectMaintainerReports />} />
      <Route path="/project-maintainer/component-diagram" element={<ComponentDiagram />} />
      <Route path="/project-maintainer/architecture-rules" element={<ArchitectureRules />} />
      <Route path="/project-maintainer/design-decisions" element={<DesignDecisions />} />
      <Route path="/system-administrator" element={<SystemAdministratorDashboard />} />
      <Route path="/system-administrator/users" element={<UserManagement />} />
      <Route path="/system-administrator/audit-log" element={<AuditLog />} />
      <Route path="/system-administrator/settings" element={<SystemSettings />} />
      <Route path="/system-administrator/mining-jobs" element={<MiningJobsMonitor />} />
    </Route>
    <Route path="*" element={<div className="min-h-screen bg-[#080b0e] p-8"><Result status="404" title="Page not found" extra={<Link to="/">Back to home</Link>} /></div>} />

  </Route>
));

export default function App() {
  return <PageErrorBoundary><StyleProvider layer><ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#38bdf8', colorBgBase: '#080b0e', fontFamily: '"Space Grotesk", sans-serif', borderRadius: 6 } }}>
    <AntApp><MotionConfig reducedMotion="user"><RouterProvider router={router} /></MotionConfig></AntApp>
  </ConfigProvider></StyleProvider></PageErrorBoundary>;
}
