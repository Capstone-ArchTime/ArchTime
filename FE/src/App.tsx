import { App as AntApp, ConfigProvider, theme } from "antd"
import { StyleProvider } from "@ant-design/cssinjs"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import AuthPage from "@/pages/Login"
import AuthProvider from "@/auth/AuthProvider"
import RouteGuard from "@/auth/RouteGuard"
import { Result } from "antd"
import { Link } from "react-router-dom"

import ApprovalQueue from "@/pages/project-maintainer/ApprovalQueue"
import Team from "@/pages/project-maintainer/Team"
import UserManagement from "@/pages/system-administrator/UserManagement"
import AuditLog from "@/pages/system-administrator/AuditLog"
import HomePage from "@/pages/HomePage"
import Dashboard from "@/pages/developer-analyst/Dashboard"
import Projects from "@/pages/developer-analyst/Projects"
import ArchitectureHistory from "@/pages/developer-analyst/ArchitectureHistory"
import Compare from "@/pages/developer-analyst/Compare"
import Evidence from "@/pages/developer-analyst/Evidence"
import Insights from "@/pages/developer-analyst/Insights"
import Reports from "@/pages/developer-analyst/Reports"
import ProjectDetail from "@/pages/developer-analyst/ProjectDetail"
import ProjectMaintainerDashboard from "@/pages/project-maintainer/Dashboard"
import ProjectMaintainerReports from "@/pages/project-maintainer/Reports"
import ComponentDiagram from "@/pages/project-maintainer/ComponentDiagram"
import ArchitectureRules from "@/pages/project-maintainer/ArchitectureRules"
import DesignDecisions from "@/pages/project-maintainer/DesignDecisions"
import SystemAdministratorDashboard from "@/pages/system-administrator/Dashboard"
import SystemSettings from "@/pages/system-administrator/SystemSettings"
import MiningJobsMonitor from "@/pages/system-administrator/MiningJobsMonitor"

function App() {
  return (
    <StyleProvider layer>
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
        <AntApp>
          <BrowserRouter>
            <AuthProvider>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="/register" element={<AuthPage />} />
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
            </Routes>
            </AuthProvider>
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </StyleProvider>
  )
}

export default App
