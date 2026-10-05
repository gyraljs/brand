// Generates every asset in dist/ from scripts/brand.mjs. Deterministic: same inputs, same bytes
// (PDF timestamps are pinned). Run with `pnpm build`.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  BLACK,
  BRIGHT,
  DEEP,
  SEGMENTS,
  SMALL,
  SORA_REGULAR,
  SORA_SEMIBOLD,
  VARIANTS,
  WORDMARK_VARIANTS,
  WHITE,
  WORDS,
  layoutHorizontal,
  layoutMark,
  layoutSmallMark,
  layoutStacked,
  layoutWordmark,
  outline,
  place,
  renderLayout,
  svgDoc,
} from './brand.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const manifest = [];
rmSync(DIST, { recursive: true, force: true });

function write(file, data, meta) {
  const path = join(DIST, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  manifest.push({ file, ...meta });
}

// ── Renderer ───────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage();

const html = (svg, w, h, unit = 'px', pageRule = '') =>
  `<!doctype html><html><head><style>${pageRule}html,body{margin:0;background:transparent}` +
  `svg{display:block;width:${String(w)}${unit};height:${String(h)}${unit}}</style></head><body>${svg}</body></html>`;

async function png(svg, file, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html(svg, w, h));
  write(file, await page.screenshot({ type: 'png', omitBackground: true }), { kind: 'png', width: w, height: h });
}

async function pdf(svg, file, wmm, hmm) {
  const rule = `@page{size:${String(wmm)}mm ${String(hmm)}mm;margin:0}`;
  await page.setContent(html(svg, wmm, hmm, 'mm', rule));
  const bytes = Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  // Pin timestamps so builds are reproducible.
  const pinned = bytes
    .toString('latin1')
    .replace(/\/(CreationDate|ModDate) \(D:[^)]*\)/g, (_m, key) => `/${key} (D:20261005000000+00'00')`);
  write(file, Buffer.from(pinned, 'latin1'), { kind: 'pdf' });
}

const dims = (viewBox, width) => [width, Math.round((width * viewBox[3]) / viewBox[2])];

// ── Layout × variant files ─────────────────────────────────────────────────────────────
const LAYOUTS = [
  {
    dir: 'mark',
    name: 'gyral-mark',
    layout: layoutMark(),
    variants: Object.keys(VARIANTS),
    pngs: [256, 512, 1024, 2048, 4096],
    mm: 80,
  },
  {
    // Below ~24px: drops the innermost half-turn, heavier stroke (BRAND.md "Minimum sizes").
    dir: 'mark-small',
    name: 'gyral-mark-small',
    layout: layoutSmallMark(),
    variants: Object.keys(VARIANTS),
    pngs: [16, 24, 32, 48, 64],
    mm: 12,
  },
  ...WORDS.flatMap((word) => [
    {
      dir: 'lockup-horizontal',
      name: `gyral-lockup-horizontal-${word}`,
      layout: layoutHorizontal(word),
      variants: Object.keys(VARIANTS),
      pngs: [512, 1024, 2048, 4096],
      mm: 200,
    },
    {
      dir: 'lockup-stacked',
      name: `gyral-lockup-stacked-${word}`,
      layout: layoutStacked(word),
      variants: Object.keys(VARIANTS),
      pngs: [512, 1024, 2048],
      mm: 120,
    },
    {
      dir: 'wordmark',
      name: `gyral-wordmark-${word}`,
      layout: layoutWordmark(word),
      variants: WORDMARK_VARIANTS,
      pngs: [512, 1024, 2048],
      mm: 160,
    },
  ]),
];

const sheet = [];
for (const entry of LAYOUTS) {
  const row = { title: entry.name, cells: [] };
  for (const variant of entry.variants) {
    const base = `${entry.dir}/${entry.name}-${variant}`;
    const svg = renderLayout(entry.layout, variant, `Gyral ${entry.name.replace('gyral-', '')} (${variant})`);
    write(`${base}.svg`, svg, { kind: 'svg' });
    const [, , vw, vh] = entry.layout.viewBox;
    await pdf(svg, `${base}.pdf`, entry.mm, Number(((entry.mm * vh) / vw).toFixed(2)));
    for (const width of entry.pngs) {
      const [w, h] = dims(entry.layout.viewBox, width);
      await png(svg, `${base}-${String(width)}.png`, w, h);
    }
    row.cells.push({ variant, file: `${base}.svg`, transparent: VARIANTS[variant].bg === null });
  }
  sheet.push(row);
}

