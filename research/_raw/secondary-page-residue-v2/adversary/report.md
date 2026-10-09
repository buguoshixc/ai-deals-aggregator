# t6 对抗复核：新牙的射程、误伤与回流路径（secondary-page-residue-v2）

**任务**：对 t4（gate-teeth）新落地的「删掉不许回流 + 扫描面不许收缩」两段产物扫描做**对抗**复核 ——
目标不是「确认它会红」，而是**找出它证不了什么**；一切读数自己跑出来，沙盒外零改动。

**锚点（本次复核读的那一份字节）**

| 对象 | 值 |
| --- | --- |
| 工作树 | `D:\OneDrive\Desktop\Code\AI Page\.worktrees\secondary-page-residue-v2` |
| 判据实现 | `scripts/tools/build-local.js` sha256 `72dde078371cba97dac91478f80ec1f0aff3e67740d16399d78bedc19bda4de6` |
| 登记表 | `scripts/data/residue-guard.json` sha256 `a37db3fd3c61c83d5269490b358efac1944c244629f236583ae9217b4171a4a7` |
| 复核入口 | `scripts/tools/check-residue.js` sha256 `b50819a12acea6e6239c519a561623649c83088757829cd8c82e9a3d8bcec4e5` |
| 产物 | `dist/` 304 文件 · treeDigest `59db0aa5aaef0ac01589c4203dc9dfeda2c7ddbe3883c2a0774f24451607d04a`（复核前后**逐字符相同**） |

**方法（可复核性声明）**

* 判据一律走**同一份实现**：探针 require `build-local.js` 的 `scanResidue()`；登记表篡改用
  `scripts/` 的等价副本（regcopy）跑 `check-residue.js` 本体（CLI 与 CI 里那一步同一条命令）。
* **真源码只读**：所有变异都发生在 `adversary/sandbox/**` 的副本里（产物副本 / scripts 副本 / 整个 repo 副本）。
  `git status --porcelain` 里 t6 期间**没有我改的跟踪文件**；`dist/` 的 treeDigest 复核前后一致。
  （t6 期间多出来的 3 个跟踪文件改动 —— `.github/actions/gate/action.yml`、`docs/BUILD.md`、
  `scripts/tools/check-ci-consistency.js` —— 是同队 gate-teeth 的 CI 接线，不是本次复核。）
* 基线读数（我自己跑的，不是转述）：`check:residue` **exit 0** · 登记 32 条 / 断言字面 **44** 条 ·
  扫描 304 文件（HTML 186）· 剥离后命中 **0** · 豁免面 **0 条** · `commentOnly` **0** ·
  `.dsrc-note 165/123 · .ddesc 80/60 · .fdesc 25/18 · .chgnote 19/14 · .pchnote 4/1 · .pftdesc 4/1 · .chgmeta 1/1 · .hint 54/40`。

**结论摘要**

* **发现 9 条**，最高严重度 **high**（F1：共享页脚豁免自证 ⇒ 被删文案可以「全站回流」而整条门禁链全绿，真构建实测）。
* **射程边界 15 条**（其中 12 条有实测读数，3 条明确标注「未实测」）。
* 我跑过的读数：射程矩阵 32 例 · 容器/阈值 11 例 · 豁免 7 例 · 登记表篡改 10 例 ·
  真构建 **26 次调用**（其中 **9 次**走到产物自检并产出读数：B0 对照 ×5 / B1 页脚回流 / B3 数据面回流 /
  B4 源码注释 / B6 keep 面改写；其余 **17 次**在数据校验阶段被数据面挡住，见 F8）· 冻结产物上跑 CLI ×5 ·
  门禁注入对照 2×9 = 18 次 · 边角 3 例 · 浏览器实测 7 个变体 · 误报率 10 次运行。
* **不是「找到它坏了」，而是「找到了它管不到的地方」** —— 现有实现本身在我做的每一条正向变异上都如期变红（32/32 符合预期、10 条回流的注入全部被抓、0 例外）。

---

## 一、发现（含严重度）

### F1 · high · 共享页脚的豁免是**自证**的：把被删文案放回共享页脚 ⇒ 全站 186 页回流，整条门禁链绿

