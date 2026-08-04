import type { OutsourcingRecord } from '@/types/outsourcing';
import { parseContractDate } from '@/utils/outsourcingDate';

type OutsourcingCsvField = Exclude<keyof OutsourcingRecord, 'contractTimestamp'>;

const COLUMN_ALIASES: Record<OutsourcingCsvField, string[]> = {
  division: ['사업부(실)', '사업부', '사업본부', '사업부_실', '사업부실'],
  project: ['프로젝트명', '프로젝트', 'PJT명', 'PJT', '현장명'],
  vendor: ['업체명', '외주업체', '협력사', '업체'],
  vendorLabel: ['업체표시', '업체명_표시', '업체별표시', '업체명(담당)', '업체_표시'],
  contractDate: ['외주계약일', '계약일'],
  contract: ['외주계약명', '외주계약', '외주_계약', '계약명'],
  budget: ['실행예산명', '실행예산', '실행예산_명', '실행예산코드'],
  spec: ['규격내역', '규격', '내역', '규격_내역'],
  unit: ['단위'],
  contractQty: ['계약수량'],
  contractUnitPrice: ['계약단가'],
  contractAmount: ['계약금액'],
  executionQty: ['실행수량'],
  executionUnitPrice: ['실행단가'],
  executionAmount: ['실행금액'],
  outsourcingQty: ['외주수량'],
  outsourcingUnitPrice: ['외주단가'],
  totalAmount: ['외주금액', '외주_금액', '외주총금액', '합계금액', '외주_총금액'],
  materialAmount: ['외주자재금액', '외주_자재금액', '자재금액', '자재_금액'],
  laborAmount: ['외주노무금액', '외주_노무금액', '노무금액', '노무_금액'],
  expenseAmount: ['외주경비금액', '외주_경비금액', '경비금액', '경비_금액'],
  materialUnitPrice: ['외주자재단가', '외주_자재단가', '자재단가', '자재_단가'],
  laborUnitPrice: ['외주노무단가', '외주_노무단가', '노무단가', '노무_단가'],
  expenseUnitPrice: ['외주경비단가', '외주_경비단가', '경비단가', '경비_단가'],
  materialQty: ['외주수량', '자재수량', '자재_수량'],
  laborQty: ['외주수량', '노무수량', '노무_수량'],
  expenseQty: ['외주수량', '경비수량', '경비_수량'],
};

