#!/usr/bin/env node
/**
 * 判据：`scripts/data/official_urls.json` 的 `_roles` 注里关于 **`sourceUrl` 行标签** 的括注，
 * 必须与**今天真的渲染出来的那句标签**一致，并且在括注里指明措辞的唯一出处。
 *
 * 为什么需要它：t8 复核发现该括注写着「渲染成「原始出处」行」，而 deals 侧的行标签
 * 早在 t7 就改成了「收录渠道」（`scripts/lib/audience.js` 的 `SOURCE_LABELS.origin`）——
 * 一份**自我声明**的注记没有任何判据盯着，改完标签它就悄悄变成了假话。
 *
 * 这条判据把三处串起来（任一处脱节都红）：
 *   ① `scripts/lib/audience.js` 的 `WORDING_CONTRACT.SOURCE_LABELS.origin`（措辞的唯一出处）
 *   ② `index.html` 的 `SOURCE_WORDING` 前端副本（由 `audience.checkWordingContract()` 逐字比）
 *   ③ `_roles` 注的括注（必须逐字引用 ①，并写明 plans 侧不渲染该字段）
 * 外加两条机械核对：plans 侧的行为（`plans-page.js` 把值原样贴进句子、`api-plans-page.js`
 * 没有给这个字段建标签表）必须仍然成立 —— 因为它们正是括注里那句「不渲染」的依据。
 *
 * 用法：
 *   node research/_raw/sources-residue-v1b/check-roles-note.js [--roles=<path>] [--json=<out>] [--quiet]
 *
 * 退出码：0 = 全部通过；1 = 有脱节（逐条打印原因）。
 * 只读、不联网、不读墙上时钟。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = name => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ROLES_PATH = opt('roles') ? path.resolve(opt('roles')) : path.join(ROOT, 'scripts', 'data', 'official_urls.json');
const QUIET = args.includes('--quiet');

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const audience = require(path.join(ROOT, 'scripts', 'lib', 'audience'));
const liveLabel = audience.WORDING_CONTRACT.SOURCE_LABELS.origin;
const note = JSON.parse(fs.readFileSync(ROLES_PATH, 'utf8'))._roles || '';

const plansPage = read('scripts/lib/plans-page.js');
const apiPlansPage = read('scripts/lib/api-plans-page.js');
const indexHtml = read('index.html');

const frontend = audience.checkWordingContract(indexHtml);

/** `case 'sourceUrl':` 之后 6 行里是否有原样透传（`String(value)`） */
function passthroughAfterCase(source, key) {
  const at = source.indexOf(`case '${key}':`);
  if (at < 0) return false;
  return source.slice(at, at + 400).includes('String(value)');
}

const checks = [
  {
    id: 'note-quotes-live-label',
    description: `_roles 注逐字引用今天渲染的标签「${liveLabel}」（出处：audience.js SOURCE_LABELS.origin）`,
    ok: note.includes(`「${liveLabel}」`),
    detail: note.includes(`「${liveLabel}」`) ? `注里出现了「${liveLabel}」` : `注里没有出现「${liveLabel}」—— 括注与渲染行为脱节`
  },
  {
    id: 'note-has-no-stale-term',
    description: '_roles 注不再把旧称「原始出处」写成本字段的行标签',
    ok: !note.includes('原始出处'),
    detail: note.includes('原始出处') ? '注里仍然残留「原始出处」' : '没有旧称'
  },
  {
    id: 'note-names-source-of-truth',
    description: '_roles 注指明措辞的唯一出处（`SOURCE_LABELS.origin` + `audience.js`）',
    ok: note.includes('SOURCE_LABELS.origin') && note.includes('audience.js'),
    detail: note.includes('SOURCE_LABELS.origin') && note.includes('audience.js') ? '已指明' : '没有指明唯一出处（下次改名无从对照）'
  },
  {
    id: 'note-states-plans-not-rendered',
    description: '_roles 注写明 plans 侧不渲染该字段的行标签',
    ok: /plans 侧/.test(note) && note.includes('不渲染'),
    detail: /plans 侧/.test(note) && note.includes('不渲染') ? '已写明' : '没有写明 plans 侧的行为'
  },
  {
    id: 'note-points-at-this-probe',
    description: '_roles 注指向本判据（可复核入口）',
    ok: note.includes('check-roles-note.js'),
    detail: note.includes('check-roles-note.js') ? '已指向' : '没有指向判据脚本'
  },
  {
    id: 'frontend-copy-agrees-with-lib',
    description: 'index.html 的 SOURCE_WORDING 前端副本与 lib 常量逐字一致（checkWordingContract）',
    ok: frontend.ok === true,
    detail: frontend.ok ? '一致' : `不一致：${frontend.reasons.join(' | ')}`
  },
  {
    id: 'plans-page-passes-value-through',
    description: 'plans 侧仍然只把该字段的值原样贴进句子（plans-page.js 的 case 后 String(value)）',
    ok: passthroughAfterCase(plansPage, 'sourceUrl'),
    detail: passthroughAfterCase(plansPage, 'sourceUrl') ? '成立' : 'plans-page.js 里不再是原样透传 —— 括注那句「不渲染」需要重新核对'
  },
  {
    id: 'api-plans-page-has-no-label-map',
    description: 'api-plans 侧没有给 plan.sourceUrl 建行标签表',
    ok: !apiPlansPage.includes("case 'sourceUrl':"),
    detail: apiPlansPage.includes("case 'sourceUrl':") ? 'api-plans-page.js 出现了 case \'sourceUrl\': —— 可能开始渲染标签了' : '成立'
  }
];

const failed = checks.filter(check => !check.ok);
const summary = {
  judgement: 'official_urls._roles 的 sourceUrl 行标签括注 ↔ 今天的渲染行为',
  rolesPath: path.relative(ROOT, ROLES_PATH).split(path.sep).join('/'),
  liveLabel,
  pass: failed.length === 0,
  checks
};

const jsonOut = opt('json');
if (jsonOut) fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(summary, null, 2) + '\n', 'utf8');

if (!QUIET) {
  console.log(`判据：official_urls._roles 的 sourceUrl 行标签括注 ↔ 渲染行为（live = 「${liveLabel}」）`);
  for (const check of checks) console.log(`  ${check.ok ? '✓' : '✗'} ${check.id} —— ${check.detail}`);
}
if (failed.length) {
  console.error(`\n❌ ${failed.length} / ${checks.length} 条脱节：${failed.map(check => check.id).join(', ')}`);
  process.exit(1);
}
if (!QUIET) console.log(`\n✅ ${checks.length} / ${checks.length} 条通过`);
process.exit(0);
