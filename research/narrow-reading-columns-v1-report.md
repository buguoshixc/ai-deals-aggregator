# `narrow-reading-columns-v1` · 保留窄阅读列的登记制 + `.pdetailbody` 居中

> 分支 `narrow-reading-columns-v1` · 隔离工作树 `.worktrees/vertical-note-coverage-v1`
> 基点 `master = 8d3767c`（PR #57 / #58 合并后）· 判据标的 `scripts/tools/verify-site.js`
> 原始读数：[`research/_raw/narrow-reading-columns-v1/`](_raw/narrow-reading-columns-v1/README.md) ·
> 独立复核：[`research/narrow-reading-columns-v1-self-audit.md`](narrow-reading-columns-v1-self-audit.md)

---

## 1. 这一轮修的是上一轮留下的 P1 的另一半

`NEXT-STEPS.md` §0 剩余事项 4（P1，不阻塞）逐字写着两件事：

1. `.pdetailbody { max-width: 72ch }`（占单元格 **0.3377**，与缺陷同量级但**不是**页面级说明）→ 保留，未来两种处置：**居中或放宽**；
2. **判据只认 `.snote` 这个类名**（换名 / 换容器即隐形）；**两处保留窄宽还没有「机器可读的保留清单」**。

本轮的处置：

* **① 居中**（不是放宽）。依据就在规范里：**S4** 写着「窄阅读列只用于真正的长文页面，**并且必须居中**」。
  `.pdetailbody` 是套餐对比页**行内展开**的正文块（首次收录 / 核对日期 / 来源类型 / 官方链接 / 逐条引文），
  72ch 是阅读行宽 —— 它长在一个 **1357px 宽**的表格单元格里，不改宽、只居中。
* **② 变成可失败的登记制**：新增 `scripts/data/narrow-reading-columns.json`，
  产物里**任何以 ch 为单位声明的窄阅读列**都必须在里面登记，未登记 ⇒ 判据 `narrow-unregistered`；
  登记的条目还必须**居中**（§19 的几何断言）且**真的比容器窄**（否则声明已过时 ⇒ 判红）。

> 「判据只认 `.snote` 类名」那一半**没有**在本轮修：它需要构建期产出一份「这一页应有多少条说明」的
> 机器可读清单（跨源对账），属独立一轮；本轮只把**已覆盖面**写清楚（自审 §2 第 3 条）。

## 2. ch 窄列的**全集**（普查，不是抽样）

产物 303 个文件里，以 ch 为单位声明的窄阅读列**只有 1 处**：

```
dist/plans/coding/index.html    .pdetailbody { max-width: 72ch; margin-inline: auto; }
```

⇒ 这就是「两处保留窄宽」里**在 ch 口径下的全部**（另一处 `.detail-main` 是 `width: min(1120px, 100%)`，
属 px 口径，由 §22b 的原有断言「居中 + 宽度 ∈ [1080,1120]」承担，本轮不重复登记、也不放进射程）。
`min-width: 16ch`（搜索框）这类**不是**窄列声明，扫描面里显式排除（只看 `max-width` / `inline-size` / `width`）。

## 3. 判据（两条，各有牙）

| 判据 | 位置 | 判什么 |
| --- | --- | --- |
| `narrow-unregistered` | `verify-site.js` §22c（**页级**码，1440/1600 全站 + 760/360 样本集都判） | 页面内联 `<style>` 里每一条 ch 窄列都必须能在登记清单里按 `selector + 归一声明文本` 逐字命中 |
| 「登记条目必须居中且真窄」 | `verify-site.js` §19（**几何**断言，真浏览器） | `.pdetailbody` 必须：比单元格窄 **≥ 40px**、左右内边距差 **≤ 2px**、自身不裁切（`scrollWidth ≤ clientWidth + 1`） |

两条合起来才是 S4 的完整应用面：**登记制回答「谁被允许窄」，几何断言回答「窄得对不对」**。

### 3.1 实测几何（真浏览器 1440×900，`/plans/coding/` 展开首行详情）

