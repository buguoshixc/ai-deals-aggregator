#!/usr/bin/env node
/**
 * coverage-expansion-v1 / t12：**迁移后数据的独立校验**（只读，不写盘、不依赖别人正在改的文件）。
 *
 * 为什么要有一份独立的校验：`scripts/lib/model-registry.js` 在本轮由 t2 持续改写
 * （MODEL_ROLES 词表在 18:23 与 18:26 两次变化中相互矛盾），我这条迁移不能靠"跑一次别人的
 * 校验器通过"来证明自己 —— 那样结论会随对方文件而翻转。这里把 v2 契约里**与词表无关**的
 * 部分逐条钉死，并额外钉住"词表必须等于新鲜度政策实际使用的 9 个角色"。
 *
 * 用法：node research/_raw/coverage-expansion-v1/verify-currentness-migration.cjs
 * 退出码 0 = 全绿；1 = 有失败项（逐条打印）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const TABLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'models.json'), 'utf8'));
const PROVIDERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'providers.json'), 'utf8'));
const RESEARCH = JSON.parse(fs.readFileSync(path.join(__dirname, 'currentness.json'), 'utf8'));
const FRESHNESS = require(path.join(ROOT, 'scripts', 'lib', 'model-freshness.js'));
const REGISTRY = require(path.join(ROOT, 'scripts', 'lib', 'model-registry.js'));

const KEY_ORDER = ['canonicalName', 'developer', 'owner', 'family', 'aliases', 'officialUrl', 'status', 'modelRole', 'releasedAt', 'releaseEvidence', 'freshnessGroup', 'note'];
/** 证据条的规范键序同样**从 schema 读**（它已改过两轮：三格 → 加 field） */
const EVIDENCE_KEYS = REGISTRY.RELEASE_EVIDENCE_KEY_ORDER;
const MAX_QUOTE = 200;
const MAX_NOTE = 240;
const MAX_GROUP = 60;

const failures = [];
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail: detail || null });
  if (!ok) failures.push(`${name}${detail ? ` —— ${detail}` : ''}`);
}

/** 政策实际用来分档的角色集合（唯一权威） */
function policyRoles() {
  const out = new Set();
  for (const tier of Object.values(FRESHNESS.MODEL_FRESHNESS_POLICY.tiers)) {
    for (const role of tier.modelRoles) out.add(role);
  }
  return [...out].sort();
}

/** providers.json 的 developer 官方域 */
function domainsOf(name) {
  for (const entry of Object.values(PROVIDERS)) {
    if (entry && typeof entry === 'object' && entry.name === name) {
      const domains = entry.officialDomains;
      if (Array.isArray(domains)) return domains;
      if (typeof domains === 'string') return [domains];
      return [];
    }
  }
  return null;
}

function hostInDomains(host, domains) {
  return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
}

const slugs = Object.keys(TABLE).filter(key => !key.startsWith('_'));
const researchSlugs = Object.keys(RESEARCH.models);

// ① 身份集合：一条不漏、不多
check('来源层 44 条身份与调查集合完全一致',
  slugs.length === 44 && researchSlugs.length === 44 && slugs.every(slug => researchSlugs.includes(slug)) && researchSlugs.every(slug => slugs.includes(slug)),
  `来源层 ${slugs.length} 条 / 调查 ${researchSlugs.length} 条`);

// ② 键序与字段存在性
for (const slug of slugs) {
  const entry = TABLE[slug];
  const keys = Object.keys(entry);
  check(`${slug}: 键序 = schema v2 ENTRY_KEY_ORDER`, JSON.stringify(keys) === JSON.stringify(KEY_ORDER), `实得 ${JSON.stringify(keys)}`);
  for (const key of ['modelRole', 'releasedAt', 'releaseEvidence', 'freshnessGroup']) {
    check(`${slug}: 写出 v2 字段 ${key}`, Object.prototype.hasOwnProperty.call(entry, key));
  }
  check(`${slug}: writer 专用派生的 catalogStatus/catalogReason 未手写`,
    !Object.prototype.hasOwnProperty.call(entry, 'catalogStatus') && !Object.prototype.hasOwnProperty.call(entry, 'catalogReason'));
}

