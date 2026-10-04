# t44 · 写死期望 → 关系式判据（4 条）+ 夹具反证 + 「样本不足」显式跳过

- 任务：t44（repair）。把 t42 §2.1 点名的 4 条**数据依赖**写死期望改成关系式/同源对账判据，
  每条配**夹具反证**（违反关系 ⇒ 必红）+ 对照绿，并把报错信息改成「点名数据对象 + 给实际/期望两侧」。
- 边界：只动 `scripts/tools/feeds-selftest.js` · `scripts/tools/data-docs-selftest.js` ·
  `scripts/tools/api-plans-selftest.js` · `scripts/tools/history-nonempty-e2e.js` + 本目录。
  `scripts/data/**` · `scripts/lib/**` · `.github/**` · `package.json` ·
  `check-ci-consistency.js` · `vendor-page-selftest.js`（t41 领地）**一个字节都没动**。
- 复跑：
  ```
  node research/_raw/t44/counter-proofs.cjs            # 18 条反证 + 4 条对照绿（人类可读）
  node research/_raw/t44/counter-proofs.cjs --json     # 机器可读 t44-counter-proofs.json
  node research/_raw/t44/counter-proofs.cjs --only=C1a # 只跑某几条
  ```

---

## 0. 一句话结论

**18/18 反证通过**（每条改动都被顶红一次，且**同一份数据上旧判据红、新判据绿**的地方逐条留下现场），
四个自测复跑全绿、断言条数只增不减（静态 `check(` 站点 131→132 / 60→61 / 147→148 / 30→33，
另加 5 个断言被改成 `skip()` 显式记账点），六个 Verify 命令全绿，反证全程只落在临时沙箱里（共享工作区 8/8 文件 sha256 未变）。

顺手收口了**同一失败形态**的另外两处（都在 `history-nonempty-e2e.js` 里，且它们当时**在今天的树上就是红的**）：

| # | 位置 | 当时的状态 | 证据 |
| --- | --- | --- | --- |
| 额外① | 合成 deal 夹具「清空重造事件」（`out.events = []`） | **红**：`4a4f4777ffbc: 记录没有历史锚点（既不在基线里，也没有 created 事件）` | 反证 C6a（旧写法 ⇒ 必红） |
| 额外② | 生产态：`counts.deal === 0 / plan 14 / api 6` + 三条空态判据 | **红 4 条**（旧计数 1 条 + 空态 3 条；冻结日志实际是 deal 1 / plan 28 / api 10，`deal-history.json` 现在有 1 条 `created`） | 反证 C7a/C7b/C7c，最终生产态 29 判定点全绿 |

---

## 1. 逐条改前 / 改后对照（每条都说明「等价或更强」）

### ① `scripts/tools/feeds-selftest.js:839` —— 注册表 ↔ 产物 同源对账

**改前**
```js
check('注册表恢复原状（临时夹具没有留在注册表里）',
  feeds.PLAN_CHANGE_FEEDS.length === 2 && !feeds.PLAN_CHANGE_FEEDS.some(spec => spec.id === 'stub-changes'));
```
`2` 是「本轮注册表里恰好有两条变化流」这个快照；本轮 API 侧刚加过一条变化流，下次再加/删一条就假红。

**改后**（进入夹具前先取快照，跑完拿快照当期望；逐身份、逐序对账）
```js
const registryBefore = feeds.PLAN_CHANGE_FEEDS.slice();   // 夹具前
...
const registryAfter = feeds.PLAN_CHANGE_FEEDS.slice();    // 夹具后
check('注册表恢复原状：…与**进入夹具前的快照**同一批、同一序（没留下、没顶掉、没换序）', …,
  `实际 feeds.PLAN_CHANGE_FEEDS=${idList(registryAfter)} / 期望（进入夹具前的注册表快照）=${idList(registryBefore)}`
  + `；差异 [夹具后多出: … / 夹具后少了: … / 位置被换: …]`);
```
**等价或更强**：旧判据只查「长度 == 2 ∧ 没有 stub」；新判据查「同一批 ∧ 同一序 ∧ 同一对象身份」——
**严格更强**：反证 C1b 把夹具改成「集合不变、只换一位」，旧判据**会放行**，新判据红并点名「位置被换」。
对「注册表合法增删」这一维是有意放宽（那是产品演进不是缺陷，反证 C1a 证明「多出一条」仍然必红）。

