# `judge-hardening-v1c`（t33）：收口 t11 的 2 条新破防 + 2 条新发现

> 攻击来源：`criteria-adversary-v1-reattack`（t11，PR #98 已合并）打出的 **N14 裁切祖先**、**N8/N9 假 `@media`/假 `@supports`**、**N15 sitemap 未闭合注释**、**N19 `<noscript><style>`**
> 被改文件：**只有** `scripts/tools/verify-site.js`（+约 150 行，判据只变严）· 未动 `scripts/lib`、`scripts/data`、产物、`plan-changes.js`
> 基线：`origin/master` `898f86f`（含 t32）= 干净跑 **885/0** ⇒ 修后 **887/0**（+2 条新命名检查，零误报）
> 证据：`research/_raw/judge-hardening-v1c/`（readings / regression / product-digest）· 装置 `.arch-v1/`（Tier-3 本机）

---

## 1. 四条收口（形态 ⇒ 读数 ⇒ 修复 ⇒ 红/绿）

### ① N14 裁切祖先 —— `note-clipped` 新增「最近的裁切祖先」

**形态**（t11 的 `forms8.json:N14-clipping-ancestor`，逐字）：
```html
<div class="arch-clip" style="display: block; height: 8px; overflow: hidden;">  … 5 条 .snote …  </div>
```
**修前读数**（t11）：`881/0 零码`；探针证明说明自身 `box 1380×20.39 · client 1380×20 · scroll 1380×20`（**自身没有任何裁切**），
而父盒只有 8px 高 ⇒ 视觉上被切掉约 60%。
**修复**：浏览器侧给每条说明量「最近的裁切祖先」——从 `parentElement` 向上，只认 `overflow ∈ {hidden, clip}` 的祖先，
判「真的切到」用**盒重叠**：说明 border-box 越出该祖先 border-box 超过 `WIDE_TOL`（2px）即记名；取**最近**的一个。
宿主侧在 `note-clipped` 上新增一条分支，点名祖先与裁掉多少 px。
**修后读数**（`v1c-newd2.json`）：
```
✗ §22c @360 样本集 79 页 … 5 条违规码 [plans/api/#0 note-clipped, … #1, #2, #3, #4]
   plans/api/#0 note-clipped：plans/api/#0 说明被**裁切祖先** div.arch-clip 裁掉约 73.56px
   （该祖先 overflow hidden/hidden；说明自身 scrollWidth/clientWidth 328/328、scrollHeight/clientHeight 82/82 都看不出问题）
```
**红/绿**：形态副本 **887/4 失败**（5 条码）· 干净产物 **887/0** · 产物逐字节未动（§7）。

### ② N8/N9 假 `@media not all` / 假 `@supports` —— 冻结串新增「**生效**断言」

**形态**：把冻结串那条真规则**同一串文本**包进 `@media not all { … }`（N8 @ `need/free-api/`）或
`@supports (display: bogus-xyz-arch) { … }`（N9 @ `need/student-only/`）。
**修前读数**（t11）：`§22c 冻结串「一处定义、全站生效」：每页恰好 1 次` **✓ 绿**（文本计数仍是 1），
红全靠变异电池连带（M6 正对照 / M1 / M8 / M10 / M12 / M15）。
**修复**：在浏览器侧屏外造一个 `.snote` 探针，读它**实际生效**的计算值（font-size / margin 下边距 / max-width / overflow-wrap），
宿主侧 `wideFrozenEffectProblems()` 把冻结串规则文本里的每条声明解析出来（`var(--x)` 就地解析成根上的值）逐条对账 ⇒
新增命名检查 `§22c 冻结串的**生效**断言：规则声明的每一条效果都必须真的落在 .snote 上`。
**两条理由分得开**（这是本条的重点）：

