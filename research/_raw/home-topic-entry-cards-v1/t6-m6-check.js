#!/usr/bin/env node
/**
 * T6 自证探针（T3 自己维护，替代队长那份已删除的临时探针 `_captain-m6-check.js`）：
 * **只给基础 `.need-grid` 规则**（含 `display:grid` 的那条）注入 `overflow-x:auto`，
 * 跑一遍完整 `verify-site.js`，把**变红的断言名（去重）**打出来，然后 byte-exact 还原。
 *
 * 这是复核者 T4 的原始 finding 形态：5 列、内容本来就没溢出（grid 的 scrollWidth == clientWidth），
 * 页面级 scrollWidth 照旧正常、卡片也全在视口内 —— 「溢出被容器吃掉」这条路，
 * 只看页面级溢出/卡片越界的老断言永远看不见。所以要证明的判据是**计算样式**：
 * `.need-grid` / `.needs` 的 overflow-x ∉ {auto, scroll}。
 *
 * 退出码语义（比队长那版更硬，免得「跑不掉」被当成「跑过」）：
 *   0 = 实验跑通 + 还原 byte-exact + **确实变红了**（新断言有牙）
 *   1 = 变红断言数 0（断言没有牙 —— 这正是 T6 要修的缺陷本身）
 *   2 = 起点不是已知良好产物 / 锚点命中数不符（拒绝注入）/ 还原后字节不等
 *
 * 用法：node research/_raw/home-topic-entry-cards-v1/t6-m6-check.js [预期变红断言名子串]
 * 默认预期子串 = '都不是横向滚动容器'。
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const F = path.join(ROOT, 'dist', 'index.html');
const EXPECT_SHA = '8076370E3C7AF29A3C3B6289A57B3B0C673DA033CD1CC8432CFA7FA7652E5242';
const EXPECT_NAME = process.argv[2] || '都不是横向滚动容器';
const sha = b => crypto.createHash('sha256').update(b).digest('hex').toUpperCase();

// ① 起点必须是已知良好产物
const orig = fs.readFileSync(F);
console.log('start sha256 =', sha(orig));
if (sha(orig) !== EXPECT_SHA) {
  console.error('✗ 起点不是已知良好产物，中止');
  process.exit(2);
}

// ② 注入：命中含 display:grid 的那条基础规则；注入前**逐个校验命中数**
const src = orig.toString('utf8');
const ALL_RE = /\.need-grid\s*\{([^}]*)\}/g;
const all = [...src.matchAll(ALL_RE)];
const base = all.filter(m => /display:\s*grid/.test(m[1]));
console.log(`锚点校验：.need-grid 规则共 ${all.length} 条（期望 4），其中含 display:grid 的 ${base.length} 条（期望 1）`);
if (all.length !== 4 || base.length !== 1) {
  console.error('✗ 锚点命中数与期望不符，拒绝注入');
  process.exit(2);
}
let injected = 0;
const mut = src.replace(ALL_RE, (whole, decl) => {
  if (!/display:\s*grid/.test(decl)) return whole;
  injected++;
  return `.need-grid {${decl} overflow-x:auto; }`;
});
console.log('injected =', injected, '（只注入基础规则）');
if (injected !== 1) { console.error('✗ 注入处数 ≠ 1'); process.exit(2); }

// ③ 跑完整套件
fs.writeFileSync(F, Buffer.from(mut, 'utf8'));
let out = '';
try {
  try {
    out = execFileSync('node', ['scripts/tools/verify-site.js'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  const names = [...new Set(out.split('\n').filter(l => /^\s*✗/.test(l)).map(l => l.replace(/^\s*✗\s*/, '').split(' — ')[0].trim()))];
  const total = (out.match(/验收\s*(\d+)\s*项，失败\s*(\d+)\s*项/) || []);
  console.log(`套件结果：${total[0] || '(没抓到汇总行)'}`);
  console.log(`变红断言（去重）${names.length} 条：`);
  names.forEach(n => console.log('  ✗ ' + n));
  const hit = names.filter(n => n.includes(EXPECT_NAME));
  console.log(`其中含「${EXPECT_NAME}」的 ${hit.length} 条`);
  if (hit.length === 0) {
    console.error(`✗ 没有一条变红断言的名字含「${EXPECT_NAME}」—— 新断言没有牙`);
    restore(orig);
    process.exit(1);
  }
} finally {
  restore(orig);
}

function restore(original) {
  fs.writeFileSync(F, original);
  const back = fs.readFileSync(F);
  const same = Buffer.compare(original, back) === 0;
  console.log('restored sha256 =', sha(back), 'byteExact =', same);
}
const back = fs.readFileSync(F);
if (Buffer.compare(orig, back) !== 0) { console.error('✗ 还原后字节不等'); process.exit(2); }
console.log('✓ 还原 byte-exact，且新断言确实变红');
