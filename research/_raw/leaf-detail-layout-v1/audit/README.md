# 独立几何探针（T3 脚手架 · audit-repro 自建）

这份目录只服务于**独立复查**：探针不 `require` `scripts/tools/verify-site.js`，也不复用它的任何函数——
静态服务、等到布局稳定、量 bounding box、判据求值全部自写，只依赖 `playwright-core`（用系统 Edge 启动）。

## 文件

| 文件 | 是什么 |
| --- | --- |
| `leaf-probe.cjs` | **同一把尺子**。`--dir=` / `--route=` 量 `.wrap / main / .dpane / .dpane-more / .dpane-src / .topin / footer` 的 rect + `centerΔ` + 关键 computed，量 390px 的 `documentElement.scrollWidth`，可写 JSON，可跑 M1–M5 变异。 |
| `before.json` | **改动前**基线复测结果（输入 = Captain 的快照 `baseline/baseline-dist/`）。 |
| `t3-make-synthetic-after.cjs` | 把改动前快照按 T1 补丁改成「合成改动后」副本（**只用于验证变异锚点**，不是交付结论）。 |
| `synth-after-check.json` | 合成改动后副本的读数（对照用）。 |
| `mutations/M*.json` | M1–M5 各自在合成副本上的变异记录 + 读数（锚点命中次数逐条记在 `mutations[].pages[].steps`）。 |
| `mutations/scaffold-selftest.txt` | 五颗牙「咬得到东西」的对账表（M0 基准 vs M1–M5）。 |

## 复用（T4 直接照抄）

```bash
WT=.worktrees/leaf-detail-layout-v1          # 工作目录 = 特性 worktree
cd $WT

# 改动后（真实 dist），与 before.json 同一把尺子：
node research/_raw/leaf-detail-layout-v1/audit/leaf-probe.cjs \
  --dir=dist --route=deal/<最长URL的id>/ --route=models/<slug>/ \
  --expect=none --label=after \
  --out=research/_raw/leaf-detail-layout-v1/audit/after.json

# 变异牙（在**临时副本**上改，被测 dist 只读）：
node .../leaf-probe.cjs --dir=dist --route=deal/<id>/ --route=models/<slug>/ \
  --mutate=M1 --expect=none --label=mutation-M1 --out=.../mutations/M1.json
```

`--mutate` 的两条铁律：CSS 块与替换锚点必须**恰好命中 1 次**（0 次或 ≥2 次 → 退出码 2 报红，
绝不「改了但不知改了哪」）；变异只写临时副本（默认 `audit/.tmp/`，可用 `--tmp=` 改），**绝不碰 `dist/`**。
本机 `%TEMP%` 对 node 的 `cpSync` 报 EIO（Access denied），所以副本根默认在 `audit/.tmp/`。

退出码：`0` 判据全过（或无判据）／`1` 判据未过／`2` 探针本身不成立（目录、路由、浏览器、锚点）。

## 改动前基线（`before.json`，label=before，退出码 0）

快照 provenance：`baseline/baseline-dist/`，`deal/2eae0e246de2/index.html` sha256 `852db703e38f3eb0…`、
`models/claude-opus-5.5/index.html` sha256 `84315c694383e319…`、`index.html` sha256 `49a30a4b1246b1e6…`
（与 Captain 的 `sha256-manifest.txt` 逐条一致）。

| 量测 | deal @1600 | deal @1440 | deal @1280 | deal @390 |
| --- | --- | --- | --- | --- |
| `main` offsetWidth | 1380 | **1380** | 1240 | 358 |
| `.dpane` offsetWidth | 820 | **820** | 820 | 358 |
| `.dpane-src` offsetWidth / max-width / word-break | 820 / 820px / break-all | 820 / 820px / **break-all** | 820 / 820px / break-all | 358 / 820px / break-all |
| `.dpane` centerΔ（列偏离居中） | **560** | **560** | **420** | 0 |
| `.wrap` / `.topin` offsetWidth | 1420 / 1420 | 1420 / 1420 | 1280 / 1280 | 390 / 390 |
| `footer` offsetWidth | 1380 | 1380 | 1240 | 358 |
| `documentElement.scrollWidth` | 1600 | 1440 | 1280 | **390（无横向溢出）** |

三条硬判据 **3/3 ✓**：`.dpane`=820（±1）、`main`=1380@1440、`.dpane-src` word-break=`break-all`。

两条对 T4 有用的基线事实：

1. **model 叶子页在改动前根本没有 `.dpane / .dpane-more / .dpane-src` 元素**（`count=0`），它的详情内容
   直接铺在 `main` 里（1380@1440）——「deal 与 model 真正统一」这一条在改动前不成立，改动后才谈得上统一。
2. 首页 `main` 在改动前后**都必须是 1380**（不该被 `.detail-main` 波及）。

### 快照的一个已知局限（impl-layout 在 T1 阶段指出的，独立记录在此）

这份快照是**旧构建**（其 `models/claude-opus-5.5` 页比 d09a1c5 的构建少若干数据字段）。因此：

- **布局类读数用它是有效的**（它确实带改动前的 CSS：820px / break-all / 无统一列）；
- 但凡涉及「结构未变、内容未变」的对比**不要用它**，会被旧数据混淆；
- deal 页 `2eae0e246de2` 的 `<div class="wrap">…</footer>` 骨架在同一 id 上 315→315，是干净的对照页。

## 变异牙自检（合成副本，M0 基准 vs 单颗牙）

| 指标 | M0(base) | M1 | M2 | M3 | M4 | M5 |
| --- | --- | --- | --- | --- | --- | --- |
| deal `main` @1440 | 1120 | 1120 | **820** | 1120 | 1120 | 1120 |
| deal `main` centerΔ @1440 | 0 | **260** | 0 | 0 | 0 | 0 |
| deal `.dpane-src` width / max-width @1440 | 1120 / none | 1120 | 820 | **820 / 820px** | 1120 | 1120 |
| deal `documentElement.scrollWidth` @390 | 390 | 390 | 836 | 390 | **1136** | 390 |
| model `main` @1440 | 1120 | 1120 | 820 | 1120 | 1120 | **1380** |
| \|deal−model\| `main` @1440 | 0 | 0 | 0 | 0 | 0 | **260** |

五颗牙的锚点各命中 **1 次**（记录在 `mutations/M*.json` 的 `mutations[].pages[].steps`），且每颗牙都能
把对应指标推向违规侧：M1 居中、M2 列宽、M3 来源块宽度、M4 小屏溢出、M5 两页不统一。

> 这是**合成**副本上的脚手架自检；T4 的正式复算必须在真实 `dist` 上重跑（`--mutate=M1..M5`），
> 并核对 `verify-site.js §22b` 的锚点唯一性守卫会真的判红。
