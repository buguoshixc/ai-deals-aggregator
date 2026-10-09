# 新扫描面的「删掉不许回流」机器牙 · 变异读数与复现（secondary-page-residue-v2 · t4 → t10）

> 本目录里 `.cjs` / `.log` 是过程产物（Tier-3，按 `.gitignore` 不入库），**结论与原始读数**在
> `*.json` 与这份 README 里；`sandbox/`（产物副本）与 `tree/`（源码副本树）跑完即弃。
>
> **t10（对抗复核修复轮）改动摘要**：删掉共享页脚**豁免机制**（F1 · 白名单自证）+
> 补两条页脚**正面断言**；反空洞从「数条目」改成「**数活字面**」（F5）；下限加**自守**
> （F6）；新增**归一化那一遍**与 **JSON 转义那一遍**（F3）；加**关系式**（F7）。
> 逐条对照与反向复现读数见 **§2.3**；边界如实登记见 **§5**。

## 1. 落地了什么（源码）

| 文件 | 内容 |
| --- | --- |
| `scripts/tools/build-local.js` | `scanResidue()`（构建期产物扫描：三遍比对 + 活字面反空洞 + 下限自守 + 关系式 + 页脚正面断言）+ `selfCheck()` 里的调用与读数 + 模块导出（`require.main === module` 守卫，CLI 行为不变） |
| `scripts/data/residue-guard.json` | 登记表：`deletedCopy` 32 条（= 44 条断言字面：`literal` + `visible` 两个面）· `containerFloors` 8 条 · `floorRatio` 0.5 |
| `scripts/tools/check-residue.js` | 复核入口：`require` **同一个** `scanResidue()`（不复制扫描逻辑），可对任意产物副本跑 ⇒ 变异演练与独立复核都用它 |
| `package.json` | `check:residue` → `node scripts/tools/check-residue.js` |

### ① 删掉不许回流（t10/F3 起是**三遍**并行比对）

* 判据：**整篇产物**（HTML 剥离 `<script>` / `<style>` / HTML 注释；非 HTML 原样判 —— Feed / 公开数据
  文件里出现的字面同样会到读者眼前）里，每个被删字面的出现次数必须为 **0**。
* **三遍**（缺一不可）：**原样字面**（挡「整行粘回去」）· **归一化后**（实体解码到不动点 / 剥标签 /
  零宽 / 全角→半角 / 大小写 / 同类标点 / 空白全去 ⇒ 挡「等价写法」）· **JSON `\uXXXX` 解码后**
  （只对 `.json` / `.ndjson` 产物 ⇒ 挡「同一句话在产物 JSON 里被转义」；⚠️ 刻意**不**对 HTML 用）。
* 32 条登记 = census2 的 4 条（A/B 实删）+ 上一轮 census 的 23 条 + 本轮新落地 5 条；去重后 44 条字面。
* 每条还有一个人工核定的 `visible`（渲染面字面），因为 census 的 `exactSubstring` 有一半是源码写法
  （`plansSource: '…',`、`<p class="snote">…</p>`），只挡「整行粘回去」，挡不住「重新渲染出来」。
* **反空洞（t10/F5 起数「活字面」而不是数数组长度）**：
  `literal` 缺失 / 空串 / 纯空白 / 与另一条逐字重复 ⇒ **逐条点名报红**；
  且**活字面总数** < `RESIDUE_MIN_LIVE_LITERALS`（40 = 建表实测 44 留 ≤9% 余量）⇒ 红；
  条目数 < `RESIDUE_MIN_ENTRIES`（30）⇒ 红。三条都写在判据旁，不写在数据里。

### ② 扫描面不许收缩（阈值型下限 + 关系式，两条并存）

8 类容器的**存在性下限**（class token 级计数，取值前先做**实体解码** ⇒ `class="ddes&#99;"` 也算 `ddesc`）：

