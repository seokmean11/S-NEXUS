import type { OutsourcingRecord } from '@/types/outsourcing';

export type OutsourcingDetailColumnKey = keyof OutsourcingRecord;

export interface OutsourcingDetailColumn {
  key: OutsourcingDetailColumnKey;
  label: string;
  kind: 'text' | 'number' | 'currency';
  minWidth?: number;
}

/** AppSheet 검색결과(상세) 컬럼 순서 */
export const OUTSOURCING_DETAIL_COLUMNS: OutsourcingDetailColumn[] = [
  { key: 'contractDate', label: '외주계약일', kind: 'text', minWidth: 110 },
  { key: 'project', label: '프로젝트명', kind: 'text', minWidth: 220 },
  { key: 'contract', label: '외주계약명', kind: 'text', minWidth: 140 },
  { key: 'vendor', label: '업체명', kind: 'text', minWidth: 140 },
  { key: 'budget', label: '실행예산명', kind: 'text', minWidth: 140 },
  { key: 'spec', label: '규격내역', kind: 'text', minWidth: 180 },
  { key: 'unit', label: '단위', kind: 'text', minWidth: 70 },
  { key: 'contractQty', label: '계약수량', kind: 'number', minWidth: 90 },
  { key: 'contractUnitPrice', label: '계약단가', kind: 'currency', minWidth: 110 },
  { key: 'contractAmount', label: '계약금액', kind: 'currency', minWidth: 120 },
  { key: 'executionQty', label: '실행수량', kind: 'number', minWidth: 90 },
  { key: 'executionUnitPrice', label: '실행단가', kind: 'currency', minWidth: 110 },
  { key: 'executionAmount', label: '실행금액', kind: 'currency', minWidth: 120 },
  { key: 'outsourcingQty', label: '외주수량', kind: 'number', minWidth: 90 },
  { key: 'outsourcingUnitPrice', label: '외주단가', kind: 'currency', minWidth: 110 },
  { key: 'totalAmount', label: '외주금액', kind: 'currency', minWidth: 120 },
  { key: 'laborUnitPrice', label: '외주노무단가', kind: 'currency', minWidth: 120 },
  { key: 'laborAmount', label: '외주노무금액', kind: 'currency', minWidth: 120 },
  { key: 'materialUnitPrice', label: '외주자재단가', kind: 'currency', minWidth: 120 },
  { key: 'materialAmount', label: '외주자재금액', kind: 'currency', minWidth: 120 },
  { key: 'expenseUnitPrice', label: '외주경비단가', kind: 'currency', minWidth: 120 },
  { key: 'expenseAmount', label: '외주경비금액', kind: 'currency', minWidth: 120 },
  { key: 'division', label: '사업부(실)', kind: 'text', minWidth: 120 },
];

export function formatOutsourcingDetailValue(
  record: OutsourcingRecord,
  column: OutsourcingDetailColumn,
): string {
  const value = record[column.key];

  if (column.kind === 'text') {
    return value ? String(value) : '';
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
    return value === 0 && column.kind === 'number' ? '0' : '';
  }

  if (column.kind === 'number') {
    return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  }

  return Math.round(value).toLocaleString('ko-KR');
}

export function buildOutsourcingDetailExportTable(records: OutsourcingRecord[]) {
  return {
    headers: OUTSOURCING_DETAIL_COLUMNS.map((column) => column.label),
    rows: records.map((record) =>
      OUTSOURCING_DETAIL_COLUMNS.map((column) => {
        const raw = record[column.key];
        if (typeof raw === 'number') return String(raw);
        return raw ?? '';
      }),
    ),
  };
}
