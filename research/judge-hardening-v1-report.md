# judge-hardening-v1a 报告：verify-site.js 侧的注释伪造面 + 扫描面缺口 + §19 全条目几何 + 竖直裁切

> **一句话**：t5（对抗性验证）落在 `verify-site.js` 的 **9 条破防**里，8 条已**修到会响**、
> 1 条（R9 假红）已修成不误报；另把 t17 折入的两条做掉（§19 生效宽 ±20% / §22c 竖直裁切量）。
> **阈值一个都没放宽**（0.85×列宽 · `WIDE_TOL` 1px · 居中容差 2px）；`verify-site.js --dir=dist`
> 由 **880 项 / 0 失败** 变成 **881 项 / 0 失败**（+1，只增不减）；**产物逐字节未动**（全树摘要 `67d1d0bd…`）。
> `lib/seo.js` 那半（F2/F3 的 `stripless`）按分工属 **t10**，本轮**未碰**。

基线：`origin/master = 4c52d47` · 分支 `judge-hardening-v1a` · 唯一改动文件 `scripts/tools/verify-site.js`。

---

## 0. 逐条结果表（修复前 → 修复后）

判据一律是**真** `scripts/tools/verify-site.js`，只把 `--dir=` 指向产物副本（判据不写盘）。
「修复前」读数来自 t9 的预复现（同一套注入脚本、`4c52d47` 的脚本）；「修复后」是同一套注入跑在修完的脚本上。

| # | 破防（t5 id） | 修复前 | 修复后 | 对照（真破，必须绿→红） |
|---|---|---|---|---|
| 1 | **F1** 冻结串计数被 CSS 注释骗过 | **假绿** exit 0 · 880/0 | **红** exit 1（`§22c 冻结串…恰好 1 次` 不再被注释满足） | 把冻结串换成**不同**规则 ⇒ exit 1 · 1 条红 ✓ |
| 2 | **F2** sitemap `<url>` 包进 XML 注释 | **假绿** exit 0 · 880/0 | **红** exit 1 · 2 条（`/vendor/zhipu/ 的 sitemap 成员资格` + `/vendor/ 枢纽 25 行 vs sitemap 24`） | 真删 ⇒ exit 1 · 2 条红 ✓ |
| 3 | **F3** canonical 包进 HTML 注释 | 组合红 exit 1 · 2 条（DOM 兜住） | 同（**DOM 侧本来就是对的**；`lib/seo.js` 半属 t10） | 真删 ⇒ exit 1 · 2 条红 ✓ |
| 4 | **R2** 逗号多选择器借用 | **假绿** exit 0 · 880/0 | **红** exit 1 · 4 条（`narrow-unregistered`） | 去掉逗号（单独 `.pnote{72ch}`）⇒ exit 1 · 4 条红 ✓ |
| 5 | **R3** `content:"/*"` 吞规则 | **假绿** exit 0 · 880/0 | **红** exit 1 · 4 条 | 无诱饵 ⇒ exit 1 · 4 条红 ✓ |
| 6 | **R4** 单位大写 `70CH` | **假绿** exit 0 · 880/0 | **红** exit 1 · 4 条 | 小写 ⇒ exit 1 · 4 条红 ✓ |
| 7 | **R5** 属性名大写 `MAX-WIDTH:` | **假绿** exit 0 · 880/0 | **红** exit 1 · 4 条 | 小写 ⇒ exit 1 · 4 条红 ✓ |
| 8 | **R9** 已登记声明 + `!important` | **假红** exit 1 · 4 条 | **绿** exit 0 · **881/0**（干净形态见 §3） | 不带 `!important` ⇒ 881/0 ✓ |
| 9 | **R11** §19 只量 `entries[0]` + 幽灵条目不报 | **假绿** exit 0 · 880/0（沙箱 `entries=3`） | **红** exit 1 · 3 条（逐条几何 + 幽灵条目） | 登记表原样 + 未登记窄列 ⇒ exit 1 · 4 条红 ✓ |
| 10 | **V3** 竖排/定高裁切零码 | **假绿** exit 0 · 880/0 | **红**（见 §4：`plans/#0..#11 note-clipped` 12 条码） | —（见 §4 的形态说明） |
| 11 | **A1** `sharedFooterExternalHrefs` 读 `ROOT/dist` | 沙箱缺 `dist/` ⇒ **5 条假失败**（t6 的 10 条同机制） | 改读 `--dir` 副本 ⇒ 该 5 条消失 | — |