**实测（真构建，不是设想）**：在 repo 副本里把 `价格与条款最终以厂商官方页面为准。`
（登记 `v2-plans-hub-description-tail`）写回**共享页脚**（`index.html` 的 `<!--SHARED:footer:START/END-->`
区间里的那个 `<footer>` 元素），跑真构建：

* `node scripts/tools/build-local.js --out=../out-footer` ⇒ **exit 0**（构建期自检全过，含新牙那两行读数）；
* 产物侧逐文件读数：该句出现 **186 次**，其中 **186 次全部落在页脚区间内**，含它的 HTML 页 **186 个**；
* `check-residue.js --dir=…` ⇒ **exit 0**；构建期读数原话仍是
  `✓ 删掉不许回流: 44 条被删文案 … 剥离后命中 0 次`。

**对照读数（同一份回流，只差「有没有碰 SHARED 锚点」）**

| 案例 | 做法 | 结果 |
| --- | --- | --- |
| E2 | 同一句进 SHARED footer 元素 + 185 个页面各自的 `<footer>` | **GREEN** · 豁免集 2 条 · 页脚内命中 **372** · 总命中 372 |
| E3 | 同一句只进每一页 `<footer>`，**不动** `index.html` 的 SHARED 区间 | **RED** · 总命中 **370**（全部算违规） |
| E4 | 进 SHARED 区间、但放在 `</footer>` **之后** | **RED** · 总命中 2 |
| E5 | E1 之后再在首页**正文**写一遍同一句 | **RED** · 4 次命中里 2 次在页脚内（豁免）、2 次在页脚外（违规） |
| X3 | 豁免生效后，把回流文案塞进页面上**第二个 `<footer>`** | **RED** · other 项：`<footer> 锚点有 2 个` |

**为什么它能成立**：豁免**名单**取值面 = 产物自己 `index.html` 的 SHARED 页脚元素；
豁免**作用域** = 每一页的 `<footer>` 区间。两者是**同一块东西**，于是「页脚里出现了被删文案」
这件事本身就把自己写进了白名单 ⇒ 白名单是自证的（self-certifying）。

**为什么这条值得判 high**：共享页脚是**每一页都有、读者每天最先/最后看到**的容器；
一次改动就能让被删文案回到 186 个页面，而**全部 9 个产物门禁 + 整个 `npm run build` 都是绿的**。
这也是本轮被删文案里唯一一条「一句话回到全站」的路径。

**顺带的现况读数（修复取舍用）**：**当前豁免集是 0 条**（构建期与 CLI 两处读数都是 0）。
页脚自己那句是 `最终以官方页面为准。`（**没有「厂商」二字**），它与登记字面
`最终以厂商官方页面为准。`（c1-05）**不是同一个字符串** ⇒ 今天这条豁免**没有任何受益者**，
只留下这条通路。（这正是它该被收紧而不是保留的理由；但要注意它存在的动机是「防止页脚合法保留某句时误红」。）

**修复方向（建议，属 gate-teeth 的裁决面）**：把白名单从「产物现算」改成**源码面受控**：
① 在构建期断言「**源码** `index.html` 的 SHARED 页脚元素里不含任何登记字面」（源码面判据，产物改不掉它）；
② 或把页脚的保留文案做成一份**签入**的白名单文件（与登记表同级、走 code review），名单与作用域仍然分离；
③ 最省事的版本：豁免集今天为 0 ⇒ 直接删掉豁免机制，等真的需要时再以 ①/② 的形态引入。

---

### F2 · medium · `<script>` / `<style>` 被整段剥离 ⇒ **运行期渲染出来的文案不在射程内**（产物里已有先例）

**实测**（射程矩阵 + Edge 真渲染，同一份字节）：

| 变体 | 扫描器 | 浏览器（playwright-core + 本机 Edge，`file://`） |
| --- | --- | --- |
| 脚本里 `textContent` 注入 DOM | **GREEN**（A2 · 0 命中） | `#script` 节点 `innerText` **含该句**、`visible=true` |
| CSS `::before { content: "…" }` | **GREEN**（A3 · 0 命中） | `getComputedStyle(el,'::before').content` = `"价格与条款最终以厂商官方页面为准。"`、`visible=true` |