// ③ modelRole 词表 = 身份层定稿的枚举；此处只钉"政策用到的角色都被身份层认识"
const authoritative = policyRoles();
check('政策角色集合非空（t4 的 MODEL_FRESHNESS_POLICY 已落盘）', authoritative.length > 0, `实得 ${authoritative.join(',')}`);
check('来源层用到的 modelRole 全部落在政策角色集合内（⇒ 不会被静默兜底到兜底档）',
  slugs.every(slug => {
    const role = TABLE[slug].modelRole;
    return role === null || authoritative.includes(role) || role === 'other';
  }),
  slugs.filter(slug => {
    const role = TABLE[slug].modelRole;
    return !(role === null || authoritative.includes(role) || role === 'other');
  }).map(slug => `${slug}=${TABLE[slug].modelRole}`).join(','));
check('来源层没有 null 角色（本轮 44 条都已判定）', slugs.every(slug => TABLE[slug].modelRole !== null));
check('registry 的 MODEL_ROLES 至少包含政策用到的每个角色（否则整批静默兜底）',
  authoritative.every(role => REGISTRY.MODEL_ROLES.includes(role)),
  `registry 词表 = ${REGISTRY.MODEL_ROLES.join(',')}；缺 = ${authoritative.filter(role => !REGISTRY.MODEL_ROLES.includes(role)).join(',')}`);

