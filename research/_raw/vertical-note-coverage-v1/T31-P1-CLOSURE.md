# T31 的 P1 闭合 · 配对证据：竖排（`writing-mode`）在 ② 判据下的覆盖不对称

> 轮次 `vertical-note-coverage-v1`（2026-10-08）· 判据标的 = `scripts/tools/verify-site.js`
> 被闭合的登记：`NEXT-STEPS.md` §0「剩余事项 3」的 P1 / DEFERRED（原证据
> `research/_raw/secondary-page-layout-unification/verify/T31-WRITING-MODE.md`）
> 原 `requiredFix`（逐字）：「把逐行归并按 `writing-mode` 参数化 —— 竖排改成按**列**归并并判列内字迹宽
> （我的探针已能稳定量到「单字形盒 16px / 竖排 17 列」这两个数）；或对 `vertical === true` 的条改判
> 「单字形盒宽 < 0.85 × 列宽」。两者都能在 **1440 档**咬中，从而把这条 P1 闭合。」

---

## 1. 为什么「删掉豁免」不是修法（本轮实测的技术要点）

T31 的形态（逐字）：

```css
.snote { writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden; }
```

竖排下 `Range.getClientRects()` 取到的是**列片段**，不是字形盒：本轮的载体上实测 **18 个 16px 宽的竖列**，
它们**共享同一条垂直带**。因此旧口径的 ② 会：

| 判据的环节 | 横排（正常说明） | 竖排（该形态） |
| --- | --- | --- |
| ① 内容盒代理量 `textWidth` | 1369px（满宽） | 1369px（**满宽** ⇒ ① 看不见） |
| 归并轴 | 按**垂直**重叠并成行 | 18 个竖列**垂直方向完全重叠** ⇒ 并成 **1 行** |
| ② 前置条件 `行数 ≥ 2` | 本载体 2 行 ⇒ 成立 | **1 行 ⇒ 不成立** |
| ② 的判据量（最宽一行） | 1351.73px（≥ 阈值 ⇒ 放行） | 按行归并后是「一行 362.64px」但**前置条件已不成立** |

⇒ **即使把 `!note.vertical` 这个显式豁免整个删掉，② 照样一条码都不出**（前置条件在竖排下恒不成立）。
修法必须是**换轴**：竖排改按**水平**重叠归并成竖列，判据量换成「竖列栈覆盖的**水平**范围」
（竖排下「字迹在横向铺到哪里」的对应量），前置条件换成「竖列数 ≥ 2」。
这条推理在本轮被三条独立读数同时证实（门禁 / 探针 / 独立复算）。

## 2. 配对读数：**同一批字节**上的旧口径 vs 本轮口径

装置：把上面的形态 CSS 注入一份 dist 副本的**共享 `<style>`（冻结串规则之后，原串逐字保留）**——
逐文件对账见 `scratch-accounting.json`：`303` 文件、与 dist 不同 **1/303**（只 `need/free-api/index.html`）、
冻结串 **1 → 1**、**+85 B**、`dist` 被写 **0** 个。

| 档 | 旧口径：**master 改动前**（本轮基线，862 项） | 旧口径：轮 6 冻结 `2cbc160dc64f8ade…`（852 项） | 本轮口径（868 项） |
| --- | --- | --- | --- |
| @1440 逐条（全站 186 页） | **✓ 0 码** | **✓ 0 码**（detail 明写「竖排 1 条」——**看见了但不判**） | **✗ `note-ink-narrow` 1 条 / 1 页** |
| @1600 逐条 | **✓ 0 码** | **✓ 0 码** | **✗ `note-ink-narrow` 1 条 / 1 页** |
| @760 样本集 29 页 | **✓ 0 码** | **✓ 0 码** | **✗ `note-ink-narrow`**（`need/free-api/#0`） |
| @360 样本集 | **✗ `note-clipped`**（`scrollWidth 375 > clientWidth 325`，溢出 **50px**） | **✗ `note-clipped`**（同一条，50px） | **✗ `note-clipped`**（同一条，50px） |
| 整轮 | **862 项 / 失败 1**（唯一那条就是 @360 的 `note-clipped`） | **852 项 / 失败 10**（其中与逐条判据有关的只有 @360 那一条；另 9 条是**旧版自己的变异靶页已失效**——见 §5） | **868 项 / 失败 4**（上表四行，全部由这份形态引起） |

