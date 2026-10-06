#!/usr/bin/env node
/**
 * T4 独立字节对账（**不复用** T3 的 diff/nonhtml-sha256.cjs 与 diff/before-after-compare.cjs）。
 *
 * 复核目标（与 T3 对账，不是复用它的实现）：
 *   ① 两个产物目录里的**非 HTML 文件**逐个 sha256 相等（期望 117/117）；
 *   ② 两个产物目录里的 **HTML 页面**剥掉**全部** <style>…</style> 块后，正文逐字节相等（期望 186/186）；
 *   ③ 文件集合完全相等（新增 / 删除都必须为 0 —— 否则「数量相等」会把一增一删洗成一样）。
 *
 * 自己实现的三处「不共用」：
 *   · 目录枚举、文件类型判定自己写；
 *   · 剥样式用**自研状态机**（逐字符扫描 <style …> 到 </style>），不用正则一把梭，
 *     以便把「没有闭合标签」「CDATA/注释里的假 <style>」这类边界如实记下来；
 *   · 「正文相等」按**字节**比（Buffer.compare），不是先 toString 再比 —— 先解码会把
 *     非法 UTF-8 序列洗成同一个 U+FFFD，正是假绿最喜欢的角落。
 *
 * 用法：node byte-compare.cjs --a=dist.baseline --b=dist --out=.../verify/byte-compare.json
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 从脚本位置向上找 package.json，不靠写死的层级数（层级写错会静默指到 research/ 里）
const ROOT = (() => {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('找不到仓库根（package.json）');
})();
const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};
const trailArg = name => {
  const hit = process.argv.find(a => a === `--${name}`);
  return Boolean(hit);
};

const A = path.resolve(ROOT, arg('a') || 'dist.baseline');
const B = path.resolve(ROOT, arg('b') || 'dist');
const OUT = path.resolve(ROOT, arg('out') || path.join(__dirname, 'byte-compare.json'));

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

/** 目录枚举：返回 POSIX 相对路径 → 绝对路径（自己写，不借 T3 的 walk）。 */
function walk(dir) {
  const files = new Map();
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) files.set(path.relative(dir, full).split(path.sep).join('/'), full);
    }
  }
  return files;
}

const isHtml = rel => /\.html?$/i.test(rel);

/**
 * 剥掉全部 <style …>…</style> 块（连标签一起剥），返回 { body: Buffer, blocks, dangling }。
 * 手写状态机：先找 "<style"，再找它后面第一个 ">"，再找 "</style"；找不到闭合就记 dangling
 * 并**保留原样**（不静默吞掉 —— 吞掉等于把「样式没闭合」洗成「正文相同」）。
 */
function stripStyleBlocks(buf) {
  const lower = Buffer.from(buf.toString('latin1').toLowerCase(), 'latin1');
  const needleOpen = Buffer.from('<style', 'latin1');
  const needleOpenEnd = Buffer.from('>', 'latin1');
  const needleClose = Buffer.from('</style', 'latin1');
  const pieces = [];
  let cursor = 0;
  let blocks = 0;
  let dangling = 0;
  let removedBytes = 0;
  for (;;) {
    const open = lower.indexOf(needleOpen, cursor);
    if (open < 0) break;
    const openEnd = lower.indexOf(needleOpenEnd, open);
    if (openEnd < 0) { dangling++; break; }
    const close = lower.indexOf(needleClose, openEnd);
    if (close < 0) { dangling++; break; }
    const closeEnd = lower.indexOf(needleOpenEnd, close);
    if (closeEnd < 0) { dangling++; break; }
    pieces.push(buf.subarray(cursor, open));
    removedBytes += closeEnd + 1 - open;
    blocks++;
    cursor = closeEnd + 1;
  }
  pieces.push(buf.subarray(cursor));
  return { body: Buffer.concat(pieces), blocks, dangling, removedBytes };
}

/** 每个 <style> 块的**去重行集合**（只为报告，不是判据）。 */
function styleLines(buf) {
  const lines = new Set();
  const text = buf.toString('utf8');
  const re = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    for (const line of match[1].split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed) lines.add(trimmed);
    }
  }
  return lines;
}

const aFiles = walk(A);
const bFiles = walk(B);
const aKeys = [...aFiles.keys()].sort();
const bKeys = [...bFiles.keys()].sort();
const added = bKeys.filter(k => !aFiles.has(k));
const removed = aKeys.filter(k => !bFiles.has(k));
const common = aKeys.filter(k => bFiles.has(k));

