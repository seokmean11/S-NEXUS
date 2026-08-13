/**
 * Claude Vision으로 로고 SVG 정밀 보정 (선택 실행)
 * .env VITE_CLAUDE_API_KEY 필요
 * 실행: node scripts/refine-login-logo-claude.mjs
 */
import fs from 'fs';

function loadEnv() {
  try {
    const raw = fs.readFileSync('.env', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^VITE_CLAUDE_API_KEY=(.+)$/);
      if (m) return m[1].trim();
    }
  } catch {
    return '';
  }
  return '';
}

const apiKey = loadEnv();
if (!apiKey) {
  console.error('VITE_CLAUDE_API_KEY가 .env에 없습니다.');
  process.exit(1);
}

const png = fs.readFileSync('public/s-nexus-logo.png').toString('base64');
const model = process.env.VITE_CLAUDE_MODEL || 'claude-sonnet-4-20250514';

const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model,
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: png },
          },
          {
            type: 'text',
            text: `This is the S-NEXUS login logo (icon + S-NEXUS text on black background).

Output ONLY a single SVG element with:
- transparent background (no black rect)
- viewBox aspect ratio matching the logo (~136:39)
- EXACT same icon shape (concave 4-point star, center hole, orange top-right, gray left)
- EXACT same text S-NEXUS with S- orange #f05a28, NEXUS gray #b8aea6
- Use paths for icon; bold sans text for wordmark
- Must be pixel-faithful to the image, sharp vector

Return raw SVG only, no markdown.`,
          },
        ],
      },
    ],
  }),
});

const payload = await response.json();
if (!response.ok) {
  console.error(payload);
  process.exit(1);
}

let text = payload.content?.find((c) => c.type === 'text')?.text ?? '';
text = text.replace(/^```svg\s*/i, '').replace(/```\s*$/i, '').trim();

if (!text.startsWith('<svg')) {
  console.error('Claude did not return SVG:', text.slice(0, 200));
  process.exit(1);
}

fs.writeFileSync('public/s-nexus-logo-claude.svg', text, 'utf8');
console.log('Wrote public/s-nexus-logo-claude.svg');
