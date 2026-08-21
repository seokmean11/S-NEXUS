import type {
  CompetitorAnalysisSummary,
  CompetitorParsedDocument,
  CompetitorSector,
} from '../src/types/competitorAnalysis';
import { resolveCanonicalCompanyKey, resolveCanonicalCompanyName } from '../src/utils/competitorCompanyAliases';
import { cleanCompanyLabel, extractCompanyNameFromFileName, normalizeCompanyKey } from './competitorDocumentIdentity';
import {
  documentTypePriority,
  shouldReplaceDocument,
} from './competitorDocumentDedup';
import type { CompetitorStructuredCompany, CompetitorStructuredData } from './competitorStructuredData';

const CORE_FINANCIAL_KEYS: Array<keyof CompetitorNormalizedFinancials> = [
  'revenue',
  'costOfGoodsSold',
  'grossProfit',
  'sga',
  'operatingIncome',
  'netIncome',
  'totalAssets',
  'totalLiabilities',
  'equity',
];

function countPopulatedFinancialFields(financials: CompetitorNormalizedFinancials): number {
  return CORE_FINANCIAL_KEYS.filter((key) => {
    const value = financials[key];
    return typeof value === 'number' && Number.isFinite(value) && value !== 0;
  }).length;
}

/** 추출 품질 점수 — 높을수록 대시보드 표현에 적합 */
export function scoreStructuredCompanyQuality(company: CompetitorStructuredCompany): number {
  const financials = company.financials;
  let score = 0;

  const fieldCount = countPopulatedFinancialFields(financials);
  score += fieldCount * 12;

  if (financials.revenue != null && financials.revenue > 0) score += 30;
  if (financials.operatingIncome != null) score += 18;
  if (financials.netIncome != null) score += 12;
  if (financials.totalAssets != null && financials.totalAssets > 0) score += 20;
  if (financials.costOfGoodsSold != null) score += 10;
  if (financials.grossProfit != null) score += 8;

  score += Math.min(company.metrics.length, 12);

  if (company.metadata?.ceo_name) score += 3;
  if (company.metadata?.biz_no) score += 2;
  if (company.metadata?.credit_rating) score += 2;

  if (company.warnings.some((warning) => /추출하지 못했습니다/u.test(warning))) score -= 25;
  if (financials.revenue != null && financials.revenue < 0) score -= 20;
  if (/대\s*표|사업자\s*번호|\n/u.test(company.companyName)) score -= 8;

  return score;
}

