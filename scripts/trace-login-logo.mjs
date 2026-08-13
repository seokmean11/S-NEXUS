/**
 * 원본 PNG 형태 → SVG 자동 트레이스 (픽셀 그대로, 벡터로 선명)
 * 실행: node scripts/trace-login-logo.mjs
 */
import fs from 'fs';
import sharp from 'sharp';
import ImageTracer from 'imagetracerjs';

const SOURCE = 'public/s-nexus-logo-clear@3x.png';
const OUTPUT_SVG = 'public/s-nexus-logo-traced.svg';

const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

const imageData = {
  width: info.width,
  height: info.height,
  data: new Uint8ClampedArray(data),
};

let svg = ImageTracer.imagedataToSVG(imageData, {
  ltres: 0.4,
  qtres: 0.4,
  pathomit: 0,
  colorsampling: 0,
  numberofcolors: 8,
  mincolorratio: 0.015,
  colorquantcycles: 2,
  scale: 1,
  roundcoords: 1,
  viewbox: true,
  desc: false,
  lcpr: 0,
  qcpr: 0,
  strokewidth: 0,
  linefilter: false,
  blurradius: 0,
  blurdelta: 0,
});

svg = svg
  .replace(/<!--.*?-->/gs, '')
  .replace(/ desc="[^"]*"/g, '')
  .replace(/<path[^>]*opacity="0"[^>]*\/>/g, '')
  .replace(/\s+/g, ' ')
  .trim();

fs.writeFileSync(OUTPUT_SVG, svg, 'utf8');
console.log(`Wrote ${OUTPUT_SVG} (${info.width}x${info.height})`);
