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

/**
 * 폴더 내 다중 파일 사명 중복 시 우선순위
 * 신용평가서 > 신용분석보고서(SCI 등) > 감사보고서 > 사업보고서 > 재무자료
 */
export function documentTypePriority(
  documentType: CompetitorDocumentType,
  fileName?: string,
): number {
  const label = toSourceTypeLabel(documentType, fileName);
  return sourceTypePriority(label);
}

export function sourceTypePriority(label: SourceTypeLabel): number {
  switch (label) {
    case '신용평가서':
      return 100;
    case '신용분석보고서':
      return 90;
    case '감사보고서':
      return 70;
    case '사업보고서':
      return 60;
    case '재무자료':
      return 40;
    default:
      return 0;
  }
}

export function toSourceTypeLabel(
  documentType: CompetitorDocumentType,
  fileName?: string,
): SourceTypeLabel {
  if (fileName) {
    // 파일명에 명시된 "신용평가서"만 최우선 라벨 (SCI·민간기업신용평가 등은 신용분석)
    if (/신용평가서/u.test(fileName)) return '신용평가서';
    if (
      /신용평가/u.test(fileName) &&
      !/신용분석|SCI|평가정보|민간\s*기업신용|기업신용평가/u.test(fileName)
    ) {
      return '신용평가서';
    }
    if (/신용분석|기업신용평가|민간\s*기업신용|SCI|NICE|이크레더블|한국기업평가/u.test(fileName)) {
      return '신용분석보고서';
    }
    if (/감사보고서/u.test(fileName)) return '감사보고서';
    if (/사업보고서/u.test(fileName)) return '사업보고서';
  }

  if (documentType === 'credit-rating') {
    if (fileName && /신용평가서/u.test(fileName)) return '신용평가서';
    if (
      fileName &&
      /신용평가/u.test(fileName) &&
      !/신용분석|SCI|평가정보|민간\s*기업신용|기업신용평가/u.test(fileName)
    ) {
      return '신용평가서';
    }
    return '신용분석보고서';
  }

  switch (documentType) {
    case 'audit-report':
      return '감사보고서';
    case 'business-report':
      return '사업보고서';
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
  existing: Pick<DocumentSelectionMeta, 'documentType' | 'parsedAt'> & { sourceFile?: string },
  incoming: Pick<DocumentSelectionMeta, 'documentType' | 'parsedAt'> & { sourceFile?: string },
): boolean {
  const existingPriority = documentTypePriority(existing.documentType, existing.sourceFile);
  const incomingPriority = documentTypePriority(incoming.documentType, incoming.sourceFile);

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
    if (
      shouldReplaceDocument(
        { documentType: best.documentType, parsedAt: best.parsedAt, sourceFile: best.sourceFile },
        {
          documentType: current.documentType,
          parsedAt: current.parsedAt,
          sourceFile: current.sourceFile,
        },
      )
    ) {
      return current;
    }
    return best;
  });
}

export function parseDocumentType(value: string | undefined): CompetitorDocumentType {
  if (value === 'audit-report') return 'audit-report';
  if (value === 'business-report') return 'business-report';
  if (value === 'credit-rating') return 'credit-rating';
  if (value === 'financial-sheet') return 'financial-sheet';
  return 'unknown';
}