| 情形 | 旧判据（文本计数） | 新判据（生效断言） |
| --- | --- | --- |
| 真规则被**整条注释掉**（t5 F1 / forge 副本） | ✗ 红 —— 理由是「**串不存在**」（计数 0） | ✗ 红（同时；探针也量不到效果） |
| 真规则被**永不生效的 at-rule 包住**（N8/N9） | ✓ 绿（计数仍是 1）—— 这就是原来的沉默 | **✗ 红 —— 理由是「串在但没生效」** |

**修后读数**（`v1c-newb.json`）：
```
✓ §22c 冻结串「一处定义、全站生效」：每页内联样式里恰好 1 次（186 页） :: 186/186 页恰好 1 次
✗ §22c 冻结串的**生效**断言：…（186 页） :: 6 条没生效：
   need/free-api/ 冻结串的 font-size: var(--fs-sm) **没有生效**（期望 12px · 实测 14px）
   need/free-api/ 冻结串的 margin 下边距 var(--s3) **没有生效**（期望 12px · 实测 0px）
   need/free-api/ 冻结串的 overflow-wrap: anywhere **没有生效**（期望 anywhere · 实测 normal）
   need/student-only/ …（同三条）
```
**红/绿**：形态副本 **887/10 失败**（含新断言 + t11 记录的变异电池连带）· 真删对照（forge 副本）**冻结串计数判据仍红**（理由是「串不存在」）· 干净产物 **887/0**。

### ③ N15 sitemap 未闭合注释 —— 两条判据同解

**形态**：`sitemap.xml` 里把 `vendor/zhipu/` 的 `<url>` 块换成 `<!-- <url> … </url>`（**不闭合**）。
**修前读数**（t11 的 `newe`）：
- `verify-site`：`厂商落地页 /vendor/zhipu/ 的 sitemap 成员资格…` **✓ 说「sitemap 有」**（假绿；`replace(/<!--[\s\S]*?-->/g,' ')` 找不到 `-->` ⇒ 一个字都不剥）
- `verify:seo`：**19/2 红**（解析后成员大面积缺失）⇒ **两条判据不同解**
**修复**：把「剥注释」换成**带配对检查**的扫描：未闭合的 `<!--` 之后**全部按注释处理**（与真解析器一致，更严）＋
新增命名检查 `§18 sitemap.xml 的 XML 注释成对（…与 verify:seo 的解析结论同解）`。
**修后读数**（`v1c-newe.json`）：
```
✗ §18 sitemap.xml 的 XML 注释成对 … :: 1 个 <!-- / 0 个 -->
✗ 厂商落地页 /vendor/zhipu/ 的 sitemap 成员资格与索引策略一致 :: sitemap 无
（verify:seo 同一副本：19 项 / 2 失败，`sitemap 成员 == 非 noindex 页面的集合：漏 …`）
```
⇒ **两侧同解：都红，而且红的是同一件事**（那一页不在 sitemap 里）。

### ④ N19 `<noscript><style>` —— 修进扫描面（不是登记）

**形态**：`<noscript><style>.pnote { max-width: 70ch; }</style></noscript>`（`developer/`）。
**修前读数**（t11 的 `newg`）：未登记清单里只有 `feeds/`（N18）与 `status/`（N17），**`developer/` 不在** ⇒ 零码。
机制：扫描面走 `document.querySelectorAll('style')`；脚本开启时 `<noscript>` 子的内容按规范是**文本**、不是 DOM 节点 ⇒ 那条 `<style>` 不存在于 DOM；
而无 JS 的读者**真的会**看到这条窄列。
**修复**（选了「修」）：把 `noscript` 子的原文里 `<style>…</style>` 段也纳入**同一把尺子**（同一条 `stripCssComments()` + 同一份登记表）。
**修后读数**（`v1c-newg.json`）：
```
✗ §22c @360 样本集 79 页 … 3 条违规码 [developer/#? narrow-unregistered, feeds/#? narrow-unregistered, status/#? narrow-unregistered]
   developer/#?：路由「developer/」有 1 条未登记的窄阅读列：.pnote { max-width: 70ch }
```
**为什么可以「修」而不是登记**：产物普查 —— **0 页**有 `noscript > style`（`Get-ChildItem dist -Recurse *.html` 逐页扫），
所以这条修复对当前产物**零影响**（干净基线 887/0 已证），成本可控 ⇒ 不占用 `scripts/data/narrow-reading-columns.json` 的声明面。

