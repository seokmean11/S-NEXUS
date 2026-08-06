import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { claudeProxyPlugin } from './vite-plugin-claude-proxy';
import { outsourcingLocalPlugin } from './vite-plugin-outsourcing-local';
import { nexusDataFolderPlugin } from './vite-plugin-nexus-data-folder';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.OUTSOURCING_DATA_PATH) {
    process.env.OUTSOURCING_DATA_PATH = env.OUTSOURCING_DATA_PATH;
  }
  if (env.GOOGLE_DRIVE_NEXUS_FOLDER_ID) {
    process.env.GOOGLE_DRIVE_NEXUS_FOLDER_ID = env.GOOGLE_DRIVE_NEXUS_FOLDER_ID;
  }
  if (env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH = env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  }
  if (env.NEXUS_DRIVE_CACHE_DIR) {
    process.env.NEXUS_DRIVE_CACHE_DIR = env.NEXUS_DRIVE_CACHE_DIR;
  }

  return {
    plugins: [react(), claudeProxyPlugin(), nexusDataFolderPlugin(), outsourcingLocalPlugin()],
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