// ── Web icons ──────────────────────────────────────────────────────────────────────────
const mark = layoutMark();
const small = layoutSmallMark();
const canvas = (size, rx, inner) =>
  svgDoc({
    viewBox: [0, 0, size, size],
    defs: inner.defs,
    body:
      (rx === null
        ? ''
        : `<rect width="${String(size)}" height="${String(size)}" rx="${String(rx)}" fill="${BLACK}"/>`) + inner.body,
    title: 'Gyral',
  });
const fullBleed = (size, inner) =>
  svgDoc({
    viewBox: [0, 0, size, size],
    defs: inner.defs,
    body: `<rect width="${String(size)}" height="${String(size)}" fill="${BLACK}"/>${inner.body}`,
    title: 'Gyral',
  });

const icoPngs = [];
for (const size of [16, 32, 48]) {
  const inner =
    size === 16
      ? place(small, 'on-black', { cx: 8, cy: 8, width: 13, small: true, stroke: SMALL.stroke16 })
      : place(mark, 'on-black', { cx: size / 2, cy: size / 2, width: size * 0.78 });
  const svg = canvas(size, size * 0.2, inner);
  await png(svg, `web/favicon-${String(size)}.png`, size, size);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html(svg, size, size));
  icoPngs.push({ size, data: await page.screenshot({ type: 'png', omitBackground: true }) });
}
write('web/favicon.ico', ico(icoPngs), { kind: 'ico', sizes: [16, 32, 48] });

await png(
  fullBleed(180, place(mark, 'on-black', { cx: 90, cy: 90, width: 108 })),
  'web/apple-touch-icon.png',
  180,
  180,
);
for (const size of [192, 512]) {
  await png(
    canvas(size, size * 0.22, place(mark, 'on-black', { cx: size / 2, cy: size / 2, width: size * 0.62 })),
    `web/icon-${String(size)}.png`,
    size,
    size,
  );
  await png(
    fullBleed(size, place(mark, 'on-black', { cx: size / 2, cy: size / 2, width: size * 0.5 })),
    `web/icon-maskable-${String(size)}.png`,
    size,
    size,
  );
}
write('web/favicon.svg', faviconSvg(), { kind: 'svg' });
write(
  'web/site.webmanifest',
  `${JSON.stringify(
    {
      name: 'Gyral',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      theme_color: BLACK,
      background_color: BLACK,
      display: 'standalone',
    },
    null,
    2,
  )}\n`,
  { kind: 'json' },
);

// ── Social ─────────────────────────────────────────────────────────────────────────────
await social('social/avatar-mark-500', 500, 500, place(mark, 'on-black', { cx: 250, cy: 250, width: 320 }));
await social(
  'social/avatar-gyraljs-500',
  500,
  500,
  place(layoutStacked('gyraljs'), 'on-black', { cx: 250, cy: 250, width: 390 }),
);
// Social cards: a large mark on the left; wordmark, tagline (two lines) and the org handle on
// the right. Everything sits inside a 64px (scaled) safe margin so GitHub's crops keep it.
for (const [name, w, h] of [
  ['social/og-1200x630', 1200, 630],
  ['social/github-social-1280x640', 1280, 640],
]) {
  const k = w / 1280;
  const markPart = place(mark, 'on-black', { cx: 300 * k, cy: h / 2, width: 380 * k });
  const textX = 560 * k;
  const word = outline('gyral', { font: SORA_SEMIBOLD, size: 168 * k, x: textX, y: h / 2 - 20 * k });
  const lines = ['Model-View-Intent web components', 'on the modern web platform.'].map((text, i) =>
    outline(text, { font: SORA_REGULAR, size: 34 * k, spacing: 0, x: textX + 6 * k, y: h / 2 + (62 + i * 48) * k }),
  );
  const handle = outline('github.com/gyraljs', {
    font: SORA_REGULAR,
    size: 28 * k,
    spacing: 0,
    x: textX + 6 * k,
    y: h / 2 + 200 * k,
  });
  await social(name, w, h, {
    defs: markPart.defs,
    body:
      markPart.body +
      `<path d="${word.d}" fill="${WHITE}"/>` +
      lines.map((l) => `<path d="${l.d}" fill="#D5D8E0"/>`).join('') +
      `<path d="${handle.d}" fill="#8EB0F6"/>`,
  });
}

async function social(name, w, h, inner) {
  const svg = svgDoc({
    viewBox: [0, 0, w, h],
    defs: inner.defs,
    body: `<rect width="${String(w)}" height="${String(h)}" fill="${BLACK}"/>${inner.body}`,
    title: 'Gyral',
  });
  write(`${name}.svg`, svg, { kind: 'svg' });
  await png(svg, `${name}.png`, w, h);
}

