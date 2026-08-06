import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import * as XLSX from 'xlsx';

interface ResolvedDataFile {
  filePath: string;
  fileName: string;
  sourcePath: string;
  updatedAt: string;
}

const PATH_FILE = 'outsourcing-data.path';
const DATA_EXTENSIONS = ['.csv', '.xlsx', '.xls'] as const;

function isDataFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return DATA_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

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

function getLocalConfiguredPath(root: string): string | null {
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

async function resolveOutsourcingDataPath(
  root: string,
): Promise<{ path: string; source: 'google-drive' | 'local' } | null> {
  try {
    const { getNexusDriveConfig, syncNexusDriveCache, resolveNexusOutsourcingCacheDir } =
      await import('./server/nexusGoogleDrive');
    const driveConfig = getNexusDriveConfig(root);
    if (driveConfig.enabled) {
      await syncNexusDriveCache(root, { subfolderKey: 'outsourcing' });
      const cacheDir = resolveNexusOutsourcingCacheDir(root);
      if (cacheDir) {
        return { path: cacheDir, source: 'google-drive' };
      }
    }
  } catch {
    // Google Drive 미설정·오류 시 로컬 경로로 폴백
  }

  const localPath = getLocalConfiguredPath(root);
  if (localPath) {
    return { path: localPath, source: 'local' };
  }

  return null;
}

function readDataFileAsCsv(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.csv') {
    return fs.readFileSync(filePath, 'utf8');
  }

  if (ext === '.xlsx' || ext === '.xls') {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error(`Excel 파일에 시트가 없습니다: ${path.basename(filePath)}`);
    }
    return XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
  }

  throw new Error(`지원하지 않는 외주 데이터 파일 형식입니다: ${path.basename(filePath)}`);
}

function resolveDataFile(dataPath: string): ResolvedDataFile {
  const resolved = path.resolve(dataPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`외주 데이터 경로를 찾을 수 없습니다: ${resolved}`);
  }

  const stat = fs.statSync(resolved);

  if (stat.isFile()) {
    if (!isDataFileName(resolved)) {
      throw new Error('외주 데이터 파일은 CSV 또는 Excel(xlsx, xls) 형식이어야 합니다.');
    }
    return {
      filePath: resolved,
      fileName: path.basename(resolved),
      sourcePath: resolved,
      updatedAt: stat.mtime.toISOString(),
    };
  }

  if (stat.isDirectory()) {
    const dataFiles = fs
      .readdirSync(resolved)
      .filter((name) => isDataFileName(name))
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

    if (dataFiles.length === 0) {
      throw new Error(`폴더에 CSV/Excel 파일이 없습니다: ${resolved}`);
    }

    const latest = dataFiles[0];
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
  server.middlewares.use('/api/outsourcing/local/info', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    const resolved = await resolveOutsourcingDataPath(root);
    if (!resolved) {
      sendJson(res, 200, {
        configured: false,
        message:
          'Google Drive NEXUS 폴더 또는 outsourcing-data.path / OUTSOURCING_DATA_PATH를 설정하세요.',
      });
      return;
    }

    try {
      const file = resolveDataFile(resolved.path);
      sendJson(res, 200, {
        configured: true,
        configuredPath: resolved.path,
        dataSource: resolved.source,
        fileName: file.fileName,
        sourcePath: file.sourcePath,
        updatedAt: file.updatedAt,
      });
    } catch (error) {
      sendJson(res, 500, {
        configured: true,
        configuredPath: resolved.path,
        dataSource: resolved.source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.middlewares.use('/api/outsourcing/local', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    const resolved = await resolveOutsourcingDataPath(root);
    if (!resolved) {
      sendJson(res, 404, {
        error:
          '외주 데이터 경로가 설정되지 않았습니다. 데이터폴더(Google Drive) 또는 outsourcing-data.path를 확인하세요.',
      });
      return;
    }

    try {
      const file = resolveDataFile(resolved.path);
      const csv = readDataFileAsCsv(file.filePath);
      sendJson(res, 200, {
        fileName: file.fileName,
        sourcePath: file.sourcePath,
        updatedAt: file.updatedAt,
        dataSource: resolved.source,
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
  let projectRoot = process.cwd();

  return {
    name: 'outsourcing-local-data',
    configResolved(config) {
      projectRoot = config.root;
    },
    configureServer(server) {
      attachRoutes(server, projectRoot);
    },
    configurePreviewServer(server) {
      attachRoutes(server, projectRoot);
    },
  };
}
