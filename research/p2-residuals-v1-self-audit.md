# p2-residuals-v1 自审（对抗性自查）

> 对象：`research/p2-residuals-v1-report.md` 与同一分支上的三个脚本改动。
> 目的不是复述结论，而是**找自己可能错的地方**：哪些断言可能假绿、哪些数字可能是巧合、
> 哪些话我说得太满、哪些我根本没验。

---

## 1. 我可能弄错的五件事（逐条给出反证或边界）

### 1.1 「余量 50」是不是一个数出来的巧合？

三条独立读数指向同一个值，且判别式是可复算的：

| 出处 | 命令 | 读数 |
|---|---|---|
| 构建期（内存里的页面） | `node scripts/tools/build-local.js` 的 SEO 门禁 | 28 码 × 186 页全过（余量 50 在红线之上） |
| 独立门禁（从 dist 重新数） | `node scripts/tools/seo-verify.js --dir=dist` | `need/no-card/ 710 字 − 下限 660 = 余量 50` |
| 一次性普查（全站 186 页） | `node .arch-v1/p2-census.cjs` | 50（次薄 123，第 7 页起 409） |

**并且**：`seo-verify.js` 里我另写了一个计数器（`ownVisibleText`），与规则层的
`seo.visibleText()` 在 6 个登记页上逐字相同（有一条断言守着）。两个实现在同一页上给同一个数，
说明这个 710 不是我某一处的笔误。

**仍然要说清的**：「可见正文」是一个**约定**（剥 script/style/注释/标签、折叠空白、解码实体）。
换一个计数器口径（例如把导航也算作不计、或按 `textContent` 数），这个 50 会变成另一个数。
登记表把这个约定**钉在 2026-10-08 的这份实现上** —— 这是它的价值，也是它的边界。

### 1.2 登记表会不会只是「装饰品」？

「读数写进代码」和「代码真的会响」是两件事。三条反证：

1. 检查码数 27 → **28**，构建日志里逐字打印 `28 个检查码 × 186 个页面全过`。
2. `【牙】登记值 +1 ⇒ 边界那一页跟着变红`（用同一份夹具、只改登记值）——证明**比的是登记值**。
3. **源码级沙箱实跑**：改数据（title 砍 9 字）⇒ 构建 exit 1 并打印
   `✗ SEO[thin-content-margin] need/no-card/：可见正文 701 字符，下限 660，余量 41 < 登记值 50`。

### 1.3 「比 thin-content 早」会不会是夸大？

沙箱里那一次：正文 702 → 余量 42 —— **`thin-content` 没有出现在红里**（`codesOf` 里没有它），
因为 42 > 0。这证明新牙在旧红线**之内**先响。最大提前量 = 登记值 = **50 个字符**
（再少 50 就同时踩两条）。

反过来说清楚**它的上限**：登记值以下它不会更早；超过登记值的变薄它**看不见**（那要靠人改登记）。

### 1.4 e3 的「0 处『查看全部』」会不会是扫漏了？

- 静态 DOM（剥 script/style）**0**；
- **含 `<script>` 模板的原始文件 0**（这一条是关键：改名最可能藏在 JS 模板里）；
- 渲染入口的 **7 个源文件 0**；
- 整个沙箱改名实验里，改名后**两条断言同时点名** ⇒ 扫描面确实覆盖了入口。

**边界（说清楚）**：产物侧扫的是「这个四字串」，不是语义 —— 若有人写「查看全部变化」，
`includes('查看全部')` 仍然会命中（那是**更好**的：字符串更长，包含关系不变）。
反过来，若有人用 JS 拼接（`'查看' + '全部'`），产物侧命不中，只有 `scripts/lib/` 的
字面量登记那一条能拦住一部分。**我承认这是扫描面，不是语义证明。**

### 1.5 e2「已与 H14 一致」会不会说不该说的话？

我把结论拆成两半，避免把话说过头：

- **渲染口径一致**（这是 H14 的正文）：三条实跑读数 + 5 条既有断言（R2/R2b/R2c/R2d/R2e）+
  构建期 5197–5203 的合成雷达自检。**这部分我说「已一致」，有出处。**