**为什么这不是纯理论**：产物调查（我自己扫的 304 文件）——186/186 页都带渲染核心脚本，
`innerHTML =` 里含中文文案的有 **1 页**（`index.html`：`'已选 <b>' + count + '</b> / ' + CMP_MAX + ' 条进入对比'`），
`textContent =` 出现在 **4 页**。也就是说「读者看到的文案由脚本写进 DOM」**在本站已经是既有形态**，
把一段被删文案重新放进 JS 字符串或 CSS `content:`，牙不会有任何反应。

**附带的剥离行为读数**（`residueStrip` 直接调）：`<script>…</script>` → `""`、`<style>…</style>` → `""`、
`<!--…-->` → `""`；`<SCRIPT>`（大写）同样被剥；`<script type="application/json">` 也被剥；
**未闭合的 `<script>` 不会被剥**（该方向是过严、安全）。剥离用**一个空格**替换（跨边界不会拼出新句子：
`…为准<!--c-->(注)` → `…为准 (注)`）。

**修复方向**：给 script 体与 style 体各加一条**只判不剥**的规则（或把剥离后的命中数从「只报不判」升级为判据，
并显式允许台账注释/正则在源码面存在）；CSS 侧至少断言 `content:` 值里不出现登记字面。

---

### F3 · medium · 字面级匹配的**等价变体**旁路：实体、零宽、标签拆分、折行 —— 浏览器渲染出同一句话

**实测**（同一批字节：扫描器逐例单跑；渲染由 Edge 读回）：

| 变体 | 扫描器 | 浏览器渲染出来的文本 |
| --- | --- | --- |
| 整句数字实体 `&#20215;…&#12290;` | **GREEN**（A6） | `innerText` **= 该句**（逐字） |
| 句号实体 `&#12290;` | **GREEN**（A5） | 同上 |
| `&nbsp;` 代替空格（`用到的&nbsp;endpoint：`） | **GREEN**（A7） | 不换行空格，肉眼同一句 |
| `U+200B` 插在句尾标点前 | **GREEN**（A8） | `innerText` 去掉零宽字符后 **= 该句** |
| `U+200D` 插在句中 | **GREEN**（A9） | 同上 |
| `<span>` 拆字（标签打断文本节点） | **GREEN**（A10） | `innerText` **= 该句** |
| `<b>` 重排版（`…<b>页面</b>…`） | **GREEN**（A11） | 渲染同一句（加粗） |
| 文本节点内换行折行 | **GREEN**（A12/A13） | `价格与条款最终以厂商官方 页面为准。`（折成 1 个空格） |
| 全角句号 `．` / ASCII 大小写 / 繁简 | **GREEN**（A14/A15/A16） | 近似同一句（这一档是「同义改写」的邻域，见 B-12） |
| JSON 里 `\uXXXX` 转义（非 HTML 面） | **GREEN**（A24b） | 任何 JSON 解析器解出来就是该句 |

**为什么它能成立**：判据是**字节级 `indexOf`**（大小写敏感、不懂实体、不归一化），
而读者的眼睛看到的是**渲染后**的文本。中间那层（解码 + 去零宽 + 跨标签拼接 + 空白折叠）没有被建模。

**修复方向**：加一层 `normalizeForMatch()`：① 剥标签取文本；② 解数字/命名实体；③ 去零宽/BOM；
④ 可选做空白折叠后再比。注明代价：归一化会把「跨标签/跨空白的近似句」也判红 —— 那正是这里想要的语义
（「读者能读到的字面」），但会新增误报面，需要与登记的字面一起过一遍。

---

### F4 · low · 非 UTF-8 编码的产物页旁路（UTF-16LE + BOM 实测）

**实测**：把探针页写成 **UTF-16LE + BOM**（HTML 自带 `<meta charset="utf-16">`）：

* 扫描器：**0 命中**（`readFileSync(path,'utf8')` 把 UTF-16 字节解成乱码 ⇒ `indexOf` 找不到）；
* Edge：`innerTextHasLiteral = true`（BOM 嗅探，页面正常渲染）。

