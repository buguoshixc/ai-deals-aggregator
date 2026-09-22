/**
 * 针对两家低清 logo 再找一次官方高清版本：
 *  - 科大讯飞：站内 logo 资源 / apple-touch-icon
 *  - 商汤：站内 logo 图形（非词标）
 * 顺带记录所有候选的尺寸，便于人工挑选。
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const get = (url, ms = 15000) => new Promise((res) => {
  const req = https.get(url, { headers: { 'user-agent': UA, accept: '*/*' }, timeout: ms }, (r) => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return get(new URL(r.headers.location, url).toString(), ms).then(res); }
    const c = []; r.on('data', (x) => c.push(x)); r.on('end', () => res({ s: r.statusCode, type: r.headers['content-type'] || '', body: Buffer.concat(c) }));
  });
  req.on('error', () => res({ s: 0, type: '', body: Buffer.alloc(0) }));
  req.on('timeout', () => { req.destroy(); res({ s: 0, type: '', body: Buffer.alloc(0) }); });
});

function dims(b, url) {
  if (b.slice(0, 8).toString('hex') === '89504e470d0a1a0a') return { fmt: 'PNG', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.slice(0, 6).toString('ascii').trim().startsWith('<svg')) {
    const m = b.toString('utf8').match(/viewBox="[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)"/);
    return { fmt: 'SVG', w: m ? +m[1] : 0, h: m ? +m[2] : 0 };
  }
  if (/\.ico$/i.test(url) || b.readUInt16LE(2) === 1) return { fmt: 'ICO', w: 0, h: 0 };
  return { fmt: '?', w: 0, h: 0 };
}

const TARGETS = [
  ['iflytek', '科大讯飞', 'https://www.xfyun.cn/', ['logo', 'apple-touch', 'brand']],
  ['sensetime', '商汤', 'https://www.sensetime.com/', ['logo', 'icon', 'brand']]
];

(async () => {
  for (const [slug, name, site, keys] of TARGETS) {
    const page = await get(site);
    if (!page.s || page.s !== 200) { console.log(name + ' 首页不可达 (' + page.s + ')'); continue; }
    const html = page.body.toString('utf8');
    const cands = new Set();

    // <img src> / <link href> / 内联样式里的 url()，只要文件名含关键字
    for (const m of html.matchAll(/(?:src|href)=["']([^"']+\.(?:svg|png|webp))["']/gi)) {
      if (keys.some((k) => m[1].toLowerCase().includes(k))) { try { cands.add(new URL(m[1], site).toString()); } catch (e) {} }
    }
    for (const m of html.matchAll(/url\(([^)]+\.(?:svg|png|webp))\)/gi)) {
      const u = m[1].replace(/["']/g, '');
      if (keys.some((k) => u.toLowerCase().includes(k))) { try { cands.add(new URL(u, site).toString()); } catch (e) {} }
    }
    // apple-touch-icon 常见路径
    for (const p of ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png']) {
      try { cands.add(new URL(p, site).toString()); } catch (e) {}
    }

    console.log('\n### ' + name + ' 候选 ' + cands.size + ' 个');
    let best = null;
    for (const u of [...cands].slice(0, 14)) {
      const r = await get(u);
      if (r.s !== 200 || r.body.length < 300) continue;
      const d = dims(r.body, u);
      const score = d.fmt === 'SVG' ? 1e6 : d.w * d.h;
      console.log('   ' + d.fmt.padEnd(5) + (d.fmt === 'SVG' ? '矢量' : d.w + 'x' + d.h).padEnd(12) +
        (r.body.length / 1024).toFixed(1).padStart(7) + ' KB  ' + u.slice(0, 88));
      if (!best || score > best.score) best = { ...d, url: u, body: r.body, score };
    }
    if (best) {
      const ext = best.fmt === 'SVG' ? '.svg' : '.png';
      const out = path.join(__dirname, 'mockups', 'logos', slug + ext);
      fs.writeFileSync(out, best.body);
      for (const old of ['.png', '.svg', '.ico']) {
        const p = path.join(__dirname, 'mockups', 'logos', slug + old);
        if (old !== ext && fs.existsSync(p)) fs.unlinkSync(p);
      }
      console.log('   → 采用 ' + best.fmt + ' ' + (best.fmt === 'SVG' ? '矢量' : best.w + 'x' + best.h) + '  ' + slug + ext);
    } else {
      console.log('   → 无更优候选，保留现状');
    }
  }
})();
