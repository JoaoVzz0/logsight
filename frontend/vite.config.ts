import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const BACKEND_ORIGIN = 'http://localhost:3333'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy:
      command === 'serve'
        ? {
            '/logs': {
              target: BACKEND_ORIGIN,
              changeOrigin: true,
              bypass: (req) =>
                req.headers.accept?.includes('text/html') ? req.url : undefined,
            },
          }
        : undefined,
  },
}))