**边界说明**：产物写入侧全是 UTF-8，本仓的源码→产物路径我**没有**实测（见「我没做的」）；
这条按「字节级字面匹配默认产物是 UTF-8」记入射程边界。

---

### F5 · medium · 登记表反空洞只数**数组长度** ⇒ 判据可以被静默缩表

**实测**（regcopy = `scripts/` 的等价副本，跑 `check-residue.js` 本体；最后逐字节还原）：

| 案例 | 改法 | CLI 读数 |
| --- | --- | --- |
| C1 | 32 条里**清空 26 条**的 `literal`+`visible`（条目数仍 32） | **exit 0** · 断言字面 `44 → 6`（判据静默缩到 6 条） |
| C8 | 把 `c1-05` 的 `literal` 换成一个**永不出现**的串（条目数、长度不变） | **exit 0** · 该条保护静默消失 |
| C6 | `RESIDUE_MIN_ENTRIES` 30→3 且只留 3 条 | **exit 0**（这是 2 处协同编辑，C1 只需 1 处） |
| C0 | 对照组（等价副本未改） | exit 0 · 44 条字面（与真仓一致） |

**结构性佐证（同一份审计）**：32 条登记里 **16 条 `visible` 为空**（单面登记）；
44 个断言字面之间存在 **21 对包含关系**（例：`最终以厂商官方页面为准。` ⊂ 4 个更长的登记字面；
`（无头浏览器渲染后提取）` ⊂ 3 条 `.ddesc` 的整句）⇒ 「44 条」不等于 44 个独立探测器，
而反空洞阈值 30 数的是**条目**、不是**非空且互不包含的字面**。

**修复方向**：反空洞判据改成数**非空字面**（并断言每条登记至少有 1 个非空面），
可选再加「最小字面数」（不被任何其它字面包含的那些）下限。

---

### F6 · low · 下限**数值**本身没有自守：数据文件里一行就能调低

**实测**：

| 案例 | 改法 | CLI 读数 |
| --- | --- | --- |
| C2 | 8 类 `floor` **全部改成 1**（类名集合不动） | **exit 0** |
| C7 | 只把 `.dsrc-note` 的 `123 → 1` | **exit 0** |
| C4 | 从 `containerFloors` 删掉 `hint` 一行 | **exit 1**（`容器下限表与扫描面声明不一致…少一类 = 那一类的反空洞守卫消失`） |
| C5 | **两处协同**：代码里的扫描面声明与下限表同批去掉 `hint` | **exit 0**（扫描面静默收缩） |
| C3 | 直接删掉登记表文件 | **exit 1**（fail-closed，抛错） |
| C9 | 篡改 `_measuredOn`（树摘要写成假值） | **exit 0**（它只是文档，没有判据读它） |

**结论**：反空洞挡住了「少一类」，没挡住「把下限改小」；也挡不住「两处协同改扫描面」。
`RESIDUE_MIN_ENTRIES` 那种「门槛写在判据旁边」的纪律，没有施加到 8 类下限上。
**修复方向**：把下限（或其下限）写进代码常量表并与数据文件交叉校验（与类名集合同一种做法），
或要求 `floor ≥ ceil(measured × 0.75)` 之类似的不等式（用 `measured` 做数据面锚点）。

---

### F7 · medium · 齿②的**静默损失空间**：25% 余量 = 允许一整族的一大部分安静消失

**实测**（真产物完整副本上的定点变异；每次变异后按原始字节还原）：

| 案例 | 变异 | 账面 | 结果 |
| --- | --- | --- | --- |
| S1 | 全部 `.dsrc-note` 的 class 属性改单引号 | 165 → **0** | **RED**（整族「消失」能挡住） |
| S2 | 30 处 `.dsrc-note` 改单引号 | 165 → 135 | **GREEN** |
| S3 | **42** 处（恰好到下限） | 165 → **123** | **GREEN**（余量 0） |
| S4 | **43** 处 | 165 → 122 | **RED**（边界精确） |
| S6 | 20 处 `.ddesc` 整族改名 | 80 → **60** | **GREEN** |
| S7 | 14 处 `.hint` 改名 | 54 → **40** | **GREEN** |
| S9 | 30 处 `.dsrc-note` 的 **class 属性整段删掉**（元素还在、类名没了） | 165 → 135 | **GREEN** |
| S10 | 20 处 `.ddesc` 写成实体 `class="ddes&#99;"`（**浏览器/CSS 解码后仍是 `ddesc`**） | 80 → **60** | **GREEN**（功能完好的元素对计量不可见） |
| S5 | 全部 `.ddesc` 实体化 | 80 → 0 | **RED** |
| S8 | 186 页各插一段含 `class="dsrc-note"` 的 `<script>` 字符串 | 165 → 165 | **GREEN**（剥 script ⇒ 运行期注入的容器不计入扫描面） |