---

## 2. 断言账（只增不减）

| 项 | 修前 | 修后 |
| --- | ---: | ---: |
| `verify-site --dir=dist`（干净产物） | **885 / 0** | **887 / 0**（+2：`冻结串生效断言` · `sitemap 注释成对`） |
| 新增**码**（不是新检查） | — | `note-clipped` 的第三类来源（裁切祖先）· `narrow-unregistered` 的 noscript 面 |
| `check:ci` | 39 / 0 | **39 / 0** |
| `check:evidence` | ✅ | ✅ |
| `npm run gate` | 48 脚本 / 0 | **48 脚本 / 0**（读数见 §6） |

**没有放宽任何既有断言**：`note-clipped` 的两条旧分支（横向 / 竖直）逐字未动；冻结串计数判据、§19 几何、登记制扫描全部保留；
新增的两条检查都是**独立命名**的（不是把旧检查改成「更宽」）。N19 的修复**只扩大**扫描面（DOM `<style>` ∪ noscript 里的 `<style>`）。

---

## 3. 回归：24 个副本/沙箱重跑（防「修一处坏一处」）

**基线差异（t32 前后）**：t11 的读数取自 **t9+t10 整合树**；本轮回归取自 **master `898f86f`（含 t32）**。
两组之间的判据差异：t32 +2 条（feed guid 窗口）；t22 把 760/360 样本集 **29 → 79 页**（失败的**名字**随之变化）；
t30 补了 **@950 档**（有说明码的副本会多 1 条失败）；本轮自身 +2 条。所以看回归要看**判定**，不是字符串。

**机器可读版**：`research/_raw/judge-hardening-v1c/regression.json`（逐个副本给出 `onlyInT11` / `onlyInT33` 与两侧失败数）。

| 分组 | 数量 | 副本 |
| --- | ---: | --- |
| **完全不变**（失败数**与失败项名字**都逐字相同） | **11** | `g21` `g300` `g1400` `grtl`(0) `gxf`(0) `forge3` `newc` `newf` `sb-two` `sb-ghost` `sb-second` |
| **预期内变化**（全部可归因到 t22/t30 + 本轮四条收口） | **13** | `att` 15→17 · `att2` 4→5 · `g19` 4→5 · `forge` 5→**6** · `forge-ctl` 5→**6** · `newa` 4→5 · `newb` 9→**10** · `newd` 4→5 · `newd2` 0→**5** · `newe` 2→**4** · `newg` 4→5 · `sb-empty` 5→6 · `sb-routes` 6→7 |
| **回归（无法归因的变化）** | **0** | —— |

**`onlyInT11` 里唯一的条目是「@760/@360 **样本集 29 页**」这两个旧**名字**（t22 扩到 79 页后名字变了）——
也就是说：**没有任何一条原本会红的判据在修后变绿**（这是本轮最要紧的回归信号）。逐条归因：

| 变化 | 归因 |
| --- | --- |
| `forge` / `forge-ctl` +1 | **本轮 ②** 的新「冻结串生效断言」（伪造副本与真删对照同时命中 ⇒ 同解） |
| `newb` +1 | 同上（N8/N9 形态现在**判据自己**红，不再只靠变异电池连带） |
| `newe` +2 | **本轮 ③** 的「sitemap 注释成对」+「`/vendor/zhipu/` 成员资格 = sitemap 无」（与 `verify:seo` 同解） |
| `newd2` +5 | **本轮 ①** 的裁切祖先码在 5 个视口档逐档命中（t11 时是 0） |
| `newg` +1 | t30 的 @950 档（N19 的 `developer/` 已在 t11 的读数里单独记过） |
| `att`/`att2`/`g19`/`newa`/`newd`/`sb-*` +1 | t30 的 @950 档（这些副本里的说明码在 950 档也成立） |
| 名字变化（29 页 → 79 页） | t22 扩样本集（判据变严，不是回归） |

