# 审查上下文包 —— 给独立完成度审查 subagent

> 你（审查员）**没有**本次会话的历史。本文件是自包含的：读它 + 读题面 + 读代码，你就能独立判断。
> **不要相信本文件里的任何"已完成"结论** —— 它们是**被审查对象**的自述。逐项自己验证。
> 你的任务原文在最后一节（用户原文，逐字）。

---

## 一、工作区（唯一工作目录）

```
D:\OneDrive\Desktop\Code\AI Page\.worktrees\v3.0-ai-deals-knowledge-base
```

- 分支：`v3.0-ai-deals-knowledge-base`，基点是 `49122ad`（= `origin/master` 上已发布的提交）。
- **对照检出**：`D:\OneDrive\Desktop\Code\AI Page`（停在旧分支 `v2.5-api-token-plans`，是 v3.0 的**基线**，用来做 diff 对照；**不要在它里面改任何东西**）。
- 依赖已装（`npm ci` 跑过）。
- **真浏览器**：`verify-site.js` 需要 `$env:DSH_EDGE`。用下面这行动态求值（脚本文件可能被按非 UTF-8 读取，不要硬编码含中文用户名的路径）：
  ```powershell
  $env:DSH_EDGE = (& node -e "process.stdout.write(require('playwright-core').chromium.executablePath())")
  ```
- PowerShell 执行策略会拦脚本文件，用：
  ```powershell
  & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File <脚本路径>
  ```
- **不要用内联 `node -e "..."` 跑含正则/引号的脚本**（本会话里这么干连续错了 4 次）。**写临时 .js 文件再 `node 文件`。**

---

## 二、题面与实施文档（权威顺序）

1. **题面（需求来源，2065 行）**：`docs/v3.0/TASK-SPEC-v3.0.md`
   （原件在 `D:\OneDrive\Desktop\新建 文本文档.md`，工作区里这份是副本，内容相同）
2. **实施约束（含勘误块与裁定）**：`docs/v3.0/AGENT-REFERENCE.md`
3. **阶段计划 + 执行台账 + 反作弊清单**：`docs/v3.0/STAGE-PLAN.md`
4. **各项交接说明**：`docs/v3.0/WIRING-t8-vendor-pages.md`、`docs/v3.0/A4-HANDOFF-feed-pipeline.md`、`docs/v3.0/IA-NOTES-t12.md`
5. **数据扩充证据**：`research/v3.0-source-candidates.md` / `.json`、`research/v3.0-adopted-candidates.md`

冲突时以**题面**为准；题面与本文件冲突时也以题面为准。

---

## 三、用户在原始 Prompt 之外追加的全部约束（都必须逐项验收）

### C1. 零偷工减料（用户原话："每个阶段都必须严格按照标准完成，绝对不可以偷工减料。你可以跑很长时间，也可以不计成本"）

一个阶段只有在 6 项全为真时才算完成：
1. 该阶段每条交付物都存在且是**真实实现**（不是占位、不是 TODO、不是空 `return null`）；
2. 验证命令全部为绿，且**原始输出逐字入台账**；
3. 牙（Tooth Test）**实跑变红过**，并记录「污染方式 / 预期失败 / 实际失败 / 还原方式」；
4. **没有新增任何豁免**：没删断言、没放宽容差、没提高下限、没加 `--skip`/`--allow`、没把硬失败降级成 warn；
5. **真实数据原则**：数据只来自官方源；查不到就如实缺失；**空的就交付空**并写明"空是事实，不是故障"；
6. 独立验收员能独立复现。

**明文禁止行为（出现即该阶段作废）**：只做部分子项就宣告完成 · "数据为空"就跳过页面或断言 · 硬编码样例代替真实数据驱动 · 删/注释/弱化断言或提高容差 · `try/catch` 静默吞错 · 伪造数据（编 eventId / 编历史事件 / `unknown`→`false` / `null`→`0`）· 用相似度或 LLM 猜测写生产关系 · 只跑自测不做端到端 · 报告数字靠估或抄题面 · "先跳过最后补" · 丢掉"检查过但没收录"的过程 · 用第三方聚合站当生产事实来源。

