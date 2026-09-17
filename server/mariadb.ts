import mysql from 'mysql2/promise';
import { readProjectEnv } from './projectEnv';

let pool: mysql.Pool | null = null;
let enabledCache: boolean | null = null;

function mariadbConfig(projectRoot: string) {
  const env = readProjectEnv(projectRoot);
  const host = process.env.MARIADB_HOST?.trim() || env.MARIADB_HOST?.trim() || '';
  const database = process.env.MARIADB_DATABASE?.trim() || env.MARIADB_DATABASE?.trim() || '';
  const user = process.env.MARIADB_USER?.trim() || env.MARIADB_USER?.trim() || '';
  const password = process.env.MARIADB_PASSWORD ?? env.MARIADB_PASSWORD ?? '';
  const port = Number(process.env.MARIADB_PORT || env.MARIADB_PORT || 3306);
  return { host, database, user, password, port };
}

export function isMariaDbEnabled(projectRoot: string): boolean {
  if (enabledCache != null) return enabledCache;
  const { host, database, user } = mariadbConfig(projectRoot);
  enabledCache = Boolean(host && database && user);
  return enabledCache;
}

export function getPool(projectRoot: string): mysql.Pool {
  if (pool) return pool;
  const cfg = mariadbConfig(projectRoot);
  pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: 8,
    charset: 'utf8mb4',
  });
  return pool;
}

let schemaReady = false;

export async function ensureMariaDbSchema(projectRoot: string): Promise<void> {
  if (!isMariaDbEnabled(projectRoot) || schemaReady) return;
  await getPool(projectRoot).query(`
    CREATE TABLE IF NOT EXISTS snexus_document (
      doc_key VARCHAR(128) NOT NULL PRIMARY KEY,
      payload LONGTEXT NOT NULL,
      updated_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await getPool(projectRoot).query(
    'ALTER TABLE snexus_document MODIFY doc_key VARCHAR(128) NOT NULL',
  ).catch(() => undefined);
  schemaReady = true;
}

export function competitorDocumentKey(year: number, sector: string): string {
  return `competitor:${year}:${sector}`;
}

export async function listDocumentKeys(projectRoot: string, prefix = ''): Promise<string[]> {
  if (!isMariaDbEnabled(projectRoot)) return [];
  await ensureMariaDbSchema(projectRoot);
  const [rows] = await getPool(projectRoot).query<mysql.RowDataPacket[]>(
    prefix
      ? 'SELECT doc_key FROM snexus_document WHERE doc_key LIKE ? ORDER BY doc_key'
      : 'SELECT doc_key FROM snexus_document ORDER BY doc_key',
    prefix ? [`${prefix}%`] : [],
  );
  return rows.map((row) => String(row.doc_key));
}

export async function getDocument<T>(projectRoot: string, docKey: string): Promise<T | null> {
  if (!isMariaDbEnabled(projectRoot)) return null;
  await ensureMariaDbSchema(projectRoot);
  const [rows] = await getPool(projectRoot).query<mysql.RowDataPacket[]>(
    'SELECT payload FROM snexus_document WHERE doc_key = ? LIMIT 1',
    [docKey],
  );
  const raw = rows[0]?.payload;
  const payload = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;
  if (typeof payload !== 'string' || !payload) return null;
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

export async function putDocument(projectRoot: string, docKey: string, payload: unknown, updatedAt: string): Promise<void> {
  if (!isMariaDbEnabled(projectRoot)) return;
  await ensureMariaDbSchema(projectRoot);
  await getPool(projectRoot).query(
    `INSERT INTO snexus_document (doc_key, payload, updated_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = VALUES(updated_at)`,
    [docKey, JSON.stringify(payload), updatedAt],
  );
}
