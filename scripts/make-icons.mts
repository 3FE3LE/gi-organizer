/**
 * The app's icons, drawn once and rendered to every size a platform asks for.
 *
 * The "GIO" mark from `src/lib/logo.ts`, in the app's accent on its own ink.
 * Drawn as paths rather than set as text, so the output does not depend on
 * which fonts the machine running this has.
 *
 * `maskable` is the same mark at a smaller scale on a full-bleed square:
 * Android crops maskable icons to its own shape and only promises the middle
 * 80% survives. Run with `node scripts/make-icons.mts`; the PNGs are committed.
 *
 * Rendered by the browser the test suite already installs, so drawing an icon
 * does not need an image library of its own.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

import { LOGO_FILLS, LOGO_STROKE_WIDTH, LOGO_STROKES, logoTransform } from '../src/lib/logo.ts';

const INK = '#0c0f17';
const GOLD = '#e3c68f';

function svg({ scale, rounded }: { scale: number; rounded: boolean }) {
  const r = rounded ? 112 : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="glow" cx="50%" cy="40%" r="62%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f3dfb2"/>
      <stop offset="100%" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${r}" fill="${INK}"/>
  <rect width="512" height="512" rx="${r}" fill="url(#glow)"/>
  <g transform="${logoTransform(scale)}">
    <path d="${LOGO_STROKES}" fill="none" stroke="url(#gold)" stroke-width="${LOGO_STROKE_WIDTH}"
          stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${LOGO_FILLS}" fill="url(#gold)"/>
  </g>
</svg>`;
}

const out = path.join(process.cwd(), 'public', 'icons');
mkdirSync(out, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, scale: 1.03, rounded: true },
  { file: 'icon-512.png', size: 512, scale: 1.03, rounded: true },
  // Inside the safe circle, crescent tips and all.
  { file: 'maskable-512.png', size: 512, scale: 0.8, rounded: false },
  // iOS draws its own rounded corners and shows transparency as black.
  { file: 'apple-touch-icon.png', size: 180, scale: 1, rounded: false },
  // Bigger than the rest: at 16px on a tab, margin is what goes first.
  { file: 'favicon-64.png', size: 64, scale: 1.06, rounded: true },
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const target of targets) {
  await page.setViewportSize({ width: target.size, height: target.size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${target.size}px;height:${target.size}px}</style>${svg(target)}`,
  );
  const file = path.join(out, target.file);
  await page.screenshot({ path: file, omitBackground: true });
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

await browser.close();
