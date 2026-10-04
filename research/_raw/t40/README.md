# t40 —— 线上旧版基线 + before/after 比较器（给 t19 冒烟一个机器对照物）

> 只读：本目录里的脚本**只读线上**（`fetch` GET），只写本目录里的文件。
> 没有 push / merge / 部署 / 改仓库设置，也没有动 `dist/` 或任何生产文件。

## 为什么要这个东西

t19 的线上冒烟要在**部署之后**回答一个问题：**线上真的换成本版了吗？**

* 现在线上跑的还是**旧版本**（见下面的基线读数）；
* GitHub Pages 前面有 CDN（`Cache-Control: max-age=600`，响应带 `Age`）⇒ "刷新后还是旧的" **可能只是缓存没过期**，
  不能据此判缺陷；
* `verify-site.js --url=` 在合并前跑，会在本版新增断言上**正确地**判红（因为线上还没这一版）⇒
  需要一个对照物，把「旧版本正常」与「部署没生效 / 内容不对」分开。

**一条纪律**：判"更新了没有"看 **`Last-Modified` / `ETag` 变了没有**，**绝不在 URL 上加 `?v=` 之类的查询串**去绕缓存
—— 那只能证明"源站有新版"，而读者看到的是缓存里的那一份。比较器全程不加查询串。

## 基线（部署前，2026-10-04T13:26:20Z 抓取）

文件：`live-baseline.json`（7 条路由 × 状态 / `Last-Modified` / `ETag` / `Cache-Control` / `Age` / 关键 DOM 事实）

| 路由 | 状态 | Last-Modified | ETag | Cache-Control | Age |
| --- | --- | --- | --- | --- | --- |
| `/` | 200 | Sun, 04 Oct 2026 07:16:27 GMT | `W/"6ac1fd4b-6197c"` | max-age=600 | 0 |
| `/models/` | 200 | 同上 | `W/"6ac1fd4b-1deaf"` | max-age=600 | 0 |
| `/models/deepseek-v3.2/` | 200 | 同上 | `W/"6ac1fd4b-14c94"` | max-age=600 | 0 |
| `/plans/api/` | 200 | 同上 | `W/"6ac1fd4b-2bb15"` | max-age=600 | 0 |
| `/plans/coding/` | 200 | 同上 | `W/"6ac1fd4b-30e89"` | max-age=600 | 0 |
| `/sitemap.xml` | 200 | 同上 | `W/"6ac1fd4b-8473"` | max-age=600 | 0 |
| `/feeds/` | 200 | 同上 | `W/"6ac1fd4b-17bf4"` | max-age=600 | 0 |

**关键 DOM 事实（证明"线上还是旧版本"）**：

| 事实 | 基线实测 | 本版部署后的期望 |
| --- | --- | --- |
| `/models/` 的 `data-model=` 计数 | **0** | **44** |
| `/models/` 的 `models-show-legacy` 计数 | **0** | **≥1** |
| `/models/deepseek-v3.2/` 的 `data-release-date=` 计数 | **0** | **≥1** |
| `/sitemap.xml` 的 `<loc>` 计数 | 170 | 170（本版不增删路由） |

## t19 冒烟怎么用

### 1）部署**前**（已做过，基线已在仓库里）

```bash
node research/_raw/t40/compare-live.cjs --snapshot=research/_raw/t40/live-baseline.json
```

### 2）部署**后**：抓 after 再比较（最常用）

```bash
node research/_raw/t40/compare-live.cjs --snapshot=research/_raw/t40/after-deploy.json
node research/_raw/t40/compare-live.cjs \
  --before=research/_raw/t40/live-baseline.json \
  --after=research/_raw/t40/after-deploy.json \
  --json=research/_raw/t40/after-deploy-diff.json \
  --require-deployed
```

### 3）部署**后**：不确定 CDN 过期没有 ⇒ 让它自己轮询（推荐）

```bash
node research/_raw/t40/compare-live.cjs \
  --before=research/_raw/t40/live-baseline.json \
  --poll-after=research/_raw/t40/after-deploy.json \
  --timeout-min=12 --interval-sec=45 --require-deployed
```

