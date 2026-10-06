# t23 · 发布前最终闸门（**终态** · 只写不发布）

> 装置：`release/check-release-consistency.cjs`（一条命令复跑全部判据，本文件不手抄数字）。
> 冻结基线（**轮 6**）：`scripts/tools/verify-site.js` sha256 **`2cbc160dc64f8ade…`** · 522,527 B ·
> 8057 个换行 / 8058 行（含末尾空行 —— 两个口径都对，见 §2.3）。
> 生成时刻：**2026-10-06 23:5x（attempt 2 · 终态）**。

## §0. 结论

> ### ⚠️ 差一行 `.gitignore` 就能提交（其余全绿）
> 文档侧、索引侧、物料侧**全部就绪**：`check-evidence-index.cjs --git` **EXIT=0（59/59）**、
> 五份文档引用 **287 条 0 缺失**、sha 绑定 **0 冲突（DRIFT 0）**、§30 十五项齐备、
> `online-smoke.cjs` 绑定有效（沿用 t12 演练 EXIT=0）。
>
> **唯一的 FATAL 是 add 清单里的一个运行期新建的 scratch 沙箱**：
> `verify/scratch/t31-form/**`（**279 文件 / 18.96 MB**，由**正在运行的 t31** 于本闸门期间新建，
> 内容是渲染出来的整站副本）。修法**一行**：
> ```gitignore
> **/scratch/        # 任何位置的可再生 scratch 沙箱（与 ① 同一条纪律）
> ```
> 实测：加上它之后 add 清单从 **≈1,235–1,239 文件 / ≈123 MB** 回到 **956 文件 / ≈104 MB**，
> 且 `teeth/_scratch` 的 4 个**指名放回件**仍然在清单里（白名单不受影响）。
> ⚠️ t31 仍在写（最后一笔 23:57）⇒ **等它停写后请重跑一次本闸门**（§6 三条命令）。
>
> 换句话说：**除这一行 + 一次停写后的复跑之外，发布侧已全部就绪。**

| # | 项 | 结论 | 关键读数 |
| --- | --- | --- | --- |
| 1 | add 清单终检 | ⚠️ **差一行**（captain 写权限） | 现状 ≈1,235–1,239 文件 / ≈123 MB，其中 `verify/scratch/t31-form`（279 / 18.96 MB）是运行期新建的可再生副本；补 `**/scratch/` 后 **956 文件 / ≈104 MB**、越界 **0**；`teeth/_scratch` 残留**恰好**是 4 个指名放回件 |
| 2 | 证据索引终检 | ✅ **通过** | PR 索引 **59/59 存在、0 死链**；五份文档引用 **287 条路径 0 缺失**；sha 绑定 **0 冲突** |
| 3 | 文档引用对账（终局） | ✅ 通过（1 处低危残留） | 已取消任务号在报告 / self-audit / PROJECT_STATUS / NEXT-STEPS / release 物料里 **0 处**；仅 `docs/DESIGN-RULES.md:87` 剩 1 处（§3.2） |
| 4 | §30 十五项字段 | ✅ **通过** | **11 项实数 + 4 项待发布**（提交 sha / PR / 合并 / 部署），四处都写着「待发布后回填」，**没有任何预写数字** |
| 5 | 发布物料自洽性 | ✅ **通过** | `online-smoke.cjs` **未改动**（`ab1e5127…`，与 t12 演练同一版；`dist/index.html de028a0d…` 未变）⇒ **沿用 t12 演练 EXIT=0，无需重跑** |

## §1. add 清单终检

### §1.1 读数

```bash
git add --dry-run --all -- index.html scripts/lib/page-kinds.js scripts/lib/archive.js \
     scripts/tools/build-local.js scripts/tools/verify-site.js scripts/tools/archive-selftest.js \
     scripts/tools/seo-selftest.js research/_raw/secondary-page-layout-unification
```

| 读数 | 现状（t31 仍在写） | **补 `**/scratch/` 之后** | attempt 1（22:03） |
| --- | --- | --- | --- |
| 文件数 | **≈1,235–1,239** | **956**（实测） | 5,444 |
| 总体积 | ≈123 MB | **≈104 MB** | 395.7 MB |
| 其中源码 7 个 | 7 个 · 1,362,935 B ≈ 1,330 KB | 同左 | 1,323,194 B |
| 越界（scratch / png / dist.* / 停机快照） | **1 组**（`verify/scratch`） | **0** | 4 组 |

