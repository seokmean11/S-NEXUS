import fs from 'fs';
import { PDFParse } from 'pdf-parse';

const buffer = fs.readFileSync('c:/Users/seosm/Downloads/내선전화표(2026.08).pdf');
const parser = new PDFParse({ data: buffer });
const textResult = await parser.getText();
await parser.destroy();

const text = textResult.text
  .replace(/\r/g, '')
  .split('\n')
  .filter((l) => !l.includes('-- 1 of 1 --'))
  .join('\n');

fs.writeFileSync('scripts/phone-directory-202608.txt', text, 'utf8');
console.log('saved', text.length, 'chars', text.split('\n').length, 'lines');
