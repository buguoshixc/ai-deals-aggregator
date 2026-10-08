# `criteria-adversary-v1` · 对刚合并的两轮判据做对抗性独立验证（竖排换轴 + 窄列登记制/居中几何）

> 任务 t5 · 尝试**证伪**而不是复述：轮 1 `vertical-note-coverage-v1`（合并 `1c02d84`）+ 轮 2 `narrow-reading-columns-v1`（合并 **`ef395c0`**）。
> 工作树 `.worktrees/criteria-adversary-v1`（基点 `origin/master = ef395c0`）· 基线自测：`verify-site.js --dir=.arch-v1/dist-base` = **874 项 / 0 失败**（与 captain 的坐标一致）。
> 原始读数：[`research/_raw/registry-adversary-v1/`](_raw/registry-adversary-v1/README.md)（8 个文件：形态清单 / sha256 台账 / 门禁切片 / 沙箱 / 探针 / 结论清单）。
> **交付方式：只交报告 + 证据**（分支 `criteria-adversary-v1` 上**本地提交**，**未推、未开 PR**，让 captain 收口）。
> **产品只读**：`scripts/**`、`dist/**`、`docs/**`、`NEXT-STEPS.md` 一个字节未改；所有形态注入 `.arch-v1/` 下的副本（逐文件 sha256 与 `dist` 全等：`c81765cd…`，303 文件）。

---

## 0. TL;DR —— 四个最重要的读数

| # | 结论 | 最小形态 | 读数 |
| --- | --- | --- | --- |
| **1** | **破防（出货判据可被注释伪造）** | `sitemap.xml` 里把 `vendor/zhipu/` 的整个 `<url>` 块包进 XML 注释 | 伪造副本：`verify:seo` **11 项 / 0 失败**、`§18 sitemap 有`、`/vendor/ 枢纽列出 24 个厂商入口 ✓`；**真删对照**三条全红（`漏 vendor/zhipu/`） |
| **2** | **破防（登记制可被 2 个字符绕过）** | `.pnote { max-width: 70CH; }`（大小写）或 `.pnote { max-width: 70ch; }` 藏在 `content:"/*"` 之后的注释里 | 扫描面**一条都看不到** ⇒ 0 码；探针：生效 `max-width` **452.812px**（真的变窄） |
| **3** | **破防（竖排单列 + 裁切 = 整页零码）** | `.snote { writing-mode: vertical-rl; width:100%; height:5.6rem; overflow:hidden; white-space:nowrap }` | ② 前置不成立（列 1）· ① 看不见（内容盒 1377px）· `note-clipped` 只看横向 ⇒ **0 码**；探针：盒 1380×89.59 而 `scrollHeight 1489` ⇒ 157 字里 **~94% 被裁掉** |
| **4** | **答案（captain 的三问）** | `entries: []` / `@media` / 祖先 `writing-mode` | ① `entries: []` ⇒ **立刻红（874 项 / 失败 5）**，且 §19 几何靠 fallback 继续跑；② `@media` 内规则、逗号、`@supports` 混排 —— 前两者**都扫得到**，逗号是**真漏**；③ 祖先写的 `writing-mode` **轴是对的**（读的是 computed style，继承可见） |

**总数**：24（`forms.json`）+ 2（`forms2.json`）+ 7（`forms3.json`）+ 3（`forms4.json`）+ 1（`mk-forge3.cjs` 的 canonical 伪造/真删对照）= **37 条形态**
（`attack-forms.json` 里 **38 条记录**：`F1` 在伪造副本与对照副本各登记一次；其中 4 条是对照：`RA2` / `RA1b` / `F2c` / `F3` 的真删对照）。
判定分布 **守住 15 · 破防 9 · 未覆盖 6 · 假红 1**（`findings.json` 31 条 finding，逐条附读数与修法）。
**不是复述**：下面每一条都有「逐字形态 · 命令 · 原始读数 · 结论」四段，且读数来自**门禁自己的 JSON**（判定）与**我自己的探针**（形态有没有真的落到布局上）。

---

## 1. 装置与纪律（这些读数为什么可以信）

```bash
# 1) 自己的工作树（产品只读）
git worktree add .worktrees/criteria-adversary-v1 -b criteria-adversary-v1 origin/master   # ef395c0
npm ci && node scripts/tools/build-local.js                        # dist/ 303 文件
cp -r dist .arch-v1/dist-base && node .arch-v1/tree-sha.cjs dist .arch-v1/sha/dist.json
# 2) 基线（对照组）
node scripts/tools/verify-site.js --dir=.arch-v1/dist-base --json=.arch-v1/json/base.json
#    ⇒ 874 项 / 失败 0 · 271 条说明 · 登记清单 1 条 · 未登记窄列 0 页 · 样本集 @760 列 676–728px（70ch 现场 452.81px）
# 3) 注入（每条形态只改 1 个文件；锚点命中数守卫）
node .arch-v1/inject.cjs --src=.arch-v1/dist-base --dst=.arch-v1/dist-att --forms=.arch-v1/forms.json
# 4) 判定（一次门禁 = 全站 186 页 @1440/@1600 逐条 + @760/@360 样本集 + 变异牙）
node scripts/tools/verify-site.js --dir=.arch-v1/dist-att --json=.arch-v1/json/att.json
# 5) 探针（只量布局，不判）
node .arch-v1/probe.cjs --dist=.arch-v1/dist-att --plan=.arch-v1/probe-plan-attack.json --out=.arch-v1/probe/attack.json
```

* **注入账**（`sha256-accounting.json`）：每份副本从 `dist-base` 整树复制（与 `dist` **逐文件 sha256 全等**），
  每条形态只改 1 个文件、`unexpectedChangedFiles: []`、`missingFiles: []`；原 `dist` 被写 **0** 个。
  形态逐字与 sha256 前→后：`attack-forms.json`。
* **登记表实验**只能改**副本里的** `scripts/`：`.arch-v1/sb-empty`（`entries: []`）、`.arch-v1/sb-two`（第二条登记 + 幽灵条目），
  它们各自的 `verify-site.js` 用 `--dir=dist` 跑自己的副本。
* **探针**（`.arch-v1/probe.cjs`，playwright-core + 本机 Edge，与门禁同一内核）：给出 computed 值 / 盒 / 左右内边距 / 字迹盒，
  用来区分「形态没生效」与「生效了但判据看不见」—— 这是我的结论与门禁读数**成对**的前提。
* **如实登记的装置偏差**：攻击副本 #1 有几条形态落在**内置变异牙的靶页**上（`docs/data/`、`changes/`、`plans/`、`need/student-only/`），
  使 `M6/M11/M13/M14/M8–M10 正对照` 的锚点前提被破坏 ⇒ 该轮 15 项失败里 **7 项是这类连带**（`M6 · M11 · M13×2 · M14×2 · M8/M9a/M9b/M10 正对照`），另外 8 项才是我的形态的直接效果。
  **纪律（写给下一轮）**：形态不要落在 `M6/M8/M9a/M9b/M10/M11/M13/M14` 的靶页上（`need/student-only/`、`docs/data/`、`changes/`、`plans/` 等），
  否则那一轮会多出 7 项连带失败；sweep 的读数不受影响（它来自 `metrics.layoutViolations` / `layoutNotes`），但「正对照」会红。