⇒ **配对的两端用的是同一批字节**：改动前的判据（master，`862/1`）与改动后的判据（`868/4`）都在
`.arch-v1/scratch-vertical` 上跑；差别只有三档新出的 `note-ink-narrow`。

线上交付物 `--dir=dist`（**未注入**）：**868 项 / 失败 0**（改判据之前同一份 dist 是 **862 项 / 失败 0**）。

## 3. 逐档几何（探针自写量测；**与门禁无共享代码**）

载体 = `need/free-api/#0`（别名页那 1 条导航更正；由 §22c ③b 断言「恰好 1 条」，所以靶页的承重面是结构性的）。
探针命令见 §4；读数见 `probe-verdict.json`。

| 档 | writing-mode | 盒宽 | 内容盒 | 有字区域代理量 | 行（按垂直重叠） | 列（按水平重叠） | 列栈水平范围 | 阈值 0.85×列宽 | 旧口径 | 本轮口径 | 自裁切 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1440 | vertical-rl | 1380 | 1369 | 1369 | **1**（最宽 362.64） | **18** | **362.64** | 1173 | 无 | **note-ink-narrow** | 0 |
| 1600 | vertical-rl | 1380 | 1369 | 1369 | 1 | 18 | 362.64 | 1173 | 无 | **note-ink-narrow** | 0 |
| 760 | vertical-rl | 728 | 717 | 717 | 1 | 18 | 362.64 | 618.8 | 无 | **note-ink-narrow** | 0 |
| 390 | vertical-rl | 358 | 347 | 347 | 1 | 18 | 362.64 | 304.3 | note-clipped | note-clipped（物理前置条件不成立 ⇒ ② 不判） | **20** |
| 360 | vertical-rl | 328 | 317 | 317 | 1 | 18 | 362.64 | 278.8 | note-clipped | note-clipped（同上） | **50** |

同页**未注入**时（`--dir=dist`）逐档：盒 1380/728/358/328，内容盒 1369/717/347/317，
**行 2 / 2 / 2 / 5 / 5**（最宽 1351.73 / 1351.73 / 711.55 / 345.28 / 315.64）、**5 档全 0 码**
⇒ 「修复后的产物本来是对的」这一次也逐档量过（不再只靠门禁那一行 detail）。

**门禁自己出的读数**（同一份注入副本，`need/free-api/#0`）与探针**逐项吻合**：`列 18（列栈 362.64px）/ 行 1（最宽 362.64px）/ 内容盒 1369px / 字形盒 22 / 列宽 1380px / 阈值 1173px`。

> 与 T31 原载体的差别如实记录：原载体 `category/agent/` 当时是「24 个竖列 / 并集 342.25×87.3 / 盒 1380」；
> 本轮换了载体（原因见 §5），所以列数与并集宽不同（18 列 / 362.64px）——**但「盒与内容盒满宽、按行归并恒 1 行、
> 水平只铺开 ~26% 列宽」这三条形状逐条相同**，而它们才是这条 P1 的要害。

## 4. 复跑命令（全部零写盘到 dist）

