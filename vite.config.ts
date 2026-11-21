import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: { host: '0.0.0.0', port: 4173 },
  preview: { host: '0.0.0.0', port: 4173 },
});
