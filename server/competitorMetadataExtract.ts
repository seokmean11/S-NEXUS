import type { CompetitorDocumentType, CompetitorMetric } from '../src/types/competitorAnalysis';
import { getMetricNumber, getMetricString } from './competitorFinancialNormalize';
import { toSourceTypeLabel } from './competitorDocumentDedup';

export interface CompetitorDocumentMetadata {
  company_name?: string | null;
  ceo_name?: string | null;
  foundation_year?: number | null;
  employees?: number | null;
  employees_prior?: number | null;
  employees_change?: number | null;
  credit_rating?: string | null;
  source_type?: string | null;
  source_file?: string | null;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function parseYearFromDateToken(token: string): number | null {
  const match = token.match(/(19|20)\d{2}/u);
  if (!match) return null;
  const year = Number(match[0]);
  return year >= 1900 && year <= 2100 ? year : null;
}

export function extractCeoName(text: string): string | null {
  const patterns = [
    /대표(?:이사|자)\s*[:：]?\s*([가-힣A-Za-z0-9·,\s]{2,60})/u,
    /(?:회\s*장|사\s*장)\s*[:：]?\s*([가-힣A-Za-z0-9·,\s]{2,40})/u,
    /대표\s*[:：]?\s*([가-힣A-Za-z0-9·,\s]{2,40})/u,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const cleaned = normalizeWhitespace(
      match[1]
        .replace(/\(.*?\)/gu, '')
        .replace(/주소.*$/u, '')
        .replace(/사업자.*$/u, ''),
    );
    if (cleaned.length >= 2 && !/신용|보고서|법률/u.test(cleaned)) {
      return cleaned;
    }
  }
  return null;
}

export function extractFoundationYear(text: string): number | null {
  const patterns = [
    /설립(?:일|연도|년월일|일자)?\s*[:：]?\s*((?:19|20)\d{2})(?:년|\s|\.|\/|-)/u,
    /((?:19|20)\d{2})년\s*\d{1,2}월\s*\d{1,2}일\s*설립/u,
    /설립\s*((?:19|20)\d{2})/u,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const year = match?.[1] ? Number(match[1]) : parseYearFromDateToken(match?.[0] ?? '');
    if (year != null && year >= 1900 && year <= 2100) return year;
  }
  return null;
}

export function extractEmployeesFromMetrics(metrics: CompetitorMetric[]): {
  employees: number | null;
  employees_prior: number | null;
  employees_change: number | null;
} {
  const employeesRaw = getMetricNumber(metrics, 'employees');
  const priorRaw = getMetricNumber(metrics, 'employeesPrior');

  const employees =
    employeesRaw != null && employeesRaw > 0 && employeesRaw < 1_000_000
      ? Math.round(employeesRaw)
      : null;
  const employees_prior =
    priorRaw != null && priorRaw > 0 && priorRaw < 1_000_000 ? Math.round(priorRaw) : null;
  const employees_change =
    employees != null && employees_prior != null ? employees - employees_prior : null;

  return { employees, employees_prior, employees_change };
}

export function extractCreditRatingFromMetrics(metrics: CompetitorMetric[]): string | null {
  return getMetricString(metrics, 'creditRating') ?? null;
}

export function extractCompetitorMetadata(input: {
  text?: string;
  fileName?: string;
  companyName?: string;
  documentType?: CompetitorDocumentType;
  metrics?: CompetitorMetric[];
}): CompetitorDocumentMetadata {
  const text = input.text ?? '';
  const metrics = input.metrics ?? [];
  const { employees, employees_prior, employees_change } = extractEmployeesFromMetrics(metrics);

  return {
    company_name: input.companyName ?? null,
    ceo_name: text ? extractCeoName(text) : null,
    foundation_year: text ? extractFoundationYear(text) : null,
    employees,
    employees_prior,
    employees_change,
    credit_rating: extractCreditRatingFromMetrics(metrics),
    source_type: input.documentType
      ? toSourceTypeLabel(input.documentType, input.fileName)
      : null,
    source_file: input.fileName ?? null,
  };
}
