import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const out = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(out, '../..');
const require = createRequire(path.join(root, 'package.json'));
const dependency = createRequire(require.resolve('@vite-pwa/assets-generator'));
const sharp = dependency('sharp');
const ico = dependency('sharp-ico');
const source = await readFile(path.join(root, 'images/Logo.svg'), 'utf8');
const colors = { 'cls-1': '#4c2107', 'cls-2': '#ff7501', 'cls-3': '#faead3', 'cls-4': '#f40' };
const body = source.replace(/^[\s\S]*?<\/defs>/, '').replace(/<\/svg>\s*$/, '')
  .replace(/class="(cls-\d)"/g, (_, name) => `fill="${colors[name]}"`)
  .replace(/>\s+</g, '><').trim();
const svg = (content, viewBox = '0 0 5016 5016') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${content}</svg>`;
const logo = svg(body);
// The first three shapes encode the orange background and its vectorisation seam.
const foreground = body.slice(body.indexOf('<g>'));
assert(foreground.startsWith('<g>'));
const monochrome = [...body.matchAll(/<path fill="#4c2107" d="([^"]+)"\s*\/>/g)]
  .map((match) => match[1]);
assert.equal(monochrome.length, 2);
const scalePath = 16 / 5016;
const safari = svg(`<path fill="#000" transform="scale(${scalePath})" d="${monochrome.join(' ')}"/>`, '0 0 16 16');
const render = (input, size) => sharp(Buffer.from(input)).resize(size, size).png({ compressionLevel: 9 });
const save = async (name, data) => {
  const target = path.join(out, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
};
await save('public/pwa/image/logo.svg', logo);
await save('src/assets/logo.svg', logo);
await save('public/pwa/image/safari-pinned-tab.svg', safari);
const pngs = new Map();
for (const size of [16, 32, 48, 64, 180, 192, 256, 512]) {
  const data = await render(logo, size).flatten({ background: '#ff4400' }).toBuffer();
  pngs.set(size, data);
  if ([64, 192, 512].includes(size)) await save(`public/pwa/image/pwa-${size}x${size}.png`, data);
  if ([16, 32, 48].includes(size)) await save(`extras/favicon-${size}x${size}.png`, data);
}
await save('public/pwa/image/apple-touch-icon-180x180.png', pngs.get(180));
await save('src/assets/cslogo.png', pngs.get(256));
const favicon = ico.encode([16, 32, 48, 256].map((size) => pngs.get(size)));
for (const name of ['public/favicon.ico', 'public/pwa/image/favicon.ico', 'src/assets/favicon.ico']) await save(name, favicon);
// Measure all visible foreground pixels. Reserve three pixels inside the 40% safe circle.
const pixels = await render(svg(foreground), 512).ensureAlpha().raw().toBuffer();
let radius = 0;
for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
  if (pixels[(y * 512 + x) * 4 + 3] > 0) radius = Math.max(radius, Math.hypot(x + 0.5 - 256, y + 0.5 - 256));
}
const scale = Math.min(1, (512 * 0.4 - 3) / radius);
const offset = 2508 * (1 - scale);
const padded = `<g transform="translate(${offset} ${offset}) scale(${scale})">${foreground}</g>`;
const maskSvg = svg(`<rect width="5016" height="5016" fill="#f40"/>${padded}`);
const mask = await render(maskSvg, 512).flatten({ background: '#ff4400' }).toBuffer();
await save('public/pwa/image/maskable-icon-512x512.png', mask);
await save('extras/maskable-icon.svg', maskSvg);
const safePixels = await render(svg(padded), 512).ensureAlpha().raw().toBuffer();
let outside = 0;
for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
  if (safePixels[(y * 512 + x) * 4 + 3] > 0 && Math.hypot(x + 0.5 - 256, y + 0.5 - 256) > 204.8) outside++;
}
assert.equal(outside, 0, 'Maskable artwork must stay inside the safe circle');
assert.deepEqual(ico.decode(favicon).map((frame) => frame.width), [16, 32, 48, 256]);
for (const [size, data] of pngs) {
  const meta = await sharp(data).metadata();
  assert.equal(meta.width, size);
  assert.equal(meta.height, size);
  assert.equal(meta.hasAlpha, false);
}
const mono = await render(safari, 512).ensureAlpha().raw().toBuffer();
let opaque = 0;
for (let i = 0; i < mono.length; i += 4) {
  if (mono[i + 3]) { assert.equal(mono[i] + mono[i + 1] + mono[i + 2], 0); opaque++; }
}
assert(opaque > 0 && opaque < 512 * 512 / 2);
// Standalone preview at native sizes plus adaptive masks and monochrome on two backgrounds.
const dataUrl = (data) => `data:image/png;base64,${data.toString('base64')}`;
const panels = [];
const label = (x, y, text) => `<text x="${x}" y="${y}" fill="#334155" font-family="Arial" font-size="16">${text}</text>`;
panels.push(label(32, 36, 'NPClassworks / icon previews'));
for (const [i, size] of [16, 32, 48, 64, 180, 192].entries()) {
  const x = 32 + i * 148;
  const display = Math.min(size, 128);
  panels.push(label(x, 75, `${size}px${size > 128 ? ' (scaled)' : ' (actual)'}`));
  panels.push(`<image href="${dataUrl(pngs.get(size))}" x="${x}" y="96" width="${display}" height="${display}"/>`);
}
panels.push(label(32, 270, '512px source (shown at 240px)'));
panels.push(`<image href="${dataUrl(pngs.get(512))}" x="32" y="290" width="240" height="240"/>`);
panels.push(label(332, 270, 'Maskable: circle crop'));
panels.push(`<image href="${dataUrl(mask)}" x="332" y="290" width="240" height="240" clip-path="url(#circle)"/>`);
panels.push(label(632, 270, 'Maskable: rounded square'));
panels.push(`<image href="${dataUrl(mask)}" x="632" y="290" width="240" height="240" clip-path="url(#rounded)"/>`);
const monoPng = await render(safari, 144).toBuffer();
panels.push(label(32, 588, 'Safari monochrome / light and dark backgrounds'));
panels.push(`<rect x="220" y="608" width="160" height="160" rx="12" fill="#222"/>`);
panels.push(`<image href="${dataUrl(monoPng)}" x="32" y="616" width="144" height="144"/>`);
const whiteMono = await render(safari.replace('fill="#000"', 'fill="#fff"'), 144).toBuffer();
panels.push(`<image href="${dataUrl(whiteMono)}" x="228" y="616" width="144" height="144"/>`);
const previewSvg = svg(`<defs><clipPath id="circle"><circle cx="452" cy="410" r="120"/></clipPath><clipPath id="rounded"><rect x="632" y="290" width="240" height="240" rx="54"/></clipPath></defs><rect width="960" height="800" fill="#f1f5f9"/>${panels.join('')}`, '0 0 960 800');
await save('preview.png', await sharp(Buffer.from(previewSvg)).png().toBuffer());
await save('validation.json', JSON.stringify({ source: 'images/Logo.svg', sizes: [...pngs.keys()], icoFrames: [16, 32, 48, 256], maskableScale: scale, maskableSafeCircleOutsidePixels: outside, safari: 'single black path, transparent background, viewBox 0 0 16 16', liveAssetsModified: false }, null, 2) + '\n');
console.log(`Generated and validated icons in ${out}; maskable scale ${scale.toFixed(4)}.`);
