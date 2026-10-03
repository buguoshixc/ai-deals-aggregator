'use strict';
/**
 * T23 最后两项现场证据：
 *  E1 P1-10 面：把 /plans/api/ 的**第 8 列（免费额度/credits）**在现场产物里改成 credits → 期望 verify-site 判红并点名
 *  E2 P1-6 面：现场产物里「目录站来源」的措辞检查（存在"第三方收录页原文"档，且不把它写成"官方页面明写"）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const DIR = 'D:\\qc-t23\\extra\\R5-api-page';
const GOLD = 'D:\\qc-t23\\gold';
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const out = { E1: null, E2: null };

/* E1：第 8 列现场变异（freeTier 格文本） */
{
  const page = path.join(DIR, 'dist/plans/api/index.html');
  const goldPage = path.join(GOLD, 'dist/plans/api/index.html');
  const before = sha(page);
  const html = fs.readFileSync(page, 'utf8');
  const cell = html.match(/<td class="pfree">[^<]*<\/td>/);
  if (!cell) { out.E1 = { skipped: 'no-pfree-cell' }; console.log('E1 跳过：找不到 pfree 格'); }
  else {
    const mutatedCell = '<td class="pfree">credits 100 credits 长期有效，属于稳定长期免费能力</td>';
    fs.writeFileSync(page, html.replace(cell[0], mutatedCell));
    const r = spawnSync('node scripts/tools/verify-site.js --dir=dist', { cwd: DIR, shell: true, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
    const lines = `${r.stdout || ''}\n${r.stderr || ''}`.split('\n').filter(l => l.includes('✗'));
    fs.copyFileSync(goldPage, page);
    out.E1 = {
      mutation: `第 8 列（免费额度）格改成 ${JSON.stringify(mutatedCell)}（原：${cell[0].slice(0, 80)}…）`,
      verifySiteExit: r.status, failureLines: lines.slice(0, 3), restoredByteExact: sha(page) === before
    };
    console.log(`E1 第 8 列现场变异：verify-site exit=${r.status} · 恢复=${out.E1.restoredByteExact}`);
    lines.slice(0, 2).forEach(l => console.log('    ' + l.trim().slice(0, 220)));
  }
}

/* E2：目录站来源措辞（现场产物） */
{
  const dist = path.join(GOLD, 'dist');
  const files = [];
  const walk = (d, b = '') => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = b ? `${b}/${e.name}` : e.name;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, rel); else if (e.name.endsWith('.html')) files.push(rel);
    }
  };
  walk(dist);
  let collected = 0, officialClaim = 0, officialClaimSamples = [];
  for (const rel of files) {
    const html = fs.readFileSync(path.join(dist, rel), 'utf8');
    const c = (html.match(/第三方收录页原文（非官方页直引）/g) || []).length;
    collected += c;
    if (c > 0) {
      // 同一页里是否同时把该来源写成「官方页面明写」（只做粗粒度记录，供人工复核）
      const o = (html.match(/官方页面明写/g) || []).length;
      if (o > 0 && officialClaimSamples.length < 3) officialClaimSamples.push({ rel, collected: c, officialWording: o });
    }
    officialClaim += (html.match(/由官方原文推断/g) || []).length ? 1 : 0;
  }
  out.E2 = {
    pages: files.length,
    collectedWordingOccurrences: collected,
    pagesWithBothWording: officialClaimSamples,
    pagesWithInferredWording: officialClaim
  };
  console.log(`E2 措辞现场检查：HTML ${files.length} 页 · 「第三方收录页原文（非官方页直引）」出现 ${collected} 次 · 「由官方原文推断」出现在 ${officialClaim} 页 · 同页同时出现两档的样例 ${officialClaimSamples.length} 个`);
}

fs.mkdirSync(path.resolve(__dirname, 'logs'), { recursive: true });
fs.writeFileSync(path.resolve(__dirname, 'logs', 'E1-E2.json'), JSON.stringify(out, null, 2));
const bad = [];
if (out.E1 && out.E1.verifySiteExit === 0) bad.push('E1：第 8 列现场变异未被 verify-site 抓');
if (out.E1 && !out.E1.restoredByteExact) bad.push('E1：恢复不是逐字节一致');
if (!out.E2 || out.E2.collectedWordingOccurrences === 0) bad.push('E2：现场没有「第三方收录页原文」档措辞（与 T09 修复不符）');
console.log(bad.length ? `\n✗ ${bad.join(' / ')}` : '\n✅ E1/E2 符合预期');
process.exit(bad.length ? 1 : 0);
