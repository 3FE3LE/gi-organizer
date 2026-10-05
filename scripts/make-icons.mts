/**
 * The app's icons, drawn once and rendered to every size a platform asks for.
 *
 * "GI", in the app's accent on its own ink — the same two letters the header
 * sets in gold before "Organizer". Drawn as strokes rather than set as text,
 * so the output does not depend on which fonts the machine running this has.
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

const INK = '#0c0f17';
const GOLD = '#e3c68f';

/**
 * The two letters on a 512 grid, centred on 256: a G that is an open ring
 * closed by a bar into its middle, and an I with its serifs, both one stroke
 * weight so they read as one mark at 48px.
 */
const MARK = [
  // G: from the upper right, the long way round to the middle of the right
  // side, then in along the crossbar.
  'M 277.8 178.2 A 110 110 0 1 0 310 256 L 232 256',
  // I
  'M 350 146 H 420 M 385 146 V 366 M 350 366 H 420',
].join(' ');

function svg({ scale, rounded }: { scale: number; rounded: boolean }) {
  const r = rounded ? 112 : 0;
  // Scaled about the centre of the mark (252, 256), which is a hair left of
  // the canvas centre because the G is wider than the I.
  const transform = `translate(256 256) scale(${scale}) translate(-252 -256)`;

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
  <path d="${MARK}" transform="${transform}" fill="none" stroke="url(#gold)"
        stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

const out = path.join(process.cwd(), 'public', 'icons');
mkdirSync(out, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, scale: 0.8, rounded: true },
  { file: 'icon-512.png', size: 512, scale: 0.8, rounded: true },
  { file: 'maskable-512.png', size: 512, scale: 0.62, rounded: false },
  // iOS draws its own rounded corners and shows transparency as black.
  { file: 'apple-touch-icon.png', size: 180, scale: 0.78, rounded: false },
  // Bigger letters than the rest: at 16px on a tab, margin is what goes first.
  { file: 'favicon-64.png', size: 64, scale: 0.92, rounded: true },
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
