// Regenerates the PNG app icons from the torch mark (the favicon itself is src/app/icon.svg).
//   node scripts/render-icons.mjs
// Writes public/icons/{icon-192,icon-512,maskable-512}.png and src/app/apple-icon.png. The maskable icon keeps the
// glyph inside the centre safe zone, since Android crops it to a circle or squircle.
import { chromium } from "@playwright/test";

const glyph = (scale) => `
  <g transform="translate(${256 - 256 * scale} ${256 - 256 * scale}) scale(${scale})">
    <path d="M256 70c16 52 84 78 84 152a84 84 0 0 1-168 0c0-28 12-47 26-63 5 20 16 32 30 38-5-50 10-94 28-127Z" fill="url(#f)"/>
    <path d="M222 324h68l-14 124h-40l-14-124Z" fill="#e0cfab"/>
    <path d="M96 440c52-22 108-22 160 0s108 22 160 0" fill="none" stroke="#22a877" stroke-width="16" stroke-linecap="round" opacity="0.85"/>
  </g>`;
const svg = (size, scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffbd57"/><stop offset="1" stop-color="#e2682c"/></linearGradient>
    <radialGradient id="g" cx="0.5" cy="0.25" r="0.75"><stop offset="0" stop-color="#2a3d33"/><stop offset="1" stop-color="#0b1210"/></radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  ${glyph(scale)}
</svg>`;

const outputs = [
  ["public/icons/icon-512.png", 512, 0.86],
  ["public/icons/icon-192.png", 192, 0.86],
  ["public/icons/maskable-512.png", 512, 0.62],
  ["src/app/apple-icon.png", 180, 0.8],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [path, size, scale] of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg(size, scale)}</body></html>`);
  await page.screenshot({ path, clip: { x: 0, y: 0, width: size, height: size } });
  console.log("wrote", path);
}
await browser.close();
