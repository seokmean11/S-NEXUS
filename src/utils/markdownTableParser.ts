import type { ExportTable } from '@/utils/reportExport';

function splitMarkdownRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\|?[\s:-]+\|[\s|:-]+\|?$/.test(line.trim());
}

export function parseMarkdownTables(text: string): ExportTable[] {
  const lines = text.split('\n');
  const tables: ExportTable[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.includes('|')) {
      index += 1;
      continue;
    }

    const headerCells = splitMarkdownRow(line);
    if (headerCells.length < 2) {
      index += 1;
      continue;
    }

    const separatorLine = lines[index + 1];
    if (!separatorLine || !isSeparatorRow(separatorLine)) {
      index += 1;
      continue;
    }

    const rows: string[][] = [];
    index += 2;
    while (index < lines.length && lines[index].includes('|')) {
      if (isSeparatorRow(lines[index])) {
        index += 1;
        continue;
      }
      rows.push(splitMarkdownRow(lines[index]));
      index += 1;
    }

    if (rows.length > 0) {
      tables.push({ headers: headerCells, rows });
    }
  }

  return tables;
}

export function stripMarkdownTables(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (
      line.includes('|') &&
      lines[index + 1] &&
      isSeparatorRow(lines[index + 1])
    ) {
      index += 2;
      while (index < lines.length && lines[index].includes('|')) {
        index += 1;
      }
      kept.push('');
      continue;
    }
    kept.push(line);
    index += 1;
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