| class | 实测 | 下限 | 取值依据（详见 JSON 的 `why`） |
| --- | --- | --- | --- |
| `.dsrc-note` | 165 | 123 | 每详情页 2 条 × 80 页 + 页族说明；余量 25%（关系式 2×详情页数更严） |
| `.ddesc` | 80 | 60 | 1 条/页 × 80 详情页（关系式 1×详情页数更严） |
| `.fdesc` | 25 | 18 | 订阅中心每份 Feed 一行（25 份） |
| `.chgnote` | 19 | 14 | /changes/ 的事件行（唯一正文容器） |
| `.pchnote` | 4 | 2 | 固定结构位；t10/F6 下限自守 ⇒ 从 1 提到 2（**收紧**） |
| `.pftdesc` | 4 | 2 | 同上 |
| `.chgmeta` | 1 | 1 | 同上（唯一一处，比例下限 ceil(0.5)=1） |
| `.hint` | 54 | 40 | 5 档档位头 + 49 张卡片「详情」提示 |

* 规则写在登记表里：`floor = max(ceil(measured × 0.5), measured − max(3, ceil(measured × 0.25)))`；
  **自守（t10/F6）**：`floor >= measured × floorRatio`，且 `floorRatio` 不得低于判据里的硬下限 0.5
  ⇒ 「把门槛改 0 / 改 1 让牙变绿」当场红。
* **关系式（t10/F7）**：`.ddesc >= 1 × 详情页数`、`.dsrc-note >= 2 × 详情页数`；基准量从产物现算
  （`deal/*/index.html` 的个数）⇒ 数据收缩时跟着走。t6 实测阈值型下限的 25% 余量允许静默消失
  （`.dsrc-note` 42 处仍 123/123 绿、`.ddesc` 20 处仍 60/60 绿、`.hint` 14 处仍 40/40 绿、
  `class="ddes&#99;"` 20 处仍绿）⇒ 关系式把那部分余量收成 0（**不动任何现有下限**）。
* 实测值锚定 `dist` 树摘要 `59db0aa5aaef0ac01589c4203dc9dfeda2c7ddbe3883c2a0774f24451607d04a`（304 文件，2026-10-09）。

### ③ 共享页脚：**没有豁免名单**，改为两条正面断言（t10/F1）

t4 曾有一条豁免机制：从 index.html 的 `<!--SHARED:footer:START/END-->` 区间里的 `<footer>` 元素
现算「哪些被删字面允许出现」，并允许它们落在每一页的 `<footer>` 里。
**t6 的真构建实测把它推翻了**：豁免的**取值面**（产物 index.html 的 SHARED 页脚元素）与
**作用域**（每页 `<footer>`）**同源** ⇒ **白名单自证** —— 把被删文案写回 SHARED 页脚，
它就同时把自己写进了白名单，产物里 186 次 / 186 页而 `npm run build` 照样 exit 0。
而该机制的**基线受益者是 0 条**（页脚保留句「最终以官方页面为准。」与登记字面差「厂商」二字）
⇒ 只留通路、没有收益 ⇒ **t10 删掉机制**，改为两条**正面断言**：

1. index.html 的 SHARED 页脚元素里**不含任何登记字面**（不该有的一句不多）；
2. 页脚保留句「最终以官方页面为准。」在**每一页**的 `<footer>` 区间里都在（该有的一句不少）——
   实测 **186/186 页**。

两条都不依赖任何名单；名单没了，通路也就没了。反向复现：**§2.3 的 T1a**（写回 SHARED 页脚 ⇒ exit 1）。

## 2. 变异读数（原始 JSON：`mut-t10.json` / `mut-build.json` / `mut-product.json` / `browser-dsrc-disclaimer.json`）

### 2.1 构建路径面（源码副本树 `tree/` 里的**真构建**，`node scripts/tools/build-local.js --out=dist`）

| id | 变异 | 期望 | 实测 exit | 结论 | 判据原话（`*.log` 里逐字） |
| --- | --- | --- | --- | --- | --- |
| M2a | `lib/plans-page.js` 恢复被删句首「价格与额度以官方页面为准：」⇒ 重新渲染出来 | 红 | **1** | ✅ | `✗ 删掉的字面又回到了产物里（1 处 · 登记 v2-plans-api-note-head/literal）：「价格与额度以官方页面为准：」 ⇒ plans/coding/index.html · …` |
| M2b | `build-local.js` 的 `.fdesc` **唯一构造点改名**（`class="fdesc"` → `class="fdesc-legacy"`）⇒ 整族在产物里消失 | 红 | **1** | ✅ | `✗ .fdesc 在产物里只有 0 次 < 下限 18 —— 这一族容器可能被整族删掉 / 改名了…` |
| M3 | 登记表 `deletedCopy` 从 32 条砍到 29 条（≤ 反空洞下限 30） | 红 | **1** | ✅ | `✗ 被删文案登记表只有 29 条 < 下限 30（scripts/data/residue-guard.json 的 deletedCopy）——删条目必须同时显式改 build-local.js 的 RESIDUE_MIN_ENTRIES，不许静默缩表` |
| M4 | 把登记表**整份删掉**（「删掉登记」的另一半：连表都不在） | 红 | **1** | ✅ | `❌ 构建失败：Error: 找不到 scripts/data/residue-guard.json ——「删掉不许回流」的判据依赖它，拒绝继续构建（判据不许退化为空转）` |

