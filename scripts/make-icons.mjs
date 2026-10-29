// Generates icons/icon-{16,32,48,64,96,128}.png and the Chrome Web Store
// small promo tile (store-promo-440x280.png) with no dependencies.
// Run: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 64, 96, 128];
const SS = 4; // supersampling factor per axis

const LIGHT = [238, 238, 210];
const DARK = [118, 150, 86];
const ARROW = [255, 170, 0];

// Shape tests in unit coordinates (0..1).
const inRoundedRect = (x, y, r) => {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

const distToSegment = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

const inTriangle = (px, py, [ax, ay], [bx, by], [cx, cy]) => {
  const s = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = s(px, py, ax, ay, bx, by);
  const d2 = s(px, py, bx, by, cx, cy);
  const d3 = s(px, py, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

// Arrow from bottom-left to top-right.
const tail = [0.22, 0.78];
const tip = [0.82, 0.18];
const dir = [tip[0] - tail[0], tip[1] - tail[1]];
const len = Math.hypot(...dir);
const [ux, uy] = [dir[0] / len, dir[1] / len];
const [nx, ny] = [-uy, ux];
const headLen = 0.3, headHalf = 0.2, shaft = 0.075;
const base = [tip[0] - ux * headLen, tip[1] - uy * headLen];
const head = [
  tip,
  [base[0] + nx * headHalf, base[1] + ny * headHalf],
  [base[0] - nx * headHalf, base[1] - ny * headHalf],
];

const colorAt = (x, y) => {
  if (!inRoundedRect(x, y, 0.18)) return null;
  if (inTriangle(x, y, ...head) || distToSegment(x, y, ...tail, ...base) <= shaft) return ARROW;
  return (Math.floor(x * 2) + Math.floor(y * 2)) % 2 ? DARK : LIGHT;
};

// Promo tile: icon centred on a dark-green background, in pixel coordinates.
const PROMO_W = 440, PROMO_H = 280, PROMO_ICON = 200;
const PROMO_BG = [74, 98, 52];
const promoColorAt = (x, y) => {
  const ox = (PROMO_W - PROMO_ICON) / 2, oy = (PROMO_H - PROMO_ICON) / 2;
  return colorAt((x - ox) / PROMO_ICON, (y - oy) / PROMO_ICON) ?? PROMO_BG;
};

function render(w, h, colorFn) {
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorFn(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const i = (y * w + x) * 4;
      if (a) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
        px[i + 3] = Math.round((a / (SS * SS)) * 255);
      }
    }
  }
  return px;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const icon = render(size, size, (x, y) => colorAt(x / size, y / size));
  writeFileSync(new URL(`icon-${size}.png`, outDir), png(size, size, icon));
}
const promo = render(PROMO_W, PROMO_H, promoColorAt);
writeFileSync(new URL('../store-promo-440x280.png', import.meta.url), png(PROMO_W, PROMO_H, promo));
console.log('wrote', [...SIZES.map((s) => `icon-${s}.png`), 'store-promo-440x280.png'].join(', '));
