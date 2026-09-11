import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {
  getNexusDriveConfig,
  isNexusDriveUploadConfigured,
  NEXUS_DRIVE_SUBFOLDERS,
  syncNexusDriveCache,
  uploadOrUpdateNexusDriveFile,
} from './nexusGoogleDrive';

export interface StoredSpendLine {
  id: string;
  kind: string;
  no: string;
  tradeType: string;
  vendorName: string;
  contractAmount: number;
  contractAmountHistory?: Array<{ sequence: number; label: string; amount: number; changedAt: string }>;
  priorPaid: number;
  monthClaim: number;
  inspected: number;
  commonInspectedManual?: boolean;
}

export interface StoredFundBillingReport {
  id: string;
  monthKey: string;
  projectName: string;
  projectCode: string;
  department: string;
  contractAmount: number;
  startDate: string;
  endDate: string;
  writtenDate: string;
  pmName: string;
  collectedPrior: number;
  expectedCollection: number;
  directCostBudget?: number;
  linkedProjectId: string;
  overheads: StoredSpendLine[];
  lines: StoredSpendLine[];
  closed?: boolean;
  updatedAt: string;
}

export interface StoredFundBillingLedger {
  reports: StoredFundBillingReport[];
  updatedAt?: string;
}

export type FundBillingRuntimeRole = 'dev' | 'service';

const PROD_STORE_DIR = '.data/fund-billing';
const DEV_STORE_DIR = '.data/fund-billing-dev';
const JSON_FILE = '월별기성원장.json';
const XLSX_FILE = '월별기성원장.xlsx';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function storeDir(root: string, role: FundBillingRuntimeRole): string {
  return path.join(root, role === 'dev' ? DEV_STORE_DIR : PROD_STORE_DIR);
}

function jsonPath(root: string, role: FundBillingRuntimeRole): string {
  return path.join(storeDir(root, role), JSON_FILE);
}

function xlsxPath(root: string, role: FundBillingRuntimeRole): string {
  return path.join(storeDir(root, role), XLSX_FILE);
}

function driveCachedJsonPath(root: string): string {
  const config = getNexusDriveConfig(root);
  return path.join(config.cacheDir, NEXUS_DRIVE_SUBFOLDERS.fundBilling, JSON_FILE);
}

export function ensureFundBillingStoreDir(root: string, role: FundBillingRuntimeRole = 'service'): void {
  fs.mkdirSync(storeDir(root, role), { recursive: true });
}

export function readFundBillingLedger(
  root: string,
  role: FundBillingRuntimeRole = 'service',
): StoredFundBillingLedger | null {
  const file = jsonPath(root, role);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as StoredFundBillingLedger;
  } catch {
    return null;
  }
}

export async function loadFundBillingLedger(
  root: string,
  _role: FundBillingRuntimeRole,
): Promise<{ ledger: StoredFundBillingLedger | null; source: 'drive' | 'sandbox' | 'local' }> {
  try {
    await syncNexusDriveCache(root, { force: true, subfolderKey: 'fundBilling', minIntervalMs: 0 });
    const cached = driveCachedJsonPath(root);
    if (fs.existsSync(cached)) {
      ensureFundBillingStoreDir(root, 'service');
      fs.copyFileSync(cached, jsonPath(root, 'service'));
      return { ledger: readFundBillingLedger(root, 'service'), source: 'drive' };
    }
  } catch {
    /* fall through to local service cache */
  }
  const local = readFundBillingLedger(root, 'service');
  return { ledger: local, source: local ? 'local' : 'drive' };
}

function lineCumulative(line: StoredSpendLine): number {
  return (line.priorPaid ?? 0) + (line.inspected ?? 0);
}

function lineRemain(line: StoredSpendLine): number {
  return (line.contractAmount ?? 0) - lineCumulative(line);
}

const KIND_LABEL: Record<string, string> = {
  subcontract: '하도급',
  advance: '전도금',
  labor: '인건비',
  other: '기타',
};

