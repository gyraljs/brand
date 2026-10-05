// Single source of truth for the Gyral marks: geometry, palettes, layouts and SVG builders.
// Everything in dist/ is generated from this module by scripts/build.mjs. See BRAND.md.
import { readFileSync } from 'node:fs';
import opentype from 'opentype.js';

const fontFile = (name) => {
  const buf = readFileSync(new URL(`../fonts/${name}`, import.meta.url));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
export const SORA_SEMIBOLD = fontFile('Sora-SemiBold.ttf');
export const SORA_REGULAR = fontFile('Sora-Regular.ttf');

// ── Colours ────────────────────────────────────────────────────────────────────────────
export const BLACK = '#121317';
export const WHITE = '#FFFFFF';
/** Bright palette: for dark surfaces. */
export const BRIGHT = { blue: '#2F6FED', red: '#E5483B', yellow: '#F5B400', green: '#2E9E5B' };
/** Deep palette: for light surfaces (the yellow becomes amber to hold up on white). */
export const DEEP = { blue: '#2A63D6', red: '#D93A2E', yellow: '#C98F00', green: '#1F8A4C' };

// ── The mark: "Gyre B" ─────────────────────────────────────────────────────────────────
// A spiral of eight quarter-arcs in mark units (viewBox 24 24 60 60). Colour follows the
// angle around the loop, so every turn cycles blue → red → yellow → green.
export const SEGMENTS = [
  { d: 'M52 50 A4 4 0 0 0 48 46', from: [52, 50], to: [48, 46], c: ['blue', 'red'], inner: true },
  { d: 'M48 46 A4 4 0 0 0 44 50', from: [48, 46], to: [44, 50], c: ['red', 'yellow'], inner: true },
  { d: 'M44 50 A8 8 0 0 0 52 58', from: [44, 50], to: [52, 58], c: ['yellow', 'green'] },
  { d: 'M52 58 A8 8 0 0 0 60 50', from: [52, 58], to: [60, 50], c: ['green', 'blue'] },
  { d: 'M60 50 A14 14 0 0 0 46 36', from: [60, 50], to: [46, 36], c: ['blue', 'red'] },
  { d: 'M46 36 A14 14 0 0 0 32 50', from: [46, 36], to: [32, 50], c: ['red', 'yellow'] },
  { d: 'M32 50 A22 22 0 0 0 54 72', from: [32, 50], to: [54, 72], c: ['yellow', 'green'] },
  { d: 'M54 72 A22 22 0 0 0 76 50', from: [54, 72], to: [76, 50], c: ['green', 'blue'] },
];
export const STROKE = 7;
/** Visual bounds of the full mark at stroke 7 (round caps included), in mark units. */
export const MARK_BOX = { x: 28.5, y: 32.5, w: 51, h: 43 };
export const MARK_CENTER = [54, 54];
/** Small-size mark (< 24 px): innermost half-turn dropped, heavier stroke. */
export const SMALL = { stroke: 10, stroke16: 11, viewBox: [25.5, 29, 57, 50] };

/** Clear space around any layout: a quarter of the mark's height. */
export const CLEAR = 0.25 * MARK_BOX.h;

const r = (n) => Number(n.toFixed(3));

/**
 * The mark's SVG content in mark units.
 * style: { kind: 'gradient' | 'flat' | 'mono', palette, color }.
 */
export function markParts(style, { id = 'g', small = false, stroke } = {}) {
  const width = stroke ?? (small ? SMALL.stroke : STROKE);
  const segs = SEGMENTS.filter((s) => !(small && s.inner));
  if (style.kind === 'mono') {
    const common = `fill="none" stroke-width="${String(width)}" stroke-linecap="round"`;
    return { defs: '', body: `<path d="${segs.map((s) => s.d).join(' ')}" ${common} stroke="${style.color}"/>` };
  }
  // Joins use butt caps, each segment running slightly under the next (no antialiasing
  // seam); round caps would paint solid circles over the gradient at every join. The two
  // outer ends get round caps as circles drawn first, so only their outer halves show.
  const common = `fill="none" stroke-width="${String(width)}" stroke-linecap="butt"`;
  const first = segs[0];
  const last = segs[segs.length - 1];
  const capColor = (s, end) => (style.kind === 'flat' ? style.palette[s.c[0]] : style.palette[s.c[end ? 1 : 0]]);
  const caps =
    `<circle cx="${String(first.from[0])}" cy="${String(first.from[1])}" r="${String(width / 2)}" fill="${capColor(first, false)}"/>` +
    `<circle cx="${String(last.to[0])}" cy="${String(last.to[1])}" r="${String(width / 2)}" fill="${capColor(last, true)}"/>`;
  const d = (s, i) => (i === segs.length - 1 ? s.d : extended(s));
  if (style.kind === 'flat') {
    const body = segs.map((s, i) => `<path d="${d(s, i)}" ${common} stroke="${style.palette[s.c[0]]}"/>`).join('');
    return { defs: '', body: caps + body };
  }
  const defs = segs
    .map((s, i) => {
      const [x1, y1] = s.from;
      const [x2, y2] = s.to;
      return (
        `<linearGradient id="${id}${String(i)}" gradientUnits="userSpaceOnUse" x1="${String(x1)}" y1="${String(y1)}" x2="${String(x2)}" y2="${String(y2)}">` +
        `<stop offset="0" stop-color="${style.palette[s.c[0]]}"/><stop offset="1" stop-color="${style.palette[s.c[1]]}"/></linearGradient>`
      );
    })
    .join('');
  const body = segs.map((s, i) => `<path d="${d(s, i)}" ${common} stroke="url(#${id}${String(i)})"/>`).join('');
  return { defs, body: caps + body };
}

/** Overlap under the following segment, in mark units along the arc. */
const OVERLAP = 0.6;

/** The segment's arc extended past its end along the same circle (counter-clockwise). */
function extended(s) {
  const m = /A(\S+) \S+ 0 0 0/.exec(s.d);
  const radius = Number(m?.[1]);
  const [x1, y1] = s.from;
  const [x2, y2] = s.to;
  // Centre of a sweep-flag-0 quarter arc: the chord's midpoint pushed toward the inside.
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const half = Math.hypot(x2 - x1, y2 - y1) / 2;
  const h = Math.sqrt(radius * radius - half * half);
  const nx = (y2 - y1) / (2 * half);
  const ny = -(x2 - x1) / (2 * half);
  const cx = mx + nx * h;
  const cy = my + ny * h;
  const angle = Math.atan2(y2 - cy, x2 - cx) - OVERLAP / radius;
  const ex = cx + radius * Math.cos(angle);
  const ey = cy + radius * Math.sin(angle);
  return `M${String(x1)} ${String(y1)} A${String(radius)} ${String(radius)} 0 0 0 ${String(r(ex))} ${String(r(ey))}`;
}

// ── Wordmark: Sora SemiBold, outlined ──────────────────────────────────────────────────
export const LETTER_SPACING = -0.02; // em

/** Outlined text: path data and its bounds, at `size` with the baseline at (x, y). */
export function outline(text, { font = SORA_SEMIBOLD, size, x = 0, y = 0, spacing = LETTER_SPACING }) {
  const glyphs = font.stringToGlyphs(text);
  const scale = size / font.unitsPerEm;
  let pen = x;
  let d = '';
  const box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  glyphs.forEach((g, i) => {
    const path = g.getPath(pen, y, size);
    d += path.toPathData(3);
    const b = path.getBoundingBox();
    if (Number.isFinite(b.x1)) {
      box.x1 = Math.min(box.x1, b.x1);
      box.y1 = Math.min(box.y1, b.y1);
      box.x2 = Math.max(box.x2, b.x2);
      box.y2 = Math.max(box.y2, b.y2);
    }
    pen += g.advanceWidth * scale;
    const next = glyphs[i + 1];
    if (next) pen += font.getKerningValue(g, next) * scale + spacing * size;
  });
  return { d, box };
}

/** Ascender height of "l" as a fraction of the font size (used to align lockups). */
const ASCENT = 0.73;
const X_HEIGHT = SORA_SEMIBOLD.tables.os2.sxHeight / SORA_SEMIBOLD.unitsPerEm;

// ── Layouts (all coordinates in mark units) ────────────────────────────────────────────
// Horizontal: "l" ascender = 0.8 × mark height; the x-height band is centred on the mark;
// gap = 0.28 × mark height. Stacked: "gyral" is 1.25 × the mark's width; gap 0.22 × height.
export const HORIZONTAL = { ascender: 0.8, gap: 0.28 };
export const STACKED = { gyralWidth: 1.25, gap: 0.22 };

function box(x1, y1, x2, y2) {
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** The small-size mark (stroke 11) as a layout, for favicons. */
export function layoutSmallMark() {
  const half = SMALL.stroke16 / 2;
  const content = box(32 - half, 36 - half, 76 + half, 72 + half);
  return { viewBox: SMALL.viewBox, text: null, content, mark: true };
}

export function layoutMark() {
  const side = Math.max(MARK_BOX.w, MARK_BOX.h) + 2 * CLEAR;
  const [cx, cy] = MARK_CENTER;
  return { viewBox: [cx - side / 2, cy - side / 2, side, side], text: null, content: MARK_BOX, mark: true };
}

export function layoutHorizontal(word) {
  const H = MARK_BOX.h;
  const size = (HORIZONTAL.ascender * H) / ASCENT;
  const baseline = MARK_CENTER[1] + (X_HEIGHT * size) / 2;
  const probe = outline(word, { size });
  const left = MARK_BOX.x + MARK_BOX.w + HORIZONTAL.gap * H;
  const text = outline(word, { size, x: left - probe.box.x1, y: baseline });
  const content = box(
    MARK_BOX.x,
    Math.min(MARK_BOX.y, text.box.y1),
    text.box.x2,
    Math.max(MARK_BOX.y + MARK_BOX.h, text.box.y2),
  );
  return { viewBox: pad(content), text, content, mark: true };
}

export function layoutStacked(word) {
  const H = MARK_BOX.h;
  const ref = outline('gyral', { size: 1 });
  const size = (STACKED.gyralWidth * MARK_BOX.w) / (ref.box.x2 - ref.box.x1);
  const baseline = MARK_BOX.y + MARK_BOX.h + STACKED.gap * H + ASCENT * size;
  const probe = outline(word, { size });
  const width = probe.box.x2 - probe.box.x1;
  const text = outline(word, { size, x: MARK_CENTER[0] - width / 2 - probe.box.x1, y: baseline });
  const content = box(
    Math.min(MARK_BOX.x, text.box.x1),
    MARK_BOX.y,
    Math.max(MARK_BOX.x + MARK_BOX.w, text.box.x2),
    text.box.y2,
  );
  return { viewBox: pad(content), text, content, mark: true };
}

export function layoutWordmark(word) {
  const text = outline(word, { size: 100 });
  const content = box(text.box.x1, text.box.y1, text.box.x2, text.box.y2);
  return { viewBox: pad(content, 0.25 * ASCENT * 100), text, content, mark: false };
}

function pad(c, p = CLEAR) {
  return [c.x - p, c.y - p, c.w + 2 * p, c.h + 2 * p];
}

// ── Colour variants ────────────────────────────────────────────────────────────────────
export const VARIANTS = {
  'on-black': { mark: { kind: 'gradient', palette: BRIGHT }, text: WHITE, bg: BLACK },
  'on-white': { mark: { kind: 'gradient', palette: DEEP }, text: BLACK, bg: WHITE },
  'transparent-dark': { mark: { kind: 'gradient', palette: BRIGHT }, text: WHITE, bg: null },
  'transparent-light': { mark: { kind: 'gradient', palette: DEEP }, text: BLACK, bg: null },
  'flat-on-black': { mark: { kind: 'flat', palette: BRIGHT }, text: WHITE, bg: BLACK },
  'flat-on-white': { mark: { kind: 'flat', palette: DEEP }, text: BLACK, bg: WHITE },
  'flat-transparent-dark': { mark: { kind: 'flat', palette: BRIGHT }, text: WHITE, bg: null },
  'flat-transparent-light': { mark: { kind: 'flat', palette: DEEP }, text: BLACK, bg: null },
  'mono-white': { mark: { kind: 'mono', color: WHITE }, text: WHITE, bg: null },
  'mono-black': { mark: { kind: 'mono', color: '#000000' }, text: '#000000', bg: null },
};
/** Wordmark-only layouts have no mark, so flat variants would duplicate the gradient ones. */
export const WORDMARK_VARIANTS = Object.keys(VARIANTS).filter((v) => !v.startsWith('flat-'));
export const WORDS = ['gyral', 'gyraljs'];

// ── SVG documents ──────────────────────────────────────────────────────────────────────
export function svgDoc({ viewBox, defs = '', body, bg = null, title }) {
  const [x, y, w, h] = viewBox.map(r);
  const rect = bg
    ? `<rect x="${String(x)}" y="${String(y)}" width="${String(w)}" height="${String(h)}" fill="${bg}"/>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${[x, y, w, h].join(' ')}" role="img" aria-label="${title}">` +
    `<title>${title}</title>${defs ? `<defs>${defs}</defs>` : ''}${rect}${body}</svg>\n`
  );
}

/** A layout in a colour variant, as a standalone SVG document. */
export function renderLayout(layout, variantName, title) {
  const v = VARIANTS[variantName];
  const parts = layout.mark ? markParts(v.mark) : { defs: '', body: '' };
  const text = layout.text ? `<path d="${layout.text.d}" fill="${v.text}"/>` : '';
  return svgDoc({ viewBox: layout.viewBox, defs: parts.defs, body: parts.body + text, bg: v.bg, title });
}

/**
 * Places a layout's content (without its clear-space padding) into a fixed canvas:
 * scaled to `width` (or `height`), centred at (cx, cy). Returns SVG markup in canvas units.
 */
export function place(layout, variantName, { cx, cy, width, height, id = 'g', small = false, stroke }) {
  const v = VARIANTS[variantName];
  const c = layout.content;
  const s = width !== undefined ? width / c.w : height / c.h;
  const tx = cx - (c.x + c.w / 2) * s;
  const ty = cy - (c.y + c.h / 2) * s;
  const parts = layout.mark ? markParts(v.mark, { id, small, stroke }) : { defs: '', body: '' };
  const text = layout.text ? `<path d="${layout.text.d}" fill="${v.text}"/>` : '';
  return {
    defs: parts.defs,
    body: `<g transform="translate(${String(r(tx))} ${String(r(ty))}) scale(${String(r(s))})">${parts.body}${text}</g>`,
  };
}
