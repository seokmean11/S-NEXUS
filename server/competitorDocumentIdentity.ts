import path from 'node:path';

/** 신용평가사·법률 문구 등 — 피분석 기업명이 아닌 경우 */
const BOILERPLATE_NAME =
  /신용정보|보호에\s*관한|법률|report\s*no|이용\s*및|대상기업\s*업종|평가정보|신용평가|평가기관|이크레더블|한국기업평가|^SCI$|SCI평가|NICE평가|나이스평가|나이스디앤비|한국신용|한신정|KIS정보|KED\s*평가|보유내역|해당\s*정보|지주\s*비율/iu;

function stripCompetitorNameNoise(name: string): string {
  return name
    .replace(/^\d+\./, '')
    .replace(/\((?:CR|cr)\d+[+-]?[^)]*\)/g, '')
    .trim();
}

const CORPORATE_LABEL_PATTERN =
  /(?:주식회사|식회사|유한회사|유한공사|\(주\)|\(유\)|㈜|（주）|（유）|\(株\))/gu;

/** 기업개요·표지에서 회사명을 가리키는 라벨 */
const COMPANY_LABEL_PATTERN =
  /(?:기\s*업\s*개\s*요|회\s*사\s*개\s*요|업\s*체\s*명|회\s*사\s*명|사\s*명|기\s*업\s*명|기\s*업\s*체\s*명|상\s*호)/u;

export interface DocumentIdentity {
  companyName: string;
  companyKey: string;
  fiscalYear: number;
  sourceFile: string;
}

export function isAgencyOrBoilerplateCompanyName(name: string): boolean {
  const cleaned = name.replace(/\s+/g, '').trim();
  if (cleaned.length < 2) return true;
  return BOILERPLATE_NAME.test(cleaned) || BOILERPLATE_NAME.test(name);
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
    .replace(/\(\d{2}\.\d{2}\.\d{2}\s*[-~～]\s*\d{2}\.\d{2}\.\d{2}\)/g, '')
    .replace(/감사보고서.*$/u, '')
    .replace(/사업보고서.*$/u, '')
    .replace(/신용(?:분석|평가).*$/u, '')
    .replace(/민간\s*기업.*$/u, '')
    .replace(/\s*대\s*표\s*(?:자|이\s*사)?\s*.*$/u, '')
    .replace(/\s*사업자\s*번호\s*[\d*-]*.*$/u, '')
    .replace(/\s*외\s*\d+\s*명.*$/u, '')
    .replace(/\s+/g, '')
    .trim();

  if (cleaned.length < 2 || isAgencyOrBoilerplateCompanyName(cleaned)) return null;
  // 날짜·기호만 남은 경우
  if (/^[\d.()~～\-]+$/.test(cleaned)) return null;
  return cleaned;
}

function extractLabeledCompanyName(text: string): string | null {
  const labeledPatterns = [
    new RegExp(
      `${COMPANY_LABEL_PATTERN.source}\\s*[:：]?\\s*(?:\\(?(?:주|유|㈜)\\)?\\s*)?([가-힣A-Za-z0-9&·\\s]{2,40})`,
      'u',
    ),
    /(?:업\s*체\s*명|회\s*사\s*명|사\s*명|기\s*업\s*명|기\s*업\s*체\s*명|상\s*호)\s*[:：]?\s*(?:\(?(?:주|유|㈜)\)?\s*)?([가-힣A-Za-z0-9&·\s]{2,40})/u,
  ];

  for (const pattern of labeledPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const label = cleanCompanyLabel(match[1]);
      if (label) return label;
    }
  }
  return null;
}

/** 기업개요(또는 유사) 섹션 본문에서 회사명 우선 추출 */
export function extractCompanyNameFromOverview(text: string): string | null {
  const overviewMatch = text.match(
    /(?:기\s*업\s*개\s*요|회\s*사\s*개\s*요|기\s*업\s*현\s*황|회\s*사\s*현\s*황)([\s\S]{0,3500})/u,
  );
  if (overviewMatch?.[1]) {
    const fromOverview = extractLabeledCompanyName(overviewMatch[1]);
    if (fromOverview) return fromOverview;

    const stockInOverview = overviewMatch[1].match(
      /(?:\(?(?:주|유|㈜)\)?\s*|주식회사\s+)([가-힣A-Za-z0-9&]{2,30})/u,
    );
    if (stockInOverview?.[1]) {
      const label = cleanCompanyLabel(stockInOverview[1]);
      if (label) return label;
    }
  }

  return extractLabeledCompanyName(text.slice(0, 12_000));
}

