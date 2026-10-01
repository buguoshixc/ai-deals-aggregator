#!/usr/bin/env node
/**
 * v3.0 题面 §8 的 20 条 Tooth Test —— 逐条实跑的**变异电池**。
 *
 * 每条牙由两半组成，缺一不可：
 *   · **违规夹具**：自测里构造出一个"坏"的输入（两半都在各阶段自测里，见每条的 `fixture` 字段）；
 *   · **守卫**：被调用的那个检查函数真的会报红。
 * 本脚本变异的是**第二半**：把守卫换成 no-op（或把结构改坏），那么「夹具里的违规」就没人拦了，
 * 自测里那条 `【牙 #N】…判红` 必须当场变红 —— 变不红就说明那条牙其实没在守东西。
 *
 * 这是对断言本身做变异测试（mutation testing）：它回答的问题是
 * 「如果我删掉这条保护，会不会有人发现？」—— 对门禁而言这个问题比「它现在是不是绿的」更重要。
 *
 * 还原：每条都用内存里的原始字节写回，并**逐字节比对 sha256**；不一致即整轮判失败。
 *
 * 用法：node research/_raw/v3.0-teeth-run.js [--only=1,15,16]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const onlySet = only ? new Set(only.split(',').map(s => s.trim())) : null;

const sha = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(path.join(ROOT, rel), text, 'utf8');

/** 把某个导出函数换成「什么都不报」的 no-op（守卫被摘掉） */
const neuter = (name, ret = '[]') => `\nmodule.exports.${name} = () => ${ret};\n`;