**守住面复核（t11 的 15 条）**：本轮回归里 `grtl`/`gxf` 仍 **0 失败**（不误报）· `g21`/`g1400` 仍按设计红 ·
`g19` 的 §19 几何仍绿（唯一红是 RA1b 的未登记）· `g300` 仍是那条生效宽比值 · `sb-empty`/`sb-two`/`sb-ghost`/`sb-second`/`sb-routes` 全部保持原判定。

---

## 4. 我**没有**做的 / 未覆盖

1. **没有动 `scripts/data/narrow-reading-columns.json`**：N19 选了「修扫描面」，登记表一字未改。
2. **裁切祖先只判 `hidden` / `clip`**：`overflow: auto|scroll` 的祖先**不判**（那是「能滚到」，不是永久切掉）。
3. **`clip-path` / `mask` / `contain: paint` 类裁切没有进判据**：本轮只收口 t11 实测的那一类（`overflow` + 固定高/宽的父盒）。
4. **冻结串生效断言只对账 4 个属性**（font-size / margin 下边距 / max-width / overflow-wrap）：`color` / `line-height` 会引入
   颜色格式（hex vs rgb）与派生量的口径问题，**故意不判**（收益低、假红风险高）。
5. **没有在 CI/POSIX 上跑**：读数全部来自本机（Windows + Edge，与门禁同一个 `playwright-core`）。
6. **sitemap 注释配对只覆盖 `<!--` / `-->` 计数与未闭合**：`-- >`（带空格）、`<!—`（长破折号）这类畸形不额外判（XML 会直接解析失败，由 verify:seo 侧红）。
7. **`verify:seo` 侧的 N15 修复不在本任务**（t10 已闭合解析侧）；本轮只让 `verify-site` 侧**同解**。

---

## 5. 复现

```bash
cd .worktrees/criteria-adversary-v1-reattack      # 分支 judge-hardening-v1c（master 898f86f + t32）
npm ci && node scripts/tools/build-local.js
node scripts/tools/verify-site.js --dir=dist      # 887 / 0

# 四条形态（.arch-v1/ 里 t11 留下的装置）
node .arch-v1/v1c-rebuild.cjs                      # 24 个副本/沙箱按当前树重建（产品零改动）
node .arch-v1/v1c-run.cjs newd2 newb newe newg     # 四条牙：expect 887/1、887/10、887/4、887/4
node scripts/tools/seo-verify.js --dir=.arch-v1/dist-newe   # 同解：19/2 红
node .arch-v1/v1c-evidence.cjs                     # 重建 research/_raw/judge-hardening-v1c/

# 门禁
npm run check:ci && npm run check:evidence && npm run gate
```

## 6. 门禁读数

| 命令 | 旧 base（`898f86f`，含 t32） | 新 base（`2253be8`，t28/t29 也进来之后） |
| --- | --- | --- |
| `node scripts/tools/build-local.js` | ✅ exit 0 | ✅ exit 0 |
| `node scripts/tools/verify-site.js --dir=dist` | ✅ **887 / 0** | ✅ **887 / 0**（四条牙也在新 base 上复跑：`newd2` 887/5 · `newb` 887/10 · `newe` 887/4 · `newg` 887/5，与旧 base 逐条一致） |
| `npm run check:ci` | ✅ 39 / 0 | ✅ 39 / 0 |
| `npm run check:evidence` | ✅ | ✅ |
| `npm run gate` | ✅ **48 脚本 / 失败 0 / 344.7s** | ✅ **48 脚本 / 失败 0 / 317.3s** |

