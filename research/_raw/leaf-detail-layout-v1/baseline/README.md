# leaf-detail-layout-v1 · 改动前基线（两份，用途不同）

这个目录里有两份"改动前"快照。**它们不是同一件东西**，混用会得出错误结论 —— 所以这份
README 把每份的来历、能回答什么问题、不能回答什么问题写清楚。

## ① `baseline-dist/` —— 会话开始时主工作区里的那份 `dist/`

- **来历**：2026-10-05 会话开始时，直接从主工作区（master）的 `dist/` 拷出来的三个页面
  （首页 / `/deal/2eae0e246de2/` / `/models/claude-opus-5.5/`）+ `deals.json` / `models.json` / `logos.css`。
- **它是什么**：一份**旧构建**（不是 `d09a1c5` 的忠实产物）—— 页脚共享块 2201B，而 `d09a1c5`
  源里是 2701B、重新构建后是 5352B；模型页少若干后来才进 registry 的数据字段。
- **能回答**：**布局类**的改动前读数（`.dpane` = 820px、`.dpane-src` 的 `max-width: 820px` 与
  `word-break: break-all`、main = 1380px@1440、居中偏差 560px）。样式块与 `d09a1c5` 逐字相同，
  所以布局读数有效。
- **不能回答**：任何「结构 / 内容有没有变」的对比。它的数据比 HEAD 旧，拿它比对会把
  "数据本来就更新"误判成"这次改动动了内容"。
- 用途：`audit/before.json` 的输入（独立审计的第一把尺子）。

## ② `baseline-head/` —— `d09a1c5` 的**忠实**重新构建

- **来历**：在一次性 worktree（`.worktrees/leaf-layout-before`，detached HEAD = `d09a1c5`，
  干净工作区）里跑 `node scripts/tools/build-local.js` 得到的 `dist/`，再拷出同样的页面。
- **它是什么**：与改动后产物**同源同数据**的改动前版本（303 个文件、186 个 HTML 页）。
- **能回答**：改动前后**逐字节**对比 —— 见 `../gate/before-after-compare.cjs` 的结论：
  303 → 303 文件、117/117 非 HTML 文件逐字节相同、186/186 HTML 页剥掉样式后正文逐字节相同、
  样式块行集合差恰好 +8 / −2（全部是本次那几条规则）。
- **用途**：队长侧的"内容零增减、数据零变化"证据；也是 §十九 数据完整性的一条硬证据。

## 两份的 sha256

- `baseline-dist/`：见 `sha256-manifest.txt` 与 `git-head.txt`（会话开始时记录的仓库状态）。
- `baseline-head/`：见 `baseline-head/sha256.txt`（含三个页面 + `deals.json` / `models.json` /
  `sitemap.xml` / `logos.css`）。

## 一句话规矩

**布局对比用哪份都行；内容/结构对比只能用 `baseline-head/`。**
