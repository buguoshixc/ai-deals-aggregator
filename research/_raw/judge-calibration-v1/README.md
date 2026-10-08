# `research/_raw/judge-calibration-v1/` · 原始读数（Tier-1）

本轮（`judge-calibration-v1`，**只读探针**）的入库证据。报告与自审在
[`research/judge-calibration-v1-report.md`](../../judge-calibration-v1-report.md) 与
[`research/judge-calibration-v1-self-audit.md`](../../judge-calibration-v1-self-audit.md)。

| 文件 | 内容 | 对应 |
| --- | --- | --- |
| `px-rem-census.json` | 全站 186 页的 px/rem 宽度声明普查（逐页逐声明的现场量测）+ 外部样式表 / 行内 `style=""` / `@media` 三个额外入口 + ch 侧交叉核对 | 报告 §1（T1） |
| `tolerance-sweep.json` | §19 居中容差 2px 的敏感性标定：位移 0–5px 逐档（两轮变形法的完整读数，含第一版方法的坑） | 报告 §2（T2） |
| `vertical-ratio-ab.json` | §22c 竖排轴阈值 0.85 vs 0.5 的 A/B：两档各跑一整轮真判据的逐形态对照 + 阈值副本的 sha256 与「改了哪几行」 | 报告 §3（T3） |
| `column-gap.json` | 横排 `column-gap` 细分：现场样本 0 条 + 6 个合成形态的单元数/跨度 + 对 ② 前置条件的影响 | 报告 §4（T4） |
| `source-unchanged.json` | 「源文件 0 改动」的机器证明（`git status --porcelain -- scripts/` 为空 + sha256/blob 比对）与本轮所量代码段在 base / `origin/master` 上的逐段一致 | 报告头部与自审 §4 |

## 读数是怎么产生的（可复跑）

* 装置与全部原始输出在 `.arch-v1/`（Tier-3，gitignore）：`calib-px-rem-census.cjs` ·
  `calib-css-surface.cjs` · `run-tolerance-sweep.ps1` · `run-tolerance-shift.ps1` · `calib-synth-build.cjs` ·
  `make-ratio-copies.cjs` · `ab-compare.cjs` · `ink-lib.cjs`（与 §22c **逐字同款**的文字几何量测）·
  `criteria-region-hash.cjs` · `source-unchanged.cjs` · `compose-calib-evidence.cjs`。
* 变形**只作用于 `dist` 的副本**（`dist.calib` / `dist.calib.offN` / `dist.calib.shiftN` / `dist.calib.synth`），
  仓库里的 `dist` 与判据源文件未改一字节。
* 复跑顺序见报告 §5；注意「`--dir=<副本>` 时工作树里必须有 `dist/index.html`」这条前置
  （`verify-site.js` 的 `sharedFooterExternalHrefs` 硬编码读它）。
