import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import mysql from 'mysql2/promise';

const root = process.argv[2] || process.cwd();
const require = createRequire(import.meta.url);

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return values;
}

const env = {
  ...readEnvFile(path.join(root, '.env')),
  ...readEnvFile(path.join(root, '.env.local')),
  ...process.env,
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

async function upsert(connection, key, payload, updatedAt) {
  await connection.query(
    `INSERT INTO snexus_document (doc_key, payload, updated_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = VALUES(updated_at)`,
    [key, JSON.stringify(payload), String(updatedAt)],
  );
}

const docs = [
  {
    key: 'fund_billing',
    file: path.join(root, '.data', 'fund-billing', '월별기성원장.json'),
  },
  {
    key: 'org',
    file: path.join(root, '.data', 'nexus-org', 'state.json'),
  },
  {
    key: 'app',
    file: path.join(root, '.data', 'nexus-app', 'state.json'),
  },
];

const connection = await mysql.createConnection({
  host: env.MARIADB_HOST || '127.0.0.1',
  port: Number(env.MARIADB_PORT || 3306),
  user: env.MARIADB_USER,
  password: env.MARIADB_PASSWORD || '',
  database: env.MARIADB_DATABASE,
  charset: 'utf8mb4',
});

await connection.query(`
  CREATE TABLE IF NOT EXISTS snexus_document (
    doc_key VARCHAR(128) NOT NULL PRIMARY KEY,
    payload LONGTEXT NOT NULL,
    updated_at VARCHAR(40) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);
try {
  await connection.query('ALTER TABLE snexus_document MODIFY doc_key VARCHAR(128) NOT NULL');
} catch {
  /* already applied */
}

for (const doc of docs) {
  const payload = readJson(doc.file);
  if (!payload) {
    console.log(`SKIP ${doc.key} missing ${doc.file}`);
    continue;
  }
  const updatedAt = payload.updatedAt || payload.savedAt || payload.app?.savedAt || new Date().toISOString();
  await upsert(connection, doc.key, payload, updatedAt);
  console.log(`OK ${doc.key} from ${doc.file}`);
}

const cacheRoot = path.join(root, env.NEXUS_DRIVE_CACHE_DIR || '.data/nexus-drive');
const outsourcingDir = path.join(cacheRoot, '외주정보데이터');
if (fs.existsSync(outsourcingDir)) {
  const XLSX = require('xlsx');
  const files = fs
    .readdirSync(outsourcingDir)
    .filter((name) => /\.(csv|xlsx|xls)$/i.test(name))
    .map((name) => {
      const filePath = path.join(outsourcingDir, name);
      const dateMatch = name.match(/(\d{4}-\d{2}-\d{2})/);
      const dateMs = dateMatch ? Date.parse(`${dateMatch[1]}T00:00:00.000Z`) : 0;
      return { name, filePath, rankMs: dateMs || fs.statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.rankMs - a.rankMs);
  const latest = files[0];
  if (latest) {
    let csv;
    if (/\.csv$/i.test(latest.name)) csv = fs.readFileSync(latest.filePath, 'utf8');
    else {
      const workbook = XLSX.readFile(latest.filePath);
      csv = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
    }
    const outsourcing = { fileName: latest.name, csv, updatedAt: new Date(latest.rankMs).toISOString() };
    await upsert(connection, 'outsourcing', outsourcing, outsourcing.updatedAt);
    console.log(`OK outsourcing from ${latest.filePath}`);
  } else {
    console.log('SKIP outsourcing no csv/xlsx');
  }
} else {
  console.log(`SKIP outsourcing missing ${outsourcingDir}`);
}

for (const file of walkFiles(path.join(cacheRoot, '경쟁사분석'))) {
  if (path.basename(file) !== 'competitor-data.json') continue;
  const payload = readJson(file);
  if (!payload?.year || !payload?.sector) {
    console.log(`SKIP competitor bad ${file}`);
    continue;
  }
  const key = `competitor:${payload.year}:${payload.sector}`;
  await upsert(connection, key, payload, payload.updatedAt || new Date().toISOString());
  console.log(`OK ${key} from ${file}`);
}

const [rows] = await connection.query(
  'SELECT doc_key, CHAR_LENGTH(payload) AS bytes, updated_at FROM snexus_document ORDER BY doc_key',
);
console.log(JSON.stringify(rows, null, 2));
await connection.end();
