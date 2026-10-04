# t31 修复报告：`/0 条/` 子串匹配把「10 条」当空态（T28-F1 blocker）

## 1. 根因（acceptance ①）

`scripts/tools/verify-site.js` 第 14 节那条断言（修复前 line 1657）：

```js
if (!/0 条/.test(row)) return true;                    // 非空行不写起算日，不算错
return /变更记录自 \d{4}-\d{2}-\d{2} 起/.test(row);
```

`/0 条/` 是**子串**匹配：`10 条` / `20 条` / `30 条` / `80 条` / `100 条` / `1,000 条` 全都命中。
现场（`dist/feeds/index.html`，2026-10-04）：

| 变化流 | 实际条数 | 该行文案 | 旧判据 `/0 条/` | 窗口里有起算日 | 旧断言判定 |
| --- | --- | --- | --- | --- | --- |
| Coding 套餐变化 | **28 条** | `…Coding 套餐变化 28 条 · 最近一条 2026-10-04 …` | `true`（窗口里框进了下一行的 `10 条`） | 否 | **判红（假红）** |
| API 价格变化 | **10 条** | `…API 价格变化 10 条 · 最近一条 2026-10-04 …` | `true`（自己的 `10 条` 命中） | 否 | **判红（假红）** |

窗口是「标题下标 + 260 字符」（`feedsPage.text.slice(idx, idx + 260)`），所以 Coding 那一行的窗口
把下一条（API）行的 `10 条` 也框了进来 —— 两条非空变化流都被要求写「变更记录自 … 起」。

复现：

```
node scripts/tools/verify-site.js        # 修复前：❌ 验收 735 项，失败 1 项
                                         #   ✗ /feeds/ 为空的变化流那一行写出了起算日
node research/_raw/t31/repro-zero-count-substring.cjs
   ① 判据层：12 组样本里旧写法与正确判据有 **6 组**不一致（全部是"条数以 0 结尾的非空行"）
   ② 现场层：逐行打印窗口原文、实际条数与旧/新判据的结论
```

## 2. 修法（acceptance ②）

判据收进 `scripts/lib/feeds.js`（**唯一出处**，页面验收与自测都读它）：

```js
const ZERO_COUNT_ROW_RE = /(?<!\d)0 条(?!\d)/;   // 数字边界：10 条 / 100 条 / 1,000 条 不算 0 条
function isZeroCountRow(text)      { return ZERO_COUNT_ROW_RE.test(String(text ?? '')); }
function hasChangeStartDate(text)  { return /变更记录自 \d{4}-\d{2}-\d{2} 起/.test(String(text ?? '')); }
function changeRowIsHonest(text)   { return isZeroCountRow(text) ? hasChangeStartDate(text) : true; }
```

`verify-site.js` 改为调用 `feedsLib.changeRowIsHonest(row)`，并且：

- 断言失败时的 detail 从「页面开头 120 字」换成**逐行事实**（`标题: 说 0 条=… · 有起算日=…`），下一次再出问题一眼能看出是哪一条流；
- 窗口右界从「固定 260 字符」改成「**下一条变化流标题的下标**（没有则退回 260）」——固定长度窗口会把邻行文案框进来，两条相邻空行时甚至能借到邻行的起算日。

`grep -n "/0 条/"` 现在只剩注释（外加自测里**故意复现旧写法**的回归钉）。

## 3. 牙（acceptance ③）

`scripts/tools/feeds-selftest.js` 新增第「十三」节，13 条断言（全部带对照组；自测总数 131 → 144）：

