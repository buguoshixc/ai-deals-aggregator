#!/usr/bin/env node
/**
 * 中文翻译待办 / 脚手架。
 *
 * 用法：
 *   node scripts/tools/zh-todo.js                  # 列出待翻译条目（按厂商）
 *   node scripts/tools/zh-todo.js --json           # 输出机器可读清单
 *   node scripts/tools/zh-todo.js --scaffold       # 生成 translations_zh.json 骨架（已译的保留）
 *   node scripts/tools/zh-todo.js --orphans        # 只看对不上 id 的译文
 *   node scripts/tools/zh-todo.js --check          # 门禁视角：只回答「有没有要人处理的事」，带退出码
 *   node scripts/tools/zh-todo.js --file=xxx.json  # 换 deals.json
 *
 * 判定逻辑与构建期共用 scripts/lib/zh.js，不会出现「工具说不用翻、构建期说缺译文」。
 */

const fs = require('fs');
const path = require('path');
const { ZH_FIELDS, ZH_FIELD_LABELS, load, attach, isEnglishProse, cjkCount } = require('../lib/zh');

const ROOT = path.join(__dirname, '..', '..');

const NOTE = [
  '人工中文译文覆盖层。键 = deal.id（sha1(vendor|title|url) 前 12 位）。',
  '只放译文，绝不覆盖英文原文——英文原文字段一个字节都不改。',
  'src 是原文指纹：译文照抄的那段英文。英文被采集器改写后指纹对不上，',
  '该字段的译文会自动停用并在构建日志里催促复核，避免出现和原文矛盾的中文。',
  '维护方式：node scripts/tools/zh-todo.js 看清单 → 填译文 → --scaffold 盖指纹。'
].join(' ');

const args = process.argv.slice(2);
const has = name => args.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const dealsFile = path.resolve(ROOT, opt('file', 'deals.json'));
const overlayFile = path.resolve(ROOT, opt('overlay', path.join('scripts', 'data', 'translations_zh.json')));

const store = JSON.parse(fs.readFileSync(dealsFile, 'utf8'));
const deals = Array.isArray(store) ? store : store.deals || [];

const overlayFileExists = fs.existsSync(overlayFile);
const overlay = overlayFileExists
  ? load(overlayFile)
  : { byId: {}, note: '', file: overlayFile, missing: true };

const { deals: attached, report } = attach(deals, overlay);

if (has('orphans')) {
  if (!report.orphaned.length) {
    console.log('没有对不上 id 的译文。');
  } else {
    console.log(`对不上任何条目 id 的译文（${report.orphaned.length}）：`);
    for (const row of report.orphaned) console.log(`  ${row.id}  ${row.title}`);
    console.log('\nid = sha1(vendor|title|url) 前 12 位。条目改名/换 URL 后 id 会变，译文需要跟着改键。');
  }
  process.exit(0);
}

const todo = [];
for (const deal of attached) {
  const missingFields = report.missing.find(row => row.id === deal.id);
  if (!missingFields) continue;
  const partial = deal.zh ? Object.keys(deal.zh) : [];
  todo.push({
    id: deal.id,
    title: deal.title,
    vendor: deal.vendor,
    region: deal.region,
    type: deal.type,
    missing: missingFields.fields,
    translated: partial,
    text: Object.fromEntries(missingFields.fields.map(f => [f, deal[f]]))
  });
}

if (has('json')) {
  console.log(JSON.stringify({ total: todo.length, todo }, null, 2));
  process.exit(0);
}

if (has('check')) {
  // 门禁视角：不打印整份待办清单，只回答「有没有需要人来处理的事」，并给出退出码。
  //
  // 为什么是**建议性**门禁：译文对不上 id 的典型原因是条目改名/换 URL（id = sha1(vendor|title|url)），
  // 这时站点该照常发布（英文原文仍在，卡片只是少一条中文提示），但不该没人知道。
  // 所以 CI 里它写进运行 Summary 而不阻断发布；本地提交前可以直接跑，非零退出即有事要办。
  const drift = report.orphaned.length + report.stale.length + report.dropped + report.skipped.length;
  const pendingFields = todo.reduce((n, row) => n + row.missing.length, 0);
  const clean = drift === 0 && todo.length === 0;

  console.log(`译文门禁 · ${path.relative(ROOT, overlayFile)}`);
  console.log(`  已贴 ${report.attached} 条 / ${report.fields} 个字段（数据共 ${report.total} 条）`);
  console.log(
    `  ${drift ? '✗' : '✓'} 漂移 ${drift} 处` +
      `（对不上 id ${report.orphaned.length} · 原文已变停用 ${report.dropped} · 不合法 ${report.skipped.length}）`
  );
  console.log(`  ${todo.length ? '✗' : '✓'} 待译 ${todo.length} 条 / ${pendingFields} 个字段`);
  if (report.warnings.length) {
    console.log(`  ℹ️  无指纹 ${report.warnings.length} 处（原文被改写时发现不了，建议在覆盖层里补 src）`);
  }
  for (const row of report.orphaned) console.log(`    孤儿   [${row.id}] ${row.title}`);
  for (const row of report.stale) console.log(`    停用   [${row.id}] ${row.title}：${row.message}`);
  for (const row of report.skipped) console.log(`    不合法 [${row.id}] ${row.title}：${row.message}`);
  for (const row of todo) console.log(`    待译   [${row.id}] ${row.title}：${row.missing.join('/')}`);
  console.log(clean ? '\n✅ 译文与数据一致' : '\n❌ 需要人工处理（见上）');
  process.exit(clean ? 0 : 1);
}

