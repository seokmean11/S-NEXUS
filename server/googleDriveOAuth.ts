import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { google } from 'googleapis';

/** Desktop OAuth loopback — scripts/google-drive-oauth-setup.mjs 와 동일 */
export const GOOGLE_OAUTH_REDIRECT_URI = 'http://127.0.0.1:5188/oauth2callback';
export const GOOGLE_OAUTH_SCOPES = ['https://www.googleapis.com/auth/drive'];

const TOKEN_RELATIVE_PATH = path.join('.data', 'google-oauth-token.json');
const PROBE_TTL_MS = 30_000;

export interface GoogleOAuthCredentials {
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
}

export interface GoogleOAuthProbeResult {
  ok: boolean;
  hasCredentials: boolean;
  error?: string;
}

interface TokenFile {
  refresh_token?: string;
  updatedAt?: string;
}

interface ProbeCacheEntry {
  at: number;
  result: GoogleOAuthProbeResult;
}

let probeCache: ProbeCacheEntry | null = null;
let reconnectServer: http.Server | null = null;
let reconnectInFlight: Promise<{ authUrl: string }> | null = null;

function readEnvFileValues(projectRoot: string): Record<string, string> {
  for (const name of ['.env.local', '.env']) {
    const envPath = path.join(projectRoot, name);
    if (!fs.existsSync(envPath)) continue;
    const values: Record<string, string> = {};
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return values;
  }
  return {};
}

function resolveTokenFilePath(projectRoot: string): string {
  return path.join(projectRoot, TOKEN_RELATIVE_PATH);
}

function readTokenFile(projectRoot: string): TokenFile | null {
  const tokenPath = resolveTokenFilePath(projectRoot);
  if (!fs.existsSync(tokenPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(tokenPath, 'utf8')) as TokenFile;
  } catch {
    return null;
  }
}

function upsertEnvKey(envPath: string, key: string, value: string): void {
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

export function getGoogleOAuthCredentials(projectRoot: string): GoogleOAuthCredentials {
  const fromEnv = readEnvFileValues(projectRoot);
  const fromFile = readTokenFile(projectRoot);
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || fromEnv.GOOGLE_OAUTH_CLIENT_ID || null,
    clientSecret:
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || fromEnv.GOOGLE_OAUTH_CLIENT_SECRET || null,
    refreshToken:
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() ||
      fromFile?.refresh_token?.trim() ||
      fromEnv.GOOGLE_OAUTH_REFRESH_TOKEN ||
      null,
  };
}

export function hasGoogleOAuthCredentials(projectRoot: string): boolean {
  const oauth = getGoogleOAuthCredentials(projectRoot);
  return Boolean(oauth.clientId && oauth.clientSecret && oauth.refreshToken);
}

export function invalidateGoogleOAuthProbeCache(): void {
  probeCache = null;
}

