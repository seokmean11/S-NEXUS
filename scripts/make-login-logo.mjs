/**
 * 로그인 로고 PNG — 원본 픽셀 형태·색상 100% 유지
 * 1) 검정 배경 → 투명
 * 2) 정수배 nearest 확대만 (보간·선명화 필터 없음 — 모양/색 변경 없음)
 *
 * 실행: node scripts/make-login-logo.mjs
 */
import fs from 'fs';
import sharp from 'sharp';

const SOURCE = 'public/s-nexus-logo.png';
const DISPLAY_WIDTH = 408;

const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (r < 42 && g < 42 && b < 42) data[i + 3] = 0;
}

async function writeVariant(label, scale) {
  const width = info.width * scale;
  const height = info.height * scale;
  const suffix = label === '1x' ? '' : `@${label}`;
  const output = `public/s-nexus-logo-clear${suffix}.png`;

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(width, height, { kernel: 'nearest' })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toFile(output);

  console.log(`Wrote ${output} (${width}x${height}, ${scale}x nearest)`);
}

const scale1 = DISPLAY_WIDTH / info.width;
await writeVariant('1x', scale1);
await writeVariant('2x', scale1 * 2);
await writeVariant('3x', scale1 * 3);

console.log(`Display: ${DISPLAY_WIDTH}x${Math.round((info.height / info.width) * DISPLAY_WIDTH)}px`);