- **构建链不一致**（这是我**新发现**的）：日志不可用时构建在 Dataset Manifest 就失败，
  「产物自检」（含那条诚实性自检）与 SEO 门禁**都没跑到** ⇒ 诚实性措辞上不了线。
  **这部分我说「这是残留」，同样有两次实跑。**

我没有把第 2 条说成「H14 被违反」（它不是），也没有把第 1 条说成「一切正常」（它不够）。

---

## 2. 每条新断言的假绿路径清单

| 新断言 | 可能怎么假绿 | 反证 |
|---|---|---|
| `thin-content-margin`（规则层） | 登记表空 / 路由写错 / 比的是硬编码值 | 登记 6 条且有一条断言要求 `/need/no-card/` 必须在；kind/count 与计划逐项对账；±1 两条反证；源码级沙箱实跑 |
| §六 登记表形状与算术自洽 | 只改 `margin` 一个数 | `chars − textFloor(kind,count) === margin` 逐条；JSON 转写逐字节对账 |
| §六 JSON 转写对账 | 两份一起改 | **这条挡不住**（两份都能改）。挡得住的是：`/need/no-card/` 必须在表里 + 算术自洽 + 登记过期即红。**如实登记这个洞** |
| §六 登记过期即红（kind/count） | 计划重算与构建期不同源 | 用构建期同一条判据（`needsOf`/`collectionsOf`）重算；独立门禁**另有一套**（从 dist 的 `deals.json` 反推） |
| §七 三张措辞表同词 | 只查了三个键 | 配套：7 个源文件无「查看全部」+ 首页受控副本同词 + `scripts/lib/` 字面量登记 + 产物侧 2 条 |
| §七 字面量登记（`scripts/lib/`） | 换目录（如 `scripts/pages/`）写死就漏 | **承认**：产物侧的『箭头锚必须逐字等于「全部变化 →」』是兜底；但它也不覆盖「点不到的地方」（如 Feed/JSON） |
| §③′ 独立复核余量 | 计数器与规则层一起错 | 两个实现互证（一条断言）；仍受 1.1 的口径约定限制 |
| §③″ H14 自洽 | 「模块在场必有 ≥1 条」只覆盖一个方向 | **反向（该有模块却没有）在产物里判不了**：`data-topic-*` 只随模块一起出现。所以这条**不断言「现在必须是 0 页」**，避免把数据变化误判成缺陷；该方向由 `selftest:changes` R3/R4 与构建期自检承担 |
| §③‴ 入口文案 | 扫描面/语义问题（见 1.4） | 沙箱改名实跑（两条同时点名） |

---

## 3. 我**没有**验证的（明确边界，别当成已验证）

1. **没有做端到端「日志不可用」的产物验证**：构建在那一步失败，所以**没有**一份
   「日志不可用」的 dist 可看。读数全部来自构建日志 + 合成雷达 + 单测。
2. **没有跑 Full Gate（`npm run gate`）**：跑的是它里面的关键步骤（build / selftest:seo /
   verify:seo / verify-site / check:ci / check:evidence）与 `selftest:changes`。
   Full Gate 由 PR 的 CI（`gate` action）跑，等 CI 绿才算数。
3. **没有重跑 `research/_raw` 里的历史取证装置**（那些是上一轮的一次性探针）。
4. **没有改 `verify-site.js`**：所以浏览器层的判据里**没有**任何一条是本轮新增的
   （e1/e2/e3 的新牙都在 `seo-verify.js` / `seo-selftest.js` 这一层）。
5. **没有验证 `--print-floor-margins` 的「复制粘贴」在真实重新登记流程里不出错**：
   我只验证了它打印的块与当前声明逐字一致。真正的重新登记（改 `seo.js` + 刷 JSON + 复跑）
   没有演练过 —— 那是下一次真出现「余量跌破」时的事。