export function normalizeSummaryBizNo(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

export function resolveSummaryCompanyGroupKey(
  company: CompetitorStructuredCompany,
  sector?: CompetitorSector,
): string {
  const bizNo = normalizeSummaryBizNo(company.metadata?.biz_no);
  if (bizNo) return `biz:${bizNo}`;

  const sourceFile = company.source_file ?? company.sourceFiles[0];
  const fromFile = sourceFile ? extractCompanyNameFromFileName(sourceFile) : null;
  const fromName = cleanCompanyLabel(company.companyName);
  const label = fromFile ?? fromName ?? company.companyKey;
  const baseKey = normalizeCompanyKey(label);
  return resolveCanonicalCompanyKey(baseKey, sector);
}

function resolveSummaryDisplayCompanyName(
  company: CompetitorStructuredCompany,
  sector?: CompetitorSector,
): string {
  const sourceFile = company.source_file ?? company.sourceFiles[0];
  const fromFile = sourceFile ? extractCompanyNameFromFileName(sourceFile) : null;
  const fromName = cleanCompanyLabel(company.companyName);
  const label = fromFile ?? fromName ?? cleanCompanyLabel(company.companyKey) ?? company.companyName;
  return resolveCanonicalCompanyName(normalizeCompanyKey(label), sector);
}

function pickBestStructuredCompany(candidates: CompetitorStructuredCompany[]): CompetitorStructuredCompany {
  return candidates.reduce((best, candidate) => {
    // 사명 중복 시 신용평가서(및 신용분석) 우선 — 품질 점수는 동순위일 때만
    if (
      shouldReplaceDocument(
        {
          documentType: best.documentType,
          parsedAt: best.parsedAt,
          sourceFile: best.source_file ?? best.sourceFiles[0],
        },
        {
          documentType: candidate.documentType,
          parsedAt: candidate.parsedAt,
          sourceFile: candidate.source_file ?? candidate.sourceFiles[0],
        },
      )
    ) {
      return candidate;
    }

    const bestPriority = documentTypePriority(
      best.documentType,
      best.source_file ?? best.sourceFiles[0],
    );
    const candidatePriority = documentTypePriority(
      candidate.documentType,
      candidate.source_file ?? candidate.sourceFiles[0],
    );
    if (candidatePriority !== bestPriority) return best;

    const bestScore = scoreStructuredCompanyQuality(best);
    const candidateScore = scoreStructuredCompanyQuality(candidate);
    return candidateScore > bestScore ? candidate : best;
  });
}

function resolveSummaryCompanyRevenue(company: CompetitorStructuredCompany): number {
  const revenue = company.financials?.revenue;
  if (typeof revenue === 'number' && Number.isFinite(revenue) && revenue > 0) {
    return revenue;
  }

  const metric = company.metrics.find((item) => item.key === 'revenue');
  if (metric?.value != null && metric.value !== '') {
    const parsed =
      typeof metric.value === 'number'
        ? metric.value
        : Number(String(metric.value).replace(/[,，]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return 0;
}

export function dedupeStructuredCompaniesForSummary(
  companies: CompetitorStructuredCompany[],
  sector?: CompetitorSector,
): CompetitorStructuredCompany[] {
  const groups = new Map<string, CompetitorStructuredCompany[]>();

  for (const company of companies) {
    const key = resolveSummaryCompanyGroupKey(company, sector);
    const bucket = groups.get(key) ?? [];
    bucket.push(company);
    groups.set(key, bucket);
  }

  return [...groups.values()]
    .map((group) => {
      const best = pickBestStructuredCompany(group);
      const canonicalKey = resolveSummaryCompanyGroupKey(best, sector);
      const canonicalName = resolveSummaryDisplayCompanyName(best, sector);
      return {
        ...best,
        companyKey: canonicalKey,
        companyName: canonicalName,
      };
    })
    .sort((a, b) => resolveSummaryCompanyRevenue(b) - resolveSummaryCompanyRevenue(a));
}

export function dedupeDocumentsForSummary(
  documents: CompetitorParsedDocument[],
  selectedCompanies: CompetitorStructuredCompany[],
): CompetitorParsedDocument[] {
  const selectedFiles = new Set(
    selectedCompanies.flatMap((company) => company.sourceFiles ?? [company.source_file].filter(Boolean)),
  );

  return documents.filter((doc) => selectedFiles.has(doc.fileName));
}

export function buildDedupedSummaryAnalysis(
  data: CompetitorStructuredData,
  options: {
    configured: boolean;
    driveConnected: boolean;
    uploadConfigured: boolean;
    folderPath: string;
    syncedAt?: string;
    dataSource?: 'structured-json' | 'pdf-parse';
  },
): CompetitorAnalysisSummary {
  const selectedCompanies = dedupeStructuredCompaniesForSummary(data.companies, data.sector as CompetitorSector);
  const selectedDocuments = dedupeDocumentsForSummary(data.documents, selectedCompanies);

  return {
    year: data.year,
    sector: data.sector as CompetitorSector,
    configured: options.configured,
    driveConnected: options.driveConnected,
    uploadConfigured: options.uploadConfigured,
    folderPath: options.folderPath,
    syncedAt: options.syncedAt,
    dataSource: options.dataSource ?? 'structured-json',
    fileCount: selectedDocuments.length,
    documents: selectedDocuments,
    companies: selectedCompanies.map((company) => ({
      companyName: company.companyName,
      fileCount: 1,
      documentTypes: [company.documentType],
      metrics: company.metrics,
      financials: company.financials,
      sourceFile: company.source_file ?? company.sourceFiles[0],
    })),
  };
}
