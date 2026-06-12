import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendHttp = env.VITE_RESUME_COPILOT_BACKEND ?? 'http://127.0.0.1:8901';
  const backendWs = backendHttp.replace(/^http/, 'ws');

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: Number(env.VITE_DEV_PORT ?? 5174),
      strictPort: true,
      proxy: {
        '/api': backendHttp,
        '/ws': { target: backendWs, ws: true },
      },
    },
    preview: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': backendHttp,
        '/ws': { target: backendWs, ws: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
