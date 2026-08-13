import type { CompetitorAnalysisSummary, CompetitorParsedDocument } from '@/types/competitorAnalysis';
import {
  formatCompetitorDisplayCompanyName,
  getCompetitorMetricNumber,
  isCompetitorFinancialSourceDocument,
  normalizeCompetitorCompanyKey,
  resolveCompetitorDocumentCompanyKey,
} from '@/utils/competitorCompanyName';
import { resolveCanonicalCompanyKey } from '@/utils/competitorCompanyAliases';

export interface CompetitorRevenueOperatingChartItem {
  rank: number;
  companyName: string;
  revenue: number;
  operatingIncome: number;
}

export const COMPETITOR_REVENUE_CHART_LIMIT = 10;
const MIN_CHART_REVENUE = 1_000_000;

function isChartRevenueValue(revenue: number): boolean {
  return Number.isFinite(revenue) && revenue >= MIN_CHART_REVENUE;
}

function extractFinancialsForSelectedYear(
  doc: CompetitorParsedDocument,
  selectedYear: number,
): { revenue: number | null; operatingIncome: number | null; matched: boolean } {
  const fiscalYear = doc.fiscalYear;

  if (fiscalYear === selectedYear) {
    return {
      revenue: getCompetitorMetricNumber(doc.metrics, 'revenue'),
      operatingIncome: getCompetitorMetricNumber(doc.metrics, 'operatingIncome'),
      matched: true,
    };
  }

  if (fiscalYear === selectedYear + 1) {
    return {
      revenue: getCompetitorMetricNumber(doc.metrics, 'revenuePrior'),
      operatingIncome: getCompetitorMetricNumber(doc.metrics, 'operatingIncomePrior'),
      matched: true,
    };
  }

  return { revenue: null, operatingIncome: null, matched: false };
}

function extractAnyAvailableFinancials(
  doc: CompetitorParsedDocument,
): { revenue: number; operatingIncome: number | null } | null {
  if (!isCompetitorFinancialSourceDocument(doc)) return null;

  const revenue =
    getCompetitorMetricNumber(doc.metrics, 'revenue') ??
    getCompetitorMetricNumber(doc.metrics, 'revenuePrior');
  if (!isChartRevenueValue(revenue ?? NaN)) return null;

  return {
    revenue: revenue!,
    operatingIncome:
      getCompetitorMetricNumber(doc.metrics, 'operatingIncome') ??
      getCompetitorMetricNumber(doc.metrics, 'operatingIncomePrior'),
  };
}

function resolveDocumentFinancials(
  doc: CompetitorParsedDocument,
  selectedYear: number,
): { revenue: number; operatingIncome: number | null } | null {
  const matched = extractFinancialsForSelectedYear(doc, selectedYear);
  if (matched.matched && matched.revenue != null && isChartRevenueValue(matched.revenue)) {
    return {
      revenue: matched.revenue,
      operatingIncome: matched.operatingIncome,
    };
  }

  return extractAnyAvailableFinancials(doc);
}

function resolveCompanyFinancialsFromMetrics(
  companyMetrics: CompetitorParsedDocument['metrics'],
): { revenue: number | null; operatingIncome: number | null } {
  const revenue =
    getCompetitorMetricNumber(companyMetrics, 'revenue') ??
    getCompetitorMetricNumber(companyMetrics, 'revenuePrior');
  const operatingIncome =
    getCompetitorMetricNumber(companyMetrics, 'operatingIncome') ??
    getCompetitorMetricNumber(companyMetrics, 'operatingIncomePrior');

  return { revenue, operatingIncome };
}

export function buildTopRevenueOperatingChartData(
  analysis: CompetitorAnalysisSummary | null,
  limit = COMPETITOR_REVENUE_CHART_LIMIT,
): CompetitorRevenueOperatingChartItem[] {
  if (!analysis) return [];

  const selectedYear = analysis.year;
  const byCompany = new Map<
    string,
    { companyName: string; revenue: number; operatingIncome: number | null }
  >();

  for (const doc of analysis.documents) {
    if (!isCompetitorFinancialSourceDocument(doc)) continue;

    const companyKeyRaw = resolveCompetitorDocumentCompanyKey(doc);
    const companyKey = resolveCanonicalCompanyKey(
      normalizeCompetitorCompanyKey(companyKeyRaw),
      analysis.sector,
    );
    const companyName = formatCompetitorDisplayCompanyName(
      companyKeyRaw,
      doc.fileName,
      analysis.sector,
    );
    const financials = resolveDocumentFinancials(doc, selectedYear);
    if (!financials) continue;

    const existing = byCompany.get(companyKey);
    if (!existing || financials.revenue > existing.revenue) {
      byCompany.set(companyKey, {
        companyName,
        revenue: financials.revenue,
        operatingIncome: financials.operatingIncome,
      });
    }
  }

  for (const company of analysis.companies) {
    const companyKey = resolveCanonicalCompanyKey(
      normalizeCompetitorCompanyKey(company.companyName),
      analysis.sector,
    );
    if (byCompany.has(companyKey)) continue;
    if (!company.documentTypes.some((type) => type === 'audit-report' || type === 'financial-sheet' || type === 'credit-rating')) {
      continue;
    }

    const financials = (company as { financials?: { revenue?: number; operatingIncome?: number } }).financials;
    if (financials?.revenue != null && isChartRevenueValue(financials.revenue)) {
      byCompany.set(companyKey, {
        companyName: formatCompetitorDisplayCompanyName(
          company.companyName,
          company.sourceFile,
          analysis.sector,
        ),
        revenue: financials.revenue,
        operatingIncome: financials.operatingIncome ?? null,
      });
      continue;
    }

    const { revenue, operatingIncome } = resolveCompanyFinancialsFromMetrics(company.metrics);
    if (revenue == null || !isChartRevenueValue(revenue)) continue;

    byCompany.set(companyKey, {
      companyName: formatCompetitorDisplayCompanyName(
        company.companyName,
        company.sourceFile,
        analysis.sector,
      ),
      revenue,
      operatingIncome,
    });
  }

  return [...byCompany.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map((row, index) => ({
      companyName: row.companyName,
      revenue: row.revenue,
      operatingIncome: row.operatingIncome ?? 0,
      rank: index + 1,
    }));
}

export function formatCompetitorFinancialAmount(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 100_000_000) {
    return `${sign}${(abs / 100_000_000).toFixed(1)}억원`;
  }
  if (abs >= 10_000) {
    return `${sign}${(abs / 10_000).toFixed(0)}만원`;
  }
  return `${sign}${abs.toLocaleString('ko-KR')}원`;
}
