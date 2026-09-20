import { ConfigProvider, theme } from "antd"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import AuthPage from "@/pages/Auth"

function App() {
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default App
