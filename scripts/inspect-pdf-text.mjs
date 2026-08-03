import fs from 'fs';
import { PDFParse } from 'pdf-parse';

const buffer = fs.readFileSync('c:/Users/seosm/Downloads/내선전화표(2026.08).pdf');
const parser = new PDFParse({ data: buffer });
const textResult = await parser.getText();
await parser.destroy();

console.log(JSON.stringify(textResult.pages?.[0]?.text?.slice(0, 2000) ?? textResult, null, 2).slice(0, 3000));