export function extractCompanyNameFromCover(text: string, fileName: string): string | null {
  const fromOverview = extractCompanyNameFromOverview(text);
  if (fromOverview) return fromOverview;

  const cover = text.slice(0, 8_000);

  const secondaryPatterns = [
    /(?:\(?(?:주|유|㈜)\)?\s*)([가-힣A-Za-z0-9&]{2,30})\s*(?:감사보고서|사업보고서|신용)/u,
  ];

  for (const pattern of secondaryPatterns) {
    const match = cover.match(pattern);
    if (match?.[1]) {
      const label = cleanCompanyLabel(match[1]);
      if (label) return label;
    }
  }

  // 맨 앞 주식회사 … 는 평가사/발행처일 수 있어 파일명보다 후순위 — 여기서는 쓰지 않음
  const fromFile = extractCompanyNameFromFileName(fileName);
  return fromFile ? cleanCompanyLabel(fromFile) : null;
}

export function extractCompanyNameFromFileName(fileName: string): string | null {
  // [SCI평가정보] 제목 등 평가사 대괄호는 회사명으로 쓰지 않음
  const withoutAgencyBracket = fileName.replace(
    /\[(?:SCI[^\]]*|NICE[^\]]*|[^\]]*(?:평가정보|신용평가|평가기관|이크레더블|한국기업평가)[^\]]*)\]/giu,
    '',
  );

  const numbered = withoutAgencyBracket.match(/^\d+\.\((?:주|유|㈜)\)([^_]+?)_/u);
  if (numbered?.[1]) {
    const label = cleanCompanyLabel(numbered[1]);
    if (label) return label;
  }

  const numberedPlain = withoutAgencyBracket.match(/^\d+\.([^_]+?)_/u);
  if (numberedPlain?.[1] && !/신용분석|신용평가/u.test(numberedPlain[1])) {
    const label = cleanCompanyLabel(
      numberedPlain[1].replace(/\(?(?:주|유|㈜)\)?/gu, '').trim(),
    );
    if (label) return label;
  }

  const bracketMatch = withoutAgencyBracket.match(/\[([^\]]+)\]/u);
  if (bracketMatch?.[1]) {
    const label = cleanCompanyLabel(bracketMatch[1]);
    if (label) return label;
  }

  const stockMatch = withoutAgencyBracket.match(/\(?(?:주|유|㈜)\)?([^()[\].]+?)(?:\(|\[|\.|_|$)/u);
  if (stockMatch?.[1]) {
    const label = cleanCompanyLabel(stockMatch[1]);
    if (label) return label;
  }

  const base = path.basename(withoutAgencyBracket, path.extname(withoutAgencyBracket));
  const stripped = base
    .replace(/^\[[^\]]+\]/, '')
    .replace(
      /[_-]?(감사보고서|사업보고서|신용분석보고서|신용평가서|신용평가|민간\s*기업신용평가\s*보고서|\(\d{4}[^)]*\)|\d{4})/g,
      '',
    )
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
  const fromOverviewOrCover = extractCompanyNameFromCover(text, fileName);
  const fromParsed = parsedCompanyName ? cleanCompanyLabel(parsedCompanyName) : null;
  const fromFile = extractCompanyNameFromFileName(fileName);

  // 기업개요·회사명 라벨 → 파일명 → 파서 추정 (평가사명은 제외)
  const fallbackRaw = fileName.replace(/\.[^.]+$/, '');
  const companyName =
    fromOverviewOrCover ??
    fromFile ??
    fromParsed ??
    cleanCompanyLabel(fallbackRaw) ??
    fromFile ??
    '미상';

  // 최종 방어: 평가사명이면 파일명 재시도 후에도 미상
  const safeName = isAgencyOrBoilerplateCompanyName(companyName)
    ? fromFile ?? '미상'
    : companyName;
  const finalName = isAgencyOrBoilerplateCompanyName(safeName) ? '미상' : safeName;

  return {
    companyName: finalName,
    companyKey: normalizeCompanyKey(finalName),
    fiscalYear: folderYear,
    sourceFile: fileName,
  };
}

export function buildFileScopedDedupKey(fileName: string, fiscalYear: number): string {
  return `${fileName}::${fiscalYear}`;
}
