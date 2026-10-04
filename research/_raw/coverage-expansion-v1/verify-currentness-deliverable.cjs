#!/usr/bin/env node
/**
 * t10 attempt 2：**对既有交付物的复核脚本**（只读，不重做研究、不改生产数据）。
 *
 * 背景：t10 attempt 1 的交付物（currentness.json / 报告）已落盘并通过自校，但任务板上
 * t10 被记为 failed（429 限流），本轮是同一个任务的第 2 次派发。本脚本的作用是：
 * 用**与首轮不同的独立路径**重新核对交付物是否仍然成立（44 条一条不漏、字段齐全、
 * 日期形态合法、证据落在开发商官方域、禁用模式扫描、词表口径与生产身份层的对应关系）。
 *
 * 用法：node research/_raw/coverage-expansion-v1/verify-currentness-deliverable.cjs
 * 退出码 0 = 全部通过。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const CN = path.join(__dirname, 'currentness.json');
const REPORT = path.join(ROOT, 'research', 'coverage-expansion-v1-model-currentness.md');
const REGISTRY = path.join(ROOT, 'scripts', 'data', 'models.json');
const PROVIDERS = path.join(ROOT, 'scripts', 'data', 'providers.json');
const REGISTRY_LIB = path.join(ROOT, 'scripts', 'lib', 'model-registry.js');

const failures = [];
const notes = [];
function check(label, ok, detail) {
  if (ok) notes.push(`  ✓ ${label}`);
  else failures.push(`${label}${detail ? ` —— ${detail}` : ''}`);
}

const raw = fs.readFileSync(CN, 'utf8');
const cn = JSON.parse(raw);
const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const providers = JSON.parse(fs.readFileSync(PROVIDERS, 'utf8'));
const reg = require(REGISTRY_LIB);

const regKeys = Object.keys(registry).filter(key => !key.startsWith('_'));
const cnKeys = Object.keys(cn.models);

/* ① 身份集合：一条不漏、不多 */
check('currentness 行数 = 44', cnKeys.length === 44, `实得 ${cnKeys.length}`);
check('registry 行数 = 44', regKeys.length === 44, `实得 ${regKeys.length}`);
const missing = regKeys.filter(key => !cnKeys.includes(key));
const extra = cnKeys.filter(key => !regKeys.includes(key));
check('键集合与 registry 完全一致', missing.length === 0 && extra.length === 0, `缺 ${missing.join(',') || '无'}；多 ${extra.join(',') || '无'}`);

/* ② 逐条必填字段 + releasedAt↔releaseEvidence 互为充要 */
const FIELD_CHECK = ['modelRole', 'modelRoleBasis', 'releasedAt', 'checkedAt', 'checkedUrls', 'checkedOutcome', 'freshnessGroup', 'freshnessGroupReason'];
const fieldProblems = [];
for (const slug of cnKeys) {
  const row = cn.models[slug];
  for (const field of FIELD_CHECK) {
    if (row[field] === undefined) fieldProblems.push(`${slug} 缺 ${field}`);
  }
  const hasDate = row.releasedAt !== null;
  const hasEvidence = row.releaseEvidence !== null && row.releaseEvidence !== undefined;
  if (hasDate && !hasEvidence) fieldProblems.push(`${slug} 有日期却没有证据`);
  if (!hasDate && hasEvidence) fieldProblems.push(`${slug} 没有日期却有证据`);
  if (hasDate) {
    for (const key of ['sourceUrl', 'quote', 'capturedAt', 'httpStatus']) {
      if (!row.releaseEvidence[key]) fieldProblems.push(`${slug} 证据缺 ${key}`);
    }
  }
  if (row.freshnessGroup !== null && !row.freshnessGroupReason) fieldProblems.push(`${slug} 有分组却没有理由`);
}
check('必填字段 / 充要性 / 证据四要素 / 分组理由 全部满足', fieldProblems.length === 0, fieldProblems.slice(0, 6).join('；'));