async function buildLedgerWorkbook(ledger: StoredFundBillingLedger): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'S-NEXUS 기성관리';

  const headerSheet = workbook.addWorksheet('기본정보');
  headerSheet.columns = [
    { header: '프로젝트ID', key: 'id', width: 16 },
    { header: '기성월', key: 'monthKey', width: 12 },
    { header: '프로젝트명', key: 'projectName', width: 32 },
    { header: '프로젝트코드', key: 'projectCode', width: 18 },
    { header: '사업유형', key: 'department', width: 16 },
    { header: '수주금액', key: 'contractAmount', width: 16 },
    { header: '계약시작', key: 'startDate', width: 16 },
    { header: '계약종료', key: 'endDate', width: 16 },
    { header: '작성일자', key: 'writtenDate', width: 18 },
    { header: '담당자', key: 'pmName', width: 12 },
    { header: '기수금액', key: 'collectedPrior', width: 16 },
    { header: '금월수금예정', key: 'expectedCollection', width: 16 },
    { header: '직접원가실행', key: 'directCostBudget', width: 16 },
    { header: '수금누계', key: 'collectedTotal', width: 16 },
    { header: '종결', key: 'closed', width: 8 },
    { header: '저장시각', key: 'updatedAt', width: 22 },
  ];
  for (const report of ledger.reports) {
    headerSheet.addRow({
      id: report.id,
      monthKey: report.monthKey,
      projectName: report.projectName,
      projectCode: report.projectCode,
      department: report.department,
      contractAmount: report.contractAmount,
      startDate: report.startDate,
      endDate: report.endDate,
      writtenDate: report.writtenDate,
      pmName: report.pmName,
      collectedPrior: report.collectedPrior,
      expectedCollection: report.expectedCollection,
      directCostBudget: report.directCostBudget ?? 0,
      collectedTotal: report.collectedPrior + report.expectedCollection,
      closed: report.closed ? 'Y' : '',
      updatedAt: report.updatedAt,
    });
  }

  const lineSheet = workbook.addWorksheet('집행내역');
  lineSheet.columns = [
    { header: '프로젝트ID', key: 'id', width: 16 },
    { header: '기성월', key: 'monthKey', width: 12 },
    { header: '프로젝트명', key: 'projectName', width: 32 },
    { header: '구분', key: 'kind', width: 12 },
    { header: '계약No', key: 'no', width: 10 },
    { header: '공종', key: 'tradeType', width: 18 },
    { header: '업체명', key: 'vendorName', width: 18 },
    { header: '하도급금액', key: 'contractAmount', width: 16 },
    { header: '기지출금액', key: 'priorPaid', width: 16 },
    { header: '금월청구금액', key: 'monthClaim', width: 16 },
    { header: '관리팀검수', key: 'inspected', width: 16 },
    { header: '누계', key: 'cumulative', width: 16 },
    { header: '잔액', key: 'remain', width: 16 },
    { header: '저장시각', key: 'updatedAt', width: 22 },
  ];
  for (const report of ledger.reports) {
    const push = (line: StoredSpendLine, kindLabel: string) => {
      lineSheet.addRow({
        id: report.id,
        monthKey: report.monthKey,
        projectName: report.projectName,
        kind: kindLabel,
        no: line.no,
        tradeType: line.tradeType,
        vendorName: line.vendorName,
        contractAmount: line.contractAmount,
        priorPaid: line.priorPaid,
        monthClaim: line.monthClaim,
        inspected: line.inspected,
        cumulative: lineCumulative(line),
        remain: lineRemain(line),
        updatedAt: report.updatedAt,
      });
    };
    for (const line of report.overheads ?? []) {
      push(line, line.tradeType || '경비');
    }
    for (const line of report.lines ?? []) {
      push(line, KIND_LABEL[line.kind] ?? line.kind);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function storedReportKey(report: StoredFundBillingReport): string {
  return `${report.id}::${report.monthKey}`;
}

/** 종결 프로젝트의 월별 기성 원천은 이후 저장으로 삭제·수정되지 않습니다. */
export function preserveClosedFundBillingReports(
  incoming: StoredFundBillingReport[],
  existing: StoredFundBillingReport[] | undefined,
): StoredFundBillingReport[] {
  const existingList = existing ?? [];
  const closedIds = new Set(
    [...incoming, ...existingList].filter((item) => item.closed).map((item) => item.id),
  );
  if (closedIds.size === 0) return incoming;

  const existingByKey = new Map(existingList.map((item) => [storedReportKey(item), item]));
  const incomingKeys = new Set(incoming.map(storedReportKey));
  const merged = incoming.map((item) => {
    if (!closedIds.has(item.id)) return item;
    const prev = existingByKey.get(storedReportKey(item));
    if (!prev) return { ...item, closed: true };
    if (prev.closed) return { ...prev, closed: true };
    return { ...item, closed: true };
  });
  for (const prev of existingList) {
    if (!closedIds.has(prev.id)) continue;
    if (!incomingKeys.has(storedReportKey(prev))) {
      merged.push({ ...prev, closed: true });
    }
  }
  return merged;
}

function readJsonLedgerFile(file: string): StoredFundBillingLedger | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as StoredFundBillingLedger;
  } catch {
    return null;
  }
}

async function loadExistingLedgerForMerge(
  root: string,
  role: FundBillingRuntimeRole,
): Promise<StoredFundBillingLedger | null> {
  try {
    await syncNexusDriveCache(root, { force: true, subfolderKey: 'fundBilling', minIntervalMs: 0 });
    const cached = readJsonLedgerFile(driveCachedJsonPath(root));
    if (cached?.reports?.length) return cached;
  } catch {
    /* fall through */
  }
  return readFundBillingLedger(root, 'service') ?? readFundBillingLedger(root, role);
}

export async function writeFundBillingLedger(
  root: string,
  ledger: StoredFundBillingLedger,
  role: FundBillingRuntimeRole = 'service',
): Promise<{ updatedAt: string; driveSaved: boolean; driveError?: string; writable: boolean }> {
  const writable = role === 'service';
  ensureFundBillingStoreDir(root, role);
  const previous = await loadExistingLedgerForMerge(root, role);
  const reports = preserveClosedFundBillingReports(
    Array.isArray(ledger.reports) ? ledger.reports : [],
    previous?.reports,
  );
  const stamped: StoredFundBillingLedger = {
    ...ledger,
    reports,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(jsonPath(root, role), JSON.stringify(stamped, null, 2), 'utf8');
  const xlsx = await buildLedgerWorkbook(stamped);
  fs.writeFileSync(xlsxPath(root, role), xlsx);

  if (!writable) {
    return {
      updatedAt: stamped.updatedAt ?? new Date().toISOString(),
      driveSaved: false,
      writable: false,
    };
  }

  let driveSaved = false;
  let driveError: string | undefined;
  const config = getNexusDriveConfig(root);
  if (config.enabled && isNexusDriveUploadConfigured(root)) {
    try {
      await uploadOrUpdateNexusDriveFile(root, JSON_FILE, Buffer.from(JSON.stringify(stamped, null, 2)), 'application/json', {
        subfolderKey: 'fundBilling',
      });
      await uploadOrUpdateNexusDriveFile(root, XLSX_FILE, xlsx, XLSX_MIME, {
        subfolderKey: 'fundBilling',
      });
      driveSaved = true;
    } catch (error) {
      driveError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    updatedAt: stamped.updatedAt ?? new Date().toISOString(),
    driveSaved,
    driveError,
    writable: true,
  };
}