### C2. 必须有一个独立的判定者
用户原话："专门派一个子agent来评判这次任务是否完成"。你（本审查员）就是这个角色。

### C3. 推送上线授权与前置条件
用户原话："等全部任务都完成，都检查通过之后，自己推送上线"；本次又追加："直到所有能够合理完成和验证的验收项都通过，再进行推送上线"。
⇒ **你的审查结论是推送的关卡**。发现未完成/遗漏/明显错误，要**直接修复并重新验证**（你有写权限；见第六节的边界）。

### C4. 本次会话里队长做出的、对实现有约束力的裁定
这些是"补充约束"，也要验收（详见 `STAGE-PLAN.md` 第六~八节）：
- **R1** 不重命名 `moonshotai` logo 资产键（它是 manifest 登记键 + 已发布 URL）。
- **R2** `openai.vendorKey = 'openai'`（A 空间确有此条目）。
- **R3** 4 个纯产品名串：`ChatGPT`/`NotebookLM` **并入**；`ChatGPT Plus`/`GPT Image` **不并入**（按官方域名证据）。
- **R4** `qoder-intl` 立为独立 provider（显示名「Qoder International」、slug `qoder-intl`、`vendorKey: null`）；不得改既有 `qoder`。
- **R5（修正版）** 只有**在 A 空间有厂商名**的 provider 才建 `/vendor/` 页 ⇒ **19 家建、4 家不建**（`trae`/`qoder`/`codebuddy`/`qoder-intl`）。判据：`providers.json` 里 `vendorKey !== null` 的条数。
- **R6** 硬顺序：数据落盘（含 t3 采信数据）必须先于页面构建。
- **不新增页脚整行**（首页页高只剩约 13% 容差余量）。
- **sitemap 条数以构建期 `expectedLocs` 断言为准，不手算**。
- **模型详情页不做价格排序**（题面是"允许"非要求）。
- **不做统一资料搜索**（题面 I3 不强制）——理由须在报告中说明。

---

## 四、已知待办与已知限制（**这些是"已知未完成"，不是隐藏问题**；请核实每一项的真实状态）

见 `docs/v3.0/STAGE-PLAN.md` 的 **D1–D13** 待办表。要点：
- **D1** `deals.json` 里 `GPT Image`（url `https://gptimage-2-5.com/`）与 `ChatGPT Plus`（url `https://chatgpt.com/veterans-claim`）疑似**非官方来源条目**，尚未核实处置。
- **D2** 题面 §16 列出的 7 个脚本名与实际 `package.json` 不一致 —— 报告必须如实写明。
- **D3** 仓库**无 `LICENSE`/`COPYING`** ⇒ 数据许可证列为"需项目所有者决定"。
- **D4** 三份 History 交付日 **0 条 `ended`/`restored`** ⇒ `/archive/` 必然 0 记录 0 详情页；该分支仅由合成夹具驱动。**不得补造事件。**
- **D7** `package.json` **文本层**重复键无断言（`JSON.parse` 会静默去重）。
- **D10** t8 的 build-local **六步接线**由 t13 执行。
- **D11/D12** verify-site 新分节与 gate action 登记。

---

## 五、队长（被审查方）自述容易出错的地方 —— 请重点证伪

本会话里**队长自己的审计工具连续出错 4 次，全部由成员纠正**。请在审查中**不要重犯**，并**优先怀疑**类似形态：
1. 用正则解析 `index.html` 的 `VENDOR_RULES`（第一个槽位是正则字面量，含 `]`/`/` 会提前收尾）⇒ 数错条目数与键名。
2. 解析 `scripts/data/models.json` 时按"数组 / `.models` 字段"找条目 —— 它其实是**像 `providers.json` 一样按 slug 直接为键**的对象。
3. 靠**手算** sitemap 条数（算错过两次）。
4. `& node $s.c` 把 `'x.js --flag'` 当成含空格的单个文件名 ⇒ 假红。
**权威做法**：结构一律以各 `scripts/lib/*.js` 的 `load()` / schema 为准；A 空间一律用 `renderCore.vendorKeyNames()`。

---

## 六、你的权限与边界

