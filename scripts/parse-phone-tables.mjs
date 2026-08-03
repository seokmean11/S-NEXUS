import fs from 'fs';
import { PDFParse } from 'pdf-parse';

const PDF_PATH = 'c:/Users/seosm/Downloads/내선전화표(2026.08).pdf';
const buffer = fs.readFileSync(PDF_PATH);
const parser = new PDFParse({ data: buffer });
const tableResult = await parser.getTable();
await parser.destroy();

fs.writeFileSync('tmp/phone-pdf-tables.json', JSON.stringify(tableResult, null, 2), 'utf8');
console.log('tables written', tableResult?.pages?.length ?? 0);