```bash
# ① 造形态注入副本（只写 .arch-v1/**；逐文件对账 + dist 只读证明）
node .arch-v1/vn-mk-scratch.cjs                     # 默认靶页 need/free-api/（可 --route= 换页）

# ② 本轮口径：交付物原样（期望 868 项 / 0 失败）
node scripts/tools/verify-site.js --dir=dist --json=.arch-v1/vn-after.json

# ③ 本轮口径：形态注入副本（期望 868 项 / 失败 4：@1440/@1600 逐条 + @760 样本 + @360 样本）
node scripts/tools/verify-site.js --dir=.arch-v1/scratch-vertical --json=.arch-v1/vn-form.json

# ④b **master 改动前那一版**打同一批字节（主工作区，未改过判据；期望 862 项 / 失败 1）
cd <主工作区>   # = 本仓根，master 上的 scripts/tools/verify-site.js 就是改动前的版本
node scripts/tools/verify-site.js \
  --dir=.worktrees/vertical-note-coverage-v1/.arch-v1/scratch-vertical \
  --json=.worktrees/vertical-note-coverage-v1/.arch-v1/vn-pre-change-on-form.json

# ④ 旧口径（轮 6 冻结版，在 .worktrees/secondary-page-layout-unification 里）打同一批字节
#    （期望 852 项 / 失败 10，其中逐条判据相关只有 @360 的 note-clipped）
node scripts/tools/verify-site.js \
  --dir=../vertical-note-coverage-v1/.arch-v1/scratch-vertical \
  --json=../vertical-note-coverage-v1/.arch-v1/vn-old-gate-on-form.json

# ⑤ 独立探针（T31 的脚本，一字未改）——两份读数
node research/_raw/secondary-page-layout-unification/verify/t31/writing-mode-probe.cjs \
  --dir=dist --route=need/free-api/ --index=0 --label=dist-carrier --out=.arch-v1/vn-probe-dist.json
node research/_raw/secondary-page-layout-unification/verify/t31/writing-mode-probe.cjs \
  --dir=.arch-v1/scratch-vertical --route=need/free-api/ --index=0 --label=form-carrier --out=.arch-v1/vn-probe-form.json

# ⑥ 独立复算（只读探针 JSON）+ 切配对读数 + 产物零变化证明
node .arch-v1/vn-verdict.cjs .arch-v1/vn-probe-dist.json .arch-v1/vn-probe-form.json \
  --out=research/_raw/vertical-note-coverage-v1/probe-verdict.json
node .arch-v1/vn-slice-pair.cjs .arch-v1/vn-old-gate-on-form.json .arch-v1/vn-form.json .arch-v1/vn-after.json \
  --out=research/_raw/vertical-note-coverage-v1/paired-gate-readings.json
node .arch-v1/tree-digest.cjs dist --out=.arch-v1/vn-digest-A.json   # 改动后重建前
node scripts/tools/build-local.js && node .arch-v1/tree-digest.cjs dist --out=.arch-v1/vn-digest-B.json
```

## 5. 两处**如实记录**的偏差（都不是「已解决」）

1. **原靶页没有承重面了**：T31 的原靶页 `category/agent/` 自 `secondary-page-intro-changes-v1`
   起**一条 `.snote` 都没有**（目录页首屏说明整层删除）。本轮第一次把 M15 挂在它上面时实测
   「说明 **0** 条 / 一条码都不出」——那不是判据失效，是**变异没有承重面**。因此：
   * 变异牙与证据副本的靶页换成 `need/free-api/`（别名页，那 1 条说明由 §22c ③b 断言「恰好 1 条」，
     靶页承重面**结构性**成立、不随数据漂移）；
   * 原靶页的**形状**仍然在证据里：T31 自己的两份探针 JSON（`probe-dist.json` / `probe-form.json`）
     与本轮的读数并列引用，说明「换轴之后同一类形状在 1440 档会红」。
2. **@390 一档在本轮载体上就自裁切**（20px）——T31 的原载体要到 @360 才裁（19px）。这是载体文本长度的差别，
   不是判据口径的差别；两档的**页面级**溢出都仍是 0（`overflow: hidden` 把溢出留在盒内），
   所以两轮都只能靠 `note-clipped` 在窄档接住它。

## 6. 结论

* ② `note-ink-narrow` 现在**按 `writing-mode` 参数化**：横排按行、竖排按列；判据量统一为
  「字迹在**水平轴**上铺到哪里 < 0.85 × min(主数据区宽, 页面列宽)」，前置条件统一为「排版单元数 ≥ 2」。
* 该形态在 **@1440 / @1600 / @760** 三档咬中（旧口径三档全 0）⇒ T31 的 P1 判为**已闭合**，
  并且不再依赖「样本集 + 自裁切副作用」这两个偶然条件。
* 判据不是「凡竖排必红」：竖列栈铺满列宽（≥ 0.85×列宽）与「只有 1 列」都不报，
  两条都在判据自检里成对钉住（`--dir=dist` 报告里「竖排判据的适用范围自检」）。