> **两条「修复后仍红」是注入方式的污染，不是判据缺陷**（都已查实并给出干净形态）：
> · R9 表里那条 attack 用的是「改写**已登记规则内部**」的旧形态 ⇒ 毁掉 §19 隔离牙的锚点（t6 §3 坑 #2）；
> · V3 表里那条 attack 注入的是 `need/free-api/` = **M15 的变异靶页** ⇒ 红的是 M15 的控制组。

---

## 1. 改了什么（逐条对应代码）

| # | 位置 | 改法 |
|---|---|---|
| F1 | 冻结串计数（`wideMeasure` 内） | 计数前先 `stripCssComments()`；注释里的冻结串不再算「一处定义、全站生效」 |
| F2 | §18 sitemap 成员资格 + §23 `vendorIndex` | 两处都先剥 **XML 注释**（`<!-- … -->`）再取 `<loc>` |
| R2 | `narrowChDeclarations` | 登记判定从「任一段命中」改为**每一段都要有登记**（`selectors.every(...)`） |
| R4/R5 | 同上 | 属性名/单位正则加 `i`（`70CH`、`MAX-WIDTH:` 都是合法 CSS） |
| R9 | 同上 + 归一函数 | 新增 `narrowNormDeclaration()`（剥 `!important`、统一小写与空白），**登记项与现场扫描共用同一个函数** |
| R3 | 同上 | 新增 `stripCssComments()`：先把**字符串字面量**里的 `/*` 替换成空格，再剥注释（`content:"/*"` 不再吞掉后面的真规则） |
| R11 | §19（`⑦b`） | 由「只量 `WIDE_NARROW_ENTRIES[0]`」改为**逐条遍历**：找不到元素（幽灵）⇒ 红；未居中 ⇒ 红；自裁切（横竖）⇒ 红；`entries: []` ⇒ **显式声明**「本轮没有几何对象」，删掉隐式 fallback |
| t17① | §19 | 新增一条：**生效宽 ÷ 声明 ch 的现场换算值 ∈ [0.8, 1.2]**（现场探针复制该元素的计算字体量 `N ch` 的像素宽） |
| V3 | §22c `note-clipped` | 增加**竖直**分支：`scrollH > clientH + WIDE_TOL`，**前置条件** `overflow-y ∈ {hidden, clip, auto, scroll}` 或声明了固定高度（`height ≠ auto`）；单列豁免的措辞相应限定为「无固定高度且无裁切」 |
| A1 | `sharedFooterExternalHrefs` | 读 `DIR`（`--dir=` 那份产物）而不是写死的 `ROOT/dist`；不传 `--dir` 时行为与旧版逐字相同，文件读不到仍返回**空集**（更严的一侧，线上冒烟语义不变） |
| t6 | §22c ② 的注释 | 「0.85 与 0.5 命中集合完全相同」改为实测表述：**0.5 ⊆ 0.85，判别区 = [0.5, 0.85)**，区内有 **0.6609**（66% multicol）与 **0.6470**（`v-h12`）；**常数 0.85 一个字符未动** |

**阈值未放宽的机器证据**：`git diff 4c52d47 -- scripts/tools/verify-site.js` 里没有
`WIDE_NOTE_RATIO` / `WIDE_TOL` 的改动行；登记表的 `centeringTolerancePx: 2` 未动（该文件本轮**没有改**）。

---

## 2. 读数与断言数

| 量 | 基线（`4c52d47`） | 本轮 | 差 |
|---|---|---|---|
| `node scripts/tools/verify-site.js --dir=dist` | 880 项 / 0 失败 | **881 项 / 0 失败** | **+1**（§19 生效宽那条；§19 逐条几何与旧单条断言 1:1 替换） |
| 产物副本上的 BASE（同一份 `--dir` 机制） | — | **881 / 0** | 证明「副本法」本身不引入差 |
| `check:ci` | 39 / 0 | **39 / 0** | 0 |
| `check:evidence` | ✅ | **✅** | 0 |
| 产物 | 304 文件 · 全树 `67d1d0bd…` | **同一串** | 0（判据改动不写产物） |

---

## 3. R9：查实与干净形态

- **现象**：把 `.pdetailbody { max-width: 72ch }` 加一个 `!important`（**同一处已登记声明**）⇒ 旧判据判它
  「未登记」= **假红**。