**M2b 的附带读数（这条守卫的存在理由）**：四次变异各自只触发 **1 项**产物自检失败，而 M2b 那唯一一项
**就是** `.fdesc` 下限 —— 也就是说「把这一族容器整族改名」在**没有 ② 的情况下构建全绿**，
而且 ① 也不会命中（容器没了，字面自然也不再出现）。这正是任务里点名的失效方式。

### 2.2 产物副本面（`check-residue.js --dir=<沙箱>`，与构建期同一份实现）

| id | 变异 | 期望 | 实测 exit | 结论 |
| --- | --- | --- | --- | --- |
| M1 | 页脚**外**注入两段被删文案（/feeds/ 的 `<main>` 开头 + 一张详情页 `</main>` 之前） | 红 | **1** | ✅ |
| M2c-shared-footer-injection | 同一段被删文案写进**共享页脚**（186 页的 `</footer>` 之前 + index.html 的 SHARED 区间里那个 `<footer>` 内） | 红（t10 后） | **1** | ✅ **旁路已关闭**：t4 时这条是**绿**（豁免成立），t10/F1 删掉豁免机制后它必须红 —— 同一份现场，现在读作「t6 找到的旁路」的回归测试 |
| M2c-exempt-outside-footer | 在上一份沙箱上再把同一段字面放到**首页 `<main>`（页脚之外）** | 红 | **1** | ✅ |

真产物未改动：`mut-product.json` 里 `distDigestBefore == distDigestAfter ==`
`59db0aa5aaef0ac01589c4203dc9dfeda2c7ddbe3883c2a0774f24451607d04a`（`scripts/tools/tree-digest.cjs`）。

### 2.3 t10 修复的反向复现（对抗复核 F1 / F3 / F5 / F6 · 原始读数 `mut-t10.json`）