### ② `scripts/tools/feeds-selftest.js:875` —— 首页订阅发现与注册表同源

**改前**
```js
check('首页订阅发现恰好 8 条（4 个选择 × 2 种格式），不是几十个',
  (tags.match(/rel="alternate"/g) || []).length === 8);
```
**改后**：两条对账（`HOMEPAGE_FEED_IDS`（`spec.homepage` 的唯一出处）↔ 产物里 `spec.homepage=true` 的那批；
tag 里的 href 集合 ↔ 由这批 Feed 的 `spec.path` + `spec.jsonPath` 派生的集合，且每个地址只出现一次），
报错给两侧集合与「少 / 多 / 重复」三类差异（形如
`实际 tag 里的 href（7 个）[…] / 期望（3 个 homepage Feed × 两个格式 = 6 个）[…]；差异 [少: feed/developer.json …]`）。

**等价或更强**：集合相等 ⇒ 旧判据那条计数关系仍然成立（`tag 地址数 == homepage Feed 数 × 2`，两个因子都由数据现算），
另外新增了「是哪些地址」与「不许重复」。反证 C2a 在同一份数据上放回旧判据：旧判据 ✗、新判据两条都 ✓。

### ③ `scripts/tools/data-docs-selftest.js:186` —— manifest 类别 ↔ 类别表

**改前**
```js
check('六个类别齐全（…）',
  docs.DATASET_CATEGORIES.every(category => manifest.datasets.some(dataset => dataset.category === category.key))
  && docs.DATASET_CATEGORIES.length === 6);
```
**改后**：**双向集合相等**（表里每一类都真有数据集 ∧ Manifest 里没有表外的类别）+ 表内 key 唯一 + 表非空；
另加一条**注册表 ↔ 类别表**同源对账（`PUBLIC_DATASETS` 用到的 category 必须都在表里）。
选「相等」而不是「包含」的理由写在代码注释里：两个方向各是一种真实缺陷 ——
表里有、Manifest 没有 ⇒ 页面上出现一个空类别；Manifest 有、表里没有 ⇒ 页面类别单元格只能印原始 key
（`datasetRowsHtml` 的回退路径），读者看到 `api-pricing` 而不是「API 计费」。

**等价或更强**：旧判据只查一个方向 + 一个字面量 6；新判据查两个方向 + key 唯一 ⇒ 计数关系
（`Manifest 里的类别数 == 表里声明的类别数`）由集合相等蕴含。反证 C3b（合法新增「一个类别 + 一份数据集」）
同一份数据上：旧判据 ✗（`length === 6`）、新判据两条全 ✓。

### ④ `scripts/tools/api-plans-selftest.js:1038` —— 计数 ↔ 事件字段自洽

**改前**
```js
radar.totals.changed === rawTypes.filter(type => type !== 'updated').length
&& radar.totals.meta === 1 && radar.other.metadata.length === 1
```
`meta === 1` 是「记录里当前只有一次元信息变化」的快照。

**改后**：期望**由这份日志的 `type` 现算**（元信息类型表 `planChanges.API_PLAN_META_FIELD_TYPES` 是唯一出处）：
两侧计数相等 ∧ 「条目数 + 截断数 == 计数」两条恒等式 ∧ 条目不许串栏 ∧ `other.metadata` 的 `field`
与日志里元信息事件的 `field` 逐一对应。报错点名两侧：
`实际 radar.totals={…}（sections.changed.items 2 条 + truncated 0 / other.metadata 1 条 + truncated 0） / 期望（由这份日志的 type 现算，元信息类型表 planChanges.API_PLAN_META_FIELD_TYPES=["updated"]） changed=2["price_increased","unit_changed"] · meta=1["updated"]；放错栏的条目 [进了「最近 7 天变化」的元信息: [] / 进了 other.metadata 的实质变化: []]`。

**等价或更强**：新增了截断恒等式、条目类型归属与 `field` 对应（旧判据都没有），只在「元信息变化次数」这一维
从字面量 1 换成由数据现算。反证 C4a（夹具里同时改 `officialUrl` 与 `sourceUrl`）在同一份数据上：
注入的旧判据 ✗、新判据两条 ✓；反证 C4b（把元信息塞进 changed 栏）新判据 ✗ 并点名放错栏的条目。

