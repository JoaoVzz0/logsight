import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

const BACKEND_ORIGIN = 'http://localhost:3333'

const proxyToApi: ProxyOptions = {
  target: BACKEND_ORIGIN,
  changeOrigin: true,
  bypass: (req) =>
    req.headers.accept?.includes('text/html') ? req.url : undefined,
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy:
      command === 'serve'
        ? { '/logs': proxyToApi, '/imports': proxyToApi }
        : undefined,
  },
}))
