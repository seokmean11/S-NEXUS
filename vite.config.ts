import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { claudeProxyPlugin } from './vite-plugin-claude-proxy';
import { outsourcingLocalPlugin } from './vite-plugin-outsourcing-local';
import { nexusDataFolderPlugin } from './vite-plugin-nexus-data-folder';
import { nexusOrgPlugin } from './vite-plugin-nexus-org';
import { competitorDrivePlugin } from './vite-plugin-competitor-drive';

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
  if (env.GOOGLE_OAUTH_CLIENT_ID) {
    process.env.GOOGLE_OAUTH_CLIENT_ID = env.GOOGLE_OAUTH_CLIENT_ID;
  }
  if (env.GOOGLE_OAUTH_CLIENT_SECRET) {
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = env.GOOGLE_OAUTH_CLIENT_SECRET;
  }
  if (env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = env.GOOGLE_OAUTH_REFRESH_TOKEN;
  }

  return {
    plugins: [react(), claudeProxyPlugin(), nexusDataFolderPlugin(), nexusOrgPlugin(), outsourcingLocalPlugin(), competitorDrivePlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // 팀원 PC에서 서비스웹으로 접속 가능 (동일 서버·공용 Drive 토큰으로 업로드)
      host: true,
      port: 5173,
      watch: {
        ignored: ['**/tmp/**', '**/.data/**'],
      },
    },
    preview: {
      host: true,
      port: 4173,
    },
  };
});