> 数字区间：t31 在闸门期间持续写入（23:56–23:57 仍有新文件），所以"现状"是个区间；
> **文件数在补规则前会小幅上浮**。终值请用 §6 的命令现场取。

### §1.2 "不该进清单"的七类 —— 逐类实测

| 类别 | 是否排除 | 实测 |
| --- | --- | --- |
| `dist.baseline/` / `dist.synth-fixed/` | ✅ | add 清单里 `^dist` 命中 **0** |
| `_halt-snapshot-*/`（停机快照） | ✅ | 命中 **0** |
| png / 截图 | ✅ | 命中 **0**（`**/*.png`） |
| `review/scratch/`、`adversary/scratch/`、`recovered/pre-t7/` | ✅ | 命中 **0**（`.gitignore` ①②） |
| `teeth/_scratch/` 整站副本 | ✅ | 命中 **0**；`teeth/_scratch/*` + 4 条 `!` 指名放回生效 |
| `review/t20|t26|t29/scratch`、`t21/scratch`、`adversary/_scratch`、`adversary/sandbox-pre-t7` | ✅ | 命中 **0**（captain 追加的 `review/*/scratch/` + 本闸门提议的规则都已落盘） |
| **`verify/scratch/`（t31 运行期新建）** | ❌ **未排除** | **279 文件 / 18.96 MB**；修法 = `**/scratch/`（一行） |

### §1.3 `verify/scratch` 是什么 / 为什么该排除 / 怎么排除

- 内容：`t31-form/` 下 `.nojekyll`、`api-plans.json`、`deal-history.json`、`deal/<id>/index.html`… ——
  **渲染出来的整站副本**（可再生）；
- 与 `review/scratch/`、`t20/scratch` 同性质 ⇒ 按仓库既有纪律（"可再生的字节不入索引"）排除；
- 建议规则（**一行**，写在 `research/_raw/secondary-page-layout-unification/.gitignore`）：
  ```gitignore
  **/scratch/        # 任何位置的可再生 scratch 沙箱
  ```
  （它同时覆盖 `review/scratch/`、`review/t20/scratch/`、`t21/scratch/`、`verify/scratch/`…，
  与既有的 `teeth/_scratch/*` + `!` 白名单**不冲突**）；
- **安全性实测**：文档里**没有任何被引用的路径**落在 `/scratch/`（非 `_scratch`）之下
  （唯一的 `scratch` 命中是 `release/pr-body.md` 里对 `review/scratch/` 的一句说明文字）；
- **效果实测**：`git -c core.excludesFile=…` 叠加这一行后
  **1,235 → 956 文件**（排掉 279），4 个白名单文件仍在。

### §1.4 `teeth/_scratch` 的 4 个残留：**这是设计意图，不是越界**

| 文件 | 为什么必须入库 |
| --- | --- |
| `teeth/_scratch/mutations.json` | 最终报告 §G（983/1284/1286 行）点名引用：轮 4 的原始 mutations.json 落点 |
| `teeth/_scratch/splice-22c.cjs` | 报告 §J ④（1263 行）点名：t7 原地整块替换 §22c 的工具 |
| `teeth/_scratch/r4-contents-before.log` / `r4-contents-after.log` | 报告 §G（1329 行）点名：全站 contents 改前/改后 |

装置已按 captain 的指示把这 4 条写进**显式白名单**（`REINCLUDED`），不再计入越界。

## §2. 证据索引终检

### §2.1 PR 描述的证据索引（`release/pr-body.md` 标记块）

| 判据 | 读数 |
| --- | --- |
| 索引路径条数 | **59** |
| 盘上不存在 | **0** |
| 不在 add 清单里（提交后会死链） | **0** |
| 被 `.gitignore` 吃掉 | **0** ⇒ `check-evidence-index.cjs --git` **EXIT=0** |

快照：`evidence-index-snapshot.txt`（含两条命令的原始输出）。

### §2.2 报告与三份文档**正文**引用的路径（比 PR 索引更宽的一层）

扫描 5 份文档，共抽到 **287** 条仓库相对路径：**存在 287 / 不存在 0**。
另有 6 条站内路由（`/docs/data/` 等页面 URL）、3 条厂商文档/URL、2 条通配写法、
2 条省略号缩写（**都能解析到唯一文件**）—— 都已按类别正确归位，不计为缺失。

对比 attempt 1：报告的 9 处、PROJECT_STATUS 的 2 处、DESIGN-RULES 的 1 处缺失**已全部修好**。

