# Captain 更正与补充说明（2026-10-05）

本文件由队长（captain）追加，用于更正 T1 报告里的两处事实错误。**T1 的 verdict=pass 不变**
——更正的两条都不影响任何验收条目（AC-01…AC-32）的判据。

---

## 更正一：主 prompt 文件**确实存在**，只是成员读不到；且已不需要它

T1 报告与 `REQUIREMENTS.md §0.1` 写的是：主 prompt 文件「在磁盘上不存在（阻塞性事实）」。

**这个结论是错的**，错因是沙箱可见性：

- 任务开始时，队长用 read 工具**成功读取**了 `D:\AI_DEALS_HOME_TOPIC_ENTRY_CARDS_PROMPT.md`
  全部 1415 行（正因如此，T1–T5 的任务契约里才能写出带 § 编号的验收要求）。
- 成员的文件沙箱只覆盖 session workspace（`D:\OneDrive\Desktop\Code\AI Page`），
  `D:\` 根不在其中。所以成员看到的 `Test-Path=False`、全仓 grep 0 命中，
  都是**「我读不到」**，不等于**「它不存在」**。这两件事必须分开写。

**现在的实际状态（队长实测）**：该文件在本次会话期间**真的从磁盘上消失了** ——
队长刚才用绝对路径也读不到它（`Test-Path=False`，`Get-Item` 报路径不存在）。
也就是说 T1 的观察在它写下时是「读不到」，在现在是「确实没了」，但**两者的含义不同**，
不能把「沙箱读不到」写成「磁盘上不存在」。

**对下游的影响：无，且不需要任何补救。**

- 本轮的规格权威是 **T1 的 `REQUIREMENTS.md`（AC-01…AC-32）＋ 各任务契约本身**，不是那个文件。
- T2/T3/T4/T5 **不要**再去 D:\ 根或全仓找 prompt 原件，也不要因为找不到而降低判据或停工。
- **`REQUIREMENTS.md §0` 里那张 `[§已载]` / `[§未载]` 对照表与「未标定的 §1/§15/§23」清单，
  一律忽略即可**：§ 编号只是溯源标签，队长已经核对过，每一条 AC 的实际内容都落在
  它自己写明的判据（断言名 / 命令 / 实测读数）上。**不需要任何 § 编号校正。**
- 顺带确认：T1 指出的「`verify-site.js §15b2` 是脚本自己的小节号、不是 prompt §15」是对的，
  这个区分保留。

---

## 更正二：slack 判据差 1px —— 是 **δ ≥ 2** 才掉行，不是 δ ≥ 1

队长在计划里写的是「任何 ≥1px 的增高都会把首屏完整卡片从 9 张压到 6 张」。**这条差 1px。**

T1 用「运行时注入 δ、不改文件」的方式实测，结论比队长的说法更准：

| δ | 最后一张完整卡 bottom | 首屏完整可见 |
|---|---|---|
| 0 | 899.00px（innerHeight = 900） | 9 张 |
| +1 | 900.00px（恰好踩线） | **仍是 9 张** |
| ≥ +2 | > 900px | **6 张** |

正确表述是：**δ ≥ 2px 才掉一行；δ = +1 只是把 1px 余量吃光、恰好卡在边界上。**

**结论不变、而且更强**：Topic Card 的 δ ∈ [114, 144]px（T1 实测），是临界值 2px 的
**57–72 倍**。所以「`verify-site.js` 首屏硬断言（≥9）与
`research/_raw/ours-baseline/verify.json` 的 `firstScreenFull` 基线必然被本轮打破」
这个判断依然成立 —— T2/T3 照 AC-31 执行，无需重新评估。

写这一条进代码注释时，请用 **δ ≥ 2px** 这个实测口径，不要沿用队长的 δ ≥ 1px。

---

## 队长已独立核验的 T1 结论（可直接采信）

以下四条队长逐条查过原始文件，T2/T3 可以放心依赖：

1. **必须删除的 4 个调用点行号正确**：`verify-site.js` 现盘 5790 行、与 HEAD 逐字节一致
   （`git diff` 为空），`:2321` / `:2324` / `:2456` / `:2477` 四条断言名逐个对上，
   运行时合计少 6 条（390/360 两档各 2 条）。
2. **`--expect-checks=38` 与 `FROZEN_ASSERTION_NAMES` 与 `verify-site.js` 无关**：前者冻结的是
   `check-ci-consistency.js` 自己的 37 + 1 项，**一条都不数** `verify-site.js` 的断言。
   T3 增删 `verify-site.js` 断言时**不得**顺手动这两个东西。
3. **卡上数字必须按 `type === 'deal'` 过滤**：现盘 `renderNeedRow` 第一行就是
   `deals.filter(deal => deal.type === 'deal')`（`build-local.js:315`），`verify-site.js:2267`
   也是同一口径。**重写时两边都必须保住**，否则 12/60/44/67 会变成 15/73/8/70。
4. **冻结指纹可复算**：`NEED_PREDICATES` 键集 `4c8125ab1c0828af`、`NEED_GROUPS`
   `794d0e084c09e2bd`、`NEED_PAGES` slug|predicate|label `9307d2faa110243b`、
   `short` 序列 `8e25f9a6c9041660` 均在 `REQUIREMENTS.md §1 AC-12/AC-13/AC-21` 中。

---

## 队长对 AC-31 的执行口径（避免 T3 误解「同步基线」为「放松基线」）

`research/_raw/ours-baseline/verify.json` 与 `verify-pre-fold.json` 的 `firstScreenFull`
从 `9` 改成实测值（预期 `6`）时：

- **只动 `firstScreenFull` 这一个字段**；`cards` / `coveredDeals` / `pageHeight` / `cols` /
  `gridTop` / `generatedAt` / `target` 等全部保持原值不动。
- 在报告与提交信息里写明：这是**记录一次已披露的密度下降**，不是把基线放宽到看不见回归。
- `verify-site.js:263` 的阈值改成实测值，并**保留**「完整 / 含截断」两个读数一起打印。
- `verify-site.js:2693`「列表视图：首屏完整可见 ≥ 12 行」的 `>= 12` 阈值**不得动**
  （它量的是列表视图，与本轮无关），只允许改 detail 文案。
