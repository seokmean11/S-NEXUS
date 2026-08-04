import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

interface ResolvedCsvFile {
  filePath: string;
  fileName: string;
  sourcePath: string;
  updatedAt: string;
}

const PATH_FILE = 'outsourcing-data.path';

function readPathFile(root: string): string | null {
  const filePath = path.join(root, PATH_FILE);
  if (!fs.existsSync(filePath)) return null;
  const line = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value && !value.startsWith('#'));
  return line || null;
}

function readEnvPath(root: string): string | null {
  for (const name of ['.env.local', '.env']) {
    const envPath = path.join(root, name);
    if (!fs.existsSync(envPath)) continue;
    const text = fs.readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('OUTSOURCING_DATA_PATH=')) {
        const value = trimmed.slice('OUTSOURCING_DATA_PATH='.length).trim();
        if (value) return value;
      }
    }
  }
  return null;
}

function getConfiguredPath(root: string): string | null {
  const candidates = [
    process.env.OUTSOURCING_DATA_PATH?.trim(),
    readEnvPath(root),
    readPathFile(root),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0] ?? null;
}

function resolveCsvFile(dataPath: string): ResolvedCsvFile {
  const resolved = path.resolve(dataPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`외주 데이터 경로를 찾을 수 없습니다: ${resolved}`);
  }

  const stat = fs.statSync(resolved);

  if (stat.isFile()) {
    if (!resolved.toLowerCase().endsWith('.csv')) {
      throw new Error('외주 데이터 파일은 CSV 형식이어야 합니다.');
    }
    return {
      filePath: resolved,
      fileName: path.basename(resolved),
      sourcePath: resolved,
      updatedAt: stat.mtime.toISOString(),
    };
  }

  if (stat.isDirectory()) {
    const csvFiles = fs
      .readdirSync(resolved)
      .filter((name) => name.toLowerCase().endsWith('.csv'))
      .map((name) => {
        const filePath = path.join(resolved, name);
        const fileStat = fs.statSync(filePath);
        return {
          filePath,
          fileName: name,
          sourcePath: filePath,
          updatedAt: fileStat.mtime.toISOString(),
          mtimeMs: fileStat.mtimeMs,
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (csvFiles.length === 0) {
      throw new Error(`폴더에 CSV 파일이 없습니다: ${resolved}`);
    }

    const latest = csvFiles[0];
    return {
      filePath: latest.filePath,
      fileName: latest.fileName,
      sourcePath: latest.sourcePath,
      updatedAt: latest.updatedAt,
    };
  }

  throw new Error(`외주 데이터 경로 형식이 올바르지 않습니다: ${resolved}`);
}

function sendJson(res: import('http').ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function attachRoutes(server: { middlewares: { use: Function } }, root: string) {
  server.middlewares.use('/api/outsourcing/local/info', (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    const configuredPath = getConfiguredPath(root);
    if (!configuredPath) {
      sendJson(res, 200, {
        configured: false,
        message:
          'outsourcing-data.path 또는 .env OUTSOURCING_DATA_PATH에 폴더(또는 CSV) 경로를 설정하세요.',
      });
      return;
    }

    try {
      const file = resolveCsvFile(configuredPath);
      sendJson(res, 200, {
        configured: true,
        configuredPath,
        fileName: file.fileName,
        sourcePath: file.sourcePath,
        updatedAt: file.updatedAt,
      });
    } catch (error) {
      sendJson(res, 500, {
        configured: true,
        configuredPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.middlewares.use('/api/outsourcing/local', (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    const configuredPath = getConfiguredPath(root);
    if (!configuredPath) {
      sendJson(res, 404, {
        error: '외주 데이터 경로가 설정되지 않았습니다. outsourcing-data.path를 확인하세요.',
      });
      return;
    }

    try {
      const file = resolveCsvFile(configuredPath);
      const csv = fs.readFileSync(file.filePath, 'utf8');
      sendJson(res, 200, {
        fileName: file.fileName,
        sourcePath: file.sourcePath,
        updatedAt: file.updatedAt,
        csv,
      });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export function outsourcingLocalPlugin(): Plugin {
  const root = process.cwd();

  return {
    name: 'outsourcing-local-data',
    configureServer(server) {
      attachRoutes(server, root);
    },
    configurePreviewServer(server) {
      attachRoutes(server, root);
    },
  };
}
