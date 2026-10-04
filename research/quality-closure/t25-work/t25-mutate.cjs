/**
 * T25 变异harness（**只在 .qc-registry/sandbox 的树副本里跑**；共享树只读、逐字节还原）。
 *
 * 用法（cwd = <repo>/.qc-registry/sandbox）：
 *   node ../t25-mutate.cjs backup                  # 把将被改的文件备份到 ../t25-backup
 *   node ../t25-mutate.cjs m-swap-cells            # 变异 A（渲染层）：输入价 ↔ 输出价 对调
 *   node ../t25-mutate.cjs m-blank-cell            # 变异 B（渲染层）：某条记录的 cache 格置空
 *   node ../t25-mutate.cjs m-m19-shaped            # 变异 C（产物层）：两行 × 三个价格格互换（M19 形状）
 *   node ../t25-mutate.cjs restore                 # 从 ../t25-backup 逐字节还原
 *   node ../t25-mutate.cjs hash                    # 打印被改文件的 sha256
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SANDBOX = process.cwd();
const BACKUP = path.join(SANDBOX, '..', 't25-backup');
const LIB = path.join(SANDBOX, 'scripts', 'lib', 'models-page.js');
const PAGE = path.join(SANDBOX, 'dist', 'models', 'glm-4.5v', 'index.html');

const TARGET_ID = '646f01c662e6'; // 智谱的 API 记录：多变体（standard + long_context）

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function hashAll() {
  for (const [label, file] of [['scripts/lib/models-page.js', LIB], ['dist/models/glm-4.5v/index.html', PAGE]]) {
    console.log(`${fs.existsSync(file) ? sha256(file) : '(缺失)'}  ${label}`);
  }
}

function backup() {
  fs.mkdirSync(BACKUP, { recursive: true });
  for (const [name, file] of [['models-page.js', LIB], ['glm-4.5v.html', PAGE]]) {
    fs.copyFileSync(file, path.join(BACKUP, name));
  }
  console.log('已备份 models-page.js 与 glm-4.5v 产物页');
}

function restore() {
  fs.copyFileSync(path.join(BACKUP, 'models-page.js'), LIB);
  fs.copyFileSync(path.join(BACKUP, 'glm-4.5v.html'), PAGE);
  console.log('已从备份逐字节还原（无 git checkout）');
}

function patchLib(replacer, marker) {
  const text = fs.readFileSync(LIB, 'utf8');
  const next = replacer(text);
  if (next === text) throw new Error(`变异没有生效（锚点未命中）：${marker}`);
  fs.writeFileSync(LIB, next);
}

function main() {
  const mode = process.argv[2] || 'hash';
  if (mode === 'hash') { hashAll(); return 0; }
  if (mode === 'backup') { backup(); hashAll(); return 0; }
  if (mode === 'restore') { restore(); hashAll(); return 0; }

  if (mode === 'm-swap-cells') {
    // 渲染层：把「输入价」与「输出价」两个格对调（行身份、行数、单位文案全不变 —— M19 的形状）
    patchLib(text => text.replace(
      '    inputText: apiPlansPage.priceText(entry.rates ? entry.rates.input : null, plan.pricing && plan.pricing.currency),\n'
      + '    outputText: apiPlansPage.priceText(entry.rates ? entry.rates.output : null, plan.pricing && plan.pricing.currency),',
      '    inputText: apiPlansPage.priceText(entry.rates ? entry.rates.output : null, plan.pricing && plan.pricing.currency), // 变异 A：与下一格对调\n'
      + '    outputText: apiPlansPage.priceText(entry.rates ? entry.rates.input : null, plan.pricing && plan.pricing.currency),'
    ), 'inputText/outputText');
    console.log('变异 A 已注入：渲染层的输入价 ↔ 输出价 对调');
  } else if (mode === 'm-blank-cell') {
    // 渲染层：只把**这一条记录**的 cache 格置空（行仍在、行数不变、其它记录不受影响）
    patchLib(text => text.replace(
      '    cacheText: apiPlansPage.priceText(entry.rates ? entry.rates.cachedInput : null, plan.pricing && plan.pricing.currency),',
      `    cacheText: plan.id === '${TARGET_ID}' ? '' : apiPlansPage.priceText(entry.rates ? entry.rates.cachedInput : null, plan.pricing && plan.pricing.currency), // 变异 B：整格置空`
    ), 'cacheText');
    console.log(`变异 B 已注入：记录 ${TARGET_ID} 的 cache 格置空`);
  } else if (mode === 'm-m19-shaped') {
    // 产物层：M19 原始形状 —— 同一记录两行（standard / long_context）的三个价格格互换，行身份与行数不变
    const html = fs.readFileSync(PAGE, 'utf8');
    const rowRe = /<tr class="mapirow"[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRe) || [];
    if (rows.length !== 2) throw new Error(`夹具前置条件不满足：glm-4.5v 应有 2 行，实得 ${rows.length}`);
    const cellsOf = row => [...row.matchAll(/<td class="num">([\s\S]*?)<\/td>/g)].map(m => m[1]);
    const a = cellsOf(rows[0]);
    const b = cellsOf(rows[1]);
    const swap = (row, from, to) => {
      let out = row;
      for (let i = 0; i < 3; i += 1) {
        out = out.replace(`<td class="num">${from[i]}</td>`, `<td class="num">${to[i]}</td>`);
      }
      return out;
    };
    const next = html.replace(rows[0], swap(rows[0], a, b)).replace(rows[1], swap(rows[1], b, a));
    if (next === html) throw new Error('变异没有生效（三个价格格没有互换）');
    fs.writeFileSync(PAGE, next);
    console.log('变异 C 已注入：M19 形状（两行 × 输入/输出/Cache 三格互换）');
  } else {
    console.error(`未知模式：${mode}`);
    return 1;
  }
  hashAll();
  return 0;
}

process.exit(main());