if (has('scaffold')) {
  // 安全作者循环：先只写译文，再用 --scaffold 把当前英文「盖指纹」。
  // 已有指纹的字段一律不动——英文改了必须由人来复核，不能靠重跑工具悄悄追认。
  const next = { _note: overlay.note || NOTE, byId: {} };
  const blessed = [];
  const keptStale = [];
  let added = 0;

  for (const deal of attached) {
    const entry = overlay.byId[deal.id] ? { ...overlay.byId[deal.id] } : null;
    if (entry) next.byId[deal.id] = entry;
  }
  for (const [id, value] of Object.entries(overlay.byId)) {
    if (!next.byId[id]) next.byId[id] = value;
  }

  for (const deal of deals) {
    const entry = next.byId[deal.id];
    if (!entry) continue;
    if (!entry._title) entry._title = deal.title;
    const src = { ...(entry.src || {}) };
    for (const field of ZH_FIELDS) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) continue;
      const current = typeof deal[field] === 'string' ? deal[field] : '';
      if (src[field] === undefined) {
        if (!current) continue;
        src[field] = current;
        blessed.push(`${deal.title} · ${field}`);
        added++;
      } else if (src[field] !== current) {
        keptStale.push(`${deal.title} · ${field}（保留旧指纹，待人工复核）`);
      }
    }
    if (Object.keys(src).length) entry.src = src;
  }

  // 新条目：补上空槽位，方便直接填
  for (const row of todo) {
    const entry = next.byId[row.id] || {};
    if (!entry._title) entry._title = row.title;
    for (const field of row.missing) {
      if (!entry[field]) entry[field] = '';
    }
    next.byId[row.id] = entry;
  }

  fs.writeFileSync(overlayFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(`已写入 ${path.relative(ROOT, overlayFile)}：${Object.keys(next.byId).length} 条`);
  console.log(`本次新盖原文指纹 ${added} 个字段`);
  if (keptStale.length) {
    console.log(`\n以下字段英文已变，指纹保持不变（请复核译文）：`);
    keptStale.forEach(line => console.log(`  ⚠️  ${line}`));
  }
  process.exit(0);
}

/* ---------------------------------------------------------------- */
/* 默认：人类可读清单                                                */
/* ---------------------------------------------------------------- */

console.log(`数据源：${path.relative(ROOT, dealsFile)}（${deals.length} 条）`);
console.log(`覆盖层：${path.relative(ROOT, overlayFile)}${overlayFileExists ? '' : '（尚不存在）'}`);
console.log(`判定阈值：英文散文 = 拉丁字母 > 8 且（零汉字，或有零星汉字但含英文虚词）\n`);

console.log(`已译   ${report.attached} 条 / ${report.fields} 个字段`);
console.log(`待译   ${todo.length} 条 / ${todo.reduce((n, r) => n + r.missing.length, 0)} 个字段`);
if (report.dropped) console.log(`停用   ${report.dropped} 处译文（原文已变，见下）`);
if (report.orphaned.length) console.log(`孤儿   ${report.orphaned.length} 条译文对不上 id（--orphans 查看）`);
if (report.skipped.length) console.log(`不合法 ${report.skipped.length} 处译文（见下）`);
if (report.warnings.length) console.log(`无指纹 ${report.warnings.length} 处译文（原文变化时发现不了）`);
console.log('');

for (const err of report.stale) console.log(`  🔁 [${err.id}] ${err.title}: ${err.message}`);
for (const err of report.skipped) console.log(`  ⚠️  [${err.id}] ${err.title}: ${err.message}`);
for (const err of report.warnings) console.log(`  ℹ️  [${err.id}] ${err.title}: ${err.message}`);
if (report.stale.length || report.skipped.length || report.warnings.length) console.log('');

for (const row of todo) {
  const flag = row.translated.length ? `（已有 ${row.translated.map(f => ZH_FIELD_LABELS[f] || f).join('/')}）` : '';
  console.log(`● ${row.title}  [${row.vendor} · ${row.region} · ${row.id}]${flag}`);
  for (const field of row.missing) {
    const text = row.text[field];
    const cjk = cjkCount(text);
    console.log(`    ${(ZH_FIELD_LABELS[field] || field).padEnd(5)} ${field.padEnd(13)} ${cjk} 汉字 / ${text.length} 字`);
    console.log(`      ${text}`);
  }
  console.log('');
}

if (!todo.length) console.log('没有待翻译条目。');

/* 顺带体检：别把本来就是中文的条目误判进来（阈值放宽后人工抽查） */
const suspicious = attached.filter(deal => ZH_FIELDS.some(f => isEnglishProse(deal[f]) && cjkCount(deal[f]) >= 4));
if (suspicious.length) {
  console.log(`\n抽查提示：以下条目「有 4 个以上汉字却判为英文」，请确认不是误判——`);
  for (const deal of suspicious) {
    console.log(`  ${deal.title} [${deal.id}]`);
    ZH_FIELDS.filter(f => isEnglishProse(deal[f]) && cjkCount(deal[f]) >= 4)
      .forEach(f => console.log(`    ${f}: ${deal[f]}`));
  }
}