### ⑤ `scripts/tools/history-nonempty-e2e.js:201` —— 硬阈值 ⇒ 空态显式跳过

**改前**
```js
const live = deals.filter(deal => deal && deal.type === 'deal' && deal.title).sort(byId);
if (live.length < 3) throw new Error(`deals.json 里 type=deal 的记录只有 ${live.length} 条，夹具需要 ≥3 条`);
```
**改后**
```js
const DEAL_FIXTURE_SEEDS = 3;
function dealSeedCandidates(deals, anchoredIds = []) { … }        // 纯函数：type=deal ∧ 有标题 ∧ 未被既有事件锚定
function dealSeedShortage(deals, anchoredIds = []) {              // 纯函数：够 ⇒ null；不够 ⇒ 原因对象（不抛错）
  return { object: 'deals.json 的 deals[]（判据：…）', actual, required, reason: '本轮样本不足，跳过并说明原因：…' };
}
```
`main()` 在样本不足时：把夹具工作区的 `deal-history.json` 还原成冻结提交那一份（有定义的输入）、
打印原因与两侧读数、把依赖那几条记录的 5 条断言记成 **`skip()` 显式跳过**（`skip` 计入判定点总数，
在汇总行单独报「N 项**显式跳过**」，与 ✓ 用不同记号）。

**等价或更强**：「没跑过」与「跑过且通过」现在**看起来不一样**（旧写法两者都是红的，而且报错像内容缺陷）；
样本充足时原来那批断言一条不少地照跑。反证 C5a（纯函数表：空 / 1 / 2 / 被锚定 / 3 条）+
C5b（把阈值抬到数据达不到 ⇒ 不抛错、打印规定措辞、exit 0、且夹具工作区的历史没被改写）。

### ⑥（额外，同文件）既有事件一律保留：追加而不是「清空重造」

**改前**：`out.events = [];`（合成事件覆盖整个 `events` 数组）
**改后**：`const kept = out.events.slice();` … `out.events = chronological(kept.concat(events));`
判据侧：`history.verifyStore(out, deals, { bytes: null })` 的参数一个字都没改。

**为什么必须改**：`deal-history.json` 现在有 1 条 `created`（`4a4f4777ffbc`，type=tool），它是那条记录的锚点；
「清空重造」等于伪造「这条记录没有历史」，`verifyStore` 会（正确地）判红 —— 而页面与数据都没错。
反证 C6a 把旧写法放回去：**今天就是红的**（`记录没有历史锚点` 点名 `4a4f4777ffbc`）；新写法全绿。

### ⑦（额外，同文件）生产态：逐字节同源 + 三条关系式空态判据

| 判据 | 改前 | 改后 |
| --- | --- | --- |
| 冻结日志还原 | `counts.deal === 0 && counts.plan === 14 && counts.api === 6` | 三份日志与 `git show HEAD:` **逐字节相同**（条数只当读数打印） |
| 三份集合 | 三份集合**必须同时为 0** | 三份集合要么同时为空、要么同时非空（不许单侧形态） |
| 五个分栏 | 五个分栏**都写着（0）** | 五个分栏都在场（不是整块消失），读数逐个点名 |
| 空态措辞 | 页面出现 ≥3 次「没有观测到」 | **措辞 ⇔ 计数**：某栏为 0 ⇔ 该栏正文写出「没有观测到…」（反方向也管） |
| 优惠变化流 | 生产态 ⇒ 流里 **0 条** | 流与页面四个事件分栏的合计**同源**：同时为空 / 同时非空，且流不许比页面多 |

判据实现抽到纯函数 `changesSectionsOf(html)`（分栏头 → 正文切片 + 差异清单），
所以反证可以**直接构造页面**去顶红它，而不用去改产品代码（改产品代码会先撞上 build-local 自己的产物自检 ——
那只能证明「别的东西会红」，证明不了这条关系有牙）。反证 C7a（旧字面量红 / 新逐字节绿）、
C7b（构造「计数 0 但没写空态话」⇒ 红；写对了 ⇒ 绿）、C7c（构造少了「即将结束」那一栏 ⇒ 读数 -1 ⇒ 红）。

### ⑧ t42 §2.2 夹具内部计数：**只加注释声明**（9 处，断言一个字都没改）

声明文字统一为：**此数字锚在本地夹具上，不随生产数据漂移**（句尾附一句「这个数字由谁定义」）。