| 量 | 值 |
| --- | --- |
| `.pdetailbody` 宽 | **465.75px**（= 72ch 现场换算） |
| 单元格内容盒宽 | **1357px** |
| 左内边距 / 右内边距 | **445.63px / 445.63px**（差 **0**） |
| computed `margin-inline` | 445.125px / 445.125px |
| 自身 `scrollWidth / clientWidth` | 466 / 466（未裁切） |

### 3.2 隔离牙（证明上一条判据**有牙**）

把同一份样式里的 `margin-inline: auto` **就地删掉**再量一次：

```
删掉前 左 445.63 / 右 445.63   ⇒   删掉后 左 0.5 / 右 890.75
（盒宽 465.75 → 465.75px：只挪位置、不改变宽度）
```

⇒ 判据量的是**居中**这件事本身，不是「盒宽变了没有」。

### 3.3 变异牙 M16（进 CI 的常驻牙）

把**已登记**的 `.pdetailbody { max-width: 72ch }` 用 DOM 追加一条 `<style>` 覆盖成 **70ch**
（命中真实元素、但行内详情未展开 ⇒ 不影响布局）：

```
现场扫描到 2 条 ch 窄列：.pdetailbody{max-width: 72ch}（已登记） · .pdetailbody{max-width: 70ch}（未登记）
期望 narrow-unregistered · 实测 [narrow-unregistered]（**除它之外没有任何别的码**）
```

⇒ 三条性质同时成立：① 未登记的会被认出来；② 已登记的那条仍在扫描结果里（不是「见 ch 就报」）；
③ 注入没有压窄任何参与布局的东西（**隔离**，不靠别的码顺带命中）。

## 4. 产物变化面（实测）

判据改动 + 一行 CSS + 一个登记文件，产物只动了**一个文件**：

| | 改前（PR #58 那一版） | 改后 |
| --- | --- | --- |
| 文件数 | 303 | 303（新增 0 / 删除 0） |
| 变化的文件 | — | **`plans/coding/index.html`（1 个）** |
| 全树摘要 | `13b17d0a31cfb358…` | `75ecb98344a855b7…` |

（逐文件 sha256 对账：`_raw` 外的 `.arch-v1/vn-digest-A.json` ↔ `.arch-v1/nrc-digest.json`。）

## 5. 门禁读数（本地实跑）

* `verify-site.js --dir=dist`：**862 → 874 项 / 失败 0**（新增 6 条：M16 三条 + 登记制适用范围自检 1 条 +
  §19 几何与隔离牙 2 条；另把「窄阅读列全部已登记」并入两个桌面档的逐条判据）。
* 判据自检：`narrow-unregistered` 的**正反例成对**（同一份合成几何：未登记 ⇒ 报、已登记 ⇒ 不报）。
* 普查读数：`未登记的窄阅读列 0 页（登记清单 1 条）`。

## 6. 复跑命令

```bash
node scripts/tools/build-local.js                       # 产物（本轮改了 build-local.js 的一行 CSS）
node scripts/tools/verify-site.js --dir=dist --json=.arch-v1/nrc-after.json   # 期望 874 项 / 0 失败
node .arch-v1/nrc-slice.cjs .arch-v1/nrc-after.json \
  --out=research/_raw/narrow-reading-columns-v1/geometry.json                # 切片（Tier-3 脚本）
node .arch-v1/tree-digest.cjs dist --out=.arch-v1/nrc-digest.json            # 产物逐文件摘要
```

## 7. 还没做（不在本版承诺内）

* **类名无关的散文普查**（「判据只认 `.snote`」那一半）：需要构建期机器可读的「这一页应有多少条说明」清单。
* 生产环境「最近变化」非空分支的真实样本（三份日志 19 条事件全是 `fields.type = tool`，**不造数据**）。
* `sideways-rl` / `vertical-lr` 无真实样本；竖排轴上没做 0.85 vs 0.5 的阈值 A/B 标定（上一轮登记）。
