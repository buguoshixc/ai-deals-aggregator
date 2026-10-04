#!/usr/bin/env node
/**
 * t33 验收 ③ 的第二半：**索引漂移保护**的证据。
 *
 * `sync-link-evidence.cjs` 不许按行号盲改：它先核对 `links[index].registrySlug` 是否等于预期的 slug，
 * 不等就拒绝（报「索引漂移，拒绝按索引改」）。本脚本在 **TEMP 隔离副本**上制造两种漂移并运行同一脚本，
 * 证明它拒绝改错行、且**不写盘**（原文件与副本都保持不变）：
 *   A. 把前两条映射换位 ⇒ 索引 31 上的东西变了；
 *   B. 把某条映射的 registrySlug 改名。
 *
 * 用法：node research/_raw/t32/prove-index-drift-guard.cjs
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'scripts', 'data', 'model-registry-links.json');
const SCRIPT = path.join(__dirname, 'sync-link-evidence.cjs');
const ORIGINAL = fs.readFileSync(SRC, 'utf8');

/** 在隔离副本上跑同一脚本（只把它的目标文件路径替换成副本路径） */
function runOn(mutate, label) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't33-drift-'));
  const doc = JSON.parse(ORIGINAL);
  mutate(doc);
  const target = path.join(tmp, 'model-registry-links.json');
  fs.writeFileSync(target, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  const before = fs.readFileSync(target, 'utf8');

  const patchedSource = fs.readFileSync(SCRIPT, 'utf8')
    .replace("const LINKS = path.join(ROOT, 'scripts', 'data', 'model-registry-links.json');", `const LINKS = ${JSON.stringify(target)};`);
  const patchedScript = path.join(tmp, 'sync-link-evidence.cjs');
  fs.writeFileSync(patchedScript, patchedSource, 'utf8');

  const result = spawnSync(process.execPath, [patchedScript], { encoding: 'utf8' });
  const after = fs.readFileSync(target, 'utf8');
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  console.log(`\n--- ${label} ---`);
  console.log(`  exit code: ${result.status}`);
  console.log('  输出：' + output.replace(/\n/g, '\n        '));
  console.log(`  副本是否被写坏: ${before !== after ? '**是（不该发生）**' : '否（拒绝改错行）'}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  return { status: result.status, untouched: before === after, output: `${result.stdout || ''}${result.stderr || ''}` };
}

console.log('索引漂移保护实测（在 TEMP 隔离副本上跑同一个 sync-link-evidence.cjs）');
// A 必须是**真把材料挪到 31 号位**的构造。两次踩坑记录（都是我构造写错，不是脚本没保护）：
//   ① 第一版用「前两条互换」—— 31 号位上的材料根本没变；
//   ② 第二版用 `[links[2], ...links.slice(0,2), ...links.slice(3)]` —— 长度守恒时那个 `slice(3)`
//      恰好又把原 31 号对象挪回了 31 号位（31 = 1 + 30）。长度守恒的换位对「固定索引」是很容易
//      把自己绕进去的，所以这里用**长度不守恒**的删头补尾式右移，确保 31 号位换人。
const a = runOn(doc => { doc.links = [...doc.links.slice(1), doc.links[0]]; }, 'A 删头补尾式右移（31 号位上的材料必换人）');
const b = runOn(doc => { doc.links[31] = { ...doc.links[31], registrySlug: 'glm-5.3-renamed' }; }, 'B 第 31 条的 registrySlug 改名');
const c = runOn(doc => { doc.links[31] = { ...doc.links[31], registrySlug: 'kimi-k3' }; }, 'C 第 31 条的 registrySlug 换成同一批里的另一条身份');

const results = [['A', a], ['B', b], ['C', c]];
// 判据：**每一种漂移都必须被拒绝（exit 1）+ 副本零改动**。两种守卫都算守住：
//   · 身份守卫：slug 与预期不符 ⇒「索引漂移，拒绝按索引改」（B/C 命中）
//   · 内容守卫：按 (index, slug) 定位到的那条抄件不是待同步的文本 ⇒「找不到待同步的抄件」（A 命中）
// 关键不变量是「**绝不按行号盲改**」——只要 exit!=0 且文件未被写坏，就没有改错行的可能。
const ok = results.every(([, r]) => r.status === 1 && r.untouched
  && (/索引漂移/.test(r.output) || /找不到待同步的抄件/.test(r.output)));
results.forEach(([label, r]) => console.log(`  ${label}: exit=${r.status} · 被守卫拦下=${/索引漂移|找不到待同步的抄件/.test(r.output)} · 副本零改动=${r.untouched}`));
console.log(`\n结论：${ok ? '✅ 三种漂移全部被拦下（exit 1 + 绝不写盘）：改名与换人由身份守卫拦，整体右移由内容守卫拦 —— 没有任何一种能走到「按行号盲改」' : '❌ 保护不足，需要加固'}`);
console.log(`原文件未被本次实测触碰: ${fs.readFileSync(SRC, 'utf8') === ORIGINAL}`);
process.exit(ok ? 0 : 1);