// ── Contact sheet ──────────────────────────────────────────────────────────────────────
const cells = sheet
  .map(
    (row) =>
      `<section><h2>${row.title}</h2><div class="row">${row.cells
        .map(
          (c) =>
            `<figure class="${c.transparent ? 'checker' : ''}"><img src="${c.file}" alt=""><figcaption>${c.variant}</figcaption></figure>`,
        )
        .join('')}</div></section>`,
  )
  .join('');
const webCells = [
  'web/favicon-16.png',
  'web/favicon-32.png',
  'web/favicon-48.png',
  'web/apple-touch-icon.png',
  'web/icon-192.png',
  'web/icon-maskable-192.png',
  'social/avatar-mark-500.png',
  'social/avatar-gyraljs-500.png',
]
  .map((f) => `<figure><img src="${f}" alt="" class="native"><figcaption>${f}</figcaption></figure>`)
  .join('');
const socialCells = ['social/og-1200x630.png', 'social/github-social-1280x640.png']
  .map((f) => `<figure><img src="${f}" alt="" class="wide"><figcaption>${f}</figcaption></figure>`)
  .join('');
write(
  'contact-sheet.html',
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Gyral brand kit: contact sheet</title><style>
body{margin:0;padding:32px;background:#ECEDF1;font:14px system-ui,sans-serif;color:#17181C}
h1{margin:0 0 24px}h2{font-size:15px;margin:24px 0 8px}
.row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}
figure{margin:0;padding:12px;background:#fff;border-radius:10px;display:flex;flex-direction:column;align-items:center;gap:6px}
figure img{height:110px;max-width:340px;object-fit:contain}
figure img.native{height:auto;max-width:none}
figure img.wide{height:200px;max-width:none}
.checker{background:repeating-conic-gradient(#9a9ca3 0 25%,#c4c6cc 0 50%) 0 0/16px 16px}
figcaption{font-size:12px;color:#3c3f48;background:#fff;padding:2px 6px;border-radius:4px}
</style></head><body><h1>Gyral brand kit — contact sheet</h1>${cells}<section><h2>Web and social</h2><div class="row">${webCells}</div><div class="row" style="margin-top:12px">${socialCells}</div></section></body></html>\n`,
  { kind: 'html' },
);
await page.setViewportSize({ width: 1800, height: 1000 });
await page.goto(`file://${join(DIST, 'contact-sheet.html')}`);
await page.waitForLoadState('networkidle');
const sheetPng = await page.screenshot({ type: 'png', fullPage: true });
writeFileSync(join(DIST, 'contact-sheet.png'), sheetPng);
manifest.push({ file: 'contact-sheet.png', kind: 'png' });

await browser.close();
manifest.sort((a, b) => a.file.localeCompare(b.file));
writeFileSync(join(DIST, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`brand: ${String(manifest.length + 1)} files in ${relative(ROOT, DIST)}/`);

// ── Helpers ────────────────────────────────────────────────────────────────────────────
/** favicon.svg: the small mark, deep palette in light tabs, bright palette in dark tabs. */
function faviconSvg() {
  const segs = SEGMENTS.filter((s) => !s.inner);
  const stops = (c) => `<stop offset="0" class="${c[0]}"/><stop offset="1" class="${c[1]}"/>`;
  const defs = segs
    .map(
      (s, i) =>
        `<linearGradient id="f${String(i)}" gradientUnits="userSpaceOnUse" x1="${String(s.from[0])}" y1="${String(s.from[1])}" x2="${String(s.to[0])}" y2="${String(s.to[1])}">${stops(s.c)}</linearGradient>`,
    )
    .join('');
  const css = (p) =>
    Object.entries(p)
      .map(([k, v]) => `.${k}{stop-color:${v}}`)
      .join('');
  const body = segs
    .map(
      (s, i) =>
        `<path d="${s.d}" fill="none" stroke-width="${String(SMALL.stroke)}" stroke-linecap="round" stroke="url(#f${String(i)})"/>`,
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SMALL.viewBox.join(' ')}"><title>Gyral</title>` +
    `<style>${css(DEEP)}@media (prefers-color-scheme: dark){${css(BRIGHT)}}</style><defs>${defs}</defs>${body}</svg>\n`
  );
}

/** An ICO file with PNG-encoded images (supported by every current browser and OS). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size, 0);
    e.writeUInt8(size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}
