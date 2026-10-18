import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('node_modules/katex')) {
            return 'vendor-katex';
          }
          if (normalized.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          if (normalized.includes('node_modules/react') || normalized.includes('node_modules/react-dom') || normalized.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
        }
      }
    }
  },
  server: {
    port: 3000,
    strictPort: true,
    open: false,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        timeout: 330000,
        proxyTimeout: 330000
      }
    }
  },
  preview: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        timeout: 330000,
        proxyTimeout: 330000
      }
    }
  }
});
