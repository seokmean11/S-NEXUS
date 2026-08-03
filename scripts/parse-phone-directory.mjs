import fs from 'fs';
import { PDFParse } from 'pdf-parse';

const PDF_PATH = process.argv[2] ?? 'c:/Users/seosm/Downloads/내선전화표(2026.08).pdf';

const buffer = fs.readFileSync(PDF_PATH);
const parser = new PDFParse({ data: buffer });
const textResult = await parser.getText();
await parser.destroy();

console.log('=== PAGES:', textResult.pages?.length ?? '?');
console.log('=== TEXT LENGTH:', textResult.text.length);
console.log('=== RAW TEXT ===');
console.log(textResult.text);
