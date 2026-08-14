import { isKoreanCreditRatingText } from './competitorCreditRatingParser';

function parseEmployeeCount(raw: string): number | null {
  const value = Number(raw.replace(/[,，]/g, ''));
  if (!Number.isFinite(value) || value <= 0 || value >= 1_000_000) return null;
  return Math.round(value);
}

function inferEmployeeReferenceYear(text: string, folderYear: number): number {
  const closingDates = [...text.matchAll(/20(\d{2})-12-31/gu)].map((match) => Number(`20${match[1]}`));
  if (closingDates.length > 0) return Math.max(...closingDates);

  const koreanClosing = text.match(/(\d{4})년\s*12월\s*31일/u);
  if (koreanClosing?.[1]) {
    const year = Number(koreanClosing[1]);
    if (year >= 1900 && year <= 2100) return year;
  }

  return folderYear;
}

function parseEmployeesFromStatusTable(text: string): {
  employees: number | null;
  employees_prior: number | null;
  referenceYear: number | null;
} {
  const sectionIdx = text.indexOf('종업원현황');
  if (sectionIdx < 0) {
    return { employees: null, employees_prior: null, referenceYear: null };
  }

  const rawSection = text.slice(sectionIdx, sectionIdx + 1200);
  const sectionEnd = rawSection.search(/\n--\s*\d+\s+of|\n3\.\s*재무정보|\n\d+\.\s*재무정보/u);
  const section = sectionEnd > 0 ? rawSection.slice(0, sectionEnd) : rawSection.slice(0, 500);
  const rows: { date: string; total: number }[] = [];

  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ \t]+((?:\d+[ \t]+)*\d+)/u);
    if (!match) continue;

    const numbers = match[2]
      .trim()
      .split(/[ \t]+/)
      .map((raw) => Number(raw.replace(/[,，]/g, '')))
      .filter((value) => Number.isFinite(value));
    if (numbers.length === 0) continue;

    const total = parseEmployeeCount(String(numbers[numbers.length - 1]));
    if (total == null) continue;
    rows.push({ date: match[1], total });
  }

  if (rows.length === 0) {
    return { employees: null, employees_prior: null, referenceYear: null };
  }

  rows.sort((a, b) => b.date.localeCompare(a.date));
  const latest = rows[0];
  const employees_prior = rows.length >= 2 ? rows[1].total : null;
  const referenceYear = Number(latest.date.slice(0, 4));

  return {
    employees: latest.total,
    employees_prior,
    referenceYear: Number.isFinite(referenceYear) ? referenceYear : null,
  };
}

function parseEmployeesFromCountLabel(text: string, folderYear: number): {
  employees: number | null;
  employees_prior: number | null;
  referenceYear: number | null;
} {
  const patterns = [
    /종업원\s*수[\s\n]{0,60}?(\d{1,6})\s*명/gu,
    /종업원[\s\n]{0,12}수[\s\n]{0,60}?(\d{1,6})\s*명/gu,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1];
      // "종업원수 2021명"처럼 연도가 잡히는 오인 방지 (표 파싱 실패 시에만 사용)
      if (/^(19|20)\d{2}$/u.test(raw)) continue;
      const employees = parseEmployeeCount(raw);
      if (employees == null) continue;
      return {
        employees,
        employees_prior: null,
        referenceYear: inferEmployeeReferenceYear(text, folderYear),
      };
    }
  }

  return { employees: null, employees_prior: null, referenceYear: null };
}

/** 파일명과 무관하게 본문에서 종업원 추출 가능한 신용/기업 분석 문서인지 판별 */
export function isProductivityEmployeeSourceText(text: string): boolean {
  const normalized = text.replace(/\r/g, '');
  if (normalized.length < 80) return false;
  if (isKoreanCreditRatingText(normalized)) return true;
  if (/종업원현황/u.test(normalized)) return true;
  if (/종업원\s*수[\s\n]{0,60}?\d{1,6}\s*명/u.test(normalized)) return true;
  return false;
}

/** 신용분석보고서 본문에서 종업원 수만 추출 — 재무 지표 파싱과 분리 */
export function extractCreditReportEmployees(
  text: string,
  folderYear: number,
): {
  employees: number | null;
  employees_prior: number | null;
  referenceYear: number | null;
} {
  const normalized = text.replace(/\r/g, '');

  const fromTable = parseEmployeesFromStatusTable(normalized);
  if (fromTable.employees != null) return fromTable;

  return parseEmployeesFromCountLabel(normalized, folderYear);
}
