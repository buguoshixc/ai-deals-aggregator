# t11 · `criteria-adversary-v1-reattack`：对 t9/t10 修复后的判据做再攻击

**被攻击对象**：t9（PR #89，已并入 master）+ t10（`origin/judge-hardening-v1b`）的**整合树**（我在自己的工作树里 `git merge` 成 `d12005e`，只读产品）。
**本 PR 只含 `research/**`**（5 个文件）——t10 那半仍走它自己的 PR #90，本分支**不代它合并**。

## 判定一句话

**9 条破防 9/9 闭合 · 守住面 15/15 无回归 · §7 最省绕过前 3 名全闭合 · 未覆盖 6 条里 1 闭合 / 1 修好 / 1 部分闭合 / 3 仍开 ·
新增 15 条形态 + 6 个沙箱里 2 条新破防 + 1 条新未覆盖。**

## 关键读数（24 次门禁实跑）

| 读数 | 值 |
| --- | --- |
| 基线（整合树干净跑） | `verify-site` **881/0**（t5 基点 874）· `verify:seo` **19/0**（t5 11）· dist 全树 `df43587c…` / 304 文件 |
| 9 条破防 | R2 逗号借登记 · R3 注释吃掉真规则 · R4 `70CH` · R5 `MAX-WIDTH` · R11 第二条登记/幽灵条目 · V3 竖排单列裁切 · F1 冻结串进注释 · F2 sitemap 进注释 · F3 canonical 进注释 —— **全部现在红**，且 F1/F2/F3 与「真删对照」**失败项逐个同名**（同解） |
| 守住面 15 条 | `att`/`att2`/`g19`/`g21`/`g300`/`g1400`/`grtl`/`gxf` 逐条复跑：**无回归**（G4/G5 仍 0 失败，G2/G3 仍按设计红） |
| 前 3 名绕过路径 | `70CH`/`MAX-WIDTH:`（三页全红）· 逗号（红）· `width:300px`（**新断言：生效宽 300px ÷ 465.75px = 0.644** 红） |
| 假红 R9（`!important`） | 已修：同一处已登记声明加 `!important` 不再误报 |
| **新破防 N14** | 裁切**祖先**（8px 高 + `overflow:hidden`）包住页面级说明 ⇒ **881/0 零码**（探针：说明自身 `scroll == client`，父盒 8px） |
| **新破防 N8/N9** | 把冻结串包进 `@media not all` / 假 `@supports` ⇒ **冻结串判据自己沉默**（文本计数仍 1），红来自变异电池连带（探针证明真规则已死：`12px/20.4px` → `14px/21px`） |
| 新发现 N15 | sitemap 用**未闭合**注释吞掉 `<url>` ⇒ `verify-site` 的成员资格判据说「sitemap 有」（假绿），`verify:seo` 19/2 红 ⇒ 两判据不一致 |
| 新未覆盖 N19 | `<noscript><style>` 里的 ch 窄列：判据沉默（有 JS 时它不是 DOM；无 JS 读者会看到窄列） |
| 产品零改动 | 注入前后 `dist/` 全树摘要**同一串** `df43587c…`；`git status --porcelain` 空；每个副本「意外变更 0 / 丢失 0」 |
| 门禁 | `build` exit 0 · `verify-site --dir=dist` **881/0** · `verify:seo` **19/0** · `check:evidence` ✅ |

## 方法读数（两条无效形态 + 一条判据截断）

1. **说「判据沉默」之前必须证「形态生效」**：N5（`max-/*x*/width` —— CSS 里不是合法属性名）与 N14 第一版（父盒 24px > 说明 20.39px）都没落到布局上，第一次跑都是「零码」；补探针后判为**无效形态**，N14 改成 8px 才拿到真破防。
2. **判据的点名列表被截到前 4 条**（`slice(0, 4)`）：逐形态归因做不全 ⇒ 把判据**复制到沙箱**改成 200 再跑（产品零改动），才拿到 `att` 9 页 / `newa` 6 页的完整清单。

## 交付

- `research/criteria-adversary-v1-reattack-report.md`（§2 九条闭合逐条 · §3 守住面 · §4 未覆盖更新判定 · §6 新破防 · §9 从零复跑 · §10 没证明的东西）
- `research/criteria-adversary-v1-reattack-self-audit.md`
- `research/_raw/registry-adversary-v1/reattack-{copies,extra}.json` + `reattack-README.md`（**没有覆盖 t5 的 7 份证据**）
- 装置与副本在 `.arch-v1/`（Tier-3，本机未入库）

**未覆盖（如实）**：CI/POSIX 未跑 · N19 的「无 JS 读者看到窄列」未实测 · N14 只测一页一个高度 · A1 其余静态判定项未逐条造副本 · `.pdetailbody` 探针重建失败（N10/N11 引用门禁自报值）。