### §2.3 sha256 一致性

| 类别 | 读数 |
| --- | --- |
| 可自动绑定并核对的行 | 1 条 —— **对得上（0 冲突）** |
| 解析器拒绝硬绑、**已逐条人工核对**的行 | 10 条 |

| 出处 | 文档写的值 | 盘上真值 | 判定 |
| --- | --- | --- | --- |
| 报告 529 / 1091 / 1114 · PROJECT_STATUS 25 · DESIGN-RULES 59 | `2cbc160dc64f8ade…`（轮 6 判据） | `2cbc160dc64f8ade…`（522,527 B） | ✅ 一致 |
| 报告 1081 | `d1c4b0df6900edf8…`（gate action.yml） | `d1c4b0df6900edf8…` | ✅ 一致 |
| 报告 320 / 813 | `46c28fa120a39aba…`（truth-401.json） | `46c28fa120a39aba…` | ✅ 一致 |
| 报告 1280 | `4cae2fb2…`（修复前的旧版，正文即声明"磁盘上已不存在"） | — | ✅ 声明属实 |
| PROJECT_STATUS 1578 | `cec440b4…`（两侧 `markup` 摘要相同） | — | ✅ 自洽（不是文件 sha） |

> 行数口径：`split('\n').length` = **8058**、换行数 = **8057**（文件以换行结尾）—— 文档写"8058 行"与
> 本装置写"8057 换行"**并不矛盾**，是同一个文件的两个数法。

## §3. 文档引用对账（**终局**）

### §3.1 已取消任务号（第一轮闸门报的 14 处）

| 检查面 | 命中 |
| --- | --- |
| 报告 / self-audit / PROJECT_STATUS / NEXT-STEPS / release 物料 | **0**（旧号一个不剩，已按映射全部更新） |
| 新号的在场证据 | `t21` 20 处 · `t22` 33 处 · `t23` 7 处（引用确实换到了新号，不是删掉了事） |

### §3.2 唯一残留（低危，不阻塞提交）

`docs/DESIGN-RULES.md:87` 行内还留着一处旧号：`…t17 的独立实验还证明：把真实引文换成编造文本，provenance-selftest…`。
它**指向一个已取消的任务**（改法：把 `t17` 换成 `t22`，或去掉任务号只留"独立实验"）。
除此之外：正文引用路径缺失 **0**、缩写解析不出 **0**、行号越界 **0**。

## §4. §30 十五项字段齐备性

| # | 字段 | 现状 | 出处 |
| --- | --- | --- | --- |
| 1 | 最终提交 sha | ⏳ 待发布后回填 | 报告 §H.3 / §I（明写"不预写"） |
| 2 | PR | ⏳ 待发布后回填 | §H.3 / §I |
| 3 | 合并状态 | ⏳ 待发布后回填 | §I |
| 4 | 部署状态 | ⏳ 待发布后回填 | §I |
| 5 | 改动文件 | ✅ 实数 | §D.1（7 个源文件） |
| 6 | 页族 | ✅ 实数 | §B + §D.3（wide 55 / detail 131） |
| 7 | 前后几何 | ✅ 实数 | §E（含 401 条逐条） |
| 8 | 移动端溢出 | ✅ 实数 | §F.5（390 / 360） |
| 9 | 详情页回归 | ✅ 实数 | §F.3 / §F.4（80 deal + 51 model） |
| 10 | 变异结果 | ✅ 实数 | §G（M0–M12 逐条期望码与实际命中） |
| 11 | Full Gate | ✅ 实数 | §H（49 步 / 45 执行 / 45 通过 / 4 跳过 / exit 0；47 步 852、48 步 858） |
| 12 | 线上 smoke | ⏳ 待发布后回填（§I 已写明回填来源与"不得编造"） | §I |
| 13 | 数据/文案/路由零变化 | ✅ 实数 | §D.4（非 HTML 117/117、HTML 186/186 去样式逐字节相同） |
| 14 | 遗留问题 | ✅ 实数 | §J（四类裁定 + 残余项） |
| 15 | 结论 | ✅ 实数 | §C.5 / §J |

⇒ **11 实数 + 4 待发布回填**；无字段缺失、无占位符、无预写数字。

## §5. 发布物料自洽性