| 组 | 断言 | 对照组 |
| --- | --- | --- |
| 判据 | 真空态行（行首 / 行尾 / 前接标点 / 带起算日的完整行）判为 0 条 | 条数以 0 结尾的**非空**行（10/20/30/80/100/1,000 条）一律不是空态 |
| 回归钉 | 旧写法（裸 `/0 条/`）把这 6 种拼法**全判错** ⇒ 缺陷可复现 | 同组里的 `28 条` / `9 条` 旧写法也判对，说明差别只在"尾数是不是 0" |
| 边界 | `0 条` 后紧跟数字 / 没有空格 ⇒ 不算空态 | `0 条（变更记录自 …）` 仍算空态 |
| **原意** | 空态行 + 起算日 ⇒ 通过 | **空态行缺起算日 ⇒ 必须失败**（这道牙存在的理由，没被削掉） |
| 假红已修 | 非空行（10 条）⇒ 不进空态分支、不要求起算日 | 非空行即便写了起算日也通过 |
| 现场夹具 | 真实两行（28 条 / 10 条）在新判据下都不进空态分支 | 同一窗口里**真的**出现「0 条」时仍然要求起算日 |
| 单一出处 | `verify-site.js` 里不再有裸 `/0 条/`（去掉注释后） | 页面验收确实调用了 `feedsLib.changeRowIsHonest(`，并且 `changeRowIsHonest('0 条') === false` 证明那道牙还在 |

## 4. 同类清扫（acceptance ④）

见 `research/_raw/t31/sweep.md`：全仓 11 类候选逐条给结论 —— **真缺陷只有 1 处**（就是本任务修的），
其余 10 类全部**无风险**（数字两侧有固定标签 / 空格 / 单位 / 括号锚点，或走 `Number` 比较、或匹配的是报错文案）。

## 5. 真实数据验收（acceptance ⑤）

| 命令 | 结果 |
| --- | --- |
| `node scripts/tools/verify-site.js` | **✅ 验收 735 项，失败 0 项**（修复前 735/1）—— 在**重新构建后的 dist/** 上跑（`verify-before.log` / `verify-final.log`） |
| `node scripts/tools/feeds-selftest.js` | **✅ 144 项通过，0 项失败**（`feeds-selftest-final.log`） |
| `node scripts/tools/check-feeds-reproducible.js --dir=dist` | **✅ exit 0**：2 次构建逐字节一致（`feeds-repro-final.log`） |
| `node scripts/tools/build-local.js` | **✅ exit 0**：产物自检全过 → `dist/`（`build-final.log`） |
| `node scripts/validate.js --strict` | **✅ exit 0**：校验通过（`validate-final.log`） |

## 6. 过程中的外部在飞状态与因果隔离（留档）

修复期间**别人正在改** `scripts/data/model-registry-links.json` 的引文（4 条 API 映射的 `evidence[0].quote`），
编辑过程中门禁红过两次（引文还没与记录逐字一致 → `validate --strict` 红；引文改完但没跑 `models:rebuild` →
`check:models:reproducible` 红、连带 `build-local` 红）。这两次都**不是**本改动造成的，
`research/_raw/t31/causality-ab.cjs` 做了 A/B/C 隔离，结果留档在 `causality-ab-result-inflight.json`：

| 组 | 代码 | 数据 | validate | check:models:reproducible | build-local | check-feeds-reproducible |
| --- | --- | --- | --- | --- | --- | --- |
| **A** | 我的改动 | HEAD 的 4 份数据文件 | ✅ 0 | ✅ 0 | ✅ 0 | ✅ 0 |
| **B** | HEAD（**没有**我的改动） | 在飞现场 | ✅ 0 | ❌ 1 | — | — |
| **C** | 我的改动 | 在飞现场 | ✅ 0 | ❌ 1 | — | — |

B 与 C 判定**逐项相同** ⇒ 在飞状态的红与本改动无关；A 组证明「我的改动 + 一致的来源层」下
`build-local` / `check-feeds-reproducible` / `validate --strict` **三门禁全绿**。

**最终状态**：外部编辑收尾（跑了 `rebuild-models`）后，§5 的 5 条命令在**现场**全部 exit 0。

## 7. 边界与不做的事

- 只改 `scripts/lib/feeds.js`、`scripts/tools/verify-site.js`、`scripts/tools/feeds-selftest.js` 与 `research/_raw/t31/`；
- **没有**新增自测文件（不动 `.github/**`、`package.json`、`check-ci-consistency.js` 的冻结口径）；
- **没有**改产物模板去迎合断言（页面本身是对的：非空行给条数与最近一条日期）；
- 没有删 `t28site.building/`；没有碰其它根派生产物。
