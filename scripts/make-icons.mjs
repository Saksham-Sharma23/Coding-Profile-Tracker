/**
 * Draws the extension icon set into public/.
 *
 *   node scripts/make-icons.mjs
 *
 * Hand-rolled rather than pulling in a raster library: the mark is a rounded square
 * and a three-point trend line, which is a few lines of geometry, and a build-time
 * image dependency for four small PNGs is a poor trade. Everything is drawn in unit
 * space and supersampled 4x, so the same source produces a clean 16px and 128px.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 32, 48, 128];
const SAMPLES = 4;

// --viz-1 / --accent, the same blue the charts and the badge use.
const BG = [47, 111, 235];
const INK = [255, 255, 255];

const CORNER = 0.22;
// A rising zigzag, not a straight diagonal: the dip in the middle is what makes it
// read as a progress line rather than a swoosh.
const LINE = [
  [0.22, 0.7],
  [0.42, 0.48],
  [0.56, 0.6],
  [0.78, 0.3],
];
const STROKE = 0.05;
const DOT = 0.088;

function roundedRectContains(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * vx + (py - ay) * vy) / len2));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

function inkAt(x, y) {
  const end = LINE[LINE.length - 1];
  if (Math.hypot(x - end[0], y - end[1]) <= DOT) return true;
  for (let i = 0; i < LINE.length - 1; i++) {
    if (distanceToSegment(x, y, LINE[i], LINE[i + 1]) <= STROKE) return true;
  }
  return false;
}

/** RGBA scanlines, each prefixed with PNG filter byte 0. */
function render(size) {
  const rows = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;

  for (let py = 0; py < size; py++) {
    rows[offset++] = 0;
    for (let px = 0; px < size; px++) {
      let inside = 0;
      let ink = 0;

      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (!roundedRectContains(x, y, CORNER)) continue;
          inside++;
          if (inkAt(x, y)) ink++;
        }
      }

      const total = SAMPLES * SAMPLES;
      const alpha = inside / total;
      // Blend ink over the background within the covered area, then let coverage
      // drive alpha so the rounded corners stay smooth.
      const mix = inside === 0 ? 0 : ink / inside;
      for (let c = 0; c < 3; c++) {
        rows[offset++] = Math.round(BG[c] * (1 - mix) + INK[c] * mix);
      }
      rows[offset++] = Math.round(alpha * 255);
    }
  }
  return rows;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // 10-12: compression, filter, interlace — all 0.

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(render(size), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(resolve(ROOT, 'public'), { recursive: true });
for (const size of SIZES) {
  const file = resolve(ROOT, `public/icon-${size}.png`);
  writeFileSync(file, png(size));
  console.log(`Wrote public/icon-${size}.png`);
}
