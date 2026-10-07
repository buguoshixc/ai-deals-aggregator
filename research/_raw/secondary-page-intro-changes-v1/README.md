# `secondary-page-intro-changes-v1` 量测证据（Tier-1 摘要）

> 基线 `origin/master = a57670d`。完整报告见
> [`research/secondary-page-intro-changes-v1-report.md`](../../secondary-page-intro-changes-v1-report.md)，
> Self-Audit 见 [`…-self-audit.md`](../../secondary-page-intro-changes-v1-self-audit.md)。
> 证据分级与操作顺序见 [`docs/EVIDENCE-POLICY.md`](../../../docs/EVIDENCE-POLICY.md)。

## 这里的文件是什么

| 文件 | 内容 | 为什么留 |
|---|---|---|
| `diff-verify.json` | 186 个页面逐字段 Before/After 对账（数据面 / 文案面 / 形状面） | 它是「数据面零变化」这条结论本身；删掉它就只剩一句声明 |
| `geometry.json` | 真浏览器（msedge headless）在 1440 / 390 / 360 下的首屏几何、说明条数、变化块在场性、横向溢出；非空分支 fixture 的亮/暗与无 JS 读数 | 「首屏提前了多少」与「零变化不渲染」都是**浏览器层**的事实，静态检查看不见 |
| `digest-manifest.json` | 三份逐页摘要原件的路径、字节数与 sha256 | 原件（含 186 页的 `itemIds` / `detailHrefs` 全量数组）属 Tier-2，不入库；这里留指纹与复跑口径 |
| `online-smoke.json` | 线上冒烟（合并 + Deploy 之后）：HTTP 层 6 条二级页 + `/changes/`，并内嵌真浏览器 4 条路由 × {1440, 390, 360} 的量测 | prompt §40 的线上抽查记录；「390px 无溢出」只有浏览器能回答 |
| `release.json` | 发布链路读数：基线 / final SHA、PR、CI run、merge commit、Deploy run、线上冒烟判定 | 一条链路的**结论**，不必去 Actions 页面翻日志 |
| `pr-body.md` | PR 正文存档 | 评审入口 |

## 怎么复跑（装置在 `.arch-v1/`，Tier-3，不入库）

```bash
# ① 逐页摘要（两个产物树各取一份）
node .arch-v1/digest.cjs <before-dist> before --out=.arch-v1/before.json
node .arch-v1/digest.cjs dist           after  --out=.arch-v1/after.json

# ② 逐字段对账 → diff-verify.json（Tier-1 摘要）
node .arch-v1/compare.cjs .arch-v1/before.json .arch-v1/after.json --out=.arch-v1/diff-verify.json

# ③ 真浏览器几何（--fixture 走非空分支）
node .arch-v1/geometry.cjs <before-dist> before
node .arch-v1/geometry.cjs dist           after
node .arch-v1/geometry.cjs dist           fixture --fixture

# ④ 产物级字符串对账（禁用串逐页）
node .arch-v1/strings-check.cjs

# ⑤ Full Gate（步骤从 .github/actions/gate/action.yml 现读）
node .arch-v1/full-gate.cjs

# ⑥ 打包成上面这几份 Tier-1 摘要
node .arch-v1/pack-evidence.cjs
```

`digest-manifest.json` 里的 `before-rebuilt` 与 `before` **逐字段相同** —— 把 BEFORE 产物
重新构建一遍再取摘要，结果一字不差：装置可复跑，且构建是确定性的。
