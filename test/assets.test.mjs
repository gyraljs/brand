import { strict as assert } from 'node:assert';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { XMLValidator } from 'fast-xml-parser';
import { VARIANTS, WORDMARK_VARIANTS, WORDS } from '../scripts/brand.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [relative(DIST, path)];
  });
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file) {
  const buf = readFileSync(join(DIST, file));
  assert.equal(buf.toString('latin1', 1, 4), 'PNG', `${file} is not a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const svgs = walk(DIST).filter((f) => f.endsWith('.svg'));

describe('manifest', () => {
  it('lists exactly the files in dist/', () => {
    const listed = manifest.map((e) => e.file).sort();
    const actual = walk(DIST)
      .filter((f) => f !== 'manifest.json')
      .sort();
    assert.deepEqual(listed, actual);
  });

  it('records the real size of every PNG', () => {
    for (const entry of manifest.filter((e) => e.kind === 'png' && e.width)) {
      assert.deepEqual(pngSize(entry.file), { width: entry.width, height: entry.height }, entry.file);
    }
  });

  it('has every layout in every variant as SVG and PDF', () => {
    const expected = [
      ...Object.keys(VARIANTS).map((v) => `mark/gyral-mark-${v}`),
      ...WORDS.flatMap((w) =>
        Object.keys(VARIANTS).flatMap((v) => [
          `lockup-horizontal/gyral-lockup-horizontal-${w}-${v}`,
          `lockup-stacked/gyral-lockup-stacked-${w}-${v}`,
        ]),
      ),
      ...WORDS.flatMap((w) => WORDMARK_VARIANTS.map((v) => `wordmark/gyral-wordmark-${w}-${v}`)),
    ];
    for (const base of expected) {
      for (const ext of ['svg', 'pdf']) assert.ok(existsSync(join(DIST, `${base}.${ext}`)), `${base}.${ext}`);
    }
  });
});

describe('svg', () => {
  it('finds SVGs to check', () => assert.ok(svgs.length > 50));

  for (const file of svgs) {
    it(`${file} is well-formed, outlined and titled`, () => {
      const src = readFileSync(join(DIST, file), 'utf8');
      assert.equal(XMLValidator.validate(src), true);
      assert.doesNotMatch(src, /<text[\s>]/, 'text must be outlined');
      assert.match(src, /viewBox="[\d.\s-]+"/);
      assert.match(src, /<title>[^<]+<\/title>/);
    });

    it(`${file} has finite path data and closed letters`, () => {
      const src = readFileSync(join(DIST, file), 'utf8');
      for (const [, d, fill] of src.matchAll(/<path d="([^"]*)" fill="([^"]*)"/g)) {
        assert.doesNotMatch(d, /NaN|Infinity/);
        // Filled paths are outlined letters (the mark is stroked): every contour ends with Z.
        if (fill !== 'none') for (const contour of d.split(/(?=M)/)) assert.match(contour, /Z$/, contour);
      }
    });
  }
});

describe('pdf', () => {
  it('every PDF starts with a PDF header', () => {
    for (const file of walk(DIST).filter((f) => f.endsWith('.pdf'))) {
      assert.equal(readFileSync(join(DIST, file)).toString('latin1', 0, 5), '%PDF-', file);
    }
  });
});

describe('web', () => {
  it('favicon.ico holds 16, 32 and 48 px PNG images', () => {
    const buf = readFileSync(join(DIST, 'web/favicon.ico'));
    assert.equal(buf.readUInt16LE(0), 0);
    assert.equal(buf.readUInt16LE(2), 1);
    const count = buf.readUInt16LE(4);
    const sizes = [];
    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16;
      const size = buf.readUInt8(entry) || 256;
      const offset = buf.readUInt32LE(entry + 12);
      assert.equal(buf.toString('latin1', offset + 1, offset + 4), 'PNG');
      assert.equal(buf.readUInt32BE(offset + 16), size);
      sizes.push(size);
    }
    assert.deepEqual(sizes, [16, 32, 48]);
  });

  it('favicon.svg adapts to the colour scheme', () => {
    assert.match(readFileSync(join(DIST, 'web/favicon.svg'), 'utf8'), /prefers-color-scheme:\s*dark/);
  });

  it('icons and social images have their platform sizes', () => {
    const sizes = {
      'web/apple-touch-icon.png': [180, 180],
      'web/icon-192.png': [192, 192],
      'web/icon-512.png': [512, 512],
      'web/icon-maskable-192.png': [192, 192],
      'web/icon-maskable-512.png': [512, 512],
      'social/avatar-mark-500.png': [500, 500],
      'social/avatar-gyraljs-500.png': [500, 500],
      'social/og-1200x630.png': [1200, 630],
      'social/github-social-1280x640.png': [1280, 640],
    };
    for (const [file, [width, height]] of Object.entries(sizes)) {
      assert.deepEqual(pngSize(file), { width, height }, file);
    }
  });

  it('site.webmanifest references icons that exist', () => {
    const wm = JSON.parse(readFileSync(join(DIST, 'web/site.webmanifest'), 'utf8'));
    assert.ok(wm.icons.some((i) => i.purpose === 'maskable'));
    for (const icon of wm.icons) assert.ok(existsSync(join(DIST, 'web', icon.src)), icon.src);
  });
});