- **根因**：登记匹配按**声明原文逐字**比（`max-width: 72ch` ≠ `max-width: 72ch !important`），
  而 `!important` 不改变「这是不是一条 ch 窄列声明」。
- **修复**：归一函数剥掉 `!important`（与折叠空白、去行尾分号同一层），登记项与现场扫描共用。
- **读数**：干净形态（**新增一条独立规则** `.pdetailbody { max-width: 72ch !important; }`，
  不写进已登记规则内部）⇒ **exit 0 · 881/0 · 0 红** ✓；对照（同规则不带 `!important`）⇒ 同样 881/0 ✓。
- **顺带查实**：`attack-matrix` 里那条残留红是「**改写已登记规则内部**」造成的 —— 它把锚点
  `.pdetailbody { max-width: 72ch; margin-inline: auto; }` 改成了带 `!important` 的版本 ⇒
  §19 隔离牙报「锚点出现 0 次 ⇒ 按红处理」。**修控制组、不修判据**（t6 §3 坑 #2 的同一形态）。

---

## 4. V3：竖直裁切量（含一处我自己的返工）

- **形态与期望**：`overflow` 会切 + 有固定高度 ⇒ 内容被竖直裁掉时必须出码。
- **修复**：`note-clipped` 增竖直分支（`scrollHeight > clientHeight + WIDE_TOL`），**带前置条件**
  （`overflow-y ∈ {hidden, clip, auto, scroll}` 或 `height ≠ auto`）—— 不加这条会把正常文档流误报。
- **返工（如实记）**：第一版**没有把 `overflowY` / `heightStyle` 加进 note 的 `box()`**，
  于是前置条件恒为假、竖直分支永不触发（前两轮探针 0 码）。补上这两个量之后，三条读数：
  - **t5 的 V3 原形态**（`.snote { writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden; white-space: nowrap; }`
    注入 `plans/`）⇒ **exit 1 · 4 项失败 · 12 条违规码 `plans/#0 note-clipped … plans/#11 note-clipped`** ✓
    （**就是 t5 那条「整页零码」的形态，现在会响**）
  - **定高裁切形态**（`.snote { height: 12px; overflow: hidden; }` 注入 `need/dev-credits/`）⇒
    **exit 1 · `need/dev-credits/#0 note-clipped：说明自身竖直溢出 49px（scrollHeight 61 > clientHeight 12）`**（@760）与
    **90px（102 > 12）**（@360）✓
  - **原样产物** ⇒ **881/0 · 0 码**（真产物上说明是 `overflow-y: visible` + `height: auto` ⇒ 前置条件不成立、不误报）✓
- **误报面**（t17 明确要求先量）：加这条判据后，**1440 / 1600 / 760 / 360 四档全绿**
  （`881/0` 的那一轮里 §22c 四档都判了、都 0 码）⇒ **误报 0 页**。

---

## 5. t17 折入的两条

1. **§19 生效宽 ±20%**（t17 裁定 ①）：`plans/coding/` 的载体实测 **465.75px ÷ 现场 72ch = 465.75px ⇒ 比值 1.000**；
   注入 t5 的 **R5b**（`.pdetailbody { width: 300px }`，登记声明不动）⇒
   **exit 1 · 1 项失败 · `生效宽 300px ÷ 现场 465.75px = 比值 0.644（容差 0.8–1.2）`** —— 与 t17 预测的 0.644 逐位相同 ✓
   （这条同时闭合了 t5 的 **R5b「未覆盖」**）。
2. **§22c 竖直裁切量**：见 §4（含前置条件与四档误报面读数）。

---

## 6. 三条方法读数（**原样进报告**，给后来者省时间）

1. **注入落点必须避开判据自己的变异靶页**：M1–M4 = `need/student-only/ · status/ · changes/ · feeds/`；
   M15 = `need/free-api/`；M6/M14 = `need/student-only/`。踩上去的效果是「整轮红在变异控制上」，
   而不是「这条判据在响」。
2. **不要把位移 / `!important` 写进已登记规则内部**（t6 §3 坑 #2）：会毁掉 §19 隔离牙的锚点，
   报成「变异未执行 ⇒ 按红处理」。
3. **沙箱必须自带 `--dir` 指向的产物 +（修 A1 之前）一份 `ROOT/dist`**：否则凭空多出
   「按设计没有站外链接」类假失败（这正是 A1 那条硬编码的机制）。