轮询会打印每次尝试的 `Age` / `x-proxy-cache` / `Last-Modified` / `data-model`，一旦
`Last-Modified` 或 `ETag` 变化就停并把 after 写盘 + 直接比较。**不加查询串**。

### 4）反证（比较器自身不是恒绿）

```bash
# 同一份快照自比 ⇒ 0 差异（acceptance ④）
node research/_raw/t40/compare-live.cjs \
  --before=research/_raw/t40/live-baseline.json --after=research/_raw/t40/live-baseline.json

# 造两份假 after：一份"部署已生效"、一份"版本变了但内容不对"
node research/_raw/t40/make-selftest-after.cjs
node research/_raw/t40/compare-live.cjs --before=research/_raw/t40/live-baseline.json \
  --after=research/_raw/t40/selftest/after-deployed.json --require-deployed        # → exit 0，17 处差异，期望全成立
node research/_raw/t40/compare-live.cjs --before=research/_raw/t40/live-baseline.json \
  --after=research/_raw/t40/selftest/after-version-only.json --require-deployed    # → exit 1（判红）
```

## 期望读数与判红条件

`--require-deployed` 下，**after 快照必须同时满足**：

1. `/models/` 的 `data-model` 计数 **== 44**（静态表一行不少）；
2. `/models/` 出现 `models-show-legacy` **≥ 1**（「显示旧型号」入口在）；
3. `/models/deepseek-v3.2/` 出现 `data-release-date` **≥ 1**（legacy 详情页有发布时间标记）；
4. 七条路由**全部 200**。

任何一条不成立 ⇒ **exit 1（判红）**。此时先看"版本信号"：

| 版本信号（状态/Last-Modified/ETag 有变化） | 期望读数 | 结论与处置 |
| --- | --- | --- |
| 无 | 未成立 | **还没部署 / CDN 未过期**：等 ≤600 秒再跑，或先查 `gh run list --workflow "Deploy to GitHub Pages"`；**不要**判缺陷 |
| 有 | 未成立 | **真问题**：新版本已上线但内容不对（例如 `data-model ≠ 44`）⇒ 按缺陷处理，别用查询串自证 |
| 有 | 成立 | ✅ 部署已生效，继续跑 `verify-site.js --url=` 做完整冒烟 |
| 无 | 成立 | 矛盾（内容变了但指纹没变）⇒ 人工看一眼 `--json` 里的逐路由差异 |

退出码：`0` 比较完成且满足要求 ｜ `1` `--require-deployed` 下不满足 ｜ `2` **after 取不到**（文件缺失/读不了/快照结构不对）—— 会打印明确原因、**不会崩** ｜ `3` 用法错误。

## 与完整冒烟的关系

本比较器是**轻量判定器**（7 条路由 + 3 件 DOM 事实，秒级）；完整冒烟仍是：

```bash
node scripts/tools/verify-site.js --url=https://buguoshixc.github.io/ai-deals-aggregator/ --json=research/_raw/t19/smoke.json
```

顺序建议：**先用本比较器等"部署生效" ⇒ 再跑 verify-site 全量**（否则后者会在本版新增断言上正确地判红，浪费时间排查）。

## 本目录文件

| 文件 | 作用 |
| --- | --- |
| `live-baseline.json` | **部署前**基线快照（acceptance ①② 的对照物） |
| `compare-live.cjs` | 快照抓取 + before/after 比较 + 轮询等待（acceptance ③④） |
| `make-selftest-after.cjs` | 造两份假 after 夹具（证明比较器不是恒绿） |
| `self-compare.log` | 自比 ⇒ **0 差异** 的运行输出（acceptance ④） |
| `selftest/after-deployed.json` / `selftest/after-version-only.json` | 假 after：生效版 / 版本变了但内容不对版 |
| `selftest/compare-after-deployed.log` | 生效版比较输出（17 处差异 + 期望全成立，exit 0） |
| `selftest/compare-version-only.log` | 内容不对版比较输出（`--require-deployed` ⇒ exit 1） |
| `selftest/compare-missing-after.log` | 「after 取不到」的输出（exit 2，不崩） |
| `selftest/poll-no-change.log` | 轮询模式在「未观察到版本变化」时的输出与处置文案（用 `--timeout-min=0` 演示，不需要真等 12 分钟） |