### 1.1 前置产物（从零复跑需要什么）

| 项 | 值 / 命令 | 备注 |
| --- | --- | --- |
| 运行时 | Node **v24.13.1** · npm **11.19.0** | 本机实测 |
| 依赖 | 在**自己的工作树**里 `npm ci` | ⚠️ 不要用 junction 指主工作区的 `node_modules`（`npm ci` 会顺着 junction 清空主工作区） |
| 浏览器 | `playwright-core` + 本机 Edge；环境变量 `DSH_EDGE` 可覆盖（默认 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`） | 门禁与探针**同一内核**，读数才可比 |
| 产物 | `node scripts/tools/build-local.js` ⇒ `dist/` **303 文件 / 1441.6 KB** | 之后所有 `--dir=` 指向的都是**副本** |
| 耗时 | 一次全量门禁 ~120 s（3 个并发 ~145 s）；探针一次 ~10 s | 36 条形态的完整复跑 ≈ 12 次门禁 ≈ 25 min（3 路并发 ≈ 10 min） |

### 1.2 装置清单（`.arch-v1/*.cjs` —— **gitignore 的 scratch，不入库**，本轮结束后**保留在原机**）

| 文件 | 接口 | 职责 |
| --- | --- | --- |
| `tree-sha.cjs` | `<dir> <out.json>` | 逐文件 sha256 + 全树摘要（「原 dist 被写 0 个」的证据） |
| `inject.cjs` | `--src --dst --forms --only --manifest` | 整树复制 + 逐形态注入；op = `css` / `wrap` / `spanLines` / `replace` / `replaceRe`；**锚点命中数守卫**（命中数 ≠ 期望 ⇒ 非零退出、不落盘）+ 变化面逐文件对账 |
| `make-sandbox.cjs` | `--root --mode=empty\|two --injectRoute --injectCss` | 搭 `scripts/` + `dist/` 的沙箱副本（**唯一**能改登记清单又不碰产品树的办法） |
| `probe.cjs` | `--dist --plan --out --label --width` | playwright-core 探针：computed（含 `fontSize/lineHeight/maxWidth/writingMode`）· 盒 · 左右内边距 · 字迹盒 —— **只量不判** |
| `mk-forge3.cjs` | 无参 | 造 canonical 注释伪造的两份副本（伪造 / 真删对照） |
| `make-evidence.cjs` | 无参 | 从 `.arch-v1/` 的原始读数**重新生成** `research/_raw/registry-adversary-v1/**` 全部证据文件 |
| `slice.cjs` · `form-readings.cjs` · `summarize.cjs` · `show-probes.cjs` | 各自读门禁 JSON / 探针 JSON | 读数切片（条级量、页级码、扫描面、失败项） |
| `count-exact.cjs` · `count-marks.cjs` · `cross-notes.cjs` · `find-disclosure.cjs` · `notes-dump.cjs` · `show.cjs` · `inspect.cjs` | 盘点小工具 | 产物结构盘点（注意：**别用 PowerShell 传带引号的字面量**，实测内层引号会被剥掉） |
| 形态文件 | `forms.json`(24) · `forms2.json`(2) · `forms3.json`(7) · `forms4.json`(3) | 逐字注入的唯一出处；**已逐条进 `attack-forms.json`**（含 `rawDefinition`：`wrap`/`spanLines`/`replace`/`replaceRe` 的逐字锚点）⇒ 即使 scratch 丢了，也能从 PR 里的证据文件重放全部 37 条形态 |

### 1.3 复跑命令 + 期望读数（照抄即可）

```bash
cd .worktrees/criteria-adversary-v1                 # 基点 ef395c0；分支 criteria-adversary-v1
npm ci && node scripts/tools/build-local.js          # dist/ 303 文件
mkdir -p .arch-v1 && cp -r dist .arch-v1/dist-base
node .arch-v1/tree-sha.cjs dist .arch-v1/sha/dist.json        # tree c81765cde8e2d0e7cf612be043d3671f841126b951c04db17a0a51c7e7a1c82c

# ① 基线（对照）
node scripts/tools/verify-site.js --dir=.arch-v1/dist-base --json=.arch-v1/json/base.json        # 期望 874 / 失败 0
# ② 攻击副本 #1（24 条形态：识别 / 竖排 / 登记 / 形状）
node .arch-v1/inject.cjs --src=.arch-v1/dist-base --dst=.arch-v1/dist-att  --forms=.arch-v1/forms.json  --manifest=.arch-v1/att-manifest.json
node scripts/tools/verify-site.js --dir=.arch-v1/dist-att  --json=.arch-v1/json/att.json          # 期望 874 / 失败 15（含 7 项变异牙连带）
# ③ 攻击副本 #2（VA8b 轴 desync 全宽度 + VA5b 样本集外的 760 形态）
node .arch-v1/inject.cjs --src=.arch-v1/dist-base --dst=.arch-v1/dist-att2 --forms=.arch-v1/forms2.json --manifest=.arch-v1/att2-manifest.json
node scripts/tools/verify-site.js --dir=.arch-v1/dist-att2 --json=.arch-v1/json/att2.json         # 期望 874 / 失败 4
# ④ 几何边界六副本（每条单独一份，因为都改 /plans/coding/ 的同一块）
for pair in "g19:G19-tolerance-inside,RA1b-comma-literal-70ch" "g21:G21-tolerance-outside" "g300:G300-narrowed-by-px" \
            "g1400:G1400-widened-by-min-width" "grtl:GRTL-ancestor-direction" "gxf:GXF-ancestor-transform"; do
  d="${pair%%:*}"; only="${pair#*:}"
  node .arch-v1/inject.cjs --src=.arch-v1/dist-base --dst=".arch-v1/dist-$d" --forms=.arch-v1/forms3.json --only="$only" --manifest=".arch-v1/manifest-dist-$d.json"
  node scripts/tools/verify-site.js --dir=".arch-v1/dist-$d" --json=".arch-v1/json/$d.json"
done
#    期望：g19 874/0 · g21 874/2 · g300 874/0 · g1400 874/2 · grtl 874/0 · gxf 874/0
# ⑤ 注释伪造（captain 增补线索）
node .arch-v1/inject.cjs --src=.arch-v1/dist-base --dst=.arch-v1/dist-forge     --forms=.arch-v1/forms4.json --only=F1-frozen-declaration-only-in-comment,F2-sitemap-loc-only-in-comment --manifest=.arch-v1/forge-manifest.json
node .arch-v1/inject.cjs --src=.arch-v1/dist-base --dst=.arch-v1/dist-forge-ctl --forms=.arch-v1/forms4.json --only=F1-frozen-declaration-only-in-comment,F2c-sitemap-url-deleted              --manifest=.arch-v1/forge-ctl-manifest.json
node .arch-v1/mk-forge3.cjs                                   # dist-forge3（canonical 进注释）/ dist-forge3-ctl（真删）
node scripts/tools/verify-site.js --dir=.arch-v1/dist-forge     --json=.arch-v1/json/forge.json      # 期望 874 / 失败 2（§18 sitemap 判据**绿**；2 项是 M15 副作用）
node scripts/tools/verify-site.js --dir=.arch-v1/dist-forge-ctl --json=.arch-v1/json/forge-ctl.json  # 期望 874 / 失败 4（sitemap 判据**红**）
node scripts/tools/verify-site.js --dir=.arch-v1/dist-forge3    --json=.arch-v1/json/forge3.json     # 期望 874 / 失败 2（DOM 判据兜住 canonical）
node scripts/tools/seo-verify.js --dir=.arch-v1/dist-forge        # 期望 exit 0（11 项 / 0 失败）—— 被注释骗过
node scripts/tools/seo-verify.js --dir=.arch-v1/dist-forge-ctl    # 期望 exit 1（漏 vendor/zhipu/）
node scripts/tools/seo-verify.js --dir=.arch-v1/dist-forge3       # 期望 exit 0 —— 被注释骗过
node scripts/tools/seo-verify.js --dir=.arch-v1/dist-forge3-ctl   # 期望 exit 1（[canonical-self] 没有 canonical）
# ⑥ 登记表沙箱（唯一能改登记清单的办法）
node .arch-v1/make-sandbox.cjs --root=.arch-v1/sb-empty --mode=empty
node .arch-v1/sb-empty/scripts/tools/verify-site.js --dir=dist --json=../json/sb-empty.json      # 期望 874 / 失败 5（立刻红）
node .arch-v1/make-sandbox.cjs --root=.arch-v1/sb-two --mode=two --injectRoute=need/ai-coding/ --injectCss=".page-notes-summary { max-width: 70ch; }"
node .arch-v1/sb-two/scripts/tools/verify-site.js --dir=dist --json=../json/sb-two.json          # 期望 874 / 失败 0（第二条登记未居中也不报）
# ⑦ 探针（9 次；只量布局）
node .arch-v1/probe.cjs --dist=.arch-v1/dist-att   --plan=.arch-v1/probe-plan-attack.json   --out=.arch-v1/probe/attack.json
node .arch-v1/probe.cjs --dist=.arch-v1/dist-base  --plan=.arch-v1/probe-plan-baseline.json --out=.arch-v1/probe/base.json
node .arch-v1/probe.cjs --dist=.arch-v1/sb-two/dist --plan=.arch-v1/probe-plan-sbtwo.json   --out=.arch-v1/probe/sb-two.json
node .arch-v1/probe.cjs --dist=.arch-v1/dist-att --width=760 --plan=.arch-v1/probe-plan-widths.json --out=.arch-v1/probe/att-width-760.json
node .arch-v1/probe.cjs --dist=.arch-v1/dist-att --width=950 --plan=.arch-v1/probe-plan-widths.json --out=.arch-v1/probe/att-width-950.json
node .arch-v1/probe.cjs --dist=.arch-v1/dist-att2 --width=760  --plan=.arch-v1/probe-plan-widths.json --out=.arch-v1/probe/att2-width-760.json
node .arch-v1/probe.cjs --dist=.arch-v1/dist-att2 --width=1440 --plan=.arch-v1/probe-plan-widths.json --out=.arch-v1/probe/att2-width-1440.json
node .arch-v1/probe.cjs --dist=.arch-v1/dist-forge --plan=.arch-v1/probe-plan-frozen.json --out=.arch-v1/probe/frozen-forged.json
node .arch-v1/probe.cjs --dist=.arch-v1/dist-base  --plan=.arch-v1/probe-plan-frozen.json --out=.arch-v1/probe/frozen-base.json
# ⑧ 证据再生 + 证据政策门禁
node .arch-v1/make-evidence.cjs && npm run check:evidence      # 期望：7 个文件重写 + ✅ 没有新增的 Tier-3 文件
```

### 1.4 t11（再攻击）的判据：怎么算「闭合」而不是「变绿」

下一轮**不许**用「把判据改松」换绿。逐条闭合判据（形态照抄 §1.3 / `attack-forms.json`，但**换一个路由或视口**再打一遍，避免修成「只对 `need/free-api/` 有效」）：

| 破防 | 闭合 = 重放同一形态时必须出现 | 反例（不算闭合） |
| --- | --- | --- |
| `F2-sitemap-comment` | §18 的 sitemap 成员资格 **红** + `/vendor/` 枢纽入口数 **红** + `verify:seo` **红**；真删对照仍红 | 只把 sitemap 判据删掉 / 只把样本路由换成不含被删页的批次 |
| `F3-canonical-comment` | `verify:seo` 的 `canonical-self` **红**（`stripless` 剥注释后 DOM 与文本一致） | 只保留 verify-site 的 DOM 判据、把 SEO 那条删掉 |
| `F1-frozen-comment` | §22c 冻结串计数**自己**红（不依赖 M15 的副作用） | 靠 M15 连带红就算闭合 |
| `R2-comma-borrow` | 逗号形态**红**（或按段逐段匹配 + `routes` 约束后红） | 只把登记条目补成「`.pnote, .pdetailbody`」放行 |
| `R4/R5-case`（`70CH` / `MAX-WIDTH`） | 两条都**红**；且注册表加回原样后**不**误报 | 只把 `70CH` 写进登记清单 |
| `R3-comment-eats-rule` | `content:"/*"` 之后的规则**红**；真规则也在 | 把注释剥离整个删掉（会让合法的规则前注释重新变成选择器） |
| `V3-vertical-clip` | 竖排 `nowrap + overflow:hidden` **红**（新码或 `note-clipped` 扩展）；**同时** ① 的正常单行说明不误报 | 用「凡竖排单列必红」换绿（会打坏 `:1366` 的合法单列） |
| `R11-second-entry` | 第二条登记未居中 ⇒ **红**；幽灵条目 ⇒ **红**；`entries: []` 仍红 | 只把 §19 的 `entries[0]` 改成硬编码别的选择器 |
| `R5b-px-effective-width`（未覆盖） | 明确二选一：登记生效宽 ≈ 声明 ch 换算值 **或** 在 `scanScope` 里逐字写清「px 不覆盖且允许换口径」 | 既不修也不写，等于把「窄阅读列」这条承诺留在灰区 |
| `V5b/V6-viewport-gap`（未覆盖） | 二选一：把 760 档扩到全部有说明的页（63 页）**或**在登记表里把「未量测档位 / 样本集外页面」写成已知边界 | 用「样本集选了哪 29 页」当已覆盖 |

**我明确认为「不该为闭合而改松/不该假修」的几条**（如与 captain 的修复任务冲突，请在 t11 里按证据裁决，不要只看绿）：

1. `R9-!important`（假红）：一行归一化（剥 `!important`）就能修；**但**如果团队决定登记制就是「声明文本逐字」，那也**可以**保留现状 —— 只是必须把这条写进登记清单的 `rule` 里（现在写的是「逐字命中」，读者会以为 `!important` 也算命中）。**别**为了它放宽到「前缀匹配」。
2. `V10`（竖排 <366 字一律红）**不是缺陷**：它是 `0.85×列宽` 的算术结果，轮 1 已如实登记。除非产品真要做竖排标题条，否则**不要**为它加豁免（加豁免会开出一个新的免判面）。
3. `V4`（溢出买覆盖率）**现在由 `note-clipped` 兜住**，不要为它新增 ② 的可见性判据（会把「真·铺满」也判红）；只要在登记表里记下「`columnSpan` 是未裁切字迹」。
4. 任何一条修复都必须**整套重跑 37 条形态**：判定「9 条破防闭合」时，同时核对「守住 15 条仍然守住」与「没有新破防」；只跑修复对应的那几条不算验收。
  **我的结论一条都不依赖这些码**（每条结论都由「该页在该档的 `metrics.layoutViolations` / `layoutNotes` 原始读数」支撑）；
  后面每一批形态都换成了**不撞靶页**的独立副本（`dist-att2`、`dist-g*`、`dist-forge*`），那些副本的失败项就是形态自己的效果。

---

## 2. 逐形态读数（守住 / 破防 / 未覆盖）

约定：**命令**列里的 `…/att` 表示 `node scripts/tools/verify-site.js --dir=.arch-v1/dist-att --json=.arch-v1/json/att.json`；
`probe(X)` 表示 `node .arch-v1/probe.cjs --dist=.arch-v1/dist-att --plan=… --label=X`（同一套探针，`probe-readings.json` 有全部字段）。

### 2.1 竖排换轴（轮 1：`note-ink-narrow` 的 §22c ②）

| 形态 | 逐字注入 | 原始读数 | 结论 |
| --- | --- | --- | --- |
| `sideways-rl` | `.snote { writing-mode: sideways-rl; width: 100%; height: 5.6rem; overflow: hidden; }` @ `need/free-api/` | 条级：`wm=sideways-rl · vertical=true · 行 1 · 列 18 · 列栈 362.64px · 判据用列 18/362.64 · 字形盒 22 · 内容盒 1369` ⇒ codes `[note-ink-narrow, note-intro-long]`；@760 同页也命中 | **守住** |
| `vertical-lr` | 同上换 `vertical-lr` @ `need/student-only/` | `列 20 · 列栈 403.42px` ⇒ `[note-ink-narrow, note-intro-long]` | **守住** |
| `columnCount = 1` + 裁切 | `.snote { writing-mode: vertical-rl; width:100%; height:5.6rem; overflow:hidden; white-space:nowrap }` @ `need/dev-credits/` | 条级 `列 1 / 列栈 16px / 内容盒 1369 / 字形盒 5` ⇒ **codes 无**；探针：盒 `1380×89.59`、`scrollHeight 1489 / clientHeight 90`、字迹 `16×1489`（top 143.5 → bottom 1632.5） | **破防**（157 字显示 ~6 字，全站零码） |
| 列栈铺满列宽 | `.snote { writing-mode: vertical-rl; width:100%; height:1rem; overflow:hidden }` @ `docs/data/` | `#0 列 102 / 列栈 2075.45px`、`#1 116 / 2360.92px`、`#2 98 / 1993.89px`（都 ≥ 1173 ⇒ ② 放行）；同时 `#0–#2 [note-clipped, note-intro-long]`，短说明 `#3–#8 [note-ink-narrow]` | **守住**（组合接住；见 §3.4 的「溢出买覆盖率」注记） |
| 只在 760 生效 | `@media (min-width:700px) and (max-width:800px) { …竖排形态… }` @ `status/`（**在 29 页样本集里**） | @760 样本档：`status/#0 note-ink-narrow, status/#1 note-ink-narrow`；@1440/@1600 不生效 ⇒ 0 码（设计如此）；探针 @760：`wm=vertical-rl · 字迹 342.2px · 24 个字形盒` | **守住**（样本档接住） |
| 未量测档位 | `@media (900–1000px) { …竖排形态… }` @ `feeds/`；同一形态挂**样本集外**的 `models/deepseek-v3.2/` | 两次门禁**全站 0 码**；探针 @950：`feeds/` 的 note `wm=vertical-rl · 字迹 260.7px`（< 0.85×910）⇒ 形态真的成立；探针 @760：`models/deepseek-v3.2/` 的 note `wm=vertical-rl · 字迹 179.1px` ⇒ 形态在 760 成立但该页不在样本集里 | **未覆盖**（视口空档 + 样本集边界） |
| `writing-mode` 在**祖先** | 外层 `<div class="arch-anc">`（CSS `writing-mode: vertical-rl`）包住 5 条 `.snote` @ `plans/api/` | 条级 `wm=vertical-rl · 列 5–15 · 列栈 97.56–301.47px` ⇒ `[note-narrow, note-ink-narrow, note-axis, note-intro-long]`；探针：note computed `writing-mode: vertical-rl`（继承可见） | **守住**（读的是 computed style，继承不会错轴） |
| 轴 desync | `.snote { writing-mode: vertical-rl; width:100% }` + 子元素 `.arch-h { writing-mode: horizontal-tb }`（正文每 16 字 `<br>`）@ `archive/`；VA8b 再加 `height:5.6rem; overflow:hidden` | ② 静默（`列 1` ⇒ 前置不成立），但 ① 接住：`内容盒 192/107px` ⇒ `[note-narrow]`；探针：`p.snote` 盒 1380、`.arch-h` 盒 **192**（7 段横排短行，右对齐 inset 1188） | **未覆盖**（② 的轴可被后代 desync，但这一形态由 ① 兜住） |
| `transform: scaleX()` | 横排 `.snote{transform:scaleX(0.35)}` @ `models/` · 竖排 + `scaleX(0.2)` @ `plans/` · 竖排 + `scaleX(5)` @ `changes/` | 横排：字迹 `421.93px` 但 **单行**（`行 1` ⇒ ② 前置不成立）⇒ 只有 `[note-axis]`；竖排 + 0.2：`列栈 7.28–68.45px` ⇒ `[note-ink-narrow, note-axis, note-intro-long]`；竖排 + 5：多数条被 ② 判红，两条被放大到 `1201.48px` 逃过 ②，但 `[note-axis, page-overflow@1440]` 接住 | **守住**（组合有牙）；单行 + scaleX 不在 ② 射程 |
| 竖排的假红带 | 任何 < 366 字的竖排说明（真实形态 137/159 字） | `137 字 ⇒ 18 列 / 362.64px`、`159 字 ⇒ 20 列 / 403.42px`，阈值 **1173px** ⇒ 距阈值还有 3.2 倍 | **未覆盖**（设计内；`0.85×列宽` 对竖排等于「≈366 字以上才放行」） |

### 2.2 登记制（轮 2：页面级码 `narrow-unregistered`）

| 形态 | 逐字注入 | 原始读数（`layoutSweep.narrowChDeclarationsAt1440`） | 结论 |
| --- | --- | --- | --- |
| **入口清空** | 沙箱副本 `scripts/data/narrow-reading-columns.json` → `entries: []` | **874 项 / 失败 5**：@1440/@1600/@760/@360 四条逐条判据全红（`未登记窄列页：plans/coding/`，`登记清单 0 条`）+ `M16 承重证明` 红（`已登记条目仍在 false`）；§19 几何**仍在跑且绿**（fallback `entries[0] \|\| {'.pdetailbody','max-width: 72ch'}`） | **守住**（fail-closed） |
| **逗号多选择器（借登记）** | `.pnote, .pdetailbody { max-width: 72ch; }` @ `need/ai-coding/` | 扫描面 `{"selector":".pnote, .pdetailbody","declaration":"max-width: 72ch","registered":**true**}` ⇒ 全站 0 码；探针：`.pnote` 生效宽 **465.75px**（真的窄了） | **破防** |
| 逗号**字面**例子 | `.arch-a, .pdetailbody { max-width: 70ch; }` @ `need/ai-coding/` | 扫描面 `registered=false` ⇒ 判红 ✓（声明文本与登记条目不同 ⇒ 逗号借不到） | **守住** |
| 对照（去掉逗号段） | `.pnote { max-width: 72ch; }` @ `need/free-model/` | `registered=false` ⇒ 判红 ✓ | **守住** |
| `@media` 内规则 | `@media (min-width: 1px) { .pnote { max-width: 70ch; } }` @ `need/china-usable/` | 扫描面命中（`registered=false`）⇒ 判红 ✓（**扁平正则没有漏扫**：它从内层 `{` 重新起匹配） | **守住** |
| 注释 + `@supports` 混排 | `/* 形态说明 */ @supports (display: grid) { .pnote { max-width: 70ch; } }` @ `need/edu-identity/` | 扫描面命中 ⇒ 判红 ✓ | **守住** |
| `!important`（未登记） | `.pnote { max-width: 70ch !important; }` @ `free-api/` | 扫描面 `max-width: 70ch !important`、`registered=false` ⇒ 判红 ✓ | **守住** |
| `!important`（已登记声明） | `.pdetailbody { max-width: 72ch !important; }` @ `plans/coding/` | 扫描面 `max-width: 72ch !important`、`registered=**false**` ⇒ 判红 | **假红**（同一处已登记声明只多了一个 `!important`） |
| **单位大小写** | `.pnote { max-width: 70CH; }` @ `need/free-tier/`；可见版 `.page-notes-summary { max-width: 70CH; }` @ `vendor/openai/` | 两条**都不在扫描面** ⇒ 0 码；探针：生效 `max-width` **452.812px** / **466.348px** | **破防**（CSS 单位大小写不敏感，2 个字符代价） |
| **属性名大小写** | `.pnote { MAX-WIDTH: 70ch; }` @ `need/free-tokens/` | 不在扫描面 ⇒ 0 码；探针：生效 **452.812px** | **破防** |
| **注释吃掉真规则** | 单独 `<style>`：`.arch-decoy::before { content: "/*"; } .pnote { max-width: 70ch; } /* arch-end */` @ `student/` | 剥注释用的是 `/\*[\s\S]*?\*/`（非贪心）⇒ 从**字符串里的 `/*`** 一直吃到末尾 `*/`，真规则被当注释吃掉 ⇒ 0 码；探针：生效 **452.812px** | **破防** |
| 行内 `style=` | `<p class="pnote" style="max-width: 70ch;">` @ `category/chat/` | 不在扫描面 ⇒ 0 码；探针（展开 `<details>` 后）生效 **452.812px** | **未覆盖**（清单 `scanScope` 已声明只覆盖内联 `<style>` 规则块） |
| px | `.pnote { max-width: 465px; }` @ `need/no-card/` | 不在扫描面 ⇒ 0 码；探针：生效 465px | **未覆盖**（已声明射程外） |
| `min-width` | `.pnote { min-width: 70ch; }` @ `developer/` | 不在扫描面 ⇒ 0 码；探针：`max-width` 仍 none、盒仍 **1380px**（min-width 不构成窄列） | **守住**（射程外且不构成窄列） |
| **生效值 vs 声明值** | `.pdetailbody { width: 300px; }` @ `plans/coding/`（登记声明 72ch 一字未动） | 副本 **874 项 / 0 失败**；§19 读数 `.pdetailbody 300px / 单元格 1357px · 左 528.5 · 右 528.5` | **未覆盖**（生效宽度被未登记口径换成 300px，两条判据都看不见） |

### 2.3 居中几何（轮 2：§19 `.pdetailbody`）

对照组（基线副本，我的探针独立复现轮 2 的数字）：`.pdetailbody 465.75px / 单元格内容盒 1357px · 左 445.63 / 右 445.63 · 自身 466/466 · margin 445.125/445.125`。

| 形态 | 逐字注入 | §19 原始读数 | 结论 |
| --- | --- | --- | --- |
| 容差**内**边界 | `.pdetailbody { position: relative; left: 0.95px; }` | ✓ `465.75px / 1357px · 左 **446.56** · 右 **444.69**`（差 **1.87px**）⇒ 副本 874/0（该副本唯一的红是逗号字面例） | **守住** |
| 容差**外**边界 | `.pdetailbody { position: relative; left: 1.05px; }` | ✗ `左 **446.67** · 右 **444.58**`（差 **2.09px** > 2）⇒ 红 ✓（Chromium 把位移量化到 1/64px ⇒ 标称 1.90/2.10 实测 1.87/2.09） | **守住** |
| 改窄（真·比容器窄有牙） | `.pdetailbody { min-width: 1400px; }` | ✗ `1400px / 单元格 1401px`（只窄 1px < 40px）⇒ 红 ✓ | **守住** |
| 改窄（未登记口径） | 见上表 `width: 300px` | ✓ `300px / 1357px · 左 528.5 · 右 528.5` | **未覆盖** |
| 父级 `direction: rtl` | `tr.pdetail td { direction: rtl; }` | ✓ `465.75px · 左 445.63 / 右 445.63`；隔离牙读数翻边：`删掉后 左 890.75 / 右 0.5` ⇒ 874/0 | **守住**（判据判「不相等」，与方向无关） |
| 祖先 `transform` | `tr.pdetail { transform: scaleX(0.9); }` | ✓ `419.17px / 1219.1px · 左 399.96 / 右 399.96`（整体等比缩放，差是不变量）⇒ 874/0 | **守住** |
| 第二条登记（几何只覆盖 `entries[0]`） | 沙箱 S2：`entries = [.pdetailbody, .page-notes-summary→70ch, .ghost-nowhere→65ch]` + 产物真写入未居中的 `.page-notes-summary` | 副本 **874/0 全绿**；§19 只量 entries[0]（`465.75px · 445.63/445.63`）；探针：`.page-notes-summary` 生效 **466.348px**、**左 0 / 右 913.66**（未居中） | **破防**（「登记的条目必须居中」只对第一条成立；幽灵条目也没有任何断言） |

### 2.4 注释伪造（captain 增补线索）：三个实测反例

| 形态 | 逐字构造 | 伪造副本读数 | 真删对照读数 | 结论 |
| --- | --- | --- | --- | --- |
| **sitemap** | `sitemap.xml`：`<!-- <url>…<loc>…/vendor/zhipu/</loc>…</url> -->` | `verify-site`：`✓ 厂商落地页 /vendor/zhipu/ 的 sitemap 成员资格与索引策略一致 :: sitemap 有`、`✓ /vendor/ 枢纽列出 24 个厂商入口 :: 页面 25 行 / sitemap 24 个`；`verify:seo`：**11 项 / 0 失败**（`sitemap entries 183`） | `vendor/zhipu/ 的 sitemap 成员资格 :: sitemap 无` ✗、`/vendor/ 枢纽列出 24 个厂商入口 :: 页面 25 行 / sitemap 24 个` ✗、`verify:seo ❌ 2 项：漏 vendor/zhipu/` | **破防**（3 条出货判据） |
| **canonical** | 把 `<link rel="canonical" href="…">` 用 HTML 注释包起来 | `verify:seo`：**11 项 / 0 失败**（`canonical-self` / `canonical-unique` 被注释骗过） | `verify:seo ❌ [canonical-self] need/student-only/ 没有 canonical` | **破防（单跑 verify:seo）**；`verify-site` 的 **DOM** 判据把它兜住（`✗ 别名页 /need/student-only/ canonical 自指`）⇒ 组合仍红 |
| **冻结串** | 把真规则换成**同一串**的 CSS 注释：`/* … .snote { color: var(--mut); … } */` @ `need/free-api/` | `✓ §22c 冻结串「一处定义、全站生效」：186/186 页恰好 1 次`（被骗过）；探针证明真规则已不在：note computed 从基线 `12px / 20.4px / margin-bottom 12px` 变成 **`14px / 21px / 0px`**，盒高 40.78 → **42** | （真删 ⇒ `frozenCount 0` ⇒ 该判据必然红） | **破防**（判据本身）；整轮红是**副作用**：`M15` 的变异锚点落在注释里、注入的 CSS 被注释吞掉（`note-ink-narrow 0 条`） |

---

## 3. 专项：登记制（captain 的三个问题，逐个回答）

### 3.1 `entries: []` ⇒ 产物**立刻**红吗？—— **是**（这是自审里如实登记「没实跑」的那一条）

沙箱 `.arch-v1/sb-empty`（`scripts/` 副本 + `dist/` 副本，登记清单清空）跑它自己的门禁：

```
874 项 / 失败 5
  ✗ §22c @1440 逐条页面级说明 … · 未登记的窄阅读列 1 页（登记清单 0 条） · 未登记窄列页：plans/coding/
  ✗ §22c @1600 …（同上）
  ✗ §22c @760 样本集 … 1 条违规码 [plans/coding/#? narrow-unregistered]
  ✗ §22c @360 样本集 …（同上）
  ✗ §22c M16 承重证明 … 现场扫描到 2 条 ch 窄列：.pdetailbody{max-width:72ch}（未登记） · .pdetailbody{max-width:70ch}（未登记）
      · 已登记条目仍在 false
```

两个附加读数：① **§19 的几何断言没有跟着哑**（`WIDE_NARROW_ENTRIES[0] || {'.pdetailbody','max-width:72ch'}` 的 fallback 让它继续量）⇒ 清空登记表不会制造「几何无人守」的窗口；② 内置牙 `M16` 也一起红（它要求「已登记那条仍在扫描结果里」）⇒ 登记制是**自洽 fail-closed** 的。

### 3.2 扫描面的真漏与假漏

* **真漏（可用来绕过）**：逗号多选择器（借登记）· 单位大小写 `70CH` · 属性名大小写 `MAX-WIDTH` · 注释剥离器被字符串 `/*` 带偏 · 生效值改成 px（`width: 300px`）。
* **不是漏（已声明射程外，但代价极低）**：行内 `style=`、`max-width: 465px`、`min-width`。
  ⚠️ 需要注意：`px` 那条的「绕过成本」只有**一个单位 token** —— 把 `max-width: 72ch` 改写成 `max-width: 465.75px` 就能同时躲开登记制与（因为 §19 的隔离牙锚点要求 `max-width: 72ch` 逐字出现）… 但**会**踩到 §19 的锚点守卫（`wideMutate` 找不到锚点 ⇒ 隔离牙红）—— 这是我唯一看到的 px 侧护栏，
  它是**副作用**（锚点字符串），不是设计出来的断言。
* **守住面（值得留着）**：`@media` 内规则**会被扫到**（扁平正则不是「只扫顶层」）；`@supports` 外层 + 注释混排不疏漏；`!important` 不会让未登记声明逃逸。
* **假红面**：已登记声明加 `!important`（或任何归一化没覆盖的写法）⇒ 判红。修法：归一化层剥掉 `!important`。

### 3.3 「登记的条目必须居中」只对 `entries[0]` 成立（沙箱 S2 实测）

`entries` 变成 3 条（第二条是真实、可见、**未居中**的窄列；第三条是产物里根本不存在的幽灵选择器）时，门禁 **874 项 / 0 失败**，
`§19` 的读数仍然是 `.pdetailbody`（`entries[0]`）。也就是说：**新增一条窄阅读列的门槛 = 在 JSON 里加一行**（不需要居中、不需要真的存在），
这与轮 2 报告的措辞「登记的条目还必须居中（§19 的几何断言）且真的比容器窄」不符。建议下一轮：

1. §19 按 `entries` **逐条**开测（用条目自己的 `routes` 找页面），而不是 `entries[0]`；
2. 加一条反向断言「每个登记条目至少在一个产物页面里命中该选择器 + 该声明」（幽灵条目 ⇒ 红）；
3. `narrow-unregistered` 的匹配约束到条目声明的 `routes`（现在 `routes` 字段完全没被读）。

### 3.4 附带发现：`narrow-unregistered` 的判据是**页级**的

同一条 ch 窄列在 @1440/@1600 与两个样本档各报一次（同一页 4 次），而 `metrics.layoutNotes` 的条级容器里没有它 ⇒ 外部逐条核对时它只能按「页」对齐。
这不是缺陷，但下一轮如果要做「跨源对账清单」，页级码与条级码的对齐口径要先定下来。

---

## 4. 专项：竖排换轴（轮 1）

1. **换轴本身是成立的**：`sideways-rl` / `vertical-lr` / 祖先继承 / 竖排 + `scaleX` 四种形态都被 `note-ink-narrow` 咬中，
   读数全部落在「列栈水平范围」上（362.64 / 403.42 / 97.56–301.47 / 7.28–68.45 px），而不是单列宽（16px）。
   这正是 T31 的 P1 要闭合的形状，我用**独立探针**复现了同一批数字。
2. **`columnCount = 1` 是这一版唯一的免判面，而它有一条真实的破防形态**：`white-space: nowrap` 让文本不换列 ⇒ 列 1 ⇒ ② 前置不成立；
   同时 `height: 5.6rem; overflow: hidden` 把 1489px 的字迹裁到 90px ⇒ 正文 **94% 不可见**，而 ①（内容盒 1377）、`note-clipped`（只看横向 1377/1377）都不响。
   **修法建议**：给竖排补一个竖直裁切量（`scrollHeight > clientHeight + WIDE_TOL` ⇒ 新码或并入 `note-clipped`），
   并把「1 列」豁免限定为「无固定高度 / 无裁切」；横排侧的类比形态（单行窄盒）本来就由 ① 接住，竖排侧没有对应物。
3. **「铺满」这个量可以被盒外的列买到**：`height: 1rem` 让列栈溢到盒外（2075–2360px > 盒 1380px）⇒ ② 放行；
   这一次是 `note-clipped`（`scrollWidth > clientWidth`）与 `note-intro-long` 接住。若某天出现「不影响 scrollWidth 的溢出」（例如纯 transform 位移/缩放），
   ② 的「铺满」就会被买通 —— `scaleX(5)` 的实测正好逼近这条边界（一部分条被放大到 1201.48px 逃过 ②，最后由 `note-axis` + `page-overflow` 接住）。
   **登记表条目**：② 的 `columnSpan` 读的是**未裁切**的字迹盒；它不区分「可见铺满」与「溢出铺满」。
4. **② 的轴可以被后代 desync**（`列 1`，② 前置不成立）：这一形态由 ① 接住（内容盒 192/107px），但**没有任何一条断言在看后代 `writing-mode`**。
   **登记表条目**：轴只按 `.snote` 自身 computed 值选；后代的 `writing-mode`/`text-orientation` 不在判据里。
5. **竖排的假红带**：`0.85 × 列宽` 换到竖排 = 「≈366 字以上才放行」⇒ 一栏 137 字的竖排说明被判红（实测 18 列 / 362.64px）。
   这一版**如实写了**「不是凡竖排必红」，但实际可用带很窄；若产品将来要放竖排标题条，需要一条显式的登记面。

---

## 5. 专项：居中几何（轮 2）

* **容差边界**是实的：`|左−右| = 1.87px ⇒ 绿`、`2.09px ⇒ 红`（我的探针与门禁读数一致）。
  边界值由 Chromium 的 1/64px 量化决定，所以「恰好 1.90/2.10」在实测里表现为 1.87/2.09（我按实测值报告，不按标称值）。
* **「真的比容器窄 ≥ 40px」也是实的**：`min-width: 1400px`（1400 vs 单元格 1401）⇒ 红。
* **对称性是不变量**：父级 `direction: rtl` 与祖先 `transform: scaleX(0.9)` 都不破坏判据（差别为 0；缩放整体等比），
  隔离牙在 rtl 下读数翻边（`890.75 / 0.5`）⇒ 它判的是「不相等」而不是方向。
* **缺口**：「比容器窄 ≥ 40px」只有**下界**、没有上界，也不校验**生效宽 ≈ 声明的 ch 现场换算值** ⇒ `width: 300px` 全绿（见 §2.2 末行）。
* **缺口**：几何只覆盖 `entries[0]`（见 §3.3）。

---

## 6. 专项：出货判据的「文本伪造」逐处审计（captain 增补线索）

判定标准：**决定判据的地方**如果读的是原始 HTML/CSS/XML 文本（而不是 DOM / CSSOM / 解析器），就能被「注释里的字面量」「`<script>`/`<style>` 里的字符串」「HTML 实体」伪造。
下表逐处给行号与判定；带 ✅/⚠️ 的是**实测**，其余是**静态判定**（我明确标出，不冒充实测）。

### 6.1 `scripts/tools/verify-site.js`

| 行号 | 读什么 | 是否决定判据 | 判定 |
| --- | --- | --- | --- |
| 6792 / 6793–6808 | `style.textContent` → 剥注释 → 扁平正则取 ch 窄列（登记制） | 是（`narrow-unregistered`） | **⚠️ 可伪造（实测）**：字符串里的 `/*` 吃掉真规则；单位/属性大小写绕开正则 |
| 6943 | `style.textContent.split(FROZEN)` 计数（冻结串） | 是（§22c ⑧） | **⚠️ 可伪造（实测）**：注释里的同一串照样计数（186/186 绿） |
| 4112–4115 | `fs.readFileSync(plans/coding/index.html)` → `matchAll(/id="(plan-[^"]+)"/g)` | 是（`/changes/` 深链落点） | **⚠️ 可伪造（静态）**：注释里写 `<!-- id="plan-x" -->` 即可给「落点」记账；同页的 DOM 侧没有第二条 `id` 断言 |
| 4138–4141 | 同上（`plans/api/`） | 是 | 同上 |
| 4338 + 4382 | `sitemap.xml` 原始文本 → `split('<loc>')` | 是（§18 sitemap 成员资格） | **⚠️ 可伪造（实测，见 §2.4）** |
| 5472–5474 | `fs.readFileSync(ROOT/dist/index.html)` → 取共享页脚片段 → 正则收 `href`（外链例外集） | 是（枢纽页「不往外送流量」的例外集） | **⚠️ 可伪造（静态）**：片段里注释掉的 `href="https://…"` 会进例外集；**另外它读的是 `ROOT/dist`，不是 `--dir=` 指定的副本**（`--dir` 校验副本时这一支仍取主 dist） |
| 8817 | `document.documentElement.outerHTML.includes('ANALYTICS:BOOTSTRAP')` | 是（分析占位符必须消失） | **免疫（方向是「必须不出现」）**：注释里出现该串只会**判红**（fail-closed）；没有「必须出现」的断言 |
| 1512–1524 | `fetch(feed.xml)` → `DOMParser` + `querySelector('parsererror')` | 是（Feed 结构） | **免疫**：XML 解析器忽略注释；解析失败会显式记 `parserError` |
| 4350–4369 | h1 / canonical / JSON-LD / robots / 行数 | 是（§18） | **免疫**：全部走 DOM（`querySelectorAll` / `querySelector(...).href` / `JSON.parse(script.textContent)`，JSON 里塞注释会解析失败 ⇒ 判红） |
| 7015 / 7484–7513 / 7165 | 说明文本、行/列字迹、字迹盒 | 是（§22c ①②③④⑤） | **免疫**：`Range.getClientRects()` + computed style（VA1–VA11 全部靠它出码） |
| 50 | 读 `scripts/data/narrow-reading-columns.json` | 是（登记清单本身） | **免疫**（读源码树，不是产物；伪造需要改仓库，属另一个信任级） |

### 6.2 `scripts/lib/seo.js`（「规则层 27 个检查码」的唯一实现）

| 行号 | 读什么 | 判定 |
| --- | --- | --- |
| 59–67 `visibleText` | 先剥 `<script>/<style>`，**再剥 `<!-- -->`** | **免疫**（唯一一处先剥注释的） |
| 76–80 `stripless` | 只剥 `<script>/<style>`，**不剥注释** | ⚠️ 下游全部继承这个缺口 |
| 88 `titleOf` / 93 `canonicalOf` / 98 `descriptionOf` / 103 `robotsOf` / 108 `h1Count` | `stripless(html)` + 正则 | **⚠️ 可伪造（canonical 已实测，见 §2.4）**；`h1Count` 的伪造方向是**假红**（注释里的 `<h1>` 会多计一个）—— 因为 `stripless` 会摘掉 `<style>`，captain 现场那个「CSS 注释里的 `<h1>`」在**出货路径**上不会发作（Tier-3 探针用的是裸正则，不含 `stripless`） |
| 112–125 `jsonLdBlocks` | **完全不 strip**，直接正则扫 `type="application/ld+json"` | **⚠️ 可伪造（静态）**：注释掉的 JSON-LD 块会被解析并通过；反过来，`<script>` 里塞注释会让 `JSON.parse` 失败 ⇒ 记 `broken`（这一侧 fail-closed） |
| 162–165 `rowMarkers` | `html.match(/data-item="/g)`（原始文本） | **⚠️ 可伪造（静态）**：注释里的 `data-item="x"` 会计入行数 |
| 167–188 `internalLinks` | `stripless(html)` + 正则 | **⚠️ 可伪造（静态）**：注释里的 `href="…"` 会被当成真实内链 |
| 357 | `new RegExp('data-summary-label="…"…').test(html)` | **⚠️ 可伪造（静态）**：同上（原始文本） |

### 6.3 `scripts/tools/seo-verify.js`（独立 SEO 门禁，Full Gate 的一步）

| 行号 | 读什么 | 判定 |
| --- | --- | --- |
| 48 `strip` | 只剥 `<script>/<style>`（**注释保留**） | ⚠️ 下游继承缺口 |
| 94 `itemListOf` | 原始正则扫 JSON-LD | ⚠️ 可伪造（静态） |
| 105–106 `rowsOf` | `strip(html)` + `data-item/data-child` 正则 | ⚠️ 可伪造（静态） |
| 156 | `sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)`（**不剥注释**） | **⚠️ 可伪造（实测）**：`sitemap entries` 仍是 183，`漏 vendor/zhipu/` 判不出来 |
| 202/205 | `strip(html)` + robots 正则（决定 `indexable`） | ⚠️ 可伪造（静态）⇒ 会同时污染「sitemap 成员 == 非 noindex 页面集合」两侧 |

### 6.4 结论（captain 的判据）

**是，我找到出货判据可被注释/字符串伪造 —— 而且有两个实测反例**：

1. **sitemap**（`verify-site` §18 两处 + `verify:seo` 一处）：XML 注释里的 `<loc>` 让三条判据同时绿；真删对照三条同时红。
2. **canonical**（`verify:seo` 的 `canonical-self` / `canonical-unique`）：HTML 注释里的 `<link rel="canonical">` 让 SEO 门禁 11/0 全绿；
   真删对照 `❌ 没有 canonical`。这一条被 `verify-site` 的 DOM 判据兜住（⇒ 系统整体仍红），但 `verify:seo` 作为**独立**门禁的证据强度被削弱。
3. 另有 1 条**判据本身**的伪造（冻结串计数，`186/186` 绿；整轮红只是因为变异牙的锚点被同一段注释吞掉）。

**修法（一条纪律，不是一堆补丁）**：凡是判据，**先剥注释再读文本**，或者干脆走解析器/DOM：

* `strip()` / `stripless()` 加 `.replace(/<!--[\s\S]*?-->/g, ' ')`；
* XML 侧（sitemap）同样剥 `<!-- -->`（或 `DOMParser` / `fast-xml-parser`——仓库已有 `DOMParser` 用法）；
* CSS 侧剥注释**不能用** `/\*[\s\S]*?\*/`：它会被字符串里的 `/*` 带偏（§2.2 实测）；用 CSSOM 的 `cssRules` 或一个能识别字符串/转义的小状态机；
* 把「读原始文本」的位置**集中登记**（一行一处），否则下一个人还会踩第三次（captain 已记录 h1 一次）。

---

## 7. 如果我是攻击者：最省的绕过路径（按成本排序）

| 排名 | 路径 | 成本 | 绕过的是哪条承诺 | 现状 |
| --- | --- | --- | --- | --- |
| 1 | `max-width: 70CH`（或 `MAX-WIDTH:`） | **2 个字符** | 登记制「任何 ch 窄列都必须登记」 | 无任何判据接住（探针证实生效） |
| 2 | `.pnote, .pdetailbody { max-width: 72ch }` | **一个逗号** | 同上（借别人的登记） | 无接住；`routes` 也没被读 |
| 3 | `width: 300px` 覆盖生效宽（声明文本一字不动） | **一个单位** | 「登记的窄列必须是真的窄阅读列」 | §19 只查 ≥40px 与居中 ⇒ 全绿 |
| 4 | 竖排 + `nowrap` + `overflow:hidden` | 3 个声明 | 「说明不许被裁/藏」 | ①/②/`note-clipped` 同时静默 ⇒ 零码 |
| 5 | `@media (901–1439px)`（或任意未量测档）内做形态 | 一个 `@media` | 全站判据的档位全覆盖 | 1440/1600/760/360 之外一律不判 |
| 6 | 把 `<loc>`/`canonical`/冻结串写进注释 | 4 个字符 | sitemap 成员 / canonical 自指 / 一处定义 | sitemap + canonical 实测可伪造（冻结串靠副作用才红） |
| 7 | 新增一条窄列 + 登记为 `entries[1]`（不居中） | 一次 JSON 编辑 | 「登记即被几何约束」 | 全绿（§3.3 实测） |

**反过来，攻击者最不划算的几条**（说明这一版哪些牙是真咬人的）：`@media` 内的 ch 窄列（会被扫到）· 逗号 + 不一致的声明文本 ·
`@supports` 外层包一层 · 未登记声明加 `!important` · 竖排 2–72 列 · 竖排 + `scaleX(<1)` · 容差外 0.1px · 把登记列撑到接近满宽。

---

## 8. 下一轮登记表条目（可直接抄）

1. **登记制的扫描面**：`narrowChDeclarations` 的正则
   * 单位：加 `i`（`70CH` 现形）；
   * 属性名：`property.toLowerCase()` 后比较（`MAX-WIDTH` 现形）；
   * 注释剥离：不要用非贪心正则（字符串里的 `/*` 会吃掉真规则），改用 `cssRules` 或带字符串识别的小状态机；
   * 逗号：按段逐段匹配，且条目匹配要带 `routes` 约束；
   * 归一化：剥 `!important`（否则已登记声明加 `!important` ⇒ 假红）。
2. **§19 的覆盖面**：按 `entries` **逐条**开测 + 「每个登记条目至少命中一个产物页面」的反向断言 + 「生效宽 ∈ [0.8, 1.2] × 声明 ch 现场换算值」。
3. **竖排**：补竖直裁切量（`scrollHeight > clientHeight + tol`）；「1 列」豁免限定为「无固定高度/无裁切」；登记「轴可被后代 `writing-mode` desync」；
   登记「② 的 `columnSpan` 是未裁切字迹，不区分可见/溢出」。
4. **档位覆盖**：登记「1440/1600 全站 + 760/360 样本集（29 页）」这个事实本身；把「有说明但不在样本集里的 34 页」列为已知盲区（或把 760 档扩到 63 页）。
5. **文本伪造**：剥注释纪律（HTML/CSS/XML 三种）+ 「读原始文本」位置登记表（本报告 §6 的表格可直接搬）。
6. **`--dir` 范围**：`sharedFooterExternalHrefs` 读的是 `ROOT/dist`（不是 `--dir` 副本）⇒ 用 `--dir` 校验副本时该例外集来自主 dist，应登记并改为 `DIR`。

---

## 9. 我**没有**做的（如实登记）

* 没有做像素级覆盖类形态（`clip-path` / `mask` / 不透明覆盖层）—— 仓内 0 处，且跨平台字体渲染会让像素断言 flaky（与轮 1 的边界声明一致）。
* 没有对**线上**做任何注入或冒烟（本任务不需要；线上读数归轮 2 的发布链）。
* 注释伪造这一类里，只有 sitemap / canonical / 冻结串三条是**实测**的；§6 表里标「静态」的条目只做了代码路径判定，**没有**各造一份副本实跑（时间预算；形态与实测的三条同源，风险不高，但我不把它写成实测）。
* 没有修改任何判据（`scripts/**` 未被写入；`git status` 里只有新增的 `research/**` 与 gitignore 的 `.arch-v1/`）。

## 10. 复跑

见 [`research/_raw/registry-adversary-v1/README.md`](_raw/registry-adversary-v1/README.md)（含每条形态的注入命令、门禁命令、探针命令）。
关键一条：`node .arch-v1/make-evidence.cjs` 可以从 `.arch-v1/` 的原始读数**重新生成**本目录的全部证据文件。