const TEETH = [
  {
    id: '1', tooth: '两个同名模型来自不同开发者，被错误自动合并',
    fixture: 'selftest:model-registry / selftest:models 的【牙 #1】违规夹具（两条同 canonicalName 不同 developer）',
    file: 'scripts/lib/model-registry.js', patch: neuter('validateRegistry'),
    cmd: ['node', ['scripts/tools/models-selftest.js']], expect: '【牙 #1】'
  },
  {
    id: '2', tooth: 'alias 指向两个 registry model',
    fixture: 'selftest:model-registry / selftest:models 的【牙 #2】违规夹具（同一个 alias 落在两个模型上）',
    file: 'scripts/lib/model-registry.js', patch: neuter('validateRegistry'),
    cmd: ['node', ['scripts/tools/models-selftest.js']], expect: '【牙 #2】'
  },
  {
    id: '3', tooth: 'mapping 指向不存在 api plan / modelKey',
    fixture: 'selftest:model-registry / selftest:models 的【牙 #3】违规夹具（映射指向不存在的 apiPlanId / modelKey）',
    file: 'scripts/lib/model-registry.js', patch: neuter('validateLinks'),
    cmd: ['node', ['scripts/tools/models-selftest.js']], expect: '【牙 #3】'
  },
  {
    id: '4', tooth: 'modelKey 改名被工具直接自动 merge',
    fixture: 'selftest:models 的【牙 #4】违规夹具（改名产生的两个 slug 各自独立；手写派生 id 被拒）',
    file: 'scripts/lib/model-registry.js', patch: neuter('validateRegistry'),
    cmd: ['node', ['scripts/tools/models-page-selftest.js']], expect: '【牙 #4】'
  },
  {
    id: '5', tooth: 'Model Page 展示不存在的 Provider',
    fixture: 'selftest:models 的【牙 #5】违规夹具（把记录渲染成另一个 Provider / 凭空多一行）',
    file: 'scripts/lib/models-page.js', patch: neuter('assertPageHonesty'),
    cmd: ['node', ['scripts/tools/models-page-selftest.js']], expect: '【牙 #5】'
  },
  {
    id: '6', tooth: '同一 provider 出现两个 canonical slug',
    fixture: 'selftest:vendor 的【牙 #6】违规夹具（两个 provider 指向同一个 slug）',
    file: 'scripts/lib/vendor-page.js', patch: neuter('assertVendorSlugCanonical'),
    cmd: ['node', ['scripts/tools/vendor-page-selftest.js']], expect: '【牙 #6】'
  },
  {
    id: '7', tooth: '/vendor/ 与 /provider/ 两个 indexable 重复页面',
    fixture: 'selftest:vendor 的【牙 #7】违规夹具（同时存在 /vendor/ 与 /provider/ 两套可索引页）',
    file: 'scripts/lib/vendor-page.js', patch: neuter('assertNoParallelProviderRoutes'),
    cmd: ['node', ['scripts/tools/vendor-page-selftest.js']], expect: '【牙 #7】'
  },
  {
    id: '8', tooth: 'Provider Page 的 API 数量与 api-plans 数据不一致',
    fixture: 'selftest:vendor 的【牙 #8】违规夹具（页面计数与 api-plans 现算值不同）',
    file: 'scripts/lib/vendor-page.js', patch: neuter('assertVendorApiCounts'),
    cmd: ['node', ['scripts/tools/vendor-page-selftest.js']], expect: '【牙 #8】'
  },
  {
    id: '9', tooth: '当前 Deal 消失后历史记录也消失',
    fixture: 'selftest:archive 的【牙 #9】违规夹具（把"当前数据里没有"的档案条目丢掉）',
    file: 'scripts/lib/archive.js', patch: neuter('assertEntrySetStable'),
    cmd: ['node', ['scripts/tools/archive-selftest.js']], expect: '按当前数据过滤档案'
  },
  {
    id: '10', tooth: 'Source 故障导致大批 Archive ended',
    fixture: 'selftest:archive 的【牙 #10】违规夹具（同一天大批 ended ⇒ suspect + mass_ended_suspect 留档）',
    file: 'scripts/lib/archive.js', patch: neuter('assertArchiveIntegrity'),
    cmd: ['node', ['scripts/tools/archive-selftest.js']], expect: '标了 suspect 却没有异常留档'
  },
  {
    id: '11', tooth: 'ended → restored 后状态错误',
    fixture: 'selftest:archive 的【牙 #11】违规夹具（restored 之后状态必须是 restored）',
    file: 'scripts/lib/archive.js', patch: neuter('assertArchiveIntegrity'),
    cmd: ['node', ['scripts/tools/archive-selftest.js']], expect: '把恢复后的状态写成 ended'
  },
  {
    id: '12', tooth: '文档里的 JSON endpoint 不存在',
    fixture: 'selftest:data-docs 的【牙 #12】违规夹具（Manifest 里写一个产物中不存在的 endpoint）',
    file: 'scripts/lib/data-docs.js', patch: neuter('assertEndpointsExist'),
    cmd: ['node', ['scripts/tools/data-docs-selftest.js']], expect: '不存在的 endpoint'
  },
  {
    id: '13', tooth: 'schemaVersion 文档与真实数据不一致',
    fixture: 'selftest:data-docs 的【牙 #13】违规夹具（Manifest 的 schemaVersion 与源文件不同）',
    file: 'scripts/lib/data-docs.js', patch: neuter('assertSchemaVersions'),
    cmd: ['node', ['scripts/tools/data-docs-selftest.js']], expect: 'schemaVersion 写成 99'
  },
  {
    id: '14', tooth: 'Dataset Manifest 数量与真实数据不一致',
    fixture: 'selftest:data-docs 的【牙 #14】违规夹具（Manifest 的 count 与磁盘实际条数不同）',
    file: 'scripts/lib/data-docs.js', patch: neuter('assertManifestCounts'),
    cmd: ['node', ['scripts/tools/data-docs-selftest.js']], expect: '记录数多写 1'
  },
  {
    id: '15', tooth: 'API event 重复 build 后 GUID 改变',
    fixture: 'selftest:feeds「GUID 两次构建逐字节相同（不是每次 build 重新生成）」',
    file: 'scripts/lib/feeds.js',
    patch: { from: '        id: entry.eventId,', to: '        id: entry.eventId + String(__teeth++,),' },
    prelude: 'let __teeth = 0;\n',
    cmd: ['node', ['scripts/tools/feeds-selftest.js']], expect: 'GUID 两次构建逐字节相同'
  },
  {
    id: '16', tooth: 'API Feed event 指向不存在页面锚点',
    fixture: '构建期「变化订阅 api-plan-changes 的深链在 plans/api/ 上没有落点」',
    file: 'scripts/lib/feeds.js',
    patch: { from: '    linkOf: entry => `${apiPlansPage.API_PLANS_ROUTE}#plan-${entry.planId}`', to: '    linkOf: entry => `${apiPlansPage.API_PLANS_ROUTE}#plan-${entry.eventId}`' },
    cmd: ['node', ['scripts/tools/build-local.js']], expect: '深链在 plans/api/ 上没有落点'
  },
  {
    id: '17', tooth: 'API Feed 混入 Coding Plan event',
    fixture: '构建期「订阅[change-event-exists] … 在 api-plan-history.json 里找不到对应事件」',
    file: 'scripts/lib/feeds.js',
    patch: { from: '          view: view && view.radar ? view.radar : null,', to: '          view: views.plans.radar,' },
    cmd: ['node', ['scripts/tools/build-local.js']], expect: '在 api-plan-history.json 里找不到对应事件'
  },
  {
    id: '18', tooth: 'Model Page duplicate canonical',
    fixture: 'selftest:models 的【牙 #18】违规夹具（两个模型页共用同一个 canonical）',
    file: 'scripts/lib/models-page.js', patch: neuter('assertCanonicalUnique'),
    cmd: ['node', ['scripts/tools/models-page-selftest.js']], expect: '【牙 #18】'
  },
  {
    id: '19', tooth: '空 Model Page 进入 sitemap',
    fixture: 'selftest:models 的【牙 #19】违规夹具（未过门槛的模型页进了 sitemap）',
    file: 'scripts/lib/models-page.js', patch: neuter('assertSitemapEligibility'),
    cmd: ['node', ['scripts/tools/models-page-selftest.js']], expect: '【牙 #19】'
  },
  {
    id: '20', tooth: 'orphan provider page',
    fixture: 'selftest:seo 的 orphan 违规夹具（可索引页没有任何站内入链）',
    file: 'scripts/lib/seo.js',
    patch: '\n{ const __v = module.exports.validate; module.exports.validate = (d, o) => { const r = __v(d, o);'
      + ' return Object.assign({}, r, { problems: (r.problems || []).filter(p => p.code !== \'orphan\') }); }; }\n',
    cmd: ['node', ['scripts/tools/seo-selftest.js']], expect: 'orphan'
  }
];

