import { ConfigProvider, theme } from "antd"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import AuthPage from "@/pages/Login"

import HomePage from "@/pages/HomePage"
import Dashboard from "@/pages/user/Dashboard"
import Projects from "@/pages/user/Projects"
import ArchitectureHistory from "@/pages/user/ArchitectureHistory"
import Compare from "@/pages/user/Compare"
import Evidence from "@/pages/user/Evidence"
import Insights from "@/pages/user/Insights"
import Reports from "@/pages/user/Reports"
import ProjectDetail from "@/pages/user/ProjectDetail"

function App() {
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
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
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default App
