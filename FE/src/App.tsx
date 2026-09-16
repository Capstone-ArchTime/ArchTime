import { ConfigProvider, theme } from "antd"
import HomePage from "@/pages/HomePage"

function App() {
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <HomePage />
    </ConfigProvider>
  )
}

export default App