- **只读为主**：先审查、取证、逐项判定。
- **发现"本轮任务仍有未完成、遗漏或明显错误"时，允许你直接修复**（用户明确要求："直接修复这些问题，并重新执行相关验证"）。
  - 修复合规：**加断言、修实现、补接线**；**禁止**删断言、放宽容差、加豁免、伪造数据、把空态隐藏。
  - 改动前先记录原文（便于还原）；改完**必须重跑**受影响的门禁与自测。
- **不要推送、不要建 PR、不要合并**（上线动作由队长在你给出结论后执行）。
- **不要 `git add -A` / `git commit -a`**（共享工作区里可能还有别人的在途改动）。如果要提交，只提交你确认属于自己的文件。
- **不要触碰** `scripts/data/curated_*.json`、`deals.json`、`plans.json`、`api-plans.json`、`scripts/data/*-history.json` 的**事实内容**（它们是生产真值，只有人工依据才能改）。

---

## 七、建议的验证入口（都在 worktree 根目录）

```powershell
# 离线门禁（33 步，约 20 秒）
& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File .\.agent-run-offline.ps1 -Tag review

# 完整门禁（含真浏览器 + 回归比对，约 2.5 分钟）
& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File .\.agent-run-gate.ps1 -Tag review-full
```

单条命令（与 CI 的 `gate` 步骤同序）：见 `docs/v3.0/AGENT-REFERENCE.md` §8，
以及 `.github/actions/gate/action.yml`（**35 个具名步骤，是与 CI 一致性的权威**）。

已落盘的门禁日志在 `research/_raw/v3.0-gate/`（`*.log` 被 gitignore，不入库）。

---

## 八、你的任务原文（用户逐字给定，必须严格遵守）

> 现在不要继续添加新功能，先对本轮任务进行一次完整的完成度审查。
>
> 请回顾本次会话中我最初提出的任务要求，以及之后对任务做出的所有补充、修改和约束，然后结合当前项目实际状态进行检查。
>
> 要求：
>
> 1. 整理本轮任务的完整需求
>    - 从最初 Prompt 和后续对话中提取所有要求。
>    - 不要只根据你最后一次修改的内容判断。
>    - 将要求拆成可以逐项验证的验收项。
>
> 2. 检查当前实现
>    - 阅读本轮修改涉及的代码和配置。
>    - 必要时检查 git diff / git status。
>    - 检查相关文件之间是否正确连接，而不是只确认"代码已经写了"。
>    - 检查是否存在写了但没有真正接入、调用、注册或生效的功能。
>
> 3. 实际验证
>    - 能运行测试就运行测试。
>    - 能进行构建、lint、type check 或静态检查就执行。
>    - 对关键功能检查正常路径、边界情况和异常路径。
>    - 不要仅根据代码表面推测功能已经完成。
>
> 4. 对每一项需求给出状态：
>    - ✅ 已完成并验证
>    - ⚠️ 已实现但未充分验证
>    - ❌ 未完成
>    - 🐛 实现存在问题
>
> 5. 特别检查：
>    - 是否遗漏了原始 Prompt 中较小的要求。
>    - 是否因为后续修改破坏了之前已经完成的功能。
>    - 是否存在 TODO、临时代码、mock、占位实现、硬编码或未完成分支。
>    - 是否存在接口定义与调用方不一致。
>    - 是否存在 UI 已实现但后端/状态逻辑未接通，或后端实现但 UI 没有使用。
>    - 是否存在测试通过但真实功能仍无法使用的情况。
>    - 是否引入明显的重复代码、死代码或兼容性问题。
>
> 6. 最终输出一个"任务完成度审查"：
>
> ## 任务完成度
>
> | 验收项 | 状态 | 证据 | 问题 |
> |---|---|---|---|
>
> 然后给出：
>
> ### 未完成 / 有问题的部分
>
> ### 建议修复项
>
> ### 最终结论
>
> 不要因为之前你自己说过"已经完成"就默认完成，必须以当前代码和实际验证结果为准。
>
> 如果发现本轮任务仍有未完成、遗漏或明显错误的部分，在完成审查后直接修复这些问题，并重新执行相关验证。
>
> 直到所有能够合理完成和验证的验收项都通过，再进行推送上线
