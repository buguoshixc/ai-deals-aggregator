#!/usr/bin/env node
/**
 * 数据文件注记 ↔ 渲染措辞的自测：零依赖、离线、秒级。
 *
 * 为什么必须有这条牙（t8/t16 实测的现场）：
 *   `scripts/data/official_urls.json` 的 `_roles` 注里写着「② `deal.sourceUrl` / `plan.sourceUrl`
 *   = 收录渠道（渲染成「原始出处」行）」—— 而 deal 侧那一行的标签早在 t7 就改成了「收录渠道」
 *   （`scripts/lib/audience.js` 的 `SOURCE_LABELS.origin`）。注记是**自我声明**：
 *   它写错了，页面照常、构建照常、门禁全绿，只有读它的人会被误导。
 *   同类风险对整个仓库成立：凡是「注记里逐字引用了一个会变的措辞/路径」，都需要一条把它
 *   钉回**唯一出处**的判据 —— 这条自测就是那个形状的第一个实例。
 *
 * 它把四处串起来，任一处脱节即红：
 *   ① `scripts/lib/audience.js` 的 `WORDING_CONTRACT.SOURCE_LABELS.origin`（措辞的唯一出处）
 *   ② `index.html` 的 `SOURCE_WORDING` 前端副本（由 `audience.checkWordingContract()` 逐字比）
 *   ③ `_roles` 注的括注（必须逐字引用 ①，写明 plans 侧不渲染该字段，并指向本自测）
 *   ④ plans 侧的行为依据：`plans-page.js` 仍把该字段原样透传、`api-plans-page.js` 没有给它建标签表
 *      （③ 里那句「不渲染」的成立条件就是这两条）
 *
 * 用法：node scripts/tools/roles-note-selftest.js [--roles=<path>]
 *   `--roles=` 只给变异实验用（指向一份被改坏的副本），门禁里不带参数、只认仓库那一份。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const audience = require('../lib/audience');

const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
const ROLES_PATH = arg('roles') ? path.resolve(arg('roles')) : path.join(ROOT, 'scripts', 'data', 'official_urls.json');
const ROLES_REL = path.relative(ROOT, ROLES_PATH).split(path.sep).join('/');

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { pass++; return; }
  failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const liveLabel = audience.WORDING_CONTRACT.SOURCE_LABELS.origin;
const note = JSON.parse(fs.readFileSync(ROLES_PATH, 'utf8'))._roles || '';
const plansPage = read('scripts/lib/plans-page.js');
const apiPlansPage = read('scripts/lib/api-plans-page.js');
const frontend = audience.checkWordingContract(read('index.html'));

/** `case '<key>':` 之后 400 字符内是否有原样透传（`String(value)`） */
function passthroughAfterCase(source, key) {
  const at = source.indexOf(`case '${key}':`);
  if (at < 0) return false;
  return source.slice(at, at + 400).includes('String(value)');
}

const plansPassthrough = passthroughAfterCase(plansPage, 'sourceUrl');
const apiPlansHasLabelMap = apiPlansPage.includes("case 'sourceUrl':");

/* ------------------------------------------------------------------ */
/* ① 注记里的行标签 = 今天的 live 措辞                                  */
/* ------------------------------------------------------------------ */

console.log('=== ① 注记里的行标签 ↔ live 措辞常量 ===');
check(`注里逐字引用今天的标签「${liveLabel}」（出处：audience.js 的 SOURCE_LABELS.origin）`,
  note.includes(`「${liveLabel}」`),
  '括注与渲染行为脱节：注里没有出现 live 值');
check('注里不再把旧称「原始出处」写成本字段的行标签',
  !note.includes('原始出处'),
  '注里仍然残留旧称「原始出处」');

/* ------------------------------------------------------------------ */
/* ② 注记必须指得回唯一出处与可复核入口                                 */
/* ------------------------------------------------------------------ */

console.log('=== ② 注记必须指明唯一出处与可复核入口 ===');
check('注里指明措辞的唯一出处（`SOURCE_LABELS.origin` + `audience.js`）',
  note.includes('SOURCE_LABELS.origin') && note.includes('audience.js'),
  '没有指明唯一出处 —— 下次改名就无从对照');
check('注里写明 plans 侧不渲染该字段的行标签',
  /plans 侧/.test(note) && note.includes('不渲染'),
  '没有写明 plans 侧的行为');
check('注里指向本自测（可复核入口）',
  note.includes('roles-note-selftest.js'),
  '没有指向判据脚本');

/* ------------------------------------------------------------------ */
/* ③ 前端副本与 lib 常量一致（跨层措辞漂移）                            */
/* ------------------------------------------------------------------ */

console.log('=== ③ 前端副本 ↔ lib 常量 ===');
check('index.html 的 SOURCE_WORDING 与 lib 常量逐字一致（checkWordingContract）',
  frontend.ok === true,
  frontend.ok ? '' : frontend.reasons.join(' | '));

/* ------------------------------------------------------------------ */
/* ④ 注里那句「不渲染」的依据仍然成立                                    */
/* ------------------------------------------------------------------ */

console.log('=== ④ plans 侧仍然只把该字段当值用 ===');
check('plans-page.js 的 `case \'sourceUrl\':` 之后仍是原样透传（String(value)）',
  plansPassthrough,
  'plans 侧不再是原样透传 —— 注里那句「不渲染」需要重新核对');
check('api-plans-page.js 里没有给 plan.sourceUrl 建标签表',
  !apiPlansHasLabelMap,
  "api-plans-page.js 出现了 case 'sourceUrl': —— 可能开始渲染标签了");

/* ------------------------------------------------------------------ */
/* 现场读数（0 也要打印：「跑了、干净」与「没跑」必须长得不一样）        */
/* ------------------------------------------------------------------ */

const quotesLive = note.includes(`「${liveLabel}」`);
const hasStaleTerm = note.includes('原始出处');
console.log(`   现场读数：注记文件 ${ROLES_REL}`);
console.log(`   · live 标签 =「${liveLabel}」· 注里出现 = ${quotesLive ? '是' : '否'} · 旧称残留 = ${hasStaleTerm ? '是' : '否'}`);
console.log(`   · 前端副本一致 = ${frontend.ok ? '是' : '否'} · plans 侧原样透传 = ${plansPassthrough ? '是' : '否'} · api-plans 标签表 = ${apiPlansHasLabelMap ? '有' : '无'}`);

/* ------------------------------------------------------------------ */

console.log(`\n${failures.length ? '❌' : '✅'} roles-note 自测：${pass} 项通过，${failures.length} 项失败`);
if (failures.length) {
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