4. **（本轮新增的坑）判据读的字段必须真的在几何里**：竖直裁切依赖 `box.overflowY` / `box.heightStyle`，
   第一版只加了 `scrollH/clientH` ⇒ 前置条件恒假、**测出来是「判据没牙」，其实是「判据没数据」**。
   教训：加一条「有前置条件」的判据时，先证明**前置条件在同一份几何里可取**。
5. **（本轮被咬两次的坑）浏览器侧那段大模板字符串里，注释不许出现反引号，也不许出现 `/*` / `*/` 字面量**：
   前者提前闭合模板（症状是运行期 `JSON.stringify(...)JSON.stringify(...) is not a function`），
   后者提前闭合块注释（症状是 evaluate 里的 `SyntaxError`）。

---

## 7. 没证明的东西（如实登记）

1. **R9 的「假红」只在 `plans/coding/` 的一条登记项上标定过**：第二条登记项进来时，
   `!important` 归一与 `routes` 约束要重新标定（现在只有 1 条登记项）。
2. **`routes` 约束只在浏览器侧按 `location.pathname` 取路由**：若将来有页面把登记项用在**别名路由**上，
   需要显式把别名也写进 `routes`，否则会判成未登记（行为更严，但会红）。
3. **竖直裁切只标定了「定高 + `overflow` 切」这一类**：`clip-path` / `mask` 这类「不改变盒、也不产生
   scrollHeight 差」的裁切仍不在射程内（与仓库既有的 DEFERRED 一致）。
4. **t5 的 V3 竖排原形态在本产物上量不到裁切**：我给出的是「有裁切 ⇒ 会红」的读数，
   **没有**证明「任何竖排定高形态都必然产生 scrollHeight 差」（浏览器对竖排的溢出方向与预期不同）。
5. **F3 的 `lib/seo.js` 那半未修**（按分工属 t10）：本轮的读数只覆盖 verify-site 的 DOM 侧。
6. **没有跑 Full Gate**（`npm run gate`）：按 captain 的要求做到 `--dir=dist` 全绿 + `check:ci` + `check:evidence`；
   PR 上的 CI `gate` 是最终门禁。

---

## 8. 复现命令

```console
cd "D:\OneDrive\Desktop\Code\AI Page\.worktrees\judge-hardening-v1a"
npm run build
node scripts/tools/verify-site.js --dir=dist            # 881 / 0
# 攻击矩阵（真判据 + 产物副本；一次性探针在 .arch-v1/，Tier-3 不入库）
node .arch-v1/prerun-after/run.cjs --parallel=3
# 干净形态的三条探针
node .arch-v1/prerun-after/probe-one.cjs R5b-effective-width plans/coding .arch-v1/prerun-after/r5b.css
node .arch-v1/prerun-after/probe-one.cjs R9b-important-separate plans/coding .arch-v1/prerun-after/r9b.css
node .arch-v1/prerun-after/probe-one.cjs V3e2-fixed-height-plans plans .arch-v1/prerun-after/v3d.css
node .arch-v1/collect-t9-evidence.cjs                    # 写 research/_raw/judge-hardening-v1/
node scripts/tools/check-ci-consistency.js --expect-checks=39
npm run check:evidence
```

**改动面**：`scripts/tools/verify-site.js`（+约 220 / −约 78）· `research/judge-hardening-v1-report.md` ·
`research/judge-hardening-v1-self-audit.md` · `research/narrow-reading-columns-v1-self-audit.md`（自审补记）·
`research/_raw/judge-hardening-v1/`。
**没有碰**：`scripts/lib/seo.js` · `scripts/tools/seo-verify.js` · `scripts/tools/seo-selftest.js` ·
`scripts/data/` · `docs/DESIGN-RULES.md` · `NEXT-STEPS.md` · `dist/`。

---

## 9. 建议收口行（原文，交 captain 决定；本轮**未**改这两个文件）

### 9.1 `docs/DESIGN-RULES.md` §9（依赖与工程）建议新增四行

