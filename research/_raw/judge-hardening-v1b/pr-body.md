# judge-hardening-v1b（t10）：seo 侧的注释伪造面 F2 / F3 / A1 + 观察 2 收口

修掉 t5 对抗性验证在 `lib/seo.js` / `seo-verify.js` 上打出的破防：**判据读的文本必须先剥注释**。
`verify-site.js` 的那一半（t9）不在本 PR 的声明面内。

## 改了什么

- `scripts/lib/seo.js`：新增唯一实现 `stripComments()`（丢 `<!--…-->`；`<script>/<style>` 段整段保住，内联 RENDER-CORE 里的
  `<!--` 字面量不被误判；注释里的 ld+json 整段丢）。`stripless()` 改为「先摘 script/style 再剥注释」；
  `jsonLdBlocks()` 走只剥注释的路径；`rowMarkers()` 走 `stripless()`；`internalLinks()` 认两种引号（`"…"` / `'…'`）；
  死代码 `attr()` 一并纪律化。
- `scripts/tools/seo-verify.js`：`strip()`、`itemListOf()`、sitemap `<loc>` 扫描三处改为经 `seo.stripComments()`；
  **新增**一条不变式「登记集合 == 实时余量 < 150 的页面集合」（少登记 / 过期登记都判红；19 项）。
- `scripts/tools/seo-selftest.js`：t7 的 §八 补丁**按原文落地**（非空行 61 行逐字核对 `identical`）+
  §九 8 条（三条伪造面 + 三个读点护栏）+ A1 矩阵 2 条。**88 → 103 项 / 0 失败**。

## 三段读数（伪造副本 / 真删对照 / 原样）

| 面 | pre-fix 伪造 | pre-fix 真删 | 本分支 伪造 | 本分支 真删 | 原样 |
| --- | --- | --- | --- | --- | --- |
| **F2** sitemap `<url>` 块包 XML 注释（`vendor/zhipu/`） | ✅ 18/0 **假绿** | ❌ 18/2 | ❌ **19/2** | ❌ 19/2（**同一批失败项**） | ✅ 19/0 |
| **F3** canonical 包 HTML 注释（`need/student-only/`） | ✅ 18/0 **假绿** | ❌ 18/1 `[canonical-self]` | ❌ **19/1** `[canonical-self]` | ❌ 19/1（同解） | ✅ 19/0 |
| A1 robots / title / rowMarkers | ✅ 假绿 | ❌ 红 | ❌ 红（与真删同解） | ❌ 红 | ✅ 19/0 |
| A1 h1Count（注释里的第二个 h1） | ❌ **假红** | — | ✅ 0 失败 | — | ✅ 19/0 |
| A1 internalLinks（单引号死链） | ✅ 假绿（看不见） | — | ❌ `[internal-link-exists]` | — | ✅ 19/0 |

**观察 2**（t13 提出 / t24 实测「登记表与转写一起裁 ⇒ 两门禁都绿」）：沙箱内把 6 行登记裁到 1 行 ——
pre-fix 工具链 `verify:seo` **18/0 不响**、自测不响（复现上界）；本分支 `verify:seo` **19/1 点名 5 页「未登记」**、自测仍绿；
只裁表（转写不动）⇒ 预存牙与新不变式**同时**响；复位 ⇒ 双绿。反向面（页面被裁薄 1429→1127、余量 107）同样被点名。

## 证据与账

- 断言只增不减：`selftest:seo` **88 → 103/0** · `verify:seo` **18 → 19/0** · 检查码 **28 不变** · `check:ci` **39/0** · `check:evidence` ✅。
- **产物零变化**：pre-fix `seo.js` 构建 vs 本分支构建，**304 文件逐文件 sha256 全等**（全树 `b99fd06d…`）。
- **影响面普查**：304 文件里「注释里的读点标记」「script/style 段里的 `data-item`」「可见文本里的单引号 `href`」均为 **0 处**，
  sitemap `<loc>` 原始 183 == 剥注释后 183 —— 三处收紧只作用于伪造副本。
- 本机 `npm run gate`：**48 脚本 / 0 失败 / 299.4s / exit 0**（含 verify-site 121.1s）。
- 交付：`research/judge-hardening-v1b-report.md`（§3 逐处行号对照表）、`research/judge-hardening-v1b-self-audit.md`、
  `research/_raw/judge-hardening-v1b/`（5 个 JSON + README）。

## 未做 / 未验证（详见报告 §6、自审 §5）

- `verify-site.js` 侧的对应读点（t9）；CI 读数以本 PR 门禁为准；`jsonLdBlocks` 在 `verify:seo` 侧**没有产物级判据**
  （包注释与真删都是 0 失败，仅规则级矩阵钉住）；`stripComments()` 自身的对抗边界（未闭合注释 / 嵌套 / `<script>` 里的 `-->`）留给 t11。
- 未改 `docs/DESIGN-RULES.md` / `NEXT-STEPS.md`（建议行以消息发 captain）。
