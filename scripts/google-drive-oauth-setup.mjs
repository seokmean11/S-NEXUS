/**
 * Google Drive OAuth refresh token 발급 (1회)
 *
 * 사전 준비:
 * 1. Google Cloud Console → 사용자 인증 정보 → OAuth 클라이언트 ID (데스크톱 앱)
 * 2. .env에 GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET 입력
 * 3. node scripts/google-drive-oauth-setup.mjs 실행
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const REDIRECT_URI = 'http://127.0.0.1:5188/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/drive'];

function readEnvValues() {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return {};
  const values = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return values;
}

const env = readEnvValues();
const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET를 .env에 먼저 입력하세요.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\n1. 아래 URL을 브라우저에서 열고 Google 계정으로 로그인·허용하세요:\n');
console.log(authUrl);
console.log('\n2. 승인 후 자동으로 refresh token을 출력합니다.\n');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/oauth2callback') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400);
      res.end('code 없음');
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>OAuth 완료</h1><p>터미널로 돌아가 refresh token을 .env에 붙여넣으세요.</p>');

    console.log('\n=== .env에 아래 줄을 추가하세요 ===\n');
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token ?? ''}`);
    console.log('\n================================\n');

    if (!tokens.refresh_token) {
      console.warn('refresh_token이 없습니다. Google 계정 연결 해제 후 다시 consent(prompt=consent)로 실행하세요.');
    }

    server.close();
    process.exit(0);
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end('OAuth 오류');
    server.close();
    process.exit(1);
  }
});

server.listen(5188, '127.0.0.1', () => {
  console.log(`대기 중: ${REDIRECT_URI}`);
});
