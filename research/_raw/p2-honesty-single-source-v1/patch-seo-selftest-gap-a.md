# 交 t10：`seo-selftest.js` §八「日志不可用时的如实登记」单元牙（5 条）

> 来源：t7（`p2-honesty-single-source-v1`）· **补丁去向 = t10**（`scripts/tools/seo-selftest.js` 在 t10 的声明面里，
> 本 PR 按「不许两人同写一个文件」的护栏**从 PR #72 撤下**，避免变成口头承诺 —— 原文就放在这里，可直接照抄/`git apply`）。
> 适用范围：与 **t20 之后的 `lib/changes.js`**（id 清单已搬走、`logAvailabilityOf` 收两种形态）完全兼容；
> 实测读数：插入后 `npm run selftest:seo` = **93 项通过 / 0 项失败**（插入前 88）。

## 这 5 条断言在守什么

| # | 断言 | 打的是什么 |
| --- | --- | --- |
| 1 | 登记表：缺失 / 损坏 ⇒ `unavailable`（原因如实带出来）；正常 ⇒ `ok` | 可用性判定的三个分支 |
| 2 | **牙**：源不可用却没登记 ⇒ 红；拿别的日期顶替 ⇒ 红；没给「没有拿到」说明 ⇒ 红 | 缺口 A 的三条不变量 |
| 3 | **反证**：源本次可用却登记为 unavailable / 留空 `updatedAt` ⇒ 红 | 不许反向放水 |
| 4 | **盘侧**：产物文件没有时间却没登记 ⇒ 红；登记了、文件却带时间 ⇒ 红 | Manifest ↔ 产物的一致性 |
| 5 | **正例**：如实登记的一份三条断言都不响；`toleratedLogComplaints()` **只**放过它的那两条形状抱怨 | 窄口子没有开得更大 |

## 插入位置

`scripts/tools/seo-selftest.js` 的**最后一行之前**（即 `console.log(\`\n=== v1.7 SEO 门禁演练：…\`);` 之前）：

```js
/* ------------------------------------------------------------------ */
section('八、日志不可用时的**如实登记**（p2-honesty-single-source-v1 / 缺口 A）');

{
  // 缺口 A 的规则本体在 `lib/changes.js`（纯函数）——这里直接对它开牙，不经过构建。
  // 合成清单刻意用 `log-a/b/c` 这种占位 id：本自测不依赖任何真实日志文件名。
  const changesLib = require('../lib/changes');
  const availability = changesLib.logAvailabilityOf([
    { id: 'log-a', file: 'a.json', label: 'A 日志', load: { missing: true } },
    { id: 'log-b', file: 'b.json', label: 'B 日志', load: { broken: '坏掉的 JSON' } },
    { id: 'log-c', file: 'c.json', label: 'C 日志', load: {} }
  ]);

  check('登记表：缺失 / 损坏 ⇒ unavailable（原因如实带出来）；正常 ⇒ ok',
    availability[0].availability === 'unavailable' && availability[0].reason === '文件缺失'
    && availability[1].availability === 'unavailable' && availability[1].reason === '坏掉的 JSON'
    && availability[2].availability === 'ok' && availability[2].reason === null,
    availability.map(row => `${row.id}=${row.availability}(${row.reason || '-'})`).join(' · '));

  const mixed = {
    datasets: [
      { id: 'log-a', updatedAt: null, updatedAtShape: null, availability: 'unavailable', updatedAtNote: '', count: 0 },
      { id: 'log-b', updatedAt: '2026-01-01', updatedAtShape: 'date', count: 0 },
      { id: 'log-c', updatedAt: '2026-01-02', updatedAtShape: 'date', count: 0 },
      { id: 'other', updatedAt: '2026-01-03', updatedAtShape: 'date', count: 0 }
    ]
  };
  const mixedProblems = changesLib.logDatasetHonestyProblems(mixed, availability);
  check('【牙】源日志不可用却没登记 ⇒ 红；拿别的日期顶替 ⇒ 红；没给「没有拿到」说明 ⇒ 红',
    mixedProblems.some(problem => problem.includes('log-b') && problem.includes('必须显式登记'))
    && mixedProblems.some(problem => problem.includes('log-b') && problem.includes('不许用别的日期顶上'))
    && mixedProblems.some(problem => problem.includes('log-a') && problem.includes('updatedAtNote')),
    mixedProblems.slice(0, 3).join('；'));

  check('【反证】源日志本次可用：登记为 unavailable 或留空 updatedAt ⇒ 红（不许反过来放水）',
    (() => {
      const forged = {
        datasets: [{ id: 'log-c', updatedAt: null, updatedAtShape: null, availability: 'unavailable', updatedAtNote: '没有拿到' }]
      };
      const problems = changesLib.logDatasetHonestyProblems(forged, availability);
      return problems.some(problem => problem.includes('不许登记为 unavailable'))
        && problems.some(problem => problem.includes('不许留空'));
    })());

  check('【盘侧】产物文件没有时间却没登记 ⇒ 红；登记了、文件却带着时间 ⇒ 红',
    changesLib.logDatasetDiskHonestyProblems({ datasets: [{ id: 'x', updatedAt: '2026-01-01', updatedAtShape: 'date' }] }, { x: null })
      .some(problem => problem.includes('必须登记为 availability: unavailable'))
    && changesLib.logDatasetDiskHonestyProblems(
      { datasets: [{ id: 'y', updatedAt: null, updatedAtShape: null, availability: 'unavailable', updatedAtNote: '没有拿到' }] },
      { y: '2026-01-01' }).some(problem => problem.includes('登记与产物不一致')));

  check('【正例】如实登记的那一份三条断言都不响；tolerated 只放过它的那两条形状抱怨（一条都不多）',
    (() => {
      const good = {
        datasets: [{
          id: 'log-a', updatedAt: null, updatedAtShape: null, availability: 'unavailable',
          updatedAtNote: '本次构建没有拿到 a.json —— 这不表示「没有变化」。'
        }]
      };
      const tolerated = changesLib.toleratedLogComplaints(good);
      return changesLib.logDatasetHonestyProblems(good, [availability[0]]).length === 0
        && changesLib.logDatasetDiskHonestyProblems(good, { 'log-a': null }).length === 0
        && tolerated.size === 2
        && tolerated.has('dataset log-a: 缺少 updatedAt')
        && changesLib.toleratedLogComplaints({ datasets: [{ id: 'log-c', updatedAt: '2026-01-02', updatedAtShape: 'date' }] }).size === 0;
    })());
}
```

## 落地后应当看到的读数

```
八、日志不可用时的**如实登记**（p2-honesty-single-source-v1 / 缺口 A）
=== v1.7 SEO 门禁演练：93 项通过，0 项失败 ===
```

（插入前 88 项；`check:ci` 的冻结清单与 `--expect-checks` 不受影响。）
