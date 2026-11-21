import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initLanguage } from './i18n'
import { installThemeStyles } from './theme/css'

// The themes' CSS variables (src/theme) go in before anything renders.
installThemeStyles()

// The language is settled first (Vietnamese loads its own small chunk), so the first paint is already in it.
void initLanguage().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
