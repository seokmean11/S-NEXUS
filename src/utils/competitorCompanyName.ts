import type { CompetitorMetric, CompetitorParsedDocument, CompetitorSector } from '../types/competitorAnalysis';
import {
  applyCompetitorCompanyAlias,
  resolveCanonicalCompanyKey,
  resolveCanonicalCompanyName,
} from './competitorCompanyAliases';
export function isBoilerplateCompetitorCompanyName(name: string): boolean {
  return /신용정보|보호에\s*관한|법률|report\s*no|이용\s*및/i.test(name);
}

export function inferCompetitorCompanyNameFromFileName(fileName: string): string | undefined {
  const numbered = fileName.match(/^\d+\.\((?:주|유|㈜)\)([^_]+?)_/u);
  if (numbered?.[1]) {
    return numbered[1].trim();
  }

  const numberedPlain = fileName.match(/^\d+\.([^_]+?)_/u);
  if (numberedPlain?.[1] && !/신용분석/u.test(numberedPlain[1])) {
    return stripCompetitorNameNoise(
      numberedPlain[1].replace(/\(?(?:주|유|㈜)\)?/gu, '').trim(),
    );
  }

  const bracketMatch = fileName.match(/\[([^\]]+)\]/u);
  if (bracketMatch?.[1]) {
    return bracketMatch[1]
      .replace(/감사보고서.*$/u, '')
      .replace(/\(\d{4}[^)]*\)/g, '')
      .trim();
  }

  const stockMatch = fileName.match(/\(?(?:주|유|㈜)\)?([^().]+?)(?:\(|\[|\.|$)/u);
  if (stockMatch?.[1]) {
    return stockMatch[1].trim();
  }

  const baseName = fileName.replace(/\.[^.]+$/, '');
  const stripped = baseName
    .replace(/^\[[^\]]+\]/, '')
    .replace(/[_-]?(감사보고서|신용평가서|신용평가|평가서|\(\d{4}[^)]*\)|\d{4})/g, '')
    .trim();
  return stripped.length >= 2 ? stripped : undefined;
}

export function resolveCompetitorDocumentCompanyKey(doc: CompetitorParsedDocument): string {
  return (
    inferCompetitorCompanyNameFromFileName(doc.fileName) ??
    (doc.companyName && !isBoilerplateCompetitorCompanyName(doc.companyName)
      ? doc.companyName
      : undefined) ??
    doc.fileName.replace(/\.[^.]+$/, '')
  );
}

export function normalizeCompetitorCompanyKey(name: string): string {
  return cleanCompetitorDisplayName(name);
}

export function normalizeCompetitorBizNo(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

/** 동일 업체 판별 — 사업자번호 > 원본파일명 > 정제 회사명 > 사명변경 별칭 */
export function resolveCompetitorRecordGroupKey(
  record: {
    company_name: string;
    biz_no?: string | null;
    metadata?: { source_file?: string | null };
  },
  sector?: CompetitorSector | string | null,
): string {
  const bizNo = normalizeCompetitorBizNo(record.biz_no);
  if (bizNo) return `biz:${bizNo}`;

  const sourceFile = record.metadata?.source_file;
  if (sourceFile) {
    const fromFile = inferCompetitorCompanyNameFromFileName(sourceFile);
    if (fromFile) {
      const cleaned = cleanCompetitorDisplayName(fromFile);
      if (cleaned.length >= 2) {
        return resolveCanonicalCompanyKey(normalizeCompetitorCompanyKey(cleaned), sector);
      }
    }
  }

  const normalized = normalizeCompetitorCompanyKey(
    formatCompetitorDisplayCompanyName(record.company_name, sourceFile, sector),
  );
  return resolveCanonicalCompanyKey(normalized, sector);
}

const CORPORATE_LABEL_PATTERN =
  /(?:주식회사|식회사|유한회사|유한공사|\(주\)|\(유\)|㈜|（주）|（유）|\(株\))/gu;

/** Drive 파일명 접두(7.)·신용등급(CR2) 등 표시 잡음 제거 */
export function stripCompetitorNameNoise(name: string): string {
  return name
    .replace(/^\d+\./, '')
    .replace(/\((?:CR|cr)\d+[+-]?[^)]*\)/g, '')
    .trim();
}

/** 대표자·사업자번호·법인 표기 등 PDF 추출 잡음 제거 */
export function cleanCompetitorDisplayName(raw: string): string {
  let name = stripCompetitorNameNoise(raw.replace(/\n+/g, ' ').trim());
  name = name.replace(CORPORATE_LABEL_PATTERN, ' ').trim();
  name = name.replace(/\s*대\s*표\s*(?:자|이\s*사)?\s*.*$/u, '').trim();
  name = name.replace(/\s*사업자\s*번호\s*[\d*-]*.*$/u, '').trim();
  name = name.replace(/\s*외\s*\d+\s*명.*$/u, '').trim();
  name = name.replace(/\s+/g, '');
  return name;
}

function isGarbledCompetitorDisplayName(name: string): boolean {
  return /대\s*표|사업자\s*번호|외\s*\d+\s*명/u.test(name) || name.replace(/\s/g, '').length > 18;
}

/** 대시보드 표시용 회사명 */
export function formatCompetitorDisplayCompanyName(
  name: string,
  sourceFile?: string | null,
  sector?: CompetitorSector | string | null,
): string {
  const cleaned = cleanCompetitorDisplayName(name);
  if (cleaned.length >= 2 && !isGarbledCompetitorDisplayName(cleaned)) {
    return resolveCanonicalCompanyName(cleaned, sector);
  }

  if (sourceFile) {
    const fromFile = inferCompetitorCompanyNameFromFileName(sourceFile);
    if (fromFile) {
      const fileCleaned = cleanCompetitorDisplayName(fromFile);
      if (fileCleaned.length >= 2) {
        return resolveCanonicalCompanyName(fileCleaned, sector);
      }
    }
  }

  if (cleaned.length >= 2) {
    return resolveCanonicalCompanyName(cleaned, sector);
  }

  const aliased = applyCompetitorCompanyAlias(name, sector);
  return aliased.displayName.length >= 2 ? aliased.displayName : name.trim();
}

export function isCompetitorFinancialSourceDocument(doc: CompetitorParsedDocument): boolean {
  if (doc.documentType === 'audit-report' || doc.documentType === 'financial-sheet') return true;
  if (doc.documentType !== 'credit-rating') return false;
  const revenue = getCompetitorMetricNumber(doc.metrics, 'revenue');
  const revenuePrior = getCompetitorMetricNumber(doc.metrics, 'revenuePrior');
  return (revenue != null && revenue >= 1_000_000) || (revenuePrior != null && revenuePrior >= 1_000_000);
}

export function getCompetitorMetricNumber(
  metrics: CompetitorMetric[],
  key: string,
): number | null {
  const metric = metrics.find((item) => item.key === key);
  if (metric?.value == null || metric.value === '') return null;
  if (typeof metric.value === 'number') return metric.value;
  const parsed = Number(String(metric.value).replace(/[,，]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}
