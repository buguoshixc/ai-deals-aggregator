#!/usr/bin/env node
/**
 * t7 审查工具：**变异夹具生成器** + 变异驱动。
 *
 * 纪律（对应题面「Mutation 必须在 TEMP 沙箱副本上做」）：
 *   · 所有夹具写在本目录 `mutations/`（= 我的 in-scope 目录），**不碰共享工作区**；
 *   · 报告通过它自带的 `--models=` / `--targets=` / `--source-rulings=` 验证开关读夹具，
 *     所以连带沙箱副本里的数据文件都不用改 —— 除了 M1b 那一条**故意**改沙箱文件再逐字节还原，
 *     用来证明"改坏了能红、还原回去 sha 一模一样"。
 *
 * 用法：node make-mutation-fixtures.cjs <repoRootForReading> <outDir>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3]);
fs.mkdirSync(outDir, { recursive: true });
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const write = (name, obj) => {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
  return file;
};
const writeRaw = (name, text) => {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, text);
  return file;
};
const manifest = {};

/* ---------- ① models 夹具：坏 releasedAt ---------- */
const srcModels = read('scripts/data/models.json');
const unknownSlug = Object.keys(srcModels).filter(k => !k.startsWith('_'))
  .find(slug => {
    const v = srcModels[slug] && srcModels[slug].releasedAt;
    return v === null || v === undefined;
  });
const m1 = JSON.parse(JSON.stringify(srcModels));
m1[unknownSlug].releasedAt = '2026-10';           // 写了但解析不出可判日
manifest.m1 = { file: write('m1-models-unparsable.json', m1), slug: unknownSlug, expect: '解析不出可判日' };

const m2 = JSON.parse(JSON.stringify(srcModels));
m2[unknownSlug].releasedAt = '';                  // 空串：v2 口径算"写了"，lib 口径算"没写" ⇒ 两处读数分家
manifest.m2 = { file: write('m2-models-empty-string.json', m2), slug: unknownSlug, expect: '两处读数不一致' };

/* ---------- ③ targets 夹具：current target 指向不存在的 registrySlug ---------- */
const targets = read('scripts/data/coverage-targets.json');
const m3 = JSON.parse(JSON.stringify(targets));
let patched = null;
for (const target of m3.targets) {
  const item = (target.currentTargets || []).find(x => x.dimension === 'models');
  if (item) { item.registrySlug = 't7-no-such-slug-xyz'; patched = target.provider; break; }
}
if (!patched) {
  m3.targets[0].dimensionIntent.models = '（t7 变异：声明一个不存在的模型身份）';
  m3.targets[0].currentTargets = (m3.targets[0].currentTargets || []).concat([{ dimension: 'models', registrySlug: 't7-no-such-slug-xyz' }]);
  patched = m3.targets[0].provider;
}
manifest.m3 = { file: write('m3-targets-bad-slug.json', m3), provider: patched, expect: '不在 scripts/data/models.json' };

/* ---------- source-rulings 夹具 ---------- */
const rulingBase = (over = {}) => Object.assign({
  source: 'futurepedia',
  decision: 'repair',
  reason: '页面改版导致选择器失效，留在静态链路上按新结构重写规则。',
  evidence: [{
    url: 'https://www.futurepedia.io/',
    capturedAt: '2026-10-05',
    reading: 'HTTP 403 / collector_error 连续 10 次（scripts/data/source-health.json 现场读数）'
  }],
  overlap: { historicalItems: 0, uniqueItems: 12, overlapItems: 0, maintenanceCost: 'medium' },
  whyKept: null,
  revisitBy: '2026-11-01',
  headlessStability: null
}, over);

const doc = rulings => ({ schemaVersion: 1, reviewedAt: '2026-10-05', rulings });

manifest.clean = { file: write('rulings-clean.json', doc([rulingBase()])), expect: null, note: '合法夹具（对账应 0 处问题）' };
manifest.m4 = { file: write('rulings-m4-keep-degraded-no-whykept.json', doc([rulingBase({ decision: 'keep-degraded', whyKept: null })])), expect: '必须写 whyKept' };
manifest.m5 = { file: write('rulings-m5-retire-still-registered.json', doc([rulingBase({ decision: 'retire', reason: '页面结构变了，退出采集链路。' })])), expect: '仍然挂在采集器注册表里' };
manifest.m6 = { file: write('rulings-m6-empty.json', doc([])), expect: '没有在 scripts/data/source-rulings.json 里留下裁决' };
manifest.m7 = {
  file: write('rulings-m7-out-of-order.json', doc([
    rulingBase({ source: 'layer3labs', decision: 'repair', reason: 'l 开头，规范序里应排在后面。' }),
    rulingBase({ source: 'aitools', decision: 'repair', reason: 'a 开头，规范序里应排在前面。' })
  ])),
  expect: '不是规范序'
};
manifest.m8 = { file: writeRaw('rulings-m8-broken.json', '{"schemaVersion": 1, "rulings": [ {'), expect: '解析失败' };
manifest.m9 = { file: write('rulings-m9-illegal-decision.json', doc([rulingBase({ decision: 'pending' })])), expect: 'decision 非法' };
manifest.m10 = { file: write('rulings-m10-headless-no-stability.json', doc([rulingBase({ decision: 'headless-migrate', headlessStability: null })])), expect: '必须写 headlessStability' };
manifest.m11 = {
  file: write('rulings-m11-relative-url.json', doc([rulingBase({
    evidence: [{ url: 'futurepedia.io/x', capturedAt: '2026-10-05', reading: '一句自我声明，没有可回访地址' }]
  })])),
  expect: '不是绝对地址'
};
manifest.m12 = { file: null, expect: '尚未落盘', note: '不传 --source-rulings（沙箱里本来就没有这份文件）⇒ 必须 exit 0 且如实说未落盘' };

fs.writeFileSync(path.join(outDir, 'fixtures-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
