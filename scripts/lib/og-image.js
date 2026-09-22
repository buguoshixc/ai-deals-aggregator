#!/usr/bin/env node
/**
 * 零依赖 OG 分享图生成：1200×630 的 PNG。
 *
 * 为什么不用 SVG：微信 / Twitter / 大部分社交平台的 unfurl 不渲染 SVG，og:image 必须是位图。
 * 为什么不装图像库：本项目刻意保持「构建不需要 npm install」（CI 里零依赖直接发布）。
 * 因此这里用 Node 内置 zlib 手写一个最小 PNG 编码器，文字用内置 5×7 点阵字模绘制。
 *
 * 取舍：点阵字模只能绘制 ASCII，中文摘要无法排版。这里只画品牌标记与站点名，
 * 不做复杂排版——分享图能显示、能辨识即可，不因此引入图像依赖。
 *
 * 用法：node scripts/lib/og-image.js [--out=dist/og-image.png]
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const WIDTH = 1200;
const HEIGHT = 630;

/** 品牌色（与 favicon.svg / index.html 的 --brand 一致） */
const BRAND = [0x43, 0x61, 0xee];
const WHITE = [0xff, 0xff, 0xff];
const INK = [0x16, 0x21, 0x3e];
const DEAL = [0xe1, 0x1d, 0x48];

/* ---------------- PNG 编码 ---------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** 无压缩过滤的原始扫描线（每行前导 filter byte = 0）→ PNG buffer */
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------- 画布 ---------------- */

function createCanvas(width, height, fill) {
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4] = fill[0];
    buf[i * 4 + 1] = fill[1];
    buf[i * 4 + 2] = fill[2];
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

function setPixel(buf, x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 4;
  if (alpha >= 1) {
    buf[i] = color[0];
    buf[i + 1] = color[1];
    buf[i + 2] = color[2];
    buf[i + 3] = 255;
    return;
  }
  buf[i] = Math.round(buf[i] * (1 - alpha) + color[0] * alpha);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - alpha) + color[1] * alpha);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - alpha) + color[2] * alpha);
  buf[i + 3] = 255;
}

function fillRect(buf, x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) setPixel(buf, x + dx, y + dy, color);
  }
}

/** 圆角矩形（半径以像素计） */
function fillRoundRect(buf, x, y, w, h, r, color) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      const py = y + dy;
      // 四个角做圆形裁剪
      const cx = dx < r ? x + r : (dx >= w - r ? x + w - r - 1 : px);
      const cy = dy < r ? y + r : (dy >= h - r ? y + h - r - 1 : py);
      if ((dx < r || dx >= w - r) && (dy < r || dy >= h - r)) {
        const ddx = px - cx;
        const ddy = py - cy;
        if (ddx * ddx + ddy * ddy > r * r) continue;
      }
      setPixel(buf, px, py, color);
    }
  }
}

/* ---------------- 5×7 点阵字模 ---------------- */

const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101']
};

const GLYPH_W = 5;
const GLYPH_H = 7;

/** 测量文本宽度（像素），scale 为放大倍数，letterSpacing 为额外字距 */
function textWidth(text, scale, letterSpacing = 1) {
  const n = text.length;
  if (!n) return 0;
  return n * (GLYPH_W * scale + letterSpacing) - letterSpacing;
}

function drawText(buf, text, x, y, scale, color, letterSpacing = 1) {
  let cursor = x;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch] || GLYPHS[' '];
    for (let gy = 0; gy < GLYPH_H; gy++) {
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            setPixel(buf, cursor + gx * scale + sx, y + gy * scale + sy, color);
          }
        }
      }
    }
    cursor += GLYPH_W * scale + letterSpacing;
  }
  return cursor;
}

/* ---------------- 组图 ---------------- */

const TITLE = 'AI DEALS AGGREGATOR';
const SUBTITLE = 'FREE TIER - STUDENT - NONPROFIT';