```markdown
| N8 | **凡决定判据的文本，先剥注释（HTML / XML / CSS 三种）或走解析器 / DOM**。注释里出现一模一样的串**不算内容还在** —— 判据读的是「这一页写了什么」，不是「这一页的哪个字节出现过」 | 2026-10-08 t5 对抗性验证 + t9 修复：sitemap.xml 里把某厂商的 `<url>` 整块包进 XML 注释 ⇒ §18「sitemap 成员资格」与 `/vendor/` 枢纽入口数**全绿**（真删才红）；把冻结串整条包进 CSS 注释 ⇒ 「每页恰好 1 次」**仍然满足**而那条规则已经不生效（computed 从 `12px/20.4px/mb 12px` 变成 `14px/21px/0`） | 断言：`verify-site.js` §18 + §23（XML 注释剥除）、§22c ⑧（CSS 注释剥除，字符串感知）；沙箱实跑：注释形态由「假绿 0 码」翻成红，真删对照仍红 |
| N9 | **「登记制」的几何承诺必须逐条兑现**：登记表里每一条都要**真的在产物里命中并量几何**（居中 / 比容器窄 / 不自裁切）；**幽灵条目报红**；**清单为空要显式声明**（不许静默回落到某个隐式默认） | 2026-10-08 t5 的 R11：`verify-site.js` 的 §19 当时只量 `WIDE_NARROW_ENTRIES[0]`，登记三条（含一条未居中、一条幽灵）并在产物里真写入未居中的 70ch 窄列 ⇒ **874 项 / 0 失败**；`entries: []` 会回落到 `.pdetailbody` 的隐式默认（「清单为空」与「清单里恰好一条」读数不可区分） | 断言：§19 逐条遍历（本条 + 自裁切 + 生效宽）+ 幽灵条目红 + `entries: []` 显式声明；沙箱实跑：`entries=3` ⇒ exit 1 点名 |
| N10 | **会切内容的形态两个轴都要量**：横向 `scrollWidth > clientWidth`，纵向 `scrollHeight > clientHeight`。竖直那条必须带「**能被切**」的前置条件（`overflow-y ∈ {hidden, clip, auto, scroll}` 或声明了固定高度），否则正常文档流会被误报 | 2026-10-08 t5 的 V3 + t17 的量化：`writing-mode: vertical-rl` + 固定高 + `overflow:hidden` 的形态下横向量恒相等（实测 1377 = 1377），只有竖直被裁（`scrollHeight 1489 / clientHeight 90`，约 94% 看不见）⇒ 整页零码 | 断言：§22c `note-clipped` 的竖直分支（同一条码覆盖两轴）；沙箱实跑：`plans/` 注入 t5 原形态 ⇒ **12 条 `note-clipped`**（`plans/#0..#11`）、`need/dev-credits/` 定高形态 ⇒ 竖直溢出 49px / 90px；**原样产物 881/0（四档误报 0）** |
| N11 | **「声明了 ch」不等于「生效了 ch」**：登记的窄列必须验**生效宽 ≈ 声明 ch 的现场换算值**（±20%，同一页现场量那个元素的字体），否则一条 `width: 300px` 就能在「声明不动」的情况下把阅读列顶掉 | 2026-10-08 t17 裁定 ①：全站只有 1 条 ch 声明（`.pdetailbody{72ch}`，1 页），生效宽 **465.75px = 恰好 72ch（比值 1.000）⇒ 零假阳性**；注入 `width: 300px` ⇒ 比值 **0.644** ⇒ 必须红（t5 的 R5b「未覆盖」在此闭合） | 断言：§19「生效宽 ÷ 现场换算值 ∈ [0.8, 1.2]」；沙箱实跑：R5b ⇒ exit 1 · `生效宽 300px ÷ 现场 465.75px = 比值 0.644（容差 0.8–1.2）` |
```

### 9.2 `NEXT-STEPS.md` §0 建议的收口段

```markdown
5b. **verify-site 侧的判据加固（t5 的 9 条破防）—— ✅ 已收口（`judge-hardening-v1a`，2026-10-08）**：
   ① 注释伪造面（sitemap XML / 冻结串 CSS 注释）② 登记表扫描面（逗号多选择器逐段登记 · `70CH` · `MAX-WIDTH:` ·
   `!important` 归一）③ `content:"/*"` 吞规则 ⇒ 字符串感知剥注释 ④ §19 逐条几何（幽灵条目 / 未居中 / 自裁切 +
   `entries: []` 显式声明）+ **生效宽 ±20%** ⑤ `note-clipped` 竖直分支（带前置条件）⑥ `sharedFooterExternalHrefs`
   改读 `--dir`（A1；`--url` 语义不变）。读数：`verify-site --dir=dist` **880 → 881 项 / 0 失败**，
   阈值一处未改，产物逐字节未动。**`lib/seo.js` 那半（F2/F3 的 `stripless`）仍挂在 t10。**
```