| 判据 | 读数 |
| --- | --- |
| `online-smoke.cjs` 是否改动 | **未改动**：sha256 `ab1e51278d0fe408454ceaf73e7f379753052c0c62193ec940c1db71c245a6c5`（= t12 演练那一版） |
| 演练标的产物是否改动 | `dist/index.html` `de028a0d…`、`dist/sitemap.xml` `1b633ae9…`（与 t12 演练时相同）⇒ 演练证据仍绑定 |
| 演练结论（沿用） | `rehearsal-summary.json` **`ok: true`**、8/8 用例符合期望、出口纪律"非回环 base 0 条 · 产物里真实域名 0 次" |
| 结论 | **无需重跑**（"若改动才重跑"的反面条件成立）；本轮也未再跑浏览器 |
| commit-message / pr-body / checklist | §22c 口径已是**并集口径**（10 个违规码含 `note-ink-narrow` / `note-hidden-text`、M1–M12、现场 70ch=452.81px 物理前置；三个文件表述一致） |
| S1–S11 清单 | 结构完整；S2 已含本闸门步骤（`check-release-consistency.cjs`，期望 EXIT=0） |

## §6. 提交前要做的事（captain）

```bash
# ⓿ 一行修法：在 research/_raw/secondary-page-layout-unification/.gitignore 追加
#    **/scratch/          （任何位置的可再生 scratch 沙箱；排除 t31 的 verify/scratch/）

# ① 闸门（期望 EXIT=0：FATAL 0 / DRIFT 0）
node research/_raw/secondary-page-layout-unification/release/check-release-consistency.cjs \
     --json=research/_raw/secondary-page-layout-unification/release/final-gate.json
# ② 证据索引（期望 EXIT=0：59/59 存在且提交后仍在）
node research/_raw/secondary-page-layout-unification/release/check-evidence-index.cjs --git
# ③ add 清单（期望 ~956 行、越界 0）
git add --dry-run --all -- index.html scripts/lib/page-kinds.js scripts/lib/archive.js \
     scripts/tools/build-local.js scripts/tools/verify-site.js scripts/tools/archive-selftest.js \
     scripts/tools/seo-selftest.js research/_raw/secondary-page-layout-unification | wc -l
```

外加可选一处：`docs/DESIGN-RULES.md:87` 的旧任务号（§3.2）。
⚠️ 三条命令都要在 **t31 停写之后**跑；跑完把 `final-gate.json` 留档（§I 回填时可引用）。

## 附录 A · attempt 1（22:12）的 blocker 闭合情况

| 上次的 finding | 现状 |
| --- | --- |
| add 清单会带 4,639 个可再生 scratch 文件（≈320 MB） | ✅ **已闭合**（`teeth/_scratch/*` + 4 条 `!` + `review/*/scratch/`）；本轮新增的 `verify/scratch`（t31）用同一手法一行闭合（§1.3） |
| 报告/文档 12 处引用路径不存在 | ✅ **已闭合**：五份文档 287 条引用 **0 缺失** |
| 判据 sha 过期待冻结（high） | ✅ **已闭合**：文档与盘上均为 `2cbc160dc64f8ade…`（0 冲突） |
| 14 处旧任务号（medium，当时暂缓） | ✅ **已闭合**：0 处（仅剩 DESIGN-RULES:87 一处低危，见 §3.2） |
| `scripts/data/ai-applied-log.json` 引用（low） | ✅ 已处理（不再判定为缺失引用） |
| `47-…txt` 缩写解析不出（low） | ✅ 已闭合（缩写解析 2/2） |

## 附录 B · 本闸门的证据文件

| 文件 | 内容 |
| --- | --- |
| `release/check-release-consistency.cjs` | 装置：索引 ⊂ add 清单 / 文档引用 6 桶分类 / sha 绑定 / 显式白名单 / 版本 pin |
| `release/final-gate.json` | 本次运行的机器可读结果（FATAL / DRIFT / 各文档桶计数 / add 读数） |
| `release/version-pins.json` | 版本绑定表（7 源文件 + 4 发布脚本 + 3 产物 + 5 文档的 sha256·大小·行数·mtime） |
| `release/add-manifest.txt` / `add-manifest-dryrun.txt` | 精确 `git add` 清单 + 逐条 dry-run 输出 |
| `release/evidence-index-snapshot.txt` | PR 索引核对快照（存在性 + `--git`） |
| `release/proposed-gitignore-addendum.txt` | 追加规则原文（含"为什么必须 `dir/*` + `!`"与 `**/scratch/` 的安全性与效果实测） |
