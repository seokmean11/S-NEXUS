import fs from 'node:fs';

const textCache = new Map<string, string>();
const inflightReads = new Map<string, Promise<string>>();

function buildPdfTextCacheKey(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    return `${filePath}:${stat.size}:${stat.mtimeMs}`;
  } catch {
    return null;
  }
}

async function readPdfTextFromDisk(filePath: string): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    await parser.destroy();
    return textResult.text?.replace(/\r/g, '') ?? '';
  } catch {
    return '';
  }
}

/** 동일 PDF in-flight dedup — 생산성·소속산업 병렬 빌드 시 1회만 파싱 */
export async function readCreditReportPdfText(filePath: string): Promise<string> {
  const cacheKey = buildPdfTextCacheKey(filePath);
  if (!cacheKey) return '';

  const cached = textCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const pending = inflightReads.get(cacheKey);
  if (pending) return pending;

  const readPromise = readPdfTextFromDisk(filePath).then((text) => {
    textCache.set(cacheKey, text);
    inflightReads.delete(cacheKey);
    return text;
  });
  inflightReads.set(cacheKey, readPromise);
  return readPromise;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]);
    }
  });

  await Promise.all(runners);
}

export async function readCreditReportPdfTextsParallel(
  filePaths: string[],
  concurrency = 4,
): Promise<Map<string, string>> {
  const textsByPath = new Map<string, string>();
  await runWithConcurrency(filePaths, concurrency, async (filePath) => {
    textsByPath.set(filePath, await readCreditReportPdfText(filePath));
  });
  return textsByPath;
}