| id | 发现 | 变异（反向复现） | 修前（t6 实测） | 修后实测 | 判据原话（`*.log` 逐字，节选） |
| --- | --- | --- | --- | --- | --- |
| **T1a** | F1（high）· 豁免自证 | **真构建**：把「价格与条款最终以厂商官方页面为准。」写回 index.html 的 **SHARED 页脚元素** | exit **0**、产物 186 次/186 页 | exit **1** ✅ | `✗ 删掉的字面又回到了产物里（186 个文件 · 原样 186 处 · 登记 v2-plans-hub-description-tail/literal）：「价格与条款最终以厂商官方页面为准。」… 现场：…</p> <p>价格与条款最终以厂商官方页面为准。</p> </footer>` |
| **P1** | F1 对照 | 产物副本：同一句塞进**每一页的 `<footer>`、不动 SHARED 区间** | exit 1（RED） | exit **1** ✅ | `✗ 删掉的字面又回到了产物里（185 个文件 · 原样 185 处 …）` |
| **T5a** | F5（medium）· 反空洞只数条目 | **真构建**：清空 26/32 条的 `literal`（条目数仍 32） | exit **0**、活字面 44→6 | exit **1** ✅ | `✗ 登记表里有 26 条不是「活字面」：c2-01（literal 缺失 / 空串 / 纯空白）、…` + `✗ 活字面只有 19 条 < 下限 40 …` |
| **T6a** | F6（low）· 下限无自守 | **真构建**：`.dsrc-note` 的 floor 123 → 1 | exit **0** | exit **1** ✅ | `✗ .dsrc-note 的下限 1 < 实测 165 × 0.5 = 82.5 —— 下限被改小的方向必须红（「下限自守」，t6 F6）` |
| **T3a** | F3（medium）· 等价变体 | **真构建**：同一句以**数字实体**写进 renderer（`&#20215;…`） | exit **0** | exit **1** ✅ | `✗ 删掉的字面以**等价写法**回到了产物里（归一化后 1 处 · 1 个文件 · 登记 v2-plans-hub-description-tail/literal）：归一化针「价格与条款最终以厂商官方页面为准.」` |
| **P2** | F3 | 产物副本：零宽 `价\u200B格与条款最终以厂商官方页面为准。` | exit 0 | exit **1** ✅ | `✗ …以**等价写法**回到了产物里（归一化后 1 处 …）归一化针「最终以厂商官方页面为准.」` |
| **P3** | F3 | 产物副本：`<span>` 拆字 `<span>价格</span>与条款最终以…` | exit 0 | exit **1** ✅ | 同上（同一个归一化针命中） |
| **P4** | F3 | 产物副本：标签间折行 `价格与条款\n<span></span>最终以…` | exit 0 | exit **1** ✅ | 同上 |
| **P5** | F3 | 产物副本：`价&nbsp;格与条款最终以…` | exit 0 | exit **1** ✅ | 同上 |
| **P6** | F3 | 产物副本：全角句号 `…为准．`（U+FF0E） | exit 0 | exit **1** ✅ | 同上 |
| **P7** | F3 | 产物副本：JSON **单转义** `dist/deals.json` 里追加 `"\u4ef7\u683c…"` | exit 0 | exit **1** ✅ | `✗ 删掉的字面在**产物 JSON 里被 \uXXXX 转义**后回流（1 处 · 1 个文件 · 登记 v2-plans-hub-description-tail/literal）… ⇒ deals.json` |
| **P8** | F3 | 产物副本：JSON **双转义**（文件里写着 `\\u4ef7…`，值本身是反斜杠-u 串） | exit 0 | exit **1** ✅ | 同上（解码到不动点后命中） |
| **P0** | 基线 | 产物副本：**未改动**的一份 dist | 绿 | exit **0** ✅ | `✅ 产物复核通过：44 条被删文案三遍 0 命中（无豁免名单）· 8 类容器均不低于下限且关系式成立` |

**两处「不按原话改」的登记（开工前先记，不静默跳过）**：

1. **标点不做「去掉全部标点」**（F3 原话是「标点归一（你上一版已按『剥标点后比对』做过一层，保留）」，
   而上一版并没有那一层 —— 这条前提有误）。按「去掉全部标点」实测**误报 80 张详情页**：
   被删的「最终以厂商官方页面为准**。**」与**保留下来的** `.dpane-src` 那句
   「本站只做收录与整理，最终以厂商官方页面为准**；**排序与推荐理由不出售。」只差一个标点，
   去标点后逐字相同。改为**同类标点归一、不跨类**（引号 / 破折号 / 省略号 / 顿号↔逗号 / 句号类 /
   分号 / 冒号 各自归一），并用 **P6（全角句号）** 证明「归一化那一遍」仍然照得到标点级变体。
2. **归一化那一遍的针**只取「渲染面字面 / 核定可见核」（24 条），源码写法且没有可见核的 4 条
   （`c1-15`/`c1-16`/`c1-23`/`c1-24`）**只判原样那一遍**，并在读数里逐条点名。
   理由同样是实测：`c1-23` 的 literal 是 `<span class="vsrc">…</span>` 这种源码写法，
   归一化剥掉标签后只剩「全部来自 API / Token 计费对比 的同一份数据」—— 而那串文字在 `/models/` 上
   是**保留下来的另一句话**的尾巴（实测 1 处误报）。这**不是**放宽：这 4 条的**原样字面**判据一字未动。

> F7 也做了（关系式，与阈值型下限**并存**、没动任何下限）；t6 的实测（25% 余量可静默消失）
> 已写进 `residue-guard.json` 的 `_why` 与 §1 ②。

## 3. 复核：`verify-site.js:1925` 既有断言 /不构成对优惠是否有效/ 与本轮删除的相容性

* 既有断言（`verify-site.js:1925-1926`）判的是**真浏览器**里 `.dpane .dsrc` 的 `innerText` 是否含
  `不构成对优惠是否有效`。