**各族的静默损失空间（实测 measured − floor）**：`.dsrc-note 42 · .ddesc 20 · .fdesc 7 · .chgnote 5 · .hint 14 ·
.pchnote 3 · .pftdesc 3 · .chgmeta 0`。
也就是说：**整族消失**会红（S1/S5 实测），但「一整族的 1/4 静默消失」不会
（例：42 处 `.dsrc-note` 说明行、20 张详情页的 `.ddesc` 来源行、14 个 `.hint`）。

**修复方向（不动任何下限、也不降低判据强度）**：对计数**结构上可推导**的类改用**关系式**而不是静态下限 ——
`.ddesc = 1 × 详情页数`、`.dsrc-note = 2 × 详情页数 + 5`（这两个关系式就是登记表 `why` 里写的口径，
且详情页数在 `build-local.js:6713` 已经与 `type=deal` 条数逐一对账）。关系式能把 25% 余量收成 0 余量，
而且**对数据量波动免疫**（不引入 F8 那类误报面）。小样本类（`.chgmeta/.pchnote/.pftdesc`）保持「存在性 ≥1」即可。

---

### F8 · low · 阈值是数据量的**静态快照**；数据面收缩时，先红的是数据面（3 次尝试都没走到牙）

**实测读数（两个方向）**

* **误报方向（正常运行）**：真构建 **5/5 次 exit 0**；冻结产物上 `check:residue` **5/5 次 exit 0**（合计 **10 次运行 0 红**）。
  下限读数每次都一样（`.dsrc-note 165/123 …`），没有任何抖动。
* **数据面收缩方向**：本仓常量里**没有** deal 详情页数量下限 —— 只有一条一致性断言
  `详情页 ${detailDirs} 个 ≠ type=deal ${dealEntries.length} 条`（`build-local.js:6713`）；
  grep `MIN_*` 只有 `MIN_PRERENDERED_CARDS=45` / `RESIDUE_MIN_ENTRIES=30` / `CATEGORY_MIN_DEALS=4`
  （后者是「生成分类页的门槛」，不是总量下限）。按余量算：**丢 20 个详情页牙仍绿，丢 21 个才红**。
* **三次「法律状态下的收缩」尝试，全部在 `runValidate()` 阶段就失败**（牙根本没跑到）：
  N=21 → `links[4] ebd47f6d2522: dealId … 在 deals.json 里不存在（… 请把这条整条移进 retired[] 并补快照）`；
  把「被引用过的 deal」排除后再试 N=21/25/40 → `疑似同一优惠未合并：AI Manga Translator ↔ …（可在 aliases.json 登记别名）` 等。
  ⇒ 数据面有**引用完整性**与**重复合并**两道互不相同的自守，收缩路径先撞它们。

**结论（如实）**：**我没有观测到一次误报**，也没有构造出「其它全绿、只有下限红」的合法状态；
「40 个详情页以下会不会只有牙红」在本次尝试里**不可达**，故按**边界**记录而不是按缺陷记录。
（风险面如实留着：如果哪一天真的出现合法的数据收缩 —— 例如大量优惠同时过期下架 ——
自然的第一反应会是「把下限调低」，而这正是本轮明令禁止的动作；F7 的关系式改法可以顺带消掉这一面。）

---

### F9 · low · **keep 面没有牙**：没被登记的字面，扫描根本不知道（这就是射程边界本身）

