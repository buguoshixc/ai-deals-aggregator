#!/usr/bin/env node
/**
 * 从厂商官网抓取品牌图标，补进 assets/logos/。
 *
 * 只做一件事：找到厂商官网自己发布的图标文件，下载到本地仓库。
 * 不热链 CDN（避免把访客 IP 交给第三方），也不从标题里拼字。
 *
 * 用法：
 *   node scripts/tools/fetch-logos.js            # 只探测，不写盘
 *   node scripts/tools/fetch-logos.js --write    # 写入 assets/logos/
 *   node scripts/tools/fetch-logos.js --only=openai,canva
 *
 * 抓到的文件仍必须在 assets/logos/manifest.json 里登记后才会被使用——
 * 下载和采用是两步，避免未经确认的图形直接上线。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'assets', 'logos');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const TIMEOUT = 15000;

/** key → 官网首页 + 已知图标路径（按优先级） */
const TARGETS = {
  openai: ['https://openai.com/', '/favicon.svg', '/favicon.ico', '/apple-touch-icon.png'],
  canva: ['https://www.canva.com/', '/favicon.ico', '/apple-touch-icon.png', '/favicon.svg'],
  cursor: ['https://cursor.com/', '/favicon.svg', '/apple-touch-icon.png', '/favicon.ico'],
  make: ['https://www.make.com/', '/favicon.ico', '/apple-touch-icon.png', '/favicon.svg'],
  n8n: ['https://n8n.io/', '/favicon.ico', '/apple-touch-icon.png', '/favicon.svg'],
  midjourney: ['https://www.midjourney.com/', '/apple-touch-icon.png', '/favicon.ico', '/favicon.svg'],
  huggingface: ['https://huggingface.co/', '/favicon.svg', '/apple-touch-icon.png', '/favicon.ico'],
  mistral: ['https://mistral.ai/', '/favicon.svg', '/apple-touch-icon.png', '/favicon.ico'],
  cohere: ['https://cohere.com/', '/favicon.svg', '/apple-touch-icon.png', '/favicon.ico'],
  together: ['https://www.together.ai/', '/favicon.svg', '/apple-touch-icon.png', '/favicon.ico'],
  ideogram: ['https://ideogram.ai/', '/favicon.ico', '/apple-touch-icon.png'],
  leonardo: ['https://leonardo.ai/', '/favicon.ico', '/apple-touch-icon.png', '/favicon.svg'],
  recraft: ['https://www.recraft.ai/', '/favicon.svg', '/apple-touch-icon.png', '/favicon.ico'],
  krea: ['https://www.krea.ai/', '/favicon.ico', '/apple-touch-icon.png'],
  xai: ['https://x.ai/', '/favicon.ico', '/apple-touch-icon.png', '/favicon.svg'],
  windsurf: ['https://windsurf.com/', '/favicon.ico', '/apple-touch-icon.png', '/favicon.svg']
};

async function get(url, asBuffer) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, signal: controller.signal, redirect: 'follow' });
    if (!res.ok) return { ok: false, status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, status: res.status, buf, text: asBuffer ? null : buf.toString('utf8') };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

