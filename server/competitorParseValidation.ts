import type { CompetitorNormalizedFinancials } from '../src/types/competitorAnalysis';
import type { CompetitorStructuredCompany } from './competitorStructuredData';
import { buildStandardRecord } from './competitorStandardSchema';

export type ValidationTrust = 'ok' | 'review' | 'reparse';
export type ValidationSeverity = 'info' | 'warning' | 'risk';

export interface CompetitorValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  field?: string;
}

export interface CompetitorRecordValidation {
  companyKey: string;
  companyName: string;
  sourceFile: string | null;
  folderYear: number;
  trust: ValidationTrust;
  parseMethod: 'local' | 'claude';
  issues: CompetitorValidationIssue[];
}

export interface CompetitorFolderValidationReport {
  version: 1;
  updatedAt: string;
  folderYear: number;
  sector: string;
  summary: {
    total: number;
    ok: number;
    review: number;
    reparse: number;
    claudeReparsed: number;
  };
  records: CompetitorRecordValidation[];
}

const UNIT_ANOMALY_WON = 1_000_000_000_000;
const YOY_SPIKE_RATIO = 10;
const BALANCE_TOLERANCE = 0.08;

function safeNum(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

function millionFromWon(won: number | null | undefined): number | null {
  const n = safeNum(won);
  return n == null ? null : n / 1_000_000;
}

function resolveTrust(issues: CompetitorValidationIssue[]): ValidationTrust {
  if (issues.some((i) => i.severity === 'risk')) return 'reparse';
  if (issues.some((i) => i.severity === 'warning')) return 'review';
  return 'ok';
}

export function validateStructuredCompany(
  company: CompetitorStructuredCompany,
  folderYear: number,
  priorFinancials?: CompetitorNormalizedFinancials,
): CompetitorRecordValidation {
  const issues: CompetitorValidationIssue[] = [];
  const standard = buildStandardRecord({
    companyName: company.companyName,
    year: folderYear,
    metrics: company.metrics,
    financials: company.financials,
    sourceFile: company.source_file ?? company.sourceFiles[0],
    sourceType: company.source_type,
    documentType: company.documentType,
    metadata: company.metadata,
  });

  const f = standard.financials;
  const revenue = safeNum(f.revenue);
  const totalAssets = safeNum(f.total_assets);
  const totalLiabilities = safeNum(f.total_liabilities);
  const totalEquity = safeNum(f.total_equity);

  if (!company.companyName || company.companyName.includes('\n') || company.companyName.length < 2) {
    issues.push({
      code: 'company_name_invalid',
      severity: 'risk',
      message: '회사명 추출이 불완전합니다.',
      field: 'company_name',
    });
  }

  if (revenue == null || revenue <= 0) {
    issues.push({
      code: 'revenue_missing',
      severity: 'risk',
      message: '매출액이 추출되지 않았습니다.',
      field: 'revenue',
    });
  }

  if (revenue != null && revenue >= 1_000_000) {
    issues.push({
      code: 'unit_anomaly',
      severity: 'risk',
      message: `매출 ${revenue.toLocaleString('ko-KR')}백만원 — 단위(원/천원/백만원) 오인 가능성`,
      field: 'revenue',
    });
  }

  const revenueWon = company.financials.revenue;
  if (revenueWon != null && Math.abs(revenueWon) >= UNIT_ANOMALY_WON) {
    issues.push({
      code: 'unit_anomaly_won',
      severity: 'risk',
      message: '매출이 조 단위로 추정됩니다.',
      field: 'revenue',
    });
  }

  if (totalAssets != null && totalAssets < 0) {
    issues.push({
      code: 'negative_assets',
      severity: 'risk',
      message: '자산총계가 음수입니다.',
      field: 'total_assets',
    });
  }

  if (revenue != null && revenue < 0) {
    issues.push({
      code: 'negative_revenue',
      severity: 'risk',
      message: '매출액이 음수입니다.',
      field: 'revenue',
    });
  }

  if (totalAssets != null && totalLiabilities != null && totalEquity != null && totalAssets > 0) {
    const implied = totalLiabilities + totalEquity;
    const diffRatio = Math.abs(totalAssets - implied) / totalAssets;
    if (diffRatio > BALANCE_TOLERANCE) {
      issues.push({
        code: 'balance_mismatch',
        severity: 'warning',
        message: `자산(${totalAssets}) ≠ 부채+자본(${Math.round(implied)}) — ${Math.round(diffRatio * 100)}% 차이`,
      });
    }
  }

  const gross = safeNum(f.gross_profit);
  const cogs = safeNum(f.cogs);
  if (revenue != null && revenue > 0 && cogs != null && gross != null) {
    const expectedGross = revenue - cogs;
    if (Math.abs(expectedGross - gross) / revenue > 0.15) {
      issues.push({
        code: 'gross_profit_mismatch',
        severity: 'warning',
        message: '매출−매출원가 ≠ 매출총이익',
      });
    }
  }

  if (priorFinancials?.revenue && revenueWon) {
    const priorRev = millionFromWon(priorFinancials.revenue);
    const currentRev = revenue;
    if (priorRev != null && currentRev != null && priorRev > 0) {
      const ratio = currentRev / priorRev;
      if (ratio >= YOY_SPIKE_RATIO || ratio <= 1 / YOY_SPIKE_RATIO) {
        issues.push({
          code: 'yoy_spike',
          severity: 'warning',
          message: `전년 대비 매출 ${ratio >= 1 ? `${ratio.toFixed(1)}배 증가` : `${(1 / ratio).toFixed(1)}배 감소`}`,
          field: 'revenue',
        });
      }
    }
  }

  if (company.metrics.length === 0) {
    issues.push({
      code: 'no_metrics',
      severity: 'risk',
      message: '추출된 재무 지표가 없습니다.',
    });
  }

  for (const warning of company.warnings) {
    if (/추출하지 못했습니다/u.test(warning)) {
      issues.push({ code: 'parse_warning', severity: 'warning', message: warning });
    }
  }

  return {
    companyKey: company.companyKey,
    companyName: company.companyName,
    sourceFile: company.source_file ?? company.sourceFiles[0] ?? null,
    folderYear,
    trust: resolveTrust(issues),
    parseMethod: 'local',
    issues,
  };
}

export function buildValidationReport(
  folderYear: number,
  sector: string,
  records: CompetitorRecordValidation[],
): CompetitorFolderValidationReport {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    folderYear,
    sector,
    summary: {
      total: records.length,
      ok: records.filter((r) => r.trust === 'ok').length,
      review: records.filter((r) => r.trust === 'review').length,
      reparse: records.filter((r) => r.trust === 'reparse').length,
      claudeReparsed: records.filter((r) => r.parseMethod === 'claude').length,
    },
    records,
  };
}

export const VALIDATION_REPORT_FILE = '.validation-report.json';