**为什么有两个 base**：我建树时 master 是 `b0389ed`+t32；回归跑完后 master 前进到 `2253be8`（t28 定价落地、t29 构建崩溃修复）。
交付前把改动**移到最新 master 上重跑**了干净产物 + 四条牙 + `check:ci` + `check:evidence` + `gate`（上表右列）——
**24 副本回归那 20 份的读数是左列的**（报告 §3 已按组标注），四条牙两列都有。

## 7. 产品零改动证明

| 项 | 读数 |
| --- | --- |
| `dist/` 全树摘要（本会话内，判据改动前 / 全部形态注入 + 重建产物之后） | `82729a9222fc783a04fb5e295ff5c91eb2b09ac33287f0b290015c85c5fa1681` / **同一串** · 304 文件 |
| `git status --porcelain` | 只有 ` M scripts/tools/verify-site.js`（唯一的代码改动） |
| 注入面 | 逐副本清单：`unexpectedChangedFiles` 合计 **0**（每条形态只改 1 个文件） |
| 未改 | `scripts/data/narrow-reading-columns.json`（N19 选了「修」）· `scripts/lib` · `dist/`（产品）· `docs/**` |
| 对照 | t11 期的产物摘要是 `df43587c…`（t9+t10 树）；旧 base（898f86f）上是 `82729a92…`，新 base（2253be8）上是 `2444746109…` —— 每换一次 base 都重新构建过，**判据改动本身从不写产物**（注入全部落在 `.arch-v1/dist-*` 副本，副本与基线逐字节相同由注入器自检） |

---

## 8. 给 captain 的收口建议行（不是承诺）

`docs/DESIGN-RULES.md` 主表可加一行（沿用现有列）：

```
| **S7** | **「声明了」不等于「生效了」**：凡是以「产物里出现了某段声明/某个串」计数成立的判据，都必须再配一条**生效断言**（在真浏览器里量它的效果）；裁切类缺陷必须同时看**自身**与**最近的裁切祖先**（overflow ∈ {hidden, clip} 且说明的盒越出祖先的盒）。理由：t11 实测两条 —— 把冻结串包进 @media not all 后文本计数仍是 1（旧判据沉默）；8px 高的 overflow:hidden 父盒把说明切掉 60% 而自身 scroll == client（零码） | ✅ 新增（judge-hardening-v1c） | 实测牙：newd2 887/5（点名 div.arch-clip 与裁掉 px）· newb 887/10（计数 ✓ + 生效 ✗，红点明「没有生效」）· newe 与 verify:seo 同解 · newg 的 developer/ 现形 | 断言：§22c 冻结串的**生效**断言 + §18 sitemap.xml 的 XML 注释成对（885 → 887）· note-clipped 第三类来源 · 扫描面并入 noscript 内的 <style>；干净产物 887/0 · gate 48/0 |
```

`NEXT-STEPS.md` §0 记录行：

```
N. ~~t11 再攻击打出的 2 条新破防 + 2 条新发现~~ → **judge-hardening-v1c 已收口**：
   N14 裁切祖先（note-clipped 加「最近的裁切祖先」）· N8/N9 冻结串加**生效断言**（红时区分「串不存在」与「串在但没生效」）·
   N15 sitemap 注释配对（与 verify:seo 同解）· N19 <noscript><style> 并入扫描面（产物 0 页受影响）。
   断言 885 → **887/0**；24 副本回归：不变 11 · 预期内 13 · **回归 0**。
   **仍未覆盖**：clip-path/mask/负 margin 类裁切 · 祖先 overflow:auto 的「能滚到」形态 · 冻结串只对账 4 个属性（color/line-height 故意不判）·
   四条收口没有内置成变异电池 M 系列（目前靠外部形态副本证明）。
```
