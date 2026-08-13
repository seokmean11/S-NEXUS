import path from 'node:path';

const BOILERPLATE_NAME = /신용정보|보호에\s*관한|법률|report\s*no|이용\s*및|대상기업\s*업종/u;

function stripCompetitorNameNoise(name: string): string {
  return name
    .replace(/^\d+\./, '')
    .replace(/\((?:CR|cr)\d+[+-]?[^)]*\)/g, '')
    .trim();
}

const CORPORATE_LABEL_PATTERN =
  /(?:주식회사|식회사|유한회사|유한공사|\(주\)|\(유\)|㈜|（주）|（유）|\(株\))/gu;

export interface DocumentIdentity {
  companyName: string;
  companyKey: string;
  fiscalYear: number;
  sourceFile: string;
}

export function normalizeCompanyKey(name: string): string {
  const cleaned = cleanCompanyLabel(name);
  if (cleaned) return cleaned;
  return name
    .replace(CORPORATE_LABEL_PATTERN, '')
    .replace(/\s+/g, '')
    .trim();
}

export function cleanCompanyLabel(raw: string): string | null {
  let cleaned = stripCompetitorNameNoise(raw)
    .replace(/\n+/g, ' ')
    .replace(CORPORATE_LABEL_PATTERN, ' ')
    .replace(/\(\d{4}[^)]*\)/g, '')
    .replace(/감사보고서.*$/u, '')
    .replace(/사업보고서.*$/u, '')
    .replace(/신용(?:분석|평가).*$/u, '')
    .replace(/\s*대\s*표\s*(?:자|이\s*사)?\s*.*$/u, '')
    .replace(/\s*사업자\s*번호\s*[\d*-]*.*$/u, '')
    .replace(/\s*외\s*\d+\s*명.*$/u, '')
    .replace(/\s+/g, '')
    .trim();

  if (cleaned.length < 2 || BOILERPLATE_NAME.test(cleaned)) return null;
  return cleaned;
}

export function extractCompanyNameFromCover(text: string, fileName: string): string | null {
  const cover = text.slice(0, 8_000);

  const coverPatterns = [
    /(?:업\s*체\s*명|회\s*사\s*명|기\s*업\s*명|상\s*호)\s*[:：]?\s*(?:\(?(?:주|유|㈜)\)?\s*)?([가-힣A-Za-z0-9&·\s]{2,40})/u,
    /(?:\(?(?:주|유|㈜)\)?\s*)([가-힣A-Za-z0-9&]{2,30})\s*(?:감사보고서|사업보고서|신용)/u,
    /주식회사\s+([가-힣A-Za-z0-9&]+)/u,
  ];

  for (const pattern of coverPatterns) {
    const match = cover.match(pattern);
    if (match?.[1]) {
      const label = cleanCompanyLabel(match[1]);
      if (label) return label;
    }
  }

  const fromFile = extractCompanyNameFromFileName(fileName);
  return fromFile ? cleanCompanyLabel(fromFile) : null;
}

export function extractCompanyNameFromFileName(fileName: string): string | null {
  const numbered = fileName.match(/^\d+\.\((?:주|유|㈜)\)([^_]+?)_/u);
  if (numbered?.[1]) {
    const label = cleanCompanyLabel(numbered[1]);
    if (label) return label;
  }

  const numberedPlain = fileName.match(/^\d+\.([^_]+?)_/u);
  if (numberedPlain?.[1] && !/신용분석/u.test(numberedPlain[1])) {
    const label = cleanCompanyLabel(
      numberedPlain[1].replace(/\(?(?:주|유|㈜)\)?/gu, '').trim(),
    );
    if (label) return label;
  }

  const bracketMatch = fileName.match(/\[([^\]]+)\]/u);
  if (bracketMatch?.[1]) {
    const label = cleanCompanyLabel(bracketMatch[1]);
    if (label) return label;
  }

  const stockMatch = fileName.match(/\(?(?:주|유|㈜)\)?([^()[\].]+?)(?:\(|\[|\.|_|$)/u);
  if (stockMatch?.[1]) {
    const label = cleanCompanyLabel(stockMatch[1]);
    if (label) return label;
  }

  const base = path.basename(fileName, path.extname(fileName));
  const stripped = base
    .replace(/^\[[^\]]+\]/, '')
    .replace(/[_-]?(감사보고서|사업보고서|신용분석보고서|신용평가서|신용평가|\(\d{4}[^)]*\)|\d{4})/g, '')
    .trim();

  return stripped.length >= 2 ? cleanCompanyLabel(stripped) : null;
}

export function extractFiscalYearFromDocument(text: string, folderYear: number): number {
  const head = text.slice(0, 12_000);

  const patterns = [
    /(\d{4})년\s*0?1월\s*0?1일\s*부터\s*(\d{4})년\s*12월\s*31일\s*까지/u,
    /(\d{4})년\s*12월\s*31일\s*현재/u,
    /제\s*\d+\s*기[^\d]{0,12}(\d{4})\s*년/u,
    /(\d{4})\s*년\s*결\s*산/u,
    /결\s*산\s*연\s*도\s*[:：]?\s*(\d{4})/u,
    /사\s*업\s*연\s*도\s*[:：]?\s*(\d{4})/u,
  ];

  for (const pattern of patterns) {
    const match = head.match(pattern);
    const yearToken = match?.[2] ?? match?.[1];
    if (yearToken) {
      const year = Number(yearToken);
      if (year >= 2000 && year <= 2100) return year;
    }
  }

  const dateRow = [...head.matchAll(/20(\d{2})-12-31/gu)].map((m) => Number(`20${m[1]}`));
  if (dateRow.length > 0) return Math.max(...dateRow);

  return folderYear;
}

export function resolveDocumentIdentity(
  text: string,
  fileName: string,
  folderYear: number,
  parsedCompanyName?: string,
): DocumentIdentity {
  const fromCover = extractCompanyNameFromCover(text, fileName);
  const fromParsed = parsedCompanyName ? cleanCompanyLabel(parsedCompanyName) : null;
  const fromFile = extractCompanyNameFromFileName(fileName);

  const companyName = fromCover ?? fromParsed ?? fromFile ?? fileName.replace(/\.[^.]+$/, '');

  return {
    companyName,
    companyKey: normalizeCompanyKey(companyName),
    fiscalYear: folderYear,
    sourceFile: fileName,
  };
}

export function buildFileScopedDedupKey(fileName: string, fiscalYear: number): string {
  return `${fileName}::${fiscalYear}`;
}
