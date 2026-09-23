import { App as AntApp, ConfigProvider, theme } from "antd"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import AuthPage from "@/pages/Login"

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
import SystemAdministratorDashboard from "@/pages/system-administrator/Dashboard"
import SystemSettings from "@/pages/system-administrator/SystemSettings"
import MiningJobsMonitor from "@/pages/system-administrator/MiningJobsMonitor"

function App() {
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <AntApp>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/history" element={<ArchitectureHistory />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/evidence" element={<Evidence />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/project" element={<ProjectDetail />} />
            <Route path="/project-maintainer" element={<ProjectMaintainerDashboard />} />
            <Route path="/project-maintainer/reports" element={<ProjectMaintainerReports />} />
            <Route path="/system-administrator" element={<SystemAdministratorDashboard />} />
            <Route path="/system-administrator/settings" element={<SystemSettings />} />
            <Route path="/system-administrator/mining-jobs" element={<MiningJobsMonitor />} />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