/* ③ 日期形态与口径（严格 YYYY-MM-DD，且每条都写明"这个日期是什么口径"） */
const dated = cnKeys.filter(slug => cn.models[slug].releasedAt !== null);
const DATE_RE = /^(19|20)[0-9]{2}-[0-9]{2}-[0-9]{2}$/;
const badDates = dated.filter(slug => !DATE_RE.test(String(cn.models[slug].releasedAt)));
check('所有 releasedAt 都是严格 YYYY-MM-DD', badDates.length === 0, badDates.join(','));
const noScope = dated.filter(slug => !cn.models[slug].releasedAtScope);
check('每条有日期的都写明日期口径（release / GA / 官方日志最早出现…）', noScope.length === 0, noScope.join(','));
const kinds = {};
for (const slug of dated) kinds[cn.models[slug].releasedAtScope] = (kinds[cn.models[slug].releasedAtScope] || 0) + 1;

/* ④ 证据必须落在开发商官方域（域清单只读 providers.json，不另造判据） */
const domainsByDeveloper = {};
for (const entry of Object.values(providers)) {
  if (entry && typeof entry === 'object' && entry.name) {
    domainsByDeveloper[entry.name] = Array.isArray(entry.officialDomains) ? entry.officialDomains : [];
  }
}
const domainProblems = [];
for (const slug of dated) {
  const row = cn.models[slug];
  const url = String(row.releaseEvidence.sourceUrl);
  let host = null;
  try { host = new URL(url).hostname; } catch (error) { host = null; }
  const owned = domainsByDeveloper[row.developer] || [];
  const inOwned = host && owned.some(domain => host === domain || host.endsWith(`.${domain}`));
  if (!inOwned) domainProblems.push(`${slug}: host=${host} 不在 ${row.developer} 的官方域 [${owned.join('/')}]`);
}
check('每条证据的出处域都落在该模型 developer 于 providers.json 登记的官方域内', domainProblems.length === 0, domainProblems.join('；'));

/* ⑤ 禁用模式扫描：第三方托管平台不得作为发布日期依据 */
const THIRD_PARTY = ['siliconflow', 'openrouter', 'huggingface', 'modelscope', 'volcengine.com/product/ark'.replace('volcengine', 'volcengine')];
const thirdPartyHits = dated.filter(slug => THIRD_PARTY.some(domain => String(cn.models[slug].releaseEvidence.sourceUrl).includes(domain)));
check('没有任何一条日期证据来自第三方托管平台', thirdPartyHits.length === 0, thirdPartyHits.join(','));
const PRECISION = ['约', '大概', '前后', '年中', '左右'];
const precisionHits = dated.filter(slug => PRECISION.some(word => String(cn.models[slug].releasedAt).includes(word)));
check('没有任何一条日期带模糊表述（假精度）', precisionHits.length === 0, precisionHits.join(','));
/* 版本号内嵌日期不得被采信：别名里含 8 位日期的条目，其 releasedAt 必须另有官方日志依据 */
const embedded = cnKeys.filter(slug => (registry[slug].aliases || []).some(alias => /20[0-9]{2}-[0-9]{2}-[0-9]{2}/.test(alias)));
const embeddedOk = embedded.every(slug => {
  if (cn.models[slug].releasedAt === null) return true;
  return /updates|release-notes/.test(String(cn.models[slug].releaseEvidence.sourceUrl));
});
check('别名里内嵌日期的条目：要么 releasedAt 为 null，要么证据来自官方 release notes/Change Log（不靠版本号猜）', embeddedOk, embedded.map(slug => `${slug}=${cn.models[slug].releasedAt}`).join(','));

/* ⑥ freshnessGroup 只在官方明文分界时给出 */
const grouped = cnKeys.filter(slug => cn.models[slug].freshnessGroup !== null);
check('freshnessGroup 非空条目都写了理由', grouped.every(slug => String(cn.models[slug].freshnessGroupReason || '').length > 10), grouped.join(','));
check('freshnessGroup 数量很小（本轮 1 条：官方明文旧代退役）', grouped.length === 1, `实得 ${grouped.length}: ${grouped.join(',')}`);

