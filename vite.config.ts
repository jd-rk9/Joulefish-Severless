import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // Preserve process.env so Node.js reads variables dynamically at runtime
    define: {
      'process.env': 'process.env',
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'https://api.deploybase.eu',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, '/api/v1/public/functions/joulefish'),
        },
      },
    },
  };
});