| 文件:行 | 声明覆盖的计数器 |
| --- | --- |
| `archive-selftest.js:193` | `synthetic.entries.length === 2`（上面那次 `archiveLib.buildArchive` 的夹具） |
| `archive-selftest.js:292` | `withoutRecords.entries.length === 2`（同一个 `lifecycleEvents`） |
| `history-selftest.js:282` | `eventsOf(store).length === 30` 与 `history-selftest.js:286` 的 `total === 30`（上面 `for (let i = 0; i < 30; i++)`） |
| `changes-selftest.js:150` | `r.totals.other === 2 && …metadata.length === 1 && …cosmetic.length === 1`（上面那张就地造的事件表） |
| `changes-selftest.js:159` | `cosmetic.totals.other === 1 && …cosmetic.length === 1`（只喂了 1 条事件） |
| `changes-selftest.js:288` | `r.totals.changed === 31`（上一行 `Array.from({ length: 31 }, …)`；队长已改判为无风险） |
| `api-plans-selftest.js:860` | `rekeyed.renameCandidates.length === 1`（就地由 `build()` 造） |
| `app-token-selftest.js:94` | `normalized.notes.length === 1`（上一行的私钥字面量） |
| `audience-selftest.js:433` | `conflictContrib.length === 2`（上面 `merge(collectedSide, plainCurator)`） |

> 依据：验收 ④ 明确要求「对 t42 §2.2 的夹具内部计数只加注释声明（含 `changes-selftest.js:286`）」，
> 所以这 9 处超出了「四个文件」的字面清单；它们**全是注释行**（`git diff` 里这些文件只有以 `//` 开头的 + 行，
> 无一行断言被改），不影响任何读数（见 §3 的复跑读数：`archive 69 / history 61 / changes 101` 项全绿）。

---

### 报错信息对照（验收 ③：坏判据只给两个裸数字，好判据点名对象并给两侧）

| 位置 | 改前（坏） | 改后（好；下面是**形如**，`…` 处是被我省略的实际集合，其余片段在反证里逐条命中过） |
| --- | --- | --- |
| feeds:839 | `undefined`（失败了也没有 detail，只有一句断言名） | `实际 feeds.PLAN_CHANGE_FEEDS=["plan-changes","stub-changes"] / 期望（进入夹具前的注册表快照）=["plan-changes"]；差异 [夹具后多出: ["stub-changes"] / 夹具后少了: [] / 位置被换: []]` |
| feeds:875 | `undefined`（detail 为空） | `实际 tag 里的 href（8 个）[…] / 期望（4 个 homepage Feed × 两个格式 = 8 个）[…]；差异 [少: 无 / 多: 无 / 重复: 无]`（C2b 里命中过 `少: …json`） |
| data-docs:186 | `undefined` | `实际（manifest.datasets 的 category 集合，6 类）[…] / 期望（docs.DATASET_CATEGORIES 声明的 key，6 类）[…]；差异 [表里有、Manifest 没有: 无 / Manifest 有、表里没有: 无 / 表里重复的 key: 无]`（C3a 里命中过 `表里有、Manifest 没有: ghost-category`） |
| api-plans:1038 | `JSON.stringify(radar.totals)` —— 只有 totals 一个对象，读不出它在跟谁比 | `实际 radar.totals={…}（sections.changed.items 2 条 + truncated 0 / other.metadata 1 条 + truncated 0） / 期望（由这份日志的 type 现算，元信息类型表 …=["updated"]） changed=2["price_increased","unit_changed"] · meta=1["updated"]；放错栏的条目 [进了「最近 7 天变化」的元信息: [] / 进了 other.metadata 的实质变化: []]`（C4b 里命中过这三段） |
| e2e:201 | `deals.json 里 type=deal 的记录只有 2 条，夹具需要 ≥3 条`（抛错，两个裸数字，且像内容缺陷） | `本轮样本不足，跳过并说明原因：deals.json 里可用来造事件的 type=deal 记录只有 2 条（id1, id2），而合成非空夹具需要 ≥3 条（…各一条）；依赖这几条记录的断言本轮不参与判定（它们没有变成「通过」）`（C5a/C5b 逐字命中） |

> 「坏改写」的样板是队长给的那句：**`期望 4、实际 9`** —— 没有名字的数字，读者无法判断该去改数据还是改判据。