**实测（真构建）**：把 25 条 `.fdesc` 里由 `feeds.js:946` 模板生成的 **10 条厂商订阅文案改短**
（`${vendor} 当前收录的 AI 优惠与免费额度。…` → `${vendor} 订阅。`，属于**保留面**文案的删除/改写）：

* `npm run build` ⇒ **exit 0**（含新牙两行读数，`.fdesc 25/18` 计数不变）；
* `check-residue.js --dir=…` ⇒ **exit 0**；
* `selftest:feeds` ⇒ **145 项通过 / 0 项失败**。

**对照（登记过的字面就能覆盖数据驱动正文）**：把 `（无头浏览器渲染后提取）` 写回**一条** deal 的
`deals.json.description`（数据面！），真构建 ⇒ **exit 1**，牙的原话点名了两处
（`deal/2eae0e246de2/index.html` 与 `deals.json`）并给出登记 id ⇒ **数据驱动的 `.ddesc` 是覆盖的，前提是字面被登记**。

**结构性读数（同一份审计）**：登记表 32 条 / 44 个断言字面**全部来自「本轮与上一轮被删的文案」**；
census（t1 的依赖读数）里 **82 组 / 255 次出现是 keep** ⇒ 保留面**一条登记都没有**。
所以：① keep 面文案被删/被改写，只有 8 类容器下限挡着（余量见 F7）；
② 任何**新发生**的删除也不会自动进登记表 —— 「删掉不许回流」是**一次性的清单**，不是规则。

**修复方向**：若要让 keep 面也有牙，需要的是**形状断言**（像题注牙那样按容器形状判），
而不是往 `deletedCopy` 里塞 keep 文案（那会把「保留」与「禁止出现」两个语义混在一张表里）。
本条的定位是**边界告知**：它说明「扫描面不许收缩」（齿②）与「被删文案不许回流」（齿①）
合起来仍然**不等于**「小字容器里的文案受到保护」。

---

## 二、射程边界（15 条）

| # | 边界 | 读数 |
| --- | --- | --- |
| B-01 | **页脚区间内**（豁免自证：名单取自产物自己） | 实测 · E1/E2/E3/E4/E5/X3 + 真构建 B1（186 页回流、exit 0）→ F1 |
| B-02 | `<script>` 体与 `<style>` 体（含运行期 DOM 注入、CSS `content:`） | 实测 · A2/A3 GREEN + Edge 渲染为真；产物里已有 `innerHTML` 中文文案先例 → F2 |
| B-03 | HTML 注释内容 | 实测 · A1/A25 GREEN（只进 `commentOnly` 计数，当前 0 次；不判） |
| B-04 | 实体 / 零宽字符 / 标签拆分 / 折行 / 大小写 / 全半角 / 繁简 | 实测 · A5–A16 GREEN（浏览器渲染同一句）→ F3 |
| B-05 | 非 UTF-8 字节（UTF-16LE + BOM） | 实测 · X1（扫描 0 命中、Edge 正常渲染）→ F4 |
| B-06 | JSON 里 `\uXXXX` 转义（功能等价、解析即原句） | 实测 · A24b/A24c GREEN；直写则 RED（A24/A29） |
| B-07 | **源码面**：只写在源码/注释里、不进产物的字面 | 实测 · B4 真构建 exit 0 且产物 0 次（判据面是产物，不是源码） |
| B-08 | **未登记的字面**（keep 面 82 组 / 255 次 + 任何新文案） | 实测 · B6 真构建 exit 0 / CLI exit 0 / selftest:feeds 145-0；结构读数见 F9 |
| B-09 | 部分删除：各族的 25% 余量内静默通过（42/20/7/5/14） | 实测 · S2/S3/S6/S7/S9/S10 GREEN，S4 一步之遥即 RED → F7 |
| B-10 | 登记表自身可被静默缩表（清空字面、换字面、调低下限、伪造锚点、协同删类） | 实测 · C1/C2/C5/C6/C7/C8/C9 exit 0；C3/C4 exit 1 → F5/F6 |
| B-11 | 计数口径：只认 `class="…"`（双引号 / HTML 静态字节 / 大小写与实体敏感）；script 里的 class 不计 | 实测 · S1 0 计数（整族 RED）、S2/S9/S10 部分损失 GREEN、S8 计数不动 |
| B-12 | **同义改写**（换一种说法：语义等价不可判定） | 未实测（不可判）· 结构性读数：登记 44 条字面 vs census 352 次出现 / 86 组 → 覆盖面本身是一份清单 |
| B-13 | 非 HTML 文件原样判（Feed / 公开数据 / `.txt` / 无扩展名） | 实测 · A24/A29 RED（正方向覆盖） |
| B-14 | 链接形态：产物里的 junction/符号链接子目录 | 实测 · X2 **抛错 EISDIR** ⇒ fail-closed（不是静默漏判；构建会红） |
| B-15 | `commentOnly` 只报不判（台账注释与真回流靠它区分） | 实测 · 基线 0 次；A1/A25 会把它加 1 而不判 |

