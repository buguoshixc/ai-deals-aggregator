/** T1 自检：REQUIREMENTS.md 的主题覆盖与条目数。只读。 */
'use strict';
const t = require('fs').readFileSync(__dirname + '/REQUIREMENTS.md', 'utf8');
const themes = {
  '整卡 <a>': ['整卡', '<a>'],
  '无选中态 / aria-pressed / data-facet / role=button': ['aria-pressed', 'data-facet', 'role="button"'],
  '无 JS 完整': ['无 JS'],
  '与 NEED_PAGES 对账': ['NEED_PAGES'],
  '不改 NEED_PREDICATES': ['NEED_PREDICATES'],
  '不改 /need/** 页面': ['/need/'],
  '桌面多列不得 10 张挤一行': ['10 张'],
  '禁止横向滚动隐藏入口': ['横向滚动'],
  '手机无横向滚动': ['手机'],
  '卡片高度 64-80px': ['64–80px'],
  '文案来源 NEED_PAGES 单一注册表': ['单一注册表'],
  '数据层零变化': ['零变化'],
  'Analytics 零改动': ['Analytics 零改动'],
  'Mutation M1-M7 真红 + byte-exact 还原': ['M1', 'byte-exact'],
  'Full Gate 全绿': ['Full Gate'],
  '首屏密度 Before/After 实测': ['Before', 'Delta'],
  '基线读数小节': ['## 2. 基线读数'],
  '冲突小节': ['## 3. 与既有硬规则的**冲突**'],
  '唯一授权变更': ['唯一**被授权的契约变更'],
  '必须删除的旧断言': ['必须**删除**的旧断言'],
  'short 保留': ['只**停止在首页使用'],
  '门禁口径不变': ['--expect-checks=38', 'FROZEN_ASSERTION_NAMES'],
  '取得方式标注': ['Edge', 'playwright-core', 'waitUntil']
};
let miss = [];
for (const [k, keys] of Object.entries(themes)) {
  const bad = keys.filter(x => !t.includes(x));
  console.log((bad.length ? '  ✗ ' : '  ✓ ') + k + (bad.length ? '   缺: ' + bad.join(' | ') : ''));
  if (bad.length) miss.push(k);
}
const ids = [...t.matchAll(/AC-(\d+)/g)].map(m => m[1]);
const uniq = [...new Set(ids)].sort((a, b) => a - b);
console.log(`\n唯一 AC 条目号 ${uniq.length} 条：AC-${uniq.join(', AC-')}`);
console.log(`字符数 ${t.length}`);
console.log(miss.length ? `\n未覆盖主题 ${miss.length} 个：${miss.join('、')}` : '\n全部主题已覆盖 ✓');
process.exit(miss.length ? 1 : 0);
