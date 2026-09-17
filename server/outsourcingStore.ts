import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { getDocument, isMariaDbEnabled, putDocument } from './mariadb';
import { getNexusDriveConfig, NEXUS_DRIVE_SUBFOLDERS } from './nexusGoogleDrive';

export const OUTSOURCING_DOC_KEY = 'outsourcing';

export interface StoredOutsourcingDoc {
  fileName: string;
  csv: string;
  updatedAt: string;
}

const DATA_EXTENSIONS = ['.csv', '.xlsx', '.xls'] as const;

export function isOutsourcingDataFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return DATA_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function fileToOutsourcingCsv(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') return fs.readFileSync(filePath, 'utf8');
  if (ext === '.xlsx' || ext === '.xls') {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error(`Excel 파일에 시트가 없습니다: ${path.basename(filePath)}`);
    return XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
  }
  throw new Error(`지원하지 않는 외주 데이터 파일 형식입니다: ${path.basename(filePath)}`);
}

export function bufferToOutsourcingCsv(fileName: string, buffer: Buffer): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.csv') return buffer.toString('utf8');
  if (ext === '.xlsx' || ext === '.xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error(`Excel 파일에 시트가 없습니다: ${fileName}`);
    return XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
  }
  throw new Error(`지원하지 않는 외주 데이터 파일 형식입니다: ${fileName}`);
}

export async function loadOutsourcingDoc(projectRoot: string): Promise<StoredOutsourcingDoc | null> {
  if (!isMariaDbEnabled(projectRoot)) return null;
  const doc = await getDocument<StoredOutsourcingDoc>(projectRoot, OUTSOURCING_DOC_KEY);
  if (!doc?.csv || !doc.fileName) return null;
  return doc;
}

export async function saveOutsourcingDoc(
  projectRoot: string,
  fileName: string,
  csv: string,
): Promise<StoredOutsourcingDoc> {
  const updatedAt = new Date().toISOString();
  const doc: StoredOutsourcingDoc = { fileName, csv, updatedAt };
  await putDocument(projectRoot, OUTSOURCING_DOC_KEY, doc, updatedAt);
  const config = getNexusDriveConfig(projectRoot);
  const cacheDir = path.join(config.cacheDir, NEXUS_DRIVE_SUBFOLDERS.outsourcing);
  fs.mkdirSync(cacheDir, { recursive: true });
  const safeName = fileName.toLowerCase().endsWith('.csv') ? fileName : `${fileName.replace(/\.[^.]+$/, '')}.csv`;
  fs.writeFileSync(path.join(cacheDir, safeName), csv, 'utf8');
  return doc;
}