## 三、我试过的清单

**1）射程矩阵 32 例**（harness/range-cases.cjs，0 例与预期不符）
会红（正方向/过严方向）：A0 逐字 · A4 行内 `style` 属性 · A17 `<template>` · A18 `<noscript>` ·
A19 `data-*` · A20 `aria-label` · A21 `placeholder` · A22 `<textarea>` · A23 `<title>` · A24 JSON 直写 ·
A26 表格单元格 · A27 `aria-hidden` · A28 `display:none` · A29 `.txt`/无扩展名 · A24c 见下（实体形态在 JSON 里 = GREEN）。
不会红（本次找到的旁路）：A1 注释 · A2 `<script>` 注入 · A3 CSS `content` · A5/A6 实体 · A7 `&nbsp;` ·
A8/A9 零宽 · A10/A11 标签拆分 · A12/A13 折行 · A14 全角 · A15 大小写 · A16 繁简 · A25 注释+脚本双写 · A24b `\u` 转义。

**2）容器/阈值 11 例**：S0 对照 · S1–S4 `.dsrc-note` 0/30/42/43 处 · S5 全族实体化 ·
S6 `.ddesc` 20 处 · S7 `.hint` 14 处 · S8 script 里的 class · S9 删 class 属性 · S10 实体化 class 名（20 处）。

**3）豁免 7 例**：E0 对照 · E1 只塞 SHARED 元素 · E2 SHARED+185 页页脚 · E3 只塞页脚不动锚点 ·
E4 SHARED 区间但页脚元素外 · E5 页脚内+页脚外 · E6 短核单塞页脚。

**4）登记表篡改 10 例**（regcopy 上跑 `check-residue.js` 本体）：C0 对照 · C1 清空 26 条字面 ·
C2 下限全改 1 · C3 删登记表 · C4 删一类下限行 · C5 协同删类 · C6 下限+条目同批下调 ·
C7 单类下限调 1 · C8 换字面 · C9 伪造 `_measuredOn`。

**5）真构建 26 次调用**（sandbox/repo 的 repo 副本；9 次走到产物自检、17 次在数据校验阶段被数据面挡住）：
B0 对照 ×5 · B1 页脚回流 · B2 shrink-21/25/40 ×2 轮（第一轮未同步数据自洽字段，第二轮修好仍被数据面挡住，
另手工复跑 1 次确认失败原话）· B3 数据面 `.ddesc` 回流 · B4 源码注释 · B6 keep 面 `.fdesc` 改写。
**另有 B5**：冻结产物上跑 `check-residue` ×5（不是构建，用来读误报率）。

**6）门禁注入对照 2×9 = 18 次**（`gates.cjs`，同一套命令打在 `product-base` 与 `product-inject` 上）：
control 全绿（含 `verify-site` 真浏览器 150.8s）；inject 侧 3 段登记字面（`最终以厂商官方页面为准。` /
`（无头浏览器渲染后提取）` / `价格、额度与条款最终以厂商官方页面为准；`，各 1 处）⇒
`check:residue` **RED**（3 项，点名登记 id 与落点）· `check-feeds-reproducible` **RED**（`feed/new.json` 与重建不一致）·
其余 7 个（`seo-verify` / `planshub-selftest` / `models-page-selftest` / `archive-selftest` /
`data-docs-selftest` / `analytics-selftest` / `verify-site`）**GREEN** —— 后 7 个不该红的理由：
它们是结构/几何/口径/数据出口的判据，**没有一条**以「某段已删文案不得出现」为命题；
`verify-site` 用的是真浏览器但它查的是盒子几何、页脚链接、题注形状与措辞契约，
文案字面回流不在它的命题集合里（对照 control 同一条命令全绿，排除了「副本本身就红」）。

