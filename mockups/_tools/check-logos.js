/**
 * 正确的 PNG 解码（含 scanline filter 反演 + 调色板），把 logo 合成到白底后统计。
 * 之前那版忽略了 filter，导致读出的颜色是垃圾值（比如讯飞的洋红）。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const DIR = path.join(__dirname, 'mockups', 'logos');

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(buf) {
  let off = 8; const idat = [];
  let w = 0, h = 0, bd = 0, ct = 0, interlace = 0;
  let plte = null, trns = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.slice(off + 4, off + 8).toString('ascii');
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; interlace = data[12]; }
    if (type === 'PLTE') plte = data;
    if (type === 'tRNS') trns = data;
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (interlace) throw new Error('不支持隔行扫描');
  if (bd !== 8) throw new Error('只支持 8 位深，实际 ' + bd);

  const ch = ct === 0 ? 1 : ct === 2 ? 3 : ct === 3 ? 1 : ct === 4 ? 2 : 4;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = Buffer.alloc(h * stride);
  const bpp = ch; // 8 位深：每像素字节数即通道数

  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const prev = dst - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? px[dst + i - bpp] : 0;
      const b = y > 0 ? px[prev + i] : 0;
      const c = (i >= bpp && y > 0) ? px[prev + i - bpp] : 0;
      let v;
      if (ft === 0) v = x;
      else if (ft === 1) v = x + a;
      else if (ft === 2) v = x + b;
      else if (ft === 3) v = x + ((a + b) >> 1);
      else if (ft === 4) v = x + paeth(a, b, c);
      else throw new Error('未知 filter ' + ft);
      px[dst + i] = v & 0xff;
    }
  }

  // 转 RGBA
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, a = 255;
    if (ct === 6) { r = px[i * 4]; g = px[i * 4 + 1]; b = px[i * 4 + 2]; a = px[i * 4 + 3]; }
    else if (ct === 2) { r = px[i * 3]; g = px[i * 3 + 1]; b = px[i * 3 + 2]; }
    else if (ct === 0) { r = g = b = px[i]; }
    else if (ct === 4) { r = g = b = px[i * 2]; a = px[i * 2 + 1]; }
    else if (ct === 3) {
      const idx = px[i];
      r = plte[idx * 3]; g = plte[idx * 3 + 1]; b = plte[idx * 3 + 2];
      a = trns && idx < trns.length ? trns[idx] : 255;
    }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  const CT = { 0: '灰度', 2: 'RGB', 3: '索引', 4: '灰度+A', 6: 'RGBA' };
  return { w, h, rgba, ctName: CT[ct], ch, bd, plte: !!plte, trns: !!trns };
}

function analyze(img) {
  const { w, h, rgba } = img;
  const colors = new Map();
  let ink = 0; // 白底上"有墨"的像素：合到白底后不是纯白的
  let transparent = 0;
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = rgba[i + 3] / 255;
      if (a < 0.06) { transparent++; continue; }
      // 合成到白底
      const r = Math.round(rgba[i] * a + 255 * (1 - a));
      const g = Math.round(rgba[i + 1] * a + 255 * (1 - a));
      const b = Math.round(rgba[i + 2] * a + 255 * (1 - a));
      const dist = Math.round(Math.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2));
      if (dist > 24) {
        ink++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        const k = r + ',' + g + ',' + b;
        colors.set(k, (colors.get(k) || 0) + 1);
      }
    }
  }
  return {
    ink, transparent,
    inkPct: Math.round((ink / (w * h)) * 100),
    bbox: maxX < 0 ? '空' : (maxX - minX + 1) + 'x' + (maxY - minY + 1) + ' @(' + minX + ',' + minY + ')',
    bboxPct: maxX < 0 ? 0 : Math.round(((maxX - minX + 1) / w) * 100),
    top: [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => 'rgb(' + c + ')×' + n)
  };
}

console.log('文件'.padEnd(20) + '尺寸'.padEnd(11) + '类型'.padEnd(9) + '白底墨迹'.padEnd(14) + '内容尺寸'.padEnd(14) + '主色');
console.log('-'.repeat(104));
let suspect = 0;
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.png')).sort()) {
  const img = decodePng(fs.readFileSync(path.join(DIR, f)));
  const a = analyze(img);
  const bad = a.ink === 0 || a.bboxPct < 40;
  if (bad) suspect++;
  console.log(
    f.padEnd(20) + (img.w + 'x' + img.h).padEnd(11) + img.ctName.padEnd(9) +
    (a.ink + ' (' + a.inkPct + '%)').padEnd(14) + a.bbox.padEnd(14) +
    a.top.join(' ') + (bad ? '   ⚠' : '')
  );
}
console.log('\n可疑（墨迹为空或内容占比 <40%）: ' + suspect);
