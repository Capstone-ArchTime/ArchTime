import { ConfigProvider, theme } from "antd"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import AuthPage from "@/pages/Auth"

import HomePage from "@/pages/HomePage"
import Dashboard from "@/pages/user/Dashboard"

function App() {
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default App