**7）边角 3 例**：X1 UTF-16LE+BOM · X2 junction 子目录 · X3 第二个 `<footer>`。

**8）浏览器实测**：Edge（`--headless`，`playwright-core`）+ 7 个变体（逐字/实体/零宽/span 拆分/
CSS `content`/脚本注入/折行），同时读 `innerText` 与 `::before` 计算样式。

**9）其它核对**：`residueStrip` 行为 9 项（大小写标签、未闭合脚本、`type=application/json`、
注释里的脚本、空格替换防跨边界拼接、`countOccurrences` 非重叠）；产物里「运行期注入文案」调查（304 文件）；
登记表可判面审计（条目/字面/空面/包含关系/源码树命中）；真仓 `git status` + `dist` treeDigest 前后一致。

**我没做的（如实列出）**：
* 源码→产物 的 UTF-16/GBK 路径（只在产物面上证明扫描器看不见，没有验证「构建能不能产出这种字节」）；
* 真 CI（GitHub Actions）上跑一次 `Residue guard` 步骤（本地跑的是同一条命令 `node scripts/tools/check-residue.js --dir=dist`）；
* census（t1）那 352 条/86 组的**逐条重数**（我引用的是 t1 的依赖读数，没有独立复核每一条）；
* 把 3 段回流注入**源码**再走真构建（F9 的 B3 做了数据面的一条，其余两条打在产物副本上）；
* 语义级「同义改写」的任何形式化尝试（不可判定，见 B-12）。

## 四、复现命令

```powershell
# 0) 沙盒根（全部命令的 workdir）
$sb = "D:\OneDrive\Desktop\Code\AI Page\.worktrees\secondary-page-residue-v2\research\_raw\secondary-page-residue-v2\adversary\sandbox"

# 1) 基线（真仓，只读）
cd "D:\OneDrive\Desktop\Code\AI Page\.worktrees\secondary-page-residue-v2"
npm run check:residue

# 2) 射程矩阵（32 例）+ 剥离函数行为
node "$sb\harness\range-cases.cjs"          # → sandbox/range-results.json

# 3) 浏览器渲染证明（Edge + playwright-core）
node "$sb\harness\browser-render.cjs"       # → sandbox/browser-render.json

# 4) 豁免滥用（7 例；E2 是「全站页脚回流仍绿」那一例）
node "$sb\harness\exempt-cases.cjs"         # → sandbox/exempt-results.json

# 5) 容器/阈值（11 例）
node "$sb\harness\class-cases.cjs"          # → sandbox/class-results.json

# 6) 登记表篡改（10 例，regcopy）
node "$sb\harness\tamper.cjs"               # → sandbox/tamper-results.json

# 7) 真构建实验：误报率 B0×5 · 页脚回流 B1 · 数据面收缩 B2 · .ddesc 回流 B3 · 源码注释 B4 · CLI×5
node "$sb\harness\builds.cjs"               # → sandbox/build-results.json
node "$sb\harness\builds2.cjs"              # → sandbox/build-results2.json
node "$sb\harness\shrink.cjs"               # → sandbox/shrink-results.json
node "$sb\harness\kept-copy.cjs"            # → sandbox/kept-copy-results.json

# 8) 边角（UTF-16 / junction / 第二个 footer）
node "$sb\harness\edge-cases.cjs"           # → sandbox/edge-results.json

# 9) 独立回流注入 + 全套产物门禁（control 与 inject 各 9 条命令）
node "$sb\harness\inject.cjs"               # → sandbox/inject-report.json
node "$sb\harness\gates.cjs" --dir="$sb\product-base"   --tag=control2
node "$sb\harness\gates.cjs" --dir="$sb\product-inject" --tag=inject2

# 10) 汇总（报告里引用的每个数字都在这里）
node "$sb\harness\summary.cjs"              # → sandbox/summary.json
```