function render() {
  // 排版前置检查：点阵字模没有自动换行，溢出会被静默裁掉，因此先断言宽度放得下
  const markX = 96;
  const titleScale = 8;
  const titleWidth = textWidth(TITLE, titleScale, 3);
  if (markX + titleWidth > WIDTH - 48) {
    throw new Error(`OG 图标题超宽（${titleWidth}px），请调小 scale 或缩短文案`);
  }
  const footWidth = textWidth(SUBTITLE, 3, 2);
  if (markX + 4 + footWidth > WIDTH - 48) {
    throw new Error(`OG 图副标题超宽（${footWidth}px）`);
  }

  const canvas = createCanvas(WIDTH, HEIGHT, BRAND);

  // 右下角斜向装饰块，避免纯色过于单调
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (x + y > WIDTH + 180 && x + y < WIDTH + 420) {
        setPixel(canvas, x, y, [0x35, 0x50, 0xd8]);
      }
    }
  }

  // 左侧白色圆角标记（与 favicon 的蓝底白星呼应，这里用简化的 % 示意）
  const markSize = 132;
  const markY = 150;
  fillRoundRect(canvas, markX, markY, markSize, markSize, 28, WHITE);
  // % 符号：两个圆点 + 斜线
  fillRect(canvas, markX + 34, markY + 42, 14, 14, BRAND);
  fillRect(canvas, markX + 84, markY + 76, 14, 14, BRAND);
  for (let i = 0; i < 48; i++) {
    fillRect(canvas, markX + 74 - i, markY + 46 + i, 6, 6, BRAND);
  }

  // 标题与副标题
  const titleY = markY + markSize + 56;
  drawText(canvas, TITLE, markX, titleY, titleScale, WHITE, 3);

  const subScale = 3;
  const subY = titleY + GLYPH_H * titleScale + 34;
  drawText(canvas, SUBTITLE, markX + 4, subY, subScale, [0xcd, 0xd7, 0xff], 2);

  // 底部说明与强调条
  const footY = HEIGHT - 96;
  drawText(canvas, 'DAILY UPDATED - OFFICIAL LINKS ONLY', markX + 4, footY, 2, [0xb9, 0xc6, 0xff], 1);
  fillRect(canvas, markX + 4, HEIGHT - 118, 96, 5, DEAL);

  return encodePng(WIDTH, HEIGHT, canvas);
}

/** 自检：确认三处文字都真的画进了画布（而不是被裁掉或根本没渲染） */
function selfCheck(png) {
  const raw = zlib.inflateSync(readIdat(png));
  const stride = WIDTH * 4;
  const count = (predicate) => {
    let n = 0;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const i = y * (stride + 1) + 1 + x * 4;
        if (predicate(raw[i], raw[i + 1], raw[i + 2])) n++;
      }
    }
    return n;
  };

  const white = count((r, g, b) => r === 255 && g === 255 && b === 255);
  const pale = count((r, g, b) => r === 0xcd && g === 0xd7 && b === 0xff);
  const faint = count((r, g, b) => r === 0xb9 && g === 0xc6 && b === 0xff);

  if (white < 1000) throw new Error(`OG 图白色标记像素过少(${white})，标记可能没画出来`);
  if (pale < 100) throw new Error(`OG 图副标题像素过少(${pale})，文字可能没画出来`);
  if (faint < 100) throw new Error(`OG 图底部说明像素过少(${faint})，文字可能没画出来`);

  return { white, pale, faint };
}

/** 从 PNG buffer 取出 IDAT 数据 */
function readIdat(png) {
  const parts = [];
  let off = 8;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.slice(off + 4, off + 8).toString('ascii');
    if (type === 'IDAT') parts.push(png.slice(off + 8, off + 8 + len));
    off += 12 + len;
  }
  return Buffer.concat(parts);
}

function main() {
  const outArg = process.argv.find(a => a.startsWith('--out='));
  const out = outArg ? path.resolve(outArg.slice(6)) : path.join(__dirname, '..', '..', 'dist', 'og-image.png');
  const png = render();

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);

  const assertWidth = png.readUInt32BE(16);
  const assertHeight = png.readUInt32BE(20);
  if (assertWidth !== WIDTH || assertHeight !== HEIGHT) {
    throw new Error(`PNG 尺寸异常: ${assertWidth}x${assertHeight}`);
  }

  const stats = selfCheck(png);
  console.log(`已生成 ${path.relative(process.cwd(), out)}（${assertWidth}x${assertHeight}, ${(png.length / 1024).toFixed(1)} KB）`);
  console.log(`  自检：标记 ${stats.white}px · 副标题 ${stats.pale}px · 底部说明 ${stats.faint}px`);
}

if (require.main === module) main();

module.exports = { render, encodePng, selfCheck, textWidth, WIDTH, HEIGHT };