---

## 2. 反证明细（18 条 + 4 条对照绿，全在临时沙箱里跑）

沙箱做法：`git ls-files` 复制整棵树到 TEMP → 在里面 `build-local` 自建 `dist/` → 逐条变异 → 跑 → 还原。
`find` 串**必须恰好出现 1 次**（否则该条反证自己就不可信，直接算失败）。跑完复核共享工作区 8 个文件的 sha256。

| id | 变异 / 构造 | 期望 | 关键证据（实测） |
| --- | --- | --- | --- |
| C1a | 去掉夹具 `finally` 里的 `PLAN_CHANGE_FEEDS.pop()` | 红 | `✗ 注册表恢复原状…` + `多出 ["stub-changes"]` |
| C1b | 夹具把注册表转一位（集合不变、顺序变） | 红 | `位置被换 ["api-plan-changes"]`（**旧判据会放行**） |
| C2a | 注册表合法地把首页订阅从 4 个减到 3 个 + 放回旧判据 | 旧红新绿 | `✗【反证·旧判据】…恰好 8 条` / `✓` 两条新对账 |
| C2b | `feedLinkTags` 少渲染 JSON 那条 tag | 红 | `✓/✗ 首页订阅发现：tag 里的地址集合…` + `少: feed/all.json…` |
| C3a | 类别表多一个没有数据集的类别 | 红 | `表里有、Manifest 没有: ghost-category` |
| C3b | 合法新增「一个类别 + 一份数据集」+ 放回旧判据 | 旧红新绿 | `✗【反证·旧判据】六个类别齐全` / `✓` 两条新对账 |
| C4a | 夹具里多一次元信息变化（`officialUrl` + `sourceUrl`）+ 放回旧判据 | 旧红新绿 | `✗【反证·旧判据】radar.totals.meta === 1` / `✓` 两条新对账 |
| C4b | 元信息事件被塞进「最近 7 天变化」栏 | 红 | `实际 radar.totals=…` + `期望（由这份日志的 type 现算…` + `放错栏的条目` |
| C5a | 纯函数表：`null` / 1 条 / 2 条 / 被锚定 / 3 条 | 0/1/2 ⇒ 原因对象；3 ⇒ `null` | 6 条子断言全 ✓（含「本轮样本不足，跳过并说明原因」与两侧数字） |
| C5b | 阈值 `DEAL_FIXTURE_SEEDS = 100000`（模拟跌破阈值） | exit 0 + 规定措辞 | `本轮样本不足，跳过并说明原因` + `只有 80 条` + 夹具历史未被改写 |
| C6a | 恢复旧写法 `out.events = chronological(events)` | 红 | `夹具执行失败` + `记录没有历史锚点` + `4a4f4777ffbc` |
| C7a | 生产态放回 `deal 0 / plan 14 / api 6` 字面量 | 旧红新绿 | `✗【反证·旧判据】…（deal 0 / plan 14 / api 6）` / `✓ …逐字节相同` |
| C7b | 构造「计数 0 但正文没写空态话」的页面（反方向也构造） | 红 + 对照绿 | 差异句 `已结束：分栏计数=0（空）而正文没写「没有观测到…」` |
| C7c | 构造少了「即将结束」那一栏的页面 | 读数 -1 ⇒ 红 | `即将结束=-1`，差异清单只含这一栏 |
| 对照绿 ×4 | 未变异沙箱：三个自测 + `--prepare-only` | exit 0 | `feeds 145` / `data-docs 58` / `api-plans 176` / `deal-history: 8 条事件（其中既有事件 1 条…）` |

机器可读：`t44-counter-proofs.json`（含每条的命令、变异说明、命中文字、exit code）。
现场日志：`counter-proofs-final.log`。

---

## 3. 现场读数（改动后复跑）

### 六个 Verify 命令（`final-verify.log`）

| 命令 | 读数 | exit |
| --- | --- | --- |
| `node scripts/tools/feeds-selftest.js` | `v1.6 订阅层演练：145 项通过，0 项失败`（改前 144） | 0 |
| `node scripts/tools/data-docs-selftest.js` | `v3.0 数据出口演练：58 项通过，0 项失败`（改前 57） | 0 |
| `node scripts/tools/api-plans-selftest.js` | `v2.5 API / Token 计费演练：176 项通过，0 项失败`（改前 175） | 0 |
| `node scripts/tools/history-nonempty-e2e.js` | `合成态 · 非空变化：37 项判定点，0 项失败，0 项显式跳过；validate/build/seo/browser 退出码 8/8 为 0` | 0 |
| `node scripts/validate.js --strict` | `✅ 校验通过（strict 模式）` | 0 |
| `node scripts/tools/check-ci-consistency.js` | `✅ CI 口径检查 38 项，失败 0 项` | 0 |