6. **没有做跨平台验证**：全部读数是本机（Windows / Node v24.13.1）一次跑出来的；
   CI 是 Ubuntu，`readdirSync` 的排序、路径分隔符等差异**可能**影响 §七 那条
   「`literalSites.join(',') === 'plans-hub-page.js'`」。**这一点有实际风险**：
   我用了 `.sort()`，但 Windows 与 Linux 的排序对**同一批 ASCII 文件名**一致；
   文件名里没有大小写混排（只有 `plans-hub-page.js` 命中），所以预期一致 —— 仍以 CI 为准。

---

## 4. 数字核对（每个数字的出处命令）

| 数字 | 出处 |
|---|---|
| 710 / 660 / 50 | `node .arch-v1/p2-census.cjs`、`node scripts/tools/seo-verify.js --dir=dist` |
| 186 页 / 303 文件 | `seo-verify.js` 的 `=== SEO 独立验收（dist/ · 186 个页面 · 117 个静态文件）===`、`tree-digest.cjs` |
| 次薄 123（`/category/`、`/category/audio/`） | 同上普查输出（顺序里的第 2、3 行） |
| 69 → 87 / 11 → 17 / 27 → 28 | 同一棵树上 `git stash` 前后各跑一次（报告 §6 的表） |
| 874 / 0 | `node scripts/tools/verify-site.js --dir=dist --json=.arch-v1/p2-after.json` |
| 4 个锚 / 3 页 | `node .arch-v1/p3b-wording-dom.cjs dist` |
| 0 字节 / 478 字节 / totals 1 | `node .arch-v1/p4-e2-unavailable.cjs` |
| 19 条事件 · startedAt 2026-09-30 | `scripts/data/deal-history.json`（探针打印） |
| 全树摘要 `13b17d0a…` | `node .arch-v1/tree-digest.cjs dist`（两次构建各一次） |

---

## 5. 越界自查（纪律）

| 纪律 | 自查 |
|---|---|
| **不许降低任何文本下限** | `git diff` 里没有 `page-kinds.js`、没有任何 `textFloor` 数值改动；新增的只有**下限之上的那条登记底线**（且 `seo-selftest` 有一条断言把 `/need/no-card/` 钉在登记表里） |
| 写作用域 | 改动只有 `scripts/lib/seo.js`、`scripts/tools/seo-selftest.js`、`scripts/tools/seo-verify.js`、`research/p2-residuals-v1-*.md`、`research/_raw/p2-residuals-v1/`；**没有**碰 `build-local.js` / `verify-site.js` / `landing.js` / `plans-hub-page.js` / DESIGN-RULES / NEXT-STEPS / `dist/` |
| 产物变化面 | 两次构建（判据原样 / 判据带改动）逐文件 sha256：**303/303 相同**（`product-digest.json`） |
| 断言数只增不减 | 87 > 69、17 > 11、28 > 27；`verify-site` 与 `selftest:changes` 不变（未触碰） |
| 证据政策 | `npm run check:evidence` 绿；新增文件全是 `.md` / `.json`（非 Tier-3）；一次性探针留在 `.arch-v1/`（gitignore） |
| 只走 PR | 不走直推 master；本文件与报告随分支一起提 PR |

---

## 6. 留给下一轮的开放项（我判断属于别的工作域）

1. **`build-local.js` 的 Dataset Manifest**（§2.2′ 的真残留）：要么让「日志不可用」能上线，
   要么把 fail-closed 写成策略。
2. **`plans-hub-page.js:251` 的硬编码字面量**：改成读措辞键（补丁见报告 §3.2），
   然后同步更新 `seo-selftest` §七 的字面量登记。
3. **`check-ci-consistency.js:191` 注释里的 27** → 28。
4. **`verify-site.js` 侧没有本轮的新判据**：若 captain 希望浏览器层也有一条
   「入口文案 / 条件模块」的现场断言，那是下一轮的活（需要改 `verify-site.js`）。
5. **登记的**「口径约定」**没有版本号**：如果将来 `visibleText()` 改了计数口径，
   登记表的 `chars` 会集体失真 —— 现在只有「算术自洽」挡着，没有「口径指纹」。
   若要更硬，可以登记一个 `counterFingerprint`（例如对一份固定样本计数）。
