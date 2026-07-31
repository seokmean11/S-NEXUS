export interface ExportTable {
  headers: string[];
  rows: string[][];
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function tableToCsv(table: ExportTable): string {
  const lines = [
    table.headers.map(escapeCsvCell).join(','),
    ...table.rows.map((row) => row.map((cell) => escapeCsvCell(cell ?? '')).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function tableToWordHtml(title: string, table: ExportTable, summary?: string): string {
  const headerCells = table.headers.map((h) => `<th>${h}</th>`).join('');
  const bodyRows = table.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell ?? ''}</td>`).join('')}</tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: 'Malgun Gothic', sans-serif; padding: 24px; color: #191f28; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    p { font-size: 13px; color: #4e5968; margin-bottom: 16px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; }
    th, td { border: 1px solid #d1d6db; padding: 8px 10px; text-align: left; }
    th { background: #f2f4f6; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${summary ? `<p>${summary}</p>` : ''}
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, table: ExportTable) {
  downloadTextFile(filename.endsWith('.csv') ? filename : `${filename}.csv`, tableToCsv(table), 'text/csv;charset=utf-8');
}

export function sectionsToWordHtml(
  title: string,
  executive: string,
  sections: { title: string; narrative: string; table?: ExportTable }[],
): string {
  const sectionHtml = sections
    .map((section) => {
      const narrative = section.narrative
        .split('\n')
        .map((line) => `<p>${line || '&nbsp;'}</p>`)
        .join('');
      const tableHtml = section.table
        ? `<table><thead><tr>${section.table.headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${section.table.rows
            .map(
              (row) =>
                `<tr>${row.map((cell) => `<td>${cell ?? ''}</td>`).join('')}</tr>`,
            )
            .join('')}</tbody></table>`
        : '';
      return `<section><h2>${section.title}</h2>${narrative}${tableHtml}</section>`;
    })
    .join('');

  const executiveHtml = executive
    .split('\n')
    .map((line) => `<p>${line || '&nbsp;'}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: 'Malgun Gothic', sans-serif; padding: 24px; color: #191f28; line-height: 1.6; }
    h1 { font-size: 22px; margin-bottom: 12px; }
    h2 { font-size: 16px; margin: 24px 0 8px; color: #1b64da; }
    p { font-size: 13px; color: #4e5968; margin: 4px 0; }
    section { margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 10px; }
    th, td { border: 1px solid #d1d6db; padding: 8px 10px; text-align: left; }
    th { background: #f2f4f6; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${executiveHtml}
  ${sectionHtml}
</body>
</html>`;
}

export function downloadInsightWordReport(
  filename: string,
  title: string,
  executive: string,
  sections: { title: string; narrative: string; table?: ExportTable }[],
) {
  const html = sectionsToWordHtml(title, executive, sections);
  downloadTextFile(
    filename.endsWith('.doc') ? filename : `${filename}.doc`,
    html,
    'application/msword;charset=utf-8',
  );
}

export function downloadWordReport(filename: string, title: string, table: ExportTable, summary?: string) {
  const html = tableToWordHtml(title, table, summary);
  downloadTextFile(
    filename.endsWith('.doc') ? filename : `${filename}.doc`,
    html,
    'application/msword;charset=utf-8',
  );
}
