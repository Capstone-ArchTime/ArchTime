import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep React and its renderer together to preserve initialization order.
          // Leave UI modules automatic so a vendor group cannot pull lazy forms,
          // selects and other route-only controls into the initial download.
          groups: [
            {
              name: 'react-runtime',
              test: /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 30,
              includeDependenciesRecursively: false,
            },
            {
              name: 'router',
              test: /[\\/]node_modules[\\/](?:react-router|react-router-dom)[\\/]/,
              priority: 20,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  server: {
    open: true,
  },
})
