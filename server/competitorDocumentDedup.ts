import type { CompetitorDocumentType, CompetitorParsedDocument } from '../src/types/competitorAnalysis';

export type SourceTypeLabel =
  | '감사보고서'
  | '사업보고서'
  | '신용평가서'
  | '신용분석보고서'
  | '재무자료'
  | '미분류';

export interface DocumentSelectionMeta {
  companyKey: string;
  companyName: string;
  fiscalYear: number;
  documentType: CompetitorDocumentType;
  sourceFile: string;
  parsedAt: string;
}

/** 문서 유형 우선순위: 감사보고서(100) > 사업보고서(80) > 신용분석(50) > 재무자료(30) */
export function documentTypePriority(documentType: CompetitorDocumentType): number {
  switch (documentType) {
    case 'audit-report':
      return 100;
    case 'business-report':
      return 80;
    case 'credit-rating':
      return 50;
    case 'financial-sheet':
      return 30;
    default:
      return 0;
  }
}

export function toSourceTypeLabel(
  documentType: CompetitorDocumentType,
  fileName?: string,
): SourceTypeLabel {
  if (documentType === 'credit-rating' && fileName) {
    if (/신용분석/u.test(fileName)) return '신용분석보고서';
    if (/신용평가/u.test(fileName)) return '신용평가서';
  }

  switch (documentType) {
    case 'audit-report':
      return '감사보고서';
    case 'business-report':
      return '사업보고서';
    case 'credit-rating':
      return '신용분석보고서';
    case 'financial-sheet':
      return '재무자료';
    default:
      return '미분류';
  }
}

export function resolveDocumentFiscalYear(
  fiscalYear: number | undefined,
  folderYear: number,
): number {
  if (typeof fiscalYear === 'number' && Number.isFinite(fiscalYear)) {
    return fiscalYear;
  }
  return folderYear;
}

export function buildCompanyFiscalDedupKey(companyKey: string, fiscalYear: number): string {
  return `${companyKey}:${fiscalYear}`;
}

export function shouldReplaceDocument(
  existing: Pick<DocumentSelectionMeta, 'documentType' | 'parsedAt'>,
  incoming: Pick<DocumentSelectionMeta, 'documentType' | 'parsedAt'>,
): boolean {
  const existingPriority = documentTypePriority(existing.documentType);
  const incomingPriority = documentTypePriority(incoming.documentType);

  if (incomingPriority > existingPriority) return true;
  if (incomingPriority < existingPriority) return false;

  const existingTime = Date.parse(existing.parsedAt);
  const incomingTime = Date.parse(incoming.parsedAt);
  if (Number.isFinite(existingTime) && Number.isFinite(incomingTime)) {
    return incomingTime >= existingTime;
  }
  return incoming.parsedAt >= existing.parsedAt;
}

export function documentToSelectionMeta(
  doc: CompetitorParsedDocument,
  companyKey: string,
  folderYear: number,
): DocumentSelectionMeta {
  const fiscalYear = resolveDocumentFiscalYear(doc.fiscalYear, folderYear);
  return {
    companyKey,
    companyName: doc.companyName ?? companyKey,
    fiscalYear,
    documentType: doc.documentType,
    sourceFile: doc.fileName,
    parsedAt: doc.parsedAt,
  };
}

export function pickPrimaryDocument(metas: DocumentSelectionMeta[]): DocumentSelectionMeta | null {
  if (metas.length === 0) return null;

  return metas.reduce((best, current) => {
    const bestPriority = documentTypePriority(best.documentType);
    const currentPriority = documentTypePriority(current.documentType);
    if (currentPriority > bestPriority) return current;
    if (currentPriority < bestPriority) return best;

    const bestTime = Date.parse(best.parsedAt);
    const currentTime = Date.parse(current.parsedAt);
    if (Number.isFinite(bestTime) && Number.isFinite(currentTime) && currentTime > bestTime) {
      return current;
    }
    return best.parsedAt >= current.parsedAt ? best : current;
  });
}

export function parseDocumentType(value: string | undefined): CompetitorDocumentType {
  if (value === 'audit-report') return 'audit-report';
  if (value === 'business-report') return 'business-report';
  if (value === 'credit-rating') return 'credit-rating';
  if (value === 'financial-sheet') return 'financial-sheet';
  return 'unknown';
}
