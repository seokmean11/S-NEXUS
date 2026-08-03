import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { claudeProxyPlugin } from './vite-plugin-claude-proxy';

export default defineConfig({
  plugins: [react(), claudeProxyPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    watch: {
      ignored: ['**/tmp/**'],
    },
  },
});