* 本轮删除只删 `.dsrc-note` 免责句的**尾半句**（`…；最终以厂商官方页面为准。`），前半句原样保留。
* 真浏览器读数（`browser-dsrc-disclaimer.json`，Edge + 与 `verify-site.js:1903` **同一个取样点**
  `.dpane .dsrc` / `.dpane .dsrc .dsrc-note`，全量 80 张详情页）：
  * 既有断言绿 **80/80**；
  * 被删尾半句在 `.dsrc` 块与 `.dsrc-note` 里都**不在** **80/80**；
  * `.dsrc` 块 80/80、`.dsrc-note` 80/80、每块 10 行；
  * 样例尾部：`…以上是本站采集与整理过程的事实，不构成对优惠是否有效、是否适用于你的判断。`
* 完整真浏览器套件 `npm run verify`：**✅ 892 项，失败 0 项**（exit 0，`verify-site.log`）。

## 4. 复核命令（逐条可重跑）

```bash
npm run build          # 构建期那一遍（含 scanResidue：三遍回流 + 活字面反空洞 + 下限自守 + 关系式 + 页脚正面断言）
npm run check:residue  # 对 dist 单独复核（与构建期同一份实现）
npm run verify:seo     # ✅ 19 项 0 失败
npm run selftest:seo   # ✅ 103 项 0 失败
npm run test:strict    # ✅ 校验通过（strict 模式）
npm run verify         # ✅ 892 项 0 失败（真浏览器）
npm run check:ci       # ✅ 39 项 0 失败（package.json 新脚本不影响 CI 口径）
npm run check:evidence # ✅ 0 个新进 Tier-3 文件（本目录的 .cjs/.log 按政策不入库）

# 变异演练（会另建沙箱与源码副本树，不碰真产物）
node research/_raw/secondary-page-residue-v2/mutation/mut-t10.cjs       # t10：F1/F3/F5/F6 反向复现（真构建 + 产物副本）
node research/_raw/secondary-page-residue-v2/mutation/mut-product.cjs   # t4 现场：M1 + 共享页脚注入（t10 后已闭）
node research/_raw/secondary-page-residue-v2/mutation/mut-build.cjs     # t4：M2a/M2b/M3/M4 真构建
node research/_raw/secondary-page-residue-v2/mutation/probe-dsrc-disclaimer.cjs \
  --json=research/_raw/secondary-page-residue-v2/mutation/browser-dsrc-disclaimer.json
```

## 5. 边界与依赖（如实登记）

1. ① 是**字面**级：同义改写照不到（语义等价不可判定）；`visible` 面与「归一化那一遍」把覆盖从
   「源码粘贴」扩到「重新渲染 / 等价写法」，但仍不是语义判据。
2. **运行期不在射程内（t6 F2）**：HTML 整段剥离 `<script>` ⇒ 由 JS 在浏览器里渲染出来的文案
   本扫描照不到（它只判**产物字节**）。那一面由真浏览器四面读数覆盖（t5：
   `innerText` / `textContent` / 剥脚本序列化 / **不剥脚本**的整份 DOM）。别把这两件事混为一谈。
3. 剥离注释是纪律：只在 `script` / `style` / 注释里的命中**单独报数、不进判据**（当前 0 次）。
4. **UTF-16LE + BOM 的产物页扫不到（t6 F4）**：按 UTF-8 读会读不出内容 ⇒ 已知边界，如实记录。
5. **阈值是数据量静态快照（t6 F8）**：8 类下限来自建表时的实测值；t6 连跑 10 次 **0 误报**，
   但数据大幅收缩时会红 —— 那时改门槛是一次显式、可评审的动作（而不是静默失效）。
   关系式（F7）那一半不吃静态快照：基准量从产物现算。
6. **keep 面没有登记字面就没有牙（t6 F9）**：新牙对**数据驱动正文**的覆盖，只在字面被登记时成立。
   这是射程边界，不是缺陷。
7. **对数据面的依赖**：`v2-headless-capture-paren`（以及 c2-02/03/04 的 `visible` 面）断言
   「`（无头浏览器渲染后提取）`」不在产物里 —— 它锚定的是**数据面已落的删除**（`deals.json` 17 处 +
   采集器 `headless.js`）。若那半边被回退，构建会红（这正是「删掉不许回流」的语义）。
