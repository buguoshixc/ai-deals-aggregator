# p2-honesty-single-source-v1 证据目录

> 任务 **t7**：闭合 t4（`p2-residuals-v1`）如实登记的两处缺口
> ① 日志缺失/损坏时那条诚实性措辞**上不了线**（构建死在 Dataset Manifest 步）；
> ② `全部变化 →` 在 `plans-hub-page.js` 是硬编码字面量（"单一出处"不完全成立）。
> 报告：`research/p2-honesty-single-source-v1-report.md` · 自审：`research/p2-honesty-single-source-v1-self-audit.md`

## 读数怎么来的（纪律）

* **不许用别的日期顶上**：日志不可用时 Manifest 登记 `availability: 'unavailable'` + `updatedAt: null`
  （既不写构建时刻，也不拿 deals 的数据日期冒充）；三颗牙里有一颗专门打"假日期"（`A2`）。
* **牙都要「实跑红 → 逐字节还原 → 复跑绿」**：`.arch-v1/teeth.cjs` 每次 make 都先备份、restore 报
  `byteExact`；`B3` 打的是**产物副本**（`.arch-v1/dist-b3`，原 dist 的 sha256 未变）。
* **产物变化面**：正常态重建后与改动前**逐文件 sha256 全等**（304 文件 · 全树摘要
  `df43587cfe90a60453e29df96599b138a8dd02242130968340cba589e6979675`）。
* 报告里的每条读数都能用 `change-surface.json` / `gap-a-degraded-build.json` / `teeth.json` 里
  的 sha256 与命令复核。

## 文件

| 文件 | 是什么 |
| --- | --- |
| `gap-a-degraded-build.json` | 缺口 A：缺失 / 损坏 / 正常三种状态的实跑读数（措辞命中 file:line + Manifest 登记 + 产物文件） |
| `gap-b-entry-wording.json` | 缺口 B：入口词的出处（措辞表 3 处 / 手写字面量 0 处）+ 枢纽页取词方式 |
| `teeth.json` | 四组牙（B1 手写回潮 / B2 表换词 / B3 产物改名 / A2 假日期）的红→还原→绿读数 |
| `change-surface.json` | 源码逐文件 sha256（对 origin/master）+ 产物全树摘要（正常态 0 变化） |
| `assertion-readings.json` | 四条断言口径的前后读数 + 相邻套件（含"verify-site 未动、留给 t9"的说明） |

## 复跑（在 `.worktrees/p2-honesty-single-source-v1` 下）

```bash
npm ci && node scripts/tools/build-local.js                     # 正常态（退出 0，产物摘要 df43587c…）
node .arch-v1/tree-sha.cjs dist --out=.arch-v1/sha/dist-normal-after.json
node .arch-v1/scan-wording.cjs dist --out=.arch-v1/json/normal-scan.json     # 正对照：markupHits 0

# 缺口 A：缺失 / 损坏两种降级
node .arch-v1/corrupt-fixture.cjs make && node scripts/tools/build-local.js   # 损坏日志（exit 0）
node .arch-v1/corrupt-fixture.cjs restore
mv scripts/data/deal-history.json /tmp/ && node scripts/tools/build-local.js  # 缺失日志（exit 0）
node .arch-v1/scan-wording.cjs dist --out=.arch-v1/json/degraded-scan.json    # 措辞命中 6 处（file:line）
mv /tmp/deal-history.json scripts/data/

# 缺口 B 的三颗牙（每颗都 make → 复跑 → restore）
node .arch-v1/teeth.cjs b1-make && npm run selftest:seo ; node .arch-v1/teeth.cjs b1-restore
node .arch-v1/teeth.cjs a2-make && mv scripts/data/deal-history.json /tmp/ && node scripts/tools/build-local.js ; mv /tmp/deal-history.json scripts/data/ ; node .arch-v1/teeth.cjs a2-restore
node .arch-v1/b3-product-tooth.cjs make && node .arch-v1/b3-product-tooth.cjs verify

# 验收口径
node scripts/tools/verify-site.js --dir=dist --json=.arch-v1/json/after.json   # 880 / 0
npm run selftest:seo ; npm run verify:seo ; npm run check:evidence
node scripts/tools/check-ci-consistency.js --expect-checks=39
```

（`.arch-v1/` 是 gitignore 的 scratch；一次性夹具、探针与完整日志都住在那里。）
