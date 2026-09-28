#!/usr/bin/env node
/**
 * 文本清洗自测（零依赖、纯本地、秒级）。
 *
 * 为什么单独一个文件：`cleanText()` 是**所有**用户可见文本的唯一入口，
 * 它同时被 schema 的字段上限、validateDeal 的「存进去就已经是规范形态」复核、
 * 以及 lib/zh.js 的译文原文指纹依赖。改动它的后果不是局部的，所以它需要自己的牙。
 *
 * 它盯的是两条纪律：
 *  ① 「上游截断 / 我们截断」都必须留下 `…`，不能让读者把断句当成完整句；
 *  ② 上限是硬的（补记号先让位），且清洗是幂等的（不幂等会把好数据判成坏数据）。
 *
 * 用法：node scripts/tools/text-selftest.js
 */

const { cleanText } = require('../lib/schema');
const { loadDeals } = require('../lib/store');

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    return;
  }
  failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

function checkEqual(name, actual, expected) {
  check(name, actual === expected, `期望 ${JSON.stringify(expected)}，实得 ${JSON.stringify(actual)}`);
}

/** 结果是否「没有切在半个词中间」：去掉记号后的正文必须是原文前缀，且原文的下一个字符是空格/结尾 */
function notMidWord(raw, result) {
  const body = result.replace(/…$/, '');
  if (raw.indexOf(body) !== 0) return false;
  if (body.length >= raw.length) return true;
  return raw[body.length] === ' ';
}

/* ------------------------------------------------------------------ */
console.log('=== 1) 上游的截断残尾必须被保留成记号 ===');

checkEqual('「...」结尾 → 保留为「…」', cleanText('Getsolved 将检测和重写整...'), 'Getsolved 将检测和重写整…');
checkEqual('「…」结尾 → 保留为「…」', cleanText('Getsolved 将检测和重写整…'), 'Getsolved 将检测和重写整…');
checkEqual('「... 」带尾空格 → 保留为「…」', cleanText('模型何时引用您的品牌。它适合希望获得 ... '), '模型何时引用您的品牌。它适合希望获得…');
checkEqual('只有省略号 → 空串（不返回一个孤零零的记号）', cleanText('...'), '');
checkEqual('空值 / 空白 → 空串', cleanText('   ') === '' ? '' : cleanText('   '), '');

// 幂等：第二次清洗不能把记号吃掉、也不能再补一个
for (const raw of ['a...', 'a…', '中文一句完整的话。。。'.replace(/。/g, '。'), 'x'.repeat(300), '中文'.repeat(120)]) {
  for (const cap of [20, 40, 60, 200]) {
    const once = cleanText(raw, cap);
    checkEqual(`幂等（cap=${cap}）：${JSON.stringify(raw.slice(0, 12))}…`, cleanText(once, cap), once);
  }
}

/* ------------------------------------------------------------------ */
console.log('\n=== 2) 我们按上限切：补记号、不越界、不切在半个词中间 ===');

for (const cap of [20, 40, 60, 120, 200, 240]) {
  const long = 'The quick brown fox jumps over the lazy dog. '.repeat(12);
  const out = cleanText(long, cap);
  check(`英文超长（cap=${cap}）以「…」结尾`, out.endsWith('…'), JSON.stringify(out.slice(-14)));
  check(`英文超长（cap=${cap}）长度不超上限`, out.length <= cap, `${out.length} > ${cap}`);
}

const midWordRaw = 'arch, benefits, and relocation plans for veterans of the armed forces';
const midWordOut = cleanText(midWordRaw, 40);
check('不在半个词中间切（`relocation pla` 那种残词不再出现）', notMidWord(midWordRaw, midWordOut),
  JSON.stringify(midWordOut));

const cjkOut = cleanText('这是一句很长的中文说明'.repeat(12), 40);
check('中文超长也补记号', cjkOut.endsWith('…') && cjkOut.length <= 40, `${cjkOut.length} 字`);

// 上限是硬的：恰好卡满时也要给记号让位
const exact = 'x'.repeat(60);
checkEqual('正好等于上限、无需记号 → 原样返回', cleanText(exact, 60), exact);
const exactCut = '文'.repeat(60) + '...';
const exactOut = cleanText(exactCut, 60);
check('上游截断 + 正好超上限 → 长度仍不越界', exactOut.length <= 60 && exactOut.endsWith('…'), `${exactOut.length} 字`);

/* ------------------------------------------------------------------ */
console.log('\n=== 3) 既有清洗行为不许退化 ===');

checkEqual('去零宽字符', cleanText('a\u200bb\ufeffc'), 'abc');
checkEqual('压缩空白与换行', cleanText('a\n\n  b\t c'), 'a b c');
checkEqual('首尾空白', cleanText('  a b  '), 'a b');

/* ------------------------------------------------------------------ */
console.log('\n=== 4) 数据不变量：存进 deals.json 的文本必须已经是规范形态 ===');

const CAPS = {
  title: 150, description: 200, discountInfo: 240, vendor: 60,
  source: 40, priceLine: 60, eligibility: 120, validity: 60
};
const deals = loadDeals();
const dirty = [];
const asciiEllipsis = [];
for (const deal of deals) {
  for (const [field, cap] of Object.entries(CAPS)) {
    const value = deal[field];
    if (typeof value !== 'string' || !value) continue;
    if (cleanText(value, cap) !== value) dirty.push(`${deal.id}.${field}`);
    if (/\.\.\.\s*$/.test(value)) asciiEllipsis.push(`${deal.id}.${field}`);
  }
}
check('每条已存文本都已是 cleanText 的规范形态（跑一次清洗不会变）', dirty.length === 0,
  dirty.slice(0, 8).join('、'));
check('没有字段以 ASCII「...」结尾（规范记号只有「…」）', asciiEllipsis.length === 0,
  asciiEllipsis.slice(0, 8).join('、'));

/* ------------------------------------------------------------------ */
console.log(`\n${failures.length ? '❌' : '✅'} 文本清洗自测：${pass} 项通过，${failures.length} 项失败`);
failures.forEach(message => console.error(`   - ${message}`));
if (failures.length) process.exit(1);
