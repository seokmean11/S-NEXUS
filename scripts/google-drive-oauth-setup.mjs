/**
 * Google Drive OAuth refresh token 발급 (1회)
 *
 * 사전 준비:
 * 1. Google Cloud Console → 사용자 인증 정보 → OAuth 클라이언트 ID (데스크톱 앱)
 * 2. .env에 GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET 입력
 * 3. node scripts/google-drive-oauth-setup.mjs 실행
 *
 * 발급된 토큰은 서버 공용입니다. 모든 팀원 업로드가 이 Drive(소유자)에 저장됩니다.
 * 테스트 모드 앱은 약 7일 후 만료되므로, 팀 사용 시 OAuth 동의 화면을 게시(프로덕션)하세요.
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
const TOKEN_FILE = path.join(projectRoot, '.data', 'google-oauth-token.json');

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

function upsertEnvKey(envPath, key, value) {
  const line = `${key}=${value}`;
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, `${line}\n`, 'utf8');
    return;
  }
  const text = fs.readFileSync(envPath, 'utf8');
  const lines = text.split(/\r?\n/);
  let replaced = false;
  const next = lines.map((current) => {
    if (!current.startsWith(`${key}=`)) return current;
    replaced = true;
    return line;
  });
  if (!replaced) {
    if (next.length > 0 && next[next.length - 1] !== '') next.push('');
    next.push(line);
  }
  fs.writeFileSync(envPath, next.join('\n'), 'utf8');
}

function saveRefreshToken(refreshToken) {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(
    TOKEN_FILE,
    `${JSON.stringify({ refresh_token: refreshToken, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
  upsertEnvKey(path.join(projectRoot, '.env'), 'GOOGLE_OAUTH_REFRESH_TOKEN', refreshToken);
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

console.log('\n1. 아래 URL을 브라우저에서 열고 Google 계정(Drive 소유자)으로 로그인·허용하세요:\n');
console.log(authUrl);
console.log('\n2. 승인 후 refresh token이 .env / .data 에 자동 저장됩니다.\n');
console.log('참고: 테스트 모드 OAuth 앱은 약 7일 후 만료됩니다. 팀 사용 시 Google Cloud Console에서 게시(프로덕션)하세요.\n');

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
    res.end('<h1>OAuth 완료</h1><p>토큰이 저장되었습니다. 이 창을 닫아도 됩니다.</p>');

    if (!tokens.refresh_token) {
      console.warn('refresh_token이 없습니다. Google 계정 연결 해제 후 다시 consent(prompt=consent)로 실행하세요.');
      server.close();
      process.exit(1);
    }

    saveRefreshToken(tokens.refresh_token);
    console.log('\n=== 저장 완료 (팀 공용 Drive 업로드 토큰) ===');
    console.log(`- ${TOKEN_FILE}`);
    console.log('- .env GOOGLE_OAUTH_REFRESH_TOKEN');
    console.log('dev/서비스 서버를 재시작한 뒤 업로드를 다시 시도하세요.\n');

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