function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value == null) return 0;
  const text = String(value).replace(/,/g, '').trim();
  if (!text || text === '-') return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseText(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function resolveColumnIndex(headers: string[], aliases: string[]): number {
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const index = normalizedHeaders.indexOf(normalizeHeader(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function buildColumnMap(headers: string[]): Partial<Record<OutsourcingCsvField, number>> {
  const map: Partial<Record<OutsourcingCsvField, number>> = {};
  (Object.keys(COLUMN_ALIASES) as OutsourcingCsvField[]).forEach((field) => {
    const index = resolveColumnIndex(headers, COLUMN_ALIASES[field]);
    if (index >= 0) map[field] = index;
  });
  return map;
}

function getCell(row: unknown[], index: number | undefined): unknown {
  if (index == null || index < 0) return '';
  return row[index] ?? '';
}

function parseCsv(text: string): unknown[][] {
  const rows: unknown[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== '')) rows.push(row);
  }

  return rows;
}

function buildOutsourcingRecord(
  row: unknown[],
  columnMap: Partial<Record<OutsourcingCsvField, number>>,
  vendor: string,
  vendorLabel: string,
  outsourcingQty: number,
  materialAmount: number,
  laborAmount: number,
  expenseAmount: number,
  totalAmount: number,
): OutsourcingRecord {
  const contractDate = parseText(getCell(row, columnMap.contractDate));

  return {
    division: parseText(getCell(row, columnMap.division)),
    project: parseText(getCell(row, columnMap.project)),
    vendor,
    vendorLabel,
    contractDate,
    contractTimestamp: parseContractDate(contractDate),
    contract: parseText(getCell(row, columnMap.contract)),
    budget: parseText(getCell(row, columnMap.budget)),
    spec: parseText(getCell(row, columnMap.spec)),
    unit: parseText(getCell(row, columnMap.unit)),
    contractQty: parseNumber(getCell(row, columnMap.contractQty)),
    contractUnitPrice: parseNumber(getCell(row, columnMap.contractUnitPrice)),
    contractAmount: parseNumber(getCell(row, columnMap.contractAmount)),
    executionQty: parseNumber(getCell(row, columnMap.executionQty)),
    executionUnitPrice: parseNumber(getCell(row, columnMap.executionUnitPrice)),
    executionAmount: parseNumber(getCell(row, columnMap.executionAmount)),
    outsourcingQty,
    outsourcingUnitPrice: parseNumber(getCell(row, columnMap.outsourcingUnitPrice)),
    totalAmount,
    materialAmount,
    laborAmount,
    expenseAmount,
    materialUnitPrice: parseNumber(getCell(row, columnMap.materialUnitPrice)),
    laborUnitPrice: parseNumber(getCell(row, columnMap.laborUnitPrice)),
    expenseUnitPrice: parseNumber(getCell(row, columnMap.expenseUnitPrice)),
    materialQty: outsourcingQty || parseNumber(getCell(row, columnMap.materialQty)),
    laborQty: outsourcingQty || parseNumber(getCell(row, columnMap.laborQty)),
    expenseQty: outsourcingQty || parseNumber(getCell(row, columnMap.expenseQty)),
  };
}

export function parseOutsourcingRows(rows: unknown[][]): OutsourcingRecord[] {
  if (rows.length === 0) return [];

  const headerRow = rows.find((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  if (!headerRow) return [];

  const headers = headerRow.map((cell) => String(cell ?? '').trim());
  const columnMap = buildColumnMap(headers);
  const dataStartIndex = rows.indexOf(headerRow) + 1;

  if (columnMap.vendor == null && columnMap.vendorLabel == null) {
    throw new Error('CSV에 업체명(또는 업체표시) 열을 찾을 수 없습니다.');
  }

  const records: OutsourcingRecord[] = [];

  for (let i = dataStartIndex; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.every((cell) => String(cell ?? '').trim() === '')) continue;

    const vendor = parseText(getCell(row, columnMap.vendor));
    const vendorLabel = parseText(getCell(row, columnMap.vendorLabel)) || vendor;
    const outsourcingQty = parseNumber(getCell(row, columnMap.outsourcingQty));
    const materialAmount = parseNumber(getCell(row, columnMap.materialAmount));
    const laborAmount = parseNumber(getCell(row, columnMap.laborAmount));
    const expenseAmount = parseNumber(getCell(row, columnMap.expenseAmount));
    const totalAmount = parseNumber(getCell(row, columnMap.totalAmount));
    const hasAmount =
      totalAmount !== 0 || materialAmount !== 0 || laborAmount !== 0 || expenseAmount !== 0;

    if (!vendor && !vendorLabel && !hasAmount) continue;

    records.push(
      buildOutsourcingRecord(
        row,
        columnMap,
        vendor,
        vendorLabel,
        outsourcingQty,
        materialAmount,
        laborAmount,
        expenseAmount,
        totalAmount,
      ),
    );
  }

  return records;
}

export function parseOutsourcingCsv(text: string): OutsourcingRecord[] {
  const normalized = text.replace(/^\uFEFF/, '');
  return parseOutsourcingRows(parseCsv(normalized));
}

const ASYNC_PARSE_BATCH_SIZE = 800;

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

/** 대용량 CSV 파싱 시 UI 멈춤을 줄이기 위해 배치 단위로 처리합니다. */
export async function parseOutsourcingCsvAsync(text: string): Promise<OutsourcingRecord[]> {
  const normalized = text.replace(/^\uFEFF/, '');
  const rows = parseCsv(normalized);
  if (rows.length === 0) return [];

  const headerRow = rows.find((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  if (!headerRow) return [];

  const headers = headerRow.map((cell) => String(cell ?? '').trim());
  const columnMap = buildColumnMap(headers);
  const dataStartIndex = rows.indexOf(headerRow) + 1;

  if (columnMap.vendor == null && columnMap.vendorLabel == null) {
    throw new Error('CSV에 업체명(또는 업체표시) 열을 찾을 수 없습니다.');
  }

  const records: OutsourcingRecord[] = [];

  for (let i = dataStartIndex; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.every((cell) => String(cell ?? '').trim() === '')) continue;

    const vendor = parseText(getCell(row, columnMap.vendor));
    const vendorLabel = parseText(getCell(row, columnMap.vendorLabel)) || vendor;
    const outsourcingQty = parseNumber(getCell(row, columnMap.outsourcingQty));
    const materialAmount = parseNumber(getCell(row, columnMap.materialAmount));
    const laborAmount = parseNumber(getCell(row, columnMap.laborAmount));
    const expenseAmount = parseNumber(getCell(row, columnMap.expenseAmount));
    const totalAmount = parseNumber(getCell(row, columnMap.totalAmount));
    const hasAmount =
      totalAmount !== 0 || materialAmount !== 0 || laborAmount !== 0 || expenseAmount !== 0;

    if (!vendor && !vendorLabel && !hasAmount) continue;

    records.push(
      buildOutsourcingRecord(
        row,
        columnMap,
        vendor,
        vendorLabel,
        outsourcingQty,
        materialAmount,
        laborAmount,
        expenseAmount,
        totalAmount,
      ),
    );

    if ((i - dataStartIndex + 1) % ASYNC_PARSE_BATCH_SIZE === 0) {
      await yieldToMain();
    }
  }

  return records;
}