### 两种历史状态都要绿（`final-verify-extra.log` · `final-e2e-synthetic.log` · `final-e2e-pristine.log`）

| 状态 | 读数 | exit |
| --- | --- | --- |
| `--state=synthetic`（合成非空） | `37 项判定点，0 项失败，0 项显式跳过` · 8/8 命令 exit 0 | 0 |
| `--state=pristine`（冻结提交的生产态） | `29 项判定点，0 项失败，0 项显式跳过` · 8/8 命令 exit 0 | 0 |

`pristine` 改动前的失败原文（都在 `after-e2e-pristine.log` 里；本文件 ⑦ 的三条在那份日志里就是红的，
旧计数判据那条已在同一次改动里修掉）：
```
✗ 空态：五个分栏都写着（0），而不是整块消失 —— 今日新增=1 · 最近 7 天变化=0 · 即将结束=0 · 已结束=0 · 重新出现=0
✗ 空态：页面用「没有观测到」如实说清，而不是留白
✗ 优惠变化：RSS 与 JSON 都在且如实地为空（0 条） —— RSS 1 条 / JSON 1 条
```
（同一份数据、同一天：页面与产物都对，判据在说「必须是空的」。这就是 t44 要修的那类假红。）

### §2.2 注释声明涉及的自测

`archive-selftest 69` · `history-selftest 61` · `changes-selftest 101` · `app-token-selftest` · `audience-selftest` —— 全绿（见 `final-verify-extra.log`）。

### 断言条数只增不减

| 文件 | 静态 `check(` 站点（HEAD → 现在） | 运行时 |
| --- | --- | --- |
| `feeds-selftest.js` | 131 → 132 | 144 → **145** |
| `data-docs-selftest.js` | 60 → 61 | 57 → **58** |
| `api-plans-selftest.js` | 147 → 148 | 175 → **176** |
| `history-nonempty-e2e.js` | 30 → 33（另加 5 个断言改成 `skip()` 显式记账点 + 1 处定义/汇总） | 合成态 **37 判定点** · 生产态 **29 判定点** |

---

## 4. 边界、环境与未做

- **未碰**：`vendor-page-selftest.js`（t41）· `scripts/data/**` · `scripts/lib/**` · `.github/**` · `package.json` ·
  `check-ci-consistency.js` · 门禁登记口径（`action.yml` 49 步 / `--expect-checks=38` / selftest 登记面）。
  夹具第 ⑤ 节逐字复核三份 `scripts/data/*-history.json` 的 sha256 未变。
- **环境（为跑 Verify 第 4 条）**：`history-nonempty-e2e.js` 的设计前提是「以冻结提交 detach 的第二个 worktree
  `../qc-e2e`」，本 worktree 下原本不存在，所以建了一个（`git worktree add --detach ../qc-e2e 118a95c`），
  并给它接了 `node_modules` junction（worktree 不带未跟踪的依赖目录，缺 `playwright-core` 时真浏览器那一步会
  `MODULE_NOT_FOUND`）。**这是环境搭建，不是产品改动**；不需要时 `git worktree remove .worktrees/qc-e2e` 即可。
- **反证只落在 TEMP**：`counter-proofs.cjs` 跑完复核共享工作区 8 个文件 sha256（结果 `8/8 一致`），
  并在结束前删掉两个临时目录。
- **未做**：全量 Gate（t18 的职责；我改动期间它的 runner 正在跑，**门禁读数需要以改动后复跑为准**）。
- **留给下一轮的一个观察**（不在本任务 inScope）：`history-nonempty-e2e.js --no-browser` 会把
  `verify-site` 记成 `code:-1`，而汇总里的 `badCodes` 是「任何 ≠ 0」⇒ 带了 `--no-browser` 也必然 exit 1。
  这不是本任务点名的问题（本任务只改第 201 行的阈值），但它是同一族「跳过被当成失败」的形态，登记在此。