const rows = [];
let hardFail = 0;
for (const entry of TEETH) {
  if (onlySet && !onlySet.has(entry.id)) continue;
  const rel = entry.file;
  const original = read(rel);
  const before = sha(original);
  let mutated = original;
  let how = '';
  if (typeof entry.patch === 'string') {
    mutated = (entry.prelude || '') + original + entry.patch;
    how = `在 ${rel} 末尾摘掉守卫 / 包一层坏行为`;
  } else {
    if (!original.includes(entry.patch.from)) {
      rows.push({ id: entry.id, tooth: entry.tooth, how: `**污染未生效**（找不到锚点：${entry.patch.from.slice(0, 40)}）`, expect: entry.expect, actual: '—', restore: '—', ok: false });
      hardFail++;
      continue;
    }
    mutated = entry.prelude
      ? entry.prelude + original.replace(entry.patch.from, entry.patch.to)
      : original.replace(entry.patch.from, entry.patch.to);
    how = `改坏 ${rel} 的一行（${entry.patch.from.trim().slice(0, 46)}…）`;
  }
  write(rel, mutated);
  let out = '';
  let code = 0;
  try {
    out = execFileSync(entry.cmd[0], entry.cmd[1], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    out = `${error.stdout || ''}${error.stderr || ''}`;
    code = typeof error.status === 'number' ? error.status : -1;
  }
  // 还原 + 逐字节核对
  write(rel, original);
  const after = sha(read(rel));
  const restored = after === before;
  if (!restored) hardFail++;
  const hit = out.split('\n').filter(line => line.includes(entry.expect) && line.includes('✗'));
  const red = code !== 0 && hit.length > 0;
  rows.push({
    id: entry.id, tooth: entry.tooth, how, expect: entry.expect,
    actual: red ? `exit=${code} · ${hit[0].trim().slice(0, 120)}` : `**没有变红**（exit=${code}）`,
    restore: restored ? `✓ sha256 逐字节相同` : `✗ sha256 不一致（${before.slice(0, 12)} → ${after.slice(0, 12)}）`,
    ok: red && restored
  });
}

console.log('\n=== v3.0 题面 §8 二十条 Tooth Test：变异实跑结果 ===\n');
for (const row of rows) {
  console.log(`#${row.id} ${row.tooth}`);
  console.log(`   污染方式: ${row.how}`);
  console.log(`   预期失败: ${row.expect}`);
  console.log(`   实际失败: ${row.actual}`);
  console.log(`   还原方式: ${row.restore}`);
  console.log(`   → ${row.ok ? '红-且-已还原 ✓' : '未达标 ✗'}\n`);
}
const bad = rows.filter(r => !r.ok).length;
console.log(`=== 共 ${rows.length} 条：达标 ${rows.length - bad} · 未达标 ${bad} · 还原失败 ${hardFail} ===`);
process.exit(bad || hardFail ? 1 : 0);