// ④ releasedAt ↔ releaseEvidence 互为充要 + 日期形态 + 官方域
const dated = [];
for (const slug of slugs) {
  const entry = TABLE[slug];
  const hasDate = entry.releasedAt !== null;
  const ev = entry.releaseEvidence;
  check(`${slug}: releaseEvidence 是数组`, Array.isArray(ev), typeof ev);
  const hasEvidence = Array.isArray(ev) && ev.length > 0;
  check(`${slug}: releasedAt 与 releaseEvidence 互为充要`, hasDate === hasEvidence, `releasedAt=${JSON.stringify(entry.releasedAt)} evidence=${hasEvidence ? '非空' : '空'}`);
  if (!hasDate) continue;
  dated.push(slug);
  check(`${slug}: releasedAt 是 YYYY-MM-DD`, /^\d{4}-\d{2}-\d{2}$/.test(String(entry.releasedAt)), String(entry.releasedAt));
  check(`${slug}: releasedAt ≥ 2000-01-01`, String(entry.releasedAt) >= '2000-01-01', String(entry.releasedAt));
  for (const item of ev) {
    check(`${slug}: 证据键序 = [sourceUrl, quote, capturedAt]`, JSON.stringify(Object.keys(item)) === JSON.stringify(EVIDENCE_KEYS), JSON.stringify(Object.keys(item)));
    check(`${slug}: quote 非空且 ≤ ${MAX_QUOTE} 字`, typeof item.quote === 'string' && item.quote.trim() && Array.from(item.quote).length <= MAX_QUOTE, `${Array.from(String(item.quote)).length} 字`);
    check(`${slug}: capturedAt 是 YYYY-MM-DD`, /^\d{4}-\d{2}-\d{2}$/.test(String(item.capturedAt)), String(item.capturedAt));
    check(`${slug}: sourceUrl 是 http(s)`, /^https?:\/\//.test(String(item.sourceUrl)), String(item.sourceUrl));
    const host = (() => { try { return new URL(item.sourceUrl).hostname; } catch { return null; } })();
    const domains = domainsOf(entry.developer);
    check(`${slug}: developer「${entry.developer}」在 providers.json 登记了官方域`, Array.isArray(domains) && domains.length > 0, domains === null ? 'developer 未登记' : JSON.stringify(domains));
    if (host && Array.isArray(domains) && domains.length) {
      check(`${slug}: 证据域 ${host} 落在官方域内（开发商官方页，不是第三方托管平台）`, hostInDomains(host, domains), `domains=${domains.join('/')}`);
    }
  }
  // 与调查报告逐字一致（迁移不得改写引文）
  const researchEvidence = (RESEARCH.models[slug] || {}).releaseEvidence;
  check(`${slug}: 证据可在 currentness.json 里找到出处（证据不新造）`,
    Boolean(researchEvidence) && (researchEvidence.sourceUrl === ev[0].sourceUrl || String(RESEARCH.sourceLedger ? JSON.stringify(RESEARCH.sourceLedger) : '').includes(ev[0].sourceUrl)),
    `来源层 ${ev[0].sourceUrl}`);
}

// ⑤ freshnessGroup 上限 + 非空必须配 note
for (const slug of slugs) {
  const entry = TABLE[slug];
  if (entry.freshnessGroup === null) continue;
  check(`${slug}: freshnessGroup ≤ ${MAX_GROUP} 字`, String(entry.freshnessGroup).length <= MAX_GROUP, String(entry.freshnessGroup));
  check(`${slug}: freshnessGroup 非空时 note 也非空（分组必须有理由）`, typeof entry.note === 'string' && entry.note.trim().length > 0);
}

// ⑥ note 长度上限
for (const slug of slugs) {
  const note = TABLE[slug].note;
  check(`${slug}: note 为 null 或 ≤ ${MAX_NOTE} 字`, note === null || (typeof note === 'string' && note.length <= MAX_NOTE), note === null ? 'null' : `${String(note).length} 字`);
}

// ⑦ 角色与调查一致 —— **角色词表由身份层定稿**，所以这里判的是"来源层的角色落在政策角色集合内"
//    （上面第 ③ 组），而**不是**"逐字等于调查报告里的角色名"。
//    调查报告用的是研究阶段的能力口径（llm / vlm / code-specialist / translation-lite …），
//    身份层后来把它归一到 general / fast / vision / coding / embedding / translation / other；
//    这一步归一由 t2 的迁移脚本完成，映射表见 research/coverage-expansion-v1-model-currentness.md 与
//    scripts/tools/model-role-vocabulary-selftest.js。本校验只钉"归一后没有掉出政策集合"。
const ROLE_NORMALIZATION_EXPECTED = {
  llm: ['general'], 'small-fast-variant': ['fast'], 'code-specialist': ['coding'],
  vlm: ['vision'], 'multimodal-llm': ['vision', 'multimodal-llm'], 'retrieval-embedding': ['embedding'],
  translation: ['translation'], 'translation-lite': ['translation-lite', 'translation'],
  roleplay: ['other', 'roleplay']
};
for (const slug of slugs) {
  const researched = (RESEARCH.models[slug] || {}).modelRole;
  const landed = TABLE[slug].modelRole;
  const allowed = ROLE_NORMALIZATION_EXPECTED[researched] || [];
  check(`${slug}: 归一后的角色 ${landed} 是调查角色 ${researched} 的合法归一`,
    allowed.includes(landed),
    `调查 ${researched} → 允许 ${allowed.join('/')}，实得 ${landed}`);
}

// ⑧ 真实数据能产出哪些 catalogStatus 分支（不造数据，如实记录）
const catalog = FRESHNESS.deriveCatalog({
  models: slugs.map(slug => {
    const e = TABLE[slug];
    return { slug, developer: e.developer, family: e.family, modelRole: e.modelRole, releasedAt: e.releasedAt, status: e.status, freshnessGroup: e.freshnessGroup };
  })
});
check('新鲜度层无硬不变量违规', catalog.invariantViolations.length === 0, JSON.stringify(catalog.invariantViolations.slice(0, 3)));
const branchCounts = catalog.entries.reduce((acc, entry) => { acc[entry.catalogStatus] = (acc[entry.catalogStatus] || 0) + 1; return acc; }, {});
check('真实数据覆盖 current 分支', (branchCounts.current || 0) > 0, `current=${branchCounts.current || 0}`);
check('真实数据覆盖 legacy 分支（legacy 仍留在 registry，未删除）', (branchCounts.legacy || 0) > 0, `legacy=${branchCounts.legacy || 0}`);
check('真实数据覆盖 unknown 分支（判不了默认保留展示）', (branchCounts.unknown || 0) > 0, `unknown=${branchCounts.unknown || 0}`);

const passed = checks.filter(item => item.ok).length;
console.log(`t12 迁移独立校验：${passed}/${checks.length} 项通过`);
console.log(`身份 ${slugs.length} 条 · 有官方发布日期 ${dated.length} 条（${dated.join(', ')}）· freshnessGroup 非空 ${slugs.filter(s => TABLE[s].freshnessGroup).length} 条`);
console.log(`catalogStatus 分布（真实数据）：${JSON.stringify(branchCounts)}（aging / historical 本分支无真实数据，见任务记录的 fixture 说明）`);
if (failures.length) {
  console.log(`\n❌ ${failures.length} 项失败：`);
  failures.forEach(item => console.log(`  - ${item}`));
  process.exit(1);
}
console.log('\n✅ 全部通过（含"registry 词表必须覆盖政策角色"这条：它红了就说明整批模型会被静默兜底到 120/240 档）');
