# t32 · 证据口径与复核限制（长解释放这里，生产文件里只留一句）

本文件是 **t32 修复的证据附件**：生产数据（`plans.json` / `api-plans.json` / `coverage-targets.json`）里
只放得下一句话的地方，把完整解释放在这里，并在生产文件里指回本文件。
判据来源：t15 独立审查（`research/coverage-expansion-v1-data-quality-review.md`）的四份现场快照
（`research/_raw/t15-*.txt`、`research/_raw/t15-url-verify/`）。

## 1. JetBrains USD 金额为什么不可服务端复核（F3）

| 事实 | 取值 | 出处 |
| --- | --- | --- |
| 本环境抓 `https://www.jetbrains.com/ai-ides/buy/` 得到的币种 | **CNY**：页面自报 `"currency": {"symbol": "CNY", "isPrefix": false, "iso": "CNY"}, "countryCode": "CN", "countryName": "China Mainland"` | `research/_raw/t15-url-verify/jetbrains-intl-us.txt`（该页服务端 HTML 里的 `productsData` 节点） |
| 加 `Accept-Language: en-US`、`country=US`、`currency=USD` cookie 后 | **仍是 CNY** | t15 的 `summary.json` 记录：该次抓取对 `US $10.00` / `US $20.00` / `US $30.00` / `US $8.33` 四个探针全部 `hit: false` |
| 页面里**稳定可复现**的部分 | 商品码与结构：`code=AIP`（JetBrains AI Pro）、`code=AIPU`（AI Ultimate）、`prices.personal/commercial`、`yearlyPerMonth`、`name` —— 这些在两次抓取里都命中 | `t15-evidence-verbatim.txt` 的「部分命中」记录（`"code": "AIP"` ✓、`"name": "JetBrains AI Pro"` ✓、价格 JSON 片段 ✗） |
| 逐项报价端点（页面逐字给出的路径形态） | `https://www.jetbrains.com/shop/quote?item=P:N:AIP:M`（个人 = `P`、商业 = `C`；年付 = `Y`、月付 = `M`；AIP / AIPU / IDESPR-AIU 为商品码） | 同上的 `productsData.<code>.links.personal.monthly.quote` 字段 |

**结论**：USD 金额**在本环境只能一次性读到**（`capturedAt` 时刻页面内嵌的商品目录 JSON），
所以生产记录里写的是「本环境只能取到 CNY 版；USD 金额取自该 JSON；不可服务端复核」，
**不写「已复核」**。换到能返回 USD 的网络出口时，用上面的 `/shop/quote?item=P:N:AIP:M`
即可逐项复核（该端点是官方页面自己给出的路径，不是我们猜的）。

## 2. stepaudio 为什么按 `non-text-resource` 处置（F7）

- 身份层的角色枚举里有 `audio`，但 **registry 里当前没有任何音频模型身份**。
- `scripts/data/model-registry-gaps.json` 的判据是「**这一串还能不能落到一个文本模型身份上**」，
  与「它属于哪种模型角色」是两个问题：音频资源在 registry 里没有身份可落 ⇒ 出口是**资源类型**。
- StepFun Step Plan 的 `stepaudio-2.5-asr / -chat / -realtime / -tts` 因此全部记为
  `non-text-resource`（另有 `step-router-v1` 记 `series`、`step-5-preview` 等 3 条记 `off-registry-model`）。
- 将来若要收录音频身份，必须做一次**有意识的口径变更**（新增身份 + 把声明改成映射），
  并同步改 `docs/SCHEMA-v3.0.md` §2.1 的那条口径。

## 3. Amazon Q Developer 停支事实的完整引文（F8 的归属地）

生产 `coverage-targets.json` 的 `aws` 行 note 收敛为一句并指回本文件；完整逐字引文（两条）在
`plans.json` 的两条记录里：

- `https://aws.amazon.com/q/developer/`：「On April 30, 2027, AWS will discontinue support for
  Amazon Q Developer IDE plugins. For capabilities similar to Amazon Q Developer IDE plugins,
  explore Kiro to access the latest models and features.」
- 同页：「The Amazon Q Developer perpetual Free Tier gives you 50 agentic chat interactions per month.」

## 4. 本轮改了什么、没改什么（可核对）

- **改了**：`evidence[].quote` 的文字（改成真正逐字的官方片段）、`billing.note` 里的复核限制句、
  `docs/SCHEMA-v3.0.md` 的两条口径、`coverage-targets.json` 的 note 长度、
  `currentness.json` 的 `_roleVocabularyMapping` 键名（连字符 → 下划线）。
- **没改**：任何金额 / 币种 / 周期 / 单位 / 日期。核对方式（可复跑）：
  把 `plans.json` 的 37 条按 `provider|planName|currency|regularPrice|promoPrice` 组成键，
  与 `git show HEAD:plans.json` 的同名键集合比对 —— 本轮结果：**37 ↔ 37、缺失 0、新增或变化 0**。
