import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { claudeProxyPlugin } from './vite-plugin-claude-proxy';
import { outsourcingLocalPlugin } from './vite-plugin-outsourcing-local';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.OUTSOURCING_DATA_PATH) {
    process.env.OUTSOURCING_DATA_PATH = env.OUTSOURCING_DATA_PATH;
  }

  return {
    plugins: [react(), claudeProxyPlugin(), outsourcingLocalPlugin()],
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
  };
});