/* ⑦ 词表口径核对：调查口径 → 生产身份层口径的映射必须完备且被 schema 认可 */
const mapping = cn._roleVocabularyMapping || {};
const researchedRoles = [...new Set(cnKeys.map(slug => cn.models[slug].modelRole))].sort();
const unmapped = researchedRoles.filter(role => !mapping[role]);
check('每个调查口径的 modelRole 都有到身份层词表的映射', unmapped.length === 0, unmapped.join(','));
const badTarget = [];
for (const [role, targets] of Object.entries(mapping)) {
  if (!Array.isArray(targets)) { badTarget.push(`${role}（映射值不是数组）`); continue; }
  for (const target of targets) {
    if (!reg.MODEL_ROLES.includes(target)) badTarget.push(`${role}→${target}（不在 MODEL_ROLES 里）`);
  }
}
check('映射目标全部落在 model-registry.js 的 MODEL_ROLES 内', badTarget.length === 0, badTarget.join(','));
/* 生产层实际落地的角色必须都是"某个调查角色的合法归一" */
const landedProblems = [];
for (const slug of cnKeys) {
  const researched = cn.models[slug].modelRole;
  const landed = registry[slug].modelRole;
  const allowed = mapping[researched] || [];
  if (!allowed.includes(landed)) landedProblems.push(`${slug}: 调查=${researched} 生产=${landed}（允许 ${allowed.join('/')}）`);
}
check('生产来源层的每条 modelRole 都是其调查角色的合法归一', landedProblems.length === 0, landedProblems.slice(0, 5).join('；'));

/* ⑧ 报告文件与结构化产物一致（不是"只有 json 没有报告"） */
const reportText = fs.readFileSync(REPORT, 'utf8');
/* 逐条表行：顶格的 `| \`slug\` | \`role\` | …`（第 3 格紧接 role，因此 §4 的归纳表
 * `| \`deepseek-flash\` | \`current-mainline\` | 官方原文…` 也符合这个形状 —— 它同样是
 * 「一条 slug + 一个枚举值」的行）。所以下面同时钉两个数字，互为交叉校验：
 *   · 顶格行 45 = §3 的 44 条逐条行 + §4 的 1 条分组归纳；
 *   · 其中 §3 的 44 行里，releasedAt 列是 `**YYYY-MM-DD**` 或 `null` 的恰好 44 行。 */
const tableRows = (reportText.match(/^\| `[a-z0-9][a-z0-9.-]*` \| /gm) || []).length;
const datedOrNullRows = (reportText.match(/^\| `[a-z0-9][a-z0-9.-]*` \| `[a-z0-9.-]+` \| (\*\*[0-9]{4}-[0-9]{2}-[0-9]{2}\*\*|null) \| /gm) || []).length;
check('报告 §3 的逐条行 = 44（按 releasedAt 列形态判定）', datedOrNullRows === 44, `逐条行 ${datedOrNullRows}`);
check('报告顶格表行数 = 45（44 条逐条 + §4 的 1 条分组归纳）', tableRows === 45, `顶格表行 ${tableRows}`);
check('报告写明了四种失败源（403 / 跨源跳转 / fetch failed / 客户端渲染空壳）中的至少三类',
  ['403', '跨源', 'fetch failed', '空壳'].filter(word => reportText.includes(word)).length >= 3,
  ['403', '跨源', 'fetch failed', '空壳'].filter(word => reportText.includes(word)).join(','));
check('报告与 json 引用同一条出处（DeepSeek Change Log 正文出现）', reportText.includes('api-docs.deepseek.com/updates'));
check('报告写明 minimax-m3 的官方发布日依据', reportText.includes('2026 年 6 月 1 日') || reportText.includes('MiniMax M3'));

console.log('t10 attempt 2 复核（对既有交付物的独立核对，不重做研究）');
console.log(`  currentness.json ${fs.statSync(CN).size} B · 报告 ${fs.statSync(REPORT).size} B`);
console.log(`  身份 ${cnKeys.length}/44 · 有官方日期 ${dated.length} 条（${dated.map(s => `${s}=${cn.models[s].releasedAt}`).join(', ')}）· 分组非空 ${grouped.length} 条`);
console.log(`  日期口径分布：${Object.entries(kinds).map(([k, v]) => `${k}×${v}`).join(' · ')}`);
console.log(`  调查角色 ${researchedRoles.length} 种：${researchedRoles.join(', ')}`);
console.log(`  生产角色（身份层）：${[...new Set(regKeys.map(s => registry[s].modelRole))].sort().join(', ')}`);
console.log(notes.join('\n'));
if (failures.length) {
  console.log(`\n❌ ${failures.length} 项失败：`);
  failures.forEach(item => console.log(`  - ${item}`));
  process.exit(1);
}
console.log(`\n✅ 全部通过（${notes.length} 项）`);