const nonHtml = [];
const html = [];
for (const rel of common) {
  const aBuf = fs.readFileSync(aFiles.get(rel));
  const bBuf = fs.readFileSync(bFiles.get(rel));
  if (isHtml(rel)) {
    const aStripped = stripStyleBlocks(aBuf);
    const bStripped = stripStyleBlocks(bBuf);
    const equal = aStripped.body.length === bStripped.body.length && aStripped.body.compare(bStripped.body) === 0;
    html.push({
      path: rel,
      bytesBefore: aBuf.length, bytesAfter: bBuf.length,
      styleBlocksBefore: aStripped.blocks, styleBlocksAfter: bStripped.blocks,
      styleBytesBefore: aStripped.removedBytes, styleBytesAfter: bStripped.removedBytes,
      danglingBefore: aStripped.dangling, danglingAfter: bStripped.dangling,
      bodyBytes: aStripped.body.length,
      bodyEqual: equal,
      bodyShaBefore: sha256(aStripped.body), bodyShaAfter: sha256(bStripped.body),
      wholeFileEqual: aBuf.compare(bBuf) === 0
    });
  } else {
    const shaBefore = sha256(aBuf);
    const shaAfter = sha256(bBuf);
    nonHtml.push({
      path: rel, bytes: aBuf.length, bytesAfter: bBuf.length,
      shaBefore, shaAfter, equal: shaBefore === shaAfter
    });
  }
}

const htmlByIdentical = html.filter(item => item.wholeFileEqual);
const htmlBodyDiff = html.filter(item => !item.bodyEqual);
const nonHtmlDiff = nonHtml.filter(item => !item.equal);

// 样式块去重行集合差（只为报告：证明「差异只在样式块里」这条主张的形状）
const aStyle = new Set();
const bStyle = new Set();
for (const rel of common) {
  if (!isHtml(rel)) continue;
  for (const line of styleLines(fs.readFileSync(aFiles.get(rel)))) aStyle.add(line);
  for (const line of styleLines(fs.readFileSync(bFiles.get(rel)))) bStyle.add(line);
}
const styleOnlyInB = [...bStyle].filter(line => !aStyle.has(line));
const styleOnlyInA = [...aStyle].filter(line => !bStyle.has(line));

const report = {
  generatedAt: new Date().toISOString(),
  a: { dir: path.relative(ROOT, A).split(path.sep).join('/'), files: aKeys.length, html: aKeys.filter(isHtml).length, nonHtml: aKeys.filter(k => !isHtml(k)).length },
  b: { dir: path.relative(ROOT, B).split(path.sep).join('/'), files: bKeys.length, html: bKeys.filter(isHtml).length, nonHtml: bKeys.filter(k => !isHtml(k)).length },
  fileSet: { added, removed, common: common.length, equalSets: added.length === 0 && removed.length === 0 },
  nonHtml: {
    compared: nonHtml.length,
    equal: nonHtml.length - nonHtmlDiff.length,
    different: nonHtmlDiff.map(item => item.path),
    totalBytes: nonHtml.reduce((sum, item) => sum + item.bytes, 0)
  },
  html: {
    compared: html.length,
    bodyEqual: html.length - htmlBodyDiff.length,
    bodyDifferent: htmlBodyDiff.map(item => item.path),
    wholeFileEqual: htmlByIdentical.length,
    wholeFileDifferent: html.length - htmlByIdentical.length,
    styleBlocksBeforeTotal: html.reduce((sum, item) => sum + item.styleBlocksBefore, 0),
    styleBlocksAfterTotal: html.reduce((sum, item) => sum + item.styleBlocksAfter, 0),
    danglingBefore: html.reduce((sum, item) => sum + item.danglingBefore, 0),
    danglingAfter: html.reduce((sum, item) => sum + item.danglingAfter, 0),
    bodyBytesTotal: html.reduce((sum, item) => sum + item.bodyBytes, 0),
    styleOnlyInB, styleOnlyInA
  },
  files: { nonHtml, html }
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`A=${report.a.dir} files=${report.a.files} html=${report.a.html} nonHtml=${report.a.nonHtml}`);
console.log(`B=${report.b.dir} files=${report.b.files} html=${report.b.html} nonHtml=${report.b.nonHtml}`);
console.log(`文件集合：相等=${report.fileSet.equalSets} added=${added.length} removed=${removed.length} common=${common.length}`);
console.log(`① 非 HTML sha256 相等：${report.nonHtml.equal}/${report.nonHtml.compared}（不同 ${nonHtmlDiff.length}）`);
console.log(`② HTML 去 <style> 后正文相等：${report.html.bodyEqual}/${report.html.compared}（不同 ${htmlBodyDiff.length}）`);
console.log(`   整文件逐字节相同：${report.html.wholeFileEqual}/${report.html.compared}`);
console.log(`   样式块数 ${report.html.styleBlocksBeforeTotal} → ${report.html.styleBlocksAfterTotal} · 悬空 <style> ${report.html.danglingBefore} → ${report.html.danglingAfter}`);
console.log(`   样式行集合差：+${styleOnlyInB.length} / -${styleOnlyInA.length}（去重后）`);
console.log(`证据：${path.relative(ROOT, OUT).split(path.sep).join('/')}`);

const ok = report.fileSet.equalSets && nonHtmlDiff.length === 0 && htmlBodyDiff.length === 0
  && report.nonHtml.compared === 117 && report.html.compared === 186;
console.log(ok ? 'RESULT=OK' : 'RESULT=FAIL');
process.exit(ok ? 0 : 1);
