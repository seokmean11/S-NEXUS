/**
 * 로그인 로고 PNG — 고해상도 원본 → 표시 크기(408×117) 유지, 선명한 다운스케일
 * 1) 검정 배경 → 투명
 * 2) 여백 trim
 * 3) 1x/2x/3x (408/816/1224 × 117) lanczos3 축소
 *
 * 실행: node scripts/make-login-logo.mjs
 */
import sharp from 'sharp';

const SOURCE = 'public/s-nexus-logo.png';
const DISPLAY_WIDTH = 408;
const DISPLAY_HEIGHT = 117;

const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (r < 42 && g < 42 && b < 42) data[i + 3] = 0;
}

const trimmed = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).trim({
  threshold: 10,
});

async function writeVariant(label, width) {
  const height = Math.round((width / DISPLAY_WIDTH) * DISPLAY_HEIGHT);
  const suffix = label === '1x' ? '' : `@${label}`;
  const output = `public/s-nexus-logo-clear${suffix}.png`;

  await trimmed
    .clone()
    .resize(width, height, {
      fit: 'inside',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3',
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toFile(output);

  const meta = await sharp(output).metadata();
  console.log(`Wrote ${output} (${meta.width}x${meta.height})`);
}

await writeVariant('1x', DISPLAY_WIDTH);
await writeVariant('2x', DISPLAY_WIDTH * 2);
await writeVariant('3x', DISPLAY_WIDTH * 3);

console.log(`Display box: ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}px`);