/** 从 HTML 里挑出图标链接，优先 apple-touch-icon（通常最大） */
function iconLinks(html, baseUrl) {
  const found = [];
  const re = /<link\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    if (!/\brel\s*=\s*["']?[^"'>]*\b(icon|apple-touch-icon)\b/i.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!href) continue;
    const sizes = tag.match(/\bsizes\s*=\s*["']([^"']+)["']/i);
    let px = 0;
    if (sizes) {
      for (const size of sizes[1].split(/\s+/)) {
        const dim = size.match(/^(\d+)x(\d+)$/i);
        if (dim) px = Math.max(px, Math.min(Number(dim[1]), Number(dim[2])));
      }
    }
    let abs;
    try { abs = new URL(href[1], baseUrl).toString(); } catch (e) { continue; }
    found.push({ url: abs, px, svg: /\.svg(\?|$)/i.test(abs) });
  }
  // 优先大尺寸 PNG，其次 SVG（矢量不糊但常常是单色剪影），最后小图标
  return found.sort((a, b) => {
    if (a.svg !== b.svg) return a.svg ? 1 : -1;
    return b.px - a.px;
  }).map(item => item.url);
}

/** 识别图片格式（不信任扩展名） */
function sniff(buf) {
  if (buf.length > 8 && buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
    return { ext: 'png', format: 'PNG', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) {
    const w = buf[6] || 0, h = buf[7] || 0;
    return { ext: 'ico', format: 'ICO', w, h };
  }
  const head = buf.slice(0, 300).toString('utf8').trim();
  if (/^<\?xml|^<svg/i.test(head)) {
    const wm = head.match(/\bwidth\s*=\s*["'](\d+(?:\.\d+)?)/i);
    const hm = head.match(/\bheight\s*=\s*["'](\d+(?:\.\d+)?)/i);
    const vb = head.match(/\bviewBox\s*=\s*["']([\d.\s-]+)["']/i);
    let w = wm ? Math.round(Number(wm[1])) : 0;
    let h = hm ? Math.round(Number(hm[1])) : 0;
    if ((!w || !h) && vb) {
      const parts = vb[1].trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4) { w = w || Math.round(parts[2]); h = h || Math.round(parts[3]); }
    }
    return { ext: 'svg', format: 'SVG', w, h };
  }
  return null;
}

async function main() {
  const write = process.argv.includes('--write');
  const onlyArg = process.argv.find(a => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice(7).split(',').map(s => s.trim()).filter(Boolean) : null;
  const keys = Object.keys(TARGETS).filter(k => !only || only.includes(k));

  const results = [];
  for (const key of keys) {
    const [home, ...fallbacks] = TARGETS[key];
    process.stdout.write(`\n${key.padEnd(12)} ${home}\n`);

    const page = await get(home, false);
    const candidates = [];
    if (page.ok) candidates.push(...iconLinks(page.text, home));
    candidates.push(...fallbacks.map(p => new URL(p, home).toString()));

    const seen = new Set();
    let picked = null;
    for (const url of candidates) {
      if (seen.has(url)) continue;
      seen.add(url);
      const res = await get(url, true);
      if (!res.ok || !res.buf.length) { process.stdout.write(`   ✗ ${url} (${res.status || res.error})\n`); continue; }
      const info = sniff(res.buf);
      if (!info) { process.stdout.write(`   ✗ ${url} (无法识别的格式, ${res.buf.length}B)\n`); continue; }
      // ICO 不收：浏览器虽支持，但多尺寸调色板的 ICO 里挑哪一帧不可控
      if (info.ext === 'ico') { process.stdout.write(`   · ${url} (ICO ${info.w}x${info.h}，跳过)\n`); continue; }
      if (info.ext === 'png' && (info.w < 64 || info.h < 64)) {
        process.stdout.write(`   · ${url} (PNG ${info.w}x${info.h} 偏小，跳过)\n`);
        continue;
      }
      picked = { url, ...info, bytes: res.buf.length, buf: res.buf };
      break;
    }

    if (!picked) { process.stdout.write('   → 没找到可用图标\n'); results.push({ key, ok: false }); continue; }

    process.stdout.write(`   ✓ ${picked.url}\n     ${picked.format} ${picked.w}x${picked.h} · ${picked.bytes}B\n`);
    results.push({ key, ok: true, ...picked });
    if (write) {
      const file = `${key}.${picked.ext}`;
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, file), picked.buf);
      process.stdout.write(`     → 已写入 assets/logos/${file}（仍需在 manifest.json 登记）\n`);
    }
  }

  const ok = results.filter(r => r.ok);
  console.log(`\n可用的 ${ok.length}/${results.length} 个${write ? '（已写盘）' : '（仅探测，加 --write 才写盘）'}`);
  console.log('\n登记用的 manifest 片段：');
  for (const r of ok) {
    console.log(`  "${r.key}": { "kind": "file", "file": "${r.key}.${r.ext}", "source": "${r.url}", "quality": "${r.format === 'SVG' ? '矢量' : r.w >= 128 ? '高清' : '够用'}" },`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