/** 공용 서버 토큰 저장 — 팀원 전원 업로드가 이 토큰으로 Drive(소유자)에 저장됩니다. */
export function saveGoogleOAuthRefreshToken(projectRoot: string, refreshToken: string): void {
  const trimmed = refreshToken.trim();
  if (!trimmed) {
    throw new Error('refresh_token이 비어 있습니다.');
  }

  const tokenPath = resolveTokenFilePath(projectRoot);
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  const payload: TokenFile = {
    refresh_token: trimmed,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(tokenPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  process.env.GOOGLE_OAUTH_REFRESH_TOKEN = trimmed;
  upsertEnvKey(path.join(projectRoot, '.env'), 'GOOGLE_OAUTH_REFRESH_TOKEN', trimmed);
  invalidateGoogleOAuthProbeCache();
}

export function formatGoogleOAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (
    lower.includes('invalid_grant') ||
    lower.includes('token has been expired or revoked') ||
    lower.includes('expired or revoked')
  ) {
    return (
      'Google Drive 공용 업로드 토큰이 만료되었거나 철회되었습니다. ' +
      '관리자가 데이터폴더에서 「Drive OAuth 재연결」을 실행하거나 npm run google-drive-oauth로 재발급하세요. ' +
      '(테스트 모드 OAuth 앱은 약 7일 후 만료되므로, 팀 사용 시 Google Cloud Console에서 게시(프로덕션)로 전환하세요.)'
    );
  }
  if (message.includes('storage quota') || message.includes('Service Accounts do not have storage')) {
    return (
      '개인 Google Drive는 서비스 계정으로 파일을 올릴 수 없습니다. ' +
      'OAuth 업로드 설정(GOOGLE_OAUTH_*)을 추가한 뒤 Drive OAuth 재연결을 실행하세요.'
    );
  }
  return message;
}

export async function probeGoogleOAuthUploadAccess(
  projectRoot: string,
  options?: { force?: boolean },
): Promise<GoogleOAuthProbeResult> {
  const oauth = getGoogleOAuthCredentials(projectRoot);
  const hasCredentials = Boolean(oauth.clientId && oauth.clientSecret && oauth.refreshToken);
  if (!hasCredentials) {
    return { ok: false, hasCredentials: false, error: 'GOOGLE_OAUTH_CLIENT_ID / SECRET / REFRESH_TOKEN이 없습니다.' };
  }

  if (!options?.force && probeCache && Date.now() - probeCache.at < PROBE_TTL_MS) {
    return probeCache.result;
  }

  try {
    const auth = new google.auth.OAuth2(oauth.clientId!, oauth.clientSecret!);
    auth.setCredentials({ refresh_token: oauth.refreshToken! });
    const token = await auth.getAccessToken();
    if (!token.token) {
      throw new Error('access token을 발급받지 못했습니다.');
    }
    const result: GoogleOAuthProbeResult = { ok: true, hasCredentials: true };
    probeCache = { at: Date.now(), result };
    return result;
  } catch (error) {
    const result: GoogleOAuthProbeResult = {
      ok: false,
      hasCredentials: true,
      error: formatGoogleOAuthError(error),
    };
    probeCache = { at: Date.now(), result };
    return result;
  }
}

export function buildGoogleOAuthAuthUrl(projectRoot: string): string {
  const oauth = getGoogleOAuthCredentials(projectRoot);
  if (!oauth.clientId || !oauth.clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET를 .env에 먼저 입력하세요.');
  }
  const client = new google.auth.OAuth2(
    oauth.clientId,
    oauth.clientSecret,
    GOOGLE_OAUTH_REDIRECT_URI,
  );
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_OAUTH_SCOPES,
  });
}

/**
 * 관리자 1회 OAuth — 발급된 refresh token은 서버 공용으로 저장되어
 * 로그인한 모든 팀원이 동일 Drive에 업로드할 수 있습니다.
 */
export async function startGoogleOAuthReconnect(
  projectRoot: string,
): Promise<{ authUrl: string }> {
  if (reconnectInFlight) return reconnectInFlight;

  reconnectInFlight = (async () => {
    if (reconnectServer) {
      await new Promise<void>((resolve) => {
        reconnectServer?.close(() => resolve());
      });
      reconnectServer = null;
    }

    const oauth = getGoogleOAuthCredentials(projectRoot);
    if (!oauth.clientId || !oauth.clientSecret) {
      throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET를 .env에 먼저 입력하세요.');
    }

    const client = new google.auth.OAuth2(
      oauth.clientId,
      oauth.clientSecret,
      GOOGLE_OAUTH_REDIRECT_URI,
    );
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_OAUTH_SCOPES,
    });

    await new Promise<void>((resolve, reject) => {
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
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>code 없음</h1>');
            return;
          }

          const { tokens } = await client.getToken(code);
          if (!tokens.refresh_token) {
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(
              '<h1>refresh_token 없음</h1><p>Google 계정에서 앱 액세스 권한을 해제한 뒤 다시 시도하세요.</p>',
            );
            return;
          }

          saveGoogleOAuthRefreshToken(projectRoot, tokens.refresh_token);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<h1>Drive OAuth 연결 완료</h1><p>이 창을 닫고 대시보드로 돌아가 주세요. 팀원 전원 업로드가 동일 Drive에 저장됩니다.</p>',
          );
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h1>OAuth 오류</h1><pre>${formatGoogleOAuthError(error)}</pre>`);
        } finally {
          server.close();
          if (reconnectServer === server) reconnectServer = null;
          reconnectInFlight = null;
        }
      });

      server.once('error', (error) => {
        reconnectServer = null;
        reconnectInFlight = null;
        reject(error);
      });

      server.listen(5188, '127.0.0.1', () => {
        reconnectServer = server;
        resolve();
      });
    });

    return { authUrl };
  })();

  try {
    return await reconnectInFlight;
  } catch (error) {
    reconnectInFlight = null;
    throw error;
  }
}
