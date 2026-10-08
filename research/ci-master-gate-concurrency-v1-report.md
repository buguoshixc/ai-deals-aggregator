# `ci-master-gate-concurrency-v1` · master 的 gate 被并发取消：取证 + 裁定 + 实测

> 装置与原始 API JSON：`.arch-v1/`（Tier-3，gitignore）· 入库证据：[`_raw/ci-master-gate-concurrency-v1/`](_raw/ci-master-gate-concurrency-v1/)
> 改动面：**只有 `.github/workflows/verify.yml` 的 concurrency 一行**（+ 那段理由注释）。
> `docs/DESIGN-RULES.md` / `NEXT-STEPS.md` 未动；`scripts/**` 未动。

---

## 0. 裁定：**改 —— 两版**（master 上既不取消、也不排队：每个提交一个并发组）

```yaml
concurrency:
- group: verify-${{ github.ref }}
- cancel-in-progress: true
+ group: verify-${{ github.ref }}-${{ github.ref == 'refs/heads/master' && github.sha || 'ref' }}
+ cancel-in-progress: ${{ github.ref != 'refs/heads/master' }}
```

**两版的关系（第二版是实测逼出来的）**：

| 版本 | 做法 | 实测结果 |
| --- | --- | --- |
| v1（PR #73/#74） | 只把 `cancel-in-progress` 置 false（组仍是 `verify-<ref>`） | **不足**：保住了「正在跑」的那次（run #175 活到 success），但**排队中的那次仍被取代**（run #176 —— 正是 v1 自己的合并提交 —— 零 job、cancelled） |
| v2（PR #76） | master 的**组名带上提交 SHA** | 每个合并提交各成一个组，谁也不取代谁 ⇒ 每个合并提交都有自己的完整结论（实测见 §5） |

一句话理由：**突发合并时，master gate 的取消率是 100%**（实测 5 次推送里 4 次被取消），
而 PR 级门禁验的是 `refs/pull/N/merge`（PR head 合进**当时** base 的合成合并），**不是**最终落到
master 上的那个合并提交 —— 于是「合并提交本身」在最需要它的时刻（密集合并）没有任何结论，
事后只能手工二分。代价有界且已量（见 §3）。

---

## 1. 取证：master push 触发的 gate 到底被取消了多少

数据源：`gh api "repos/buguoshixc/ai-deals-aggregator/actions/runs?event=push&per_page=100"`
（原始 JSON 与 sha256 记在证据 `gate-runs.json.rawApiSha256`）。

### 1.1 计数与比例（覆盖 51 次 master gate，满足「≥20 次」）

| 结论 | 次数 | 比例 |
| --- | --- | --- |
| success | **46** | 90.2% |
| **cancelled** | **4** | **7.8%** |
| （拉取时在跑 / 排队） | 1 | — |
| failure | **0** | 0% |
| **合计（含在跑）** | **51** | 100% |

同窗口的 `Deploy to GitHub Pages`（master）：success 47 · failure 1 · 其余在跑。
**历史取消率只有 7.8%** —— 单看这个数字会得出「不必改」。真正的问题在突发窗口（§1.3）。

### 1.2 每一次 cancelled 被谁取代

| 被取消的 run | 提交 | 创建时刻 | 取代它的 run | 间隔 |
| --- | --- | --- | --- | --- |
| #151 | `33d24722` | 10:11:40Z | #154（`8c9fb29`，**自己也随后被取消**） | +302s |
| #154 | `8c9fb29` | 10:16:42Z | #156（`95dfeb99`，success） | +280s |
| #165 | `724e7131` | 10:46:08Z | #167（`17dcfb75`，在跑） | +18s |
| #166 | `7fd57759` | 10:46:16Z | 同上 | +10s |

前两次（#151/#154）是 captain 观察到的 `#62`/`#63` 那两次；它们的 **Deploy 都是 success**
（同一 SHA），这正是「风险不是零但也不是全无」的来源。

### 1.3 突发窗口的现场（今天 10:41–10:46Z，5 次 master push）

| 推送 | gate | Deploy | 说明 |
| --- | --- | --- | --- |
| `04938854`（10:41:02） | **cancelled**（跑了 **4m04s** 才被杀） | **success** | Deploy 已经跑起来 ⇒ 没被杀 |
| `24ce23bc`（10:43:48） | **cancelled**（10:46:38） | **cancelled**（10:46:09，+141s） | Deploy 在 **pending** 时被取代 |
| `724e7131`（10:46:08） | **cancelled**（+10s） | **cancelled**（+10s） | 还在排队就被取代 |
| `7fd57759`（10:46:16） | **cancelled**（+11s） | **cancelled**（+11s） | 同上 |
| `17dcfb75`（10:46:26） | 在跑 → 后来 success | 在跑 | 最新的一次才有结论 |

**突发取消率：gate 4/5、Deploy 3/5。** 两条链都会丢掉中间提交的结论：

* gate 丢的是**正在跑**的那次（`cancel-in-progress: true`）；
* Deploy 的组是 `pages` + `cancel-in-progress: false`，**但它仍然丢掉了 3 次** ——
  观测到的是「**排队中**的 run 被后一次取代」（+10s / +11s 就 cancelled，根本没开始跑）。
  这是 GitHub 并发组的既有语义（同一组只保留最新的一次排队），不是本仓库可配的开关。

⇒ **两条链加起来，突发里只有「最新那一次提交」拿到完整结论**；中间几次合并提交
（也正是「两个绿分支合起来语义冲突」的候选）在 CI 里是空白。

---

## 2. 口径风险：PR 级门禁 ≠ 合并提交验证

| 门禁 | 跑在哪 | 验的是什么 |
| --- | --- | --- |
| PR 级 `verify.yml`（`pull_request` 事件） | `refs/pull/N/merge` | PR head 合进**当时** base 的**合成**合并提交 |
| master 级 `verify.yml`（`push` 事件） | `refs/heads/master` | **真正落到 master 的那个合并提交** |

规则集 `master-gate`（id 24126623，active，`~DEFAULT_BRANCH`）里 **`required_status_checks`
要求 context = `gate`**（`strict_required_status_checks_policy: false`）——也就是说
「gate 绿」是仓库自己的显式要求；而 master 上被取消的那次 gate 会让**合并提交自己**的必需检查
停在 cancelled（既不是 success 也不是 failure）。规则集的检查是在 **PR 合并时**求值（PR head 已绿），
所以这**不阻塞**任何操作 —— 但它让「合并落点是否被验过」这件事在记录上无从查证。

风险的实际大小（诚实口径）：

* **不是零**：合成合并与真实合并确实可能不同（base 在 PR 最后一次门禁之后又前进了），
  突发时这个差值最大。
* **也不是「线上会被坏代码覆盖」**：`deploy.yml` 的 `prepublish` 跑的是**同一个** `.github/actions/gate`
  （`allow_degraded_run: 'false'`，比 PR 路径更严格），`build`/`deploy` 靠 `needs: prepublish` 才可能执行
  ⇒ **发布前一定有一次完整的门禁**，而且它跑在最新的那个提交上、从不被取消（跑起来之后）。
* 真正丢掉的是**可归因性**：5 次合并里若最新那次红，你无法从 CI 记录判断是哪一次引入的
  —— 中间四次都没有结论。

---

## 3. 取舍：改 vs 不改

| 维度 | 不改（现状） | 改（v2：master 每个提交一个组） |
| --- | --- | --- |
| 合并提交的结论 | 突发时 0/5（只有最新一次有） | **每次都有**（各自一个组，谁也取代不了谁） |
| 最新提交的反馈延迟 | ~中位 207s | **仍是 ~中位 207s**（并行跑，不排队） |
| runner 分钟 | 少 | 突发时 k 倍 —— 但仓库是 **public**，标准 runner 分钟**不计费** |
| 并发压力 | 小 | master 上并发 k 个 gate（≤ 突发次数）；PR 组完全不受影响 |
| 失败定位 | 只能手工 bisect | CI 记录直接给出是哪一次合并红 |
| force-push 后的旧 run | 取消（正确） | **PR/其它分支仍取消**（只对 master 换组名） |

> 中间那一版（v1：只关 `cancel-in-progress`）会把 master 变成**串行队列**，最新提交的结论最多晚
> (k−1) × 中位 207s —— 实测证明它还**不足以**保住中间提交（排队中的会被取代），所以没有采用。

**为什么 runner 成本这一项可以放掉**：`gh api repos/… --template '{{.private}}'` → **false**（public），
公开仓库的标准 runner 不计费；贵的是**排队延迟**，而它只影响「最新提交的结论什么时候出来」，
不影响发布（发布链独立）。

**为什么排队延迟可以接受**：gate 实测耗时中位 **207s**、最长 696s（46 个成功样本）；
突发是罕见事件（今天两次），且 k 通常 ≤ 3 ⇒ 最坏几十分钟量级的延迟，换来「每次合并都有结论」。
反过来，若未来出现 k 很大的连推（例如自动 rebase 机器人），这条判据会变成串行瓶颈 ——
那时应当改的是**推送侧的节奏**，而不是回到「静默取消」。

**为什么不改的论证不成立**（我认真试过这一侧）：不改的唯一硬理由只能是「合并提交反正会被别的链验」
—— 实测反驳了它：同一 SHA 的 `Deploy` run 在突发里也会因 pending 被丢掉（3/5），
所以「Deploy 兜底」只覆盖最新一次。verify.yml 自己头部写着「push → master：合并后的落点也验一遍」，
现状让这句话在密集合并时变成空话。

> ⚠️ 修复后要把口径分开（见 §5.2.1）：**「合并提交都要有 gate 结论」是 gate 侧的要求，v2 已闭合**；
> **「部署只要最新一次的产物」是 Deploy 侧的要求，旧的被取代本来就是对的**。
> 上面这条反驳针对的是**修复前**的状态 —— 那时中间提交既没有 gate 结论、也没有部署，两样都缺。

---

## 4. 改动、门槛与回滚

* 改动（v2，PR #76）：`.github/workflows/verify.yml` 的 `concurrency.group`（master 组名带提交 SHA）
  + `cancel-in-progress`（非 master 仍取消）+ 一段理由注释（写进文件，让下一个人知道为什么 master 特殊、
  以及第一版为什么不够、怎么回滚）。
* 冻结门槛：`npm run check:ci` → **39 项 / 0 失败**（`check-ci-consistency.js` **不读 `concurrency`**，
  未触及任何冻结断言；断言项数也没有变化，`--expect-checks=39` 不动）。
* `npm run check:evidence` → 通过（没有新增 Tier-3 文件）。
* 真 YAML 解析：`python -c "import yaml; yaml.safe_load(open('.github/workflows/verify.yml', encoding='utf-8'))"`
  → `concurrency` 两键解析正确、`on:` 三个事件在位、job 名仍是 `gate`。
* 不新增 workflow（不触发 (0b) 的未登记硬红）；`on:` 触发面、job 结构、步骤体一字未动。
* **回滚**：`group` 改回 `verify-${{ github.ref }}`、`cancel-in-progress` 改回 `true`（单文件两行）。
  回滚后行为与 2026-10-08 之前完全一致（回滚路径已写进文件注释）。

---

## 5. 改动后的实测（两版改动、两次实测）

### 5.1 第一版（v1）实测：**不足** —— 保住了「在跑」，丢了「排队」

| run | 提交 | 创建 | 终态 | 关键读数 |
| --- | --- | --- | --- | --- |
| #175 | `5b2d91877d` | 11:02:54Z | **success**（307s） | 组里**正在跑**的那个**没被杀**：job 8 步全跑（11:02:56 → 11:08:00）⇒ v1 的「不杀正在跑的」这一半成立 |
| #176 | `56d1cff9`（**v1 自己的合并提交**） | 11:05:06Z | **cancelled**（11:06:51） | `gh api …/runs/<id>/jobs` **返回空**：一个 job 都没创建 ⇒ 它是**在排队阶段被取代**的 |
| #177 | `26c6614a` | 11:06:50Z | success（11:13:15） | #175 结束（11:08:00）后于 11:08:03 才开始 ⇒ 组是串行的 |

* **机制**：GitHub 的并发组在新 run 进入同一 group 时，会取消**先前 pending 的那个** ——
  这与 `cancel-in-progress` 无关；**组名不按提交隔离就绕不过去**。
* ⇒ v1 只保住「最新一次提交」的结论，**合并在中间的提交仍然没有结论**
  （讽刺的是被丢掉的那个正是 v1 自己的合并提交）。
* **订正一个可能的误判**：`56d1cff9` 与 `26c6614a` 的 `verify.yml` **都是 v1 配置**
  （`git show <sha>:.github/workflows/verify.yml` 实测），所以这不是「旧配置的 run 杀了新配置的 run」；
  证据是「组里**在跑**的 #175 没被杀、**排队中**的 #176 被取代」。
* **实验设计条件（记住了）**：被检验的两次推送**都必须携带补丁**，否则新 run 自己的旧配置会
  以旧语义处理上一推 —— 这正是我们第一次安排的「#73 → #74」那对样本的教训（它们都是 v1，
  结论仍然成立；但若再安排一次，必须两次都带补丁）。

### 5.2 第二版（v2）实测：**通过** —— 重叠窗口里 `cancelled` = 0

有效窗口的构造：captain 把收口拆成两个 docs PR（A = `docs/DESIGN-RULES.md` 的 N9 并发组规则、
B = `NEXT-STEPS.md` 的流程教训），**两个提交都从含 v2 的 master 切出**，A 门禁绿后先合 A、31 秒后合 B
（随后又落了第三推、第四推）。

| 推送 | 合并提交 | 创建 | gate run | gate 终态 | Deploy run | Deploy 终态 |
| --- | --- | --- | --- | --- | --- | --- |
| **A** | `51ae75b910` | 11:36:16Z | **#186** | **completed/success**（**扛过两次更晚的推送**） | #154 | completed/success |
| **B** | `ef176b54a0` | 11:36:47Z | **#187** | **completed/success**（扛过一次更晚的推送） | #155 | completed/**cancelled** |
| 第三推 | `41816ac0ce` | 11:40:21Z | #189 | 读数时在跑 | #156 | 在跑 |
| 第四推 | `d19017af04` | 11:41:18Z | #190 | 读数时在跑 | #157 | pending |

* **判定：PASS**。窗口内**每一次已终态的 gate 都是 `completed/success`，`cancelled` = 0**；
  A 的那一对 run 连续扛过两次更晚的 master 推送 —— 而在 v1/旧配置下，它正是会被干掉的那一类
  （对照：§5.1 的 #176 被取代、§1.3 的 #163 跑了 4m04s 被杀）。
* 入库证据：`_raw/ci-master-gate-concurrency-v1/post-change-measurement.json`
  （`v2.verdict = PASS`，逐 run 的 `createdAt / updatedAt / 重叠标记` 都在里面）。

#### 5.2.1 一个必须分清的口径：**gate 要「每个提交都有结论」，Deploy 只要「最新一次的产物」**

同一张表里 B 的 **Deploy 是 cancelled**，但这**不是缺口**：

| | gate（`verify.yml`） | Deploy（`deploy.yml`） |
| --- | --- | --- |
| 需求 | **每个合并提交**都要有自己的验证结论（可归因、可二分） | **只需要最新一次合并提交**的部署产物（站点只有一份） |
| 组 | v2 起：master 每个提交一个组（互不取代） | 单组 `pages`（本轮**未改**） |
| 旧的 pending 被新 run 取代 | **不允许**（那就是这次的缺陷） | **正确且期望**（被取代的是旧提交的部署，本来就不该覆盖新提交） |
| 本轮读数 | `cancelled` = 0 | B 的 Deploy 被取代、C 的 Deploy 随后部署最新提交 |

⇒ 两条要求**不是同一条**：v2 闭合的是 gate 侧的「每个合并提交都要有结论」；
Deploy 侧的「排队中被取代」是同一类 GitHub 组语义，但对部署而言是**对的语义**。

### 5.3 判定标准（写在前面，免得事后挑对自己有利的口径）

* 有效窗口 = **两次推送的提交都携带 v2**，且两次 gate 在时间上**重叠**（第二次 push 的 gate 创建时刻
  < 第一次 gate 的结束时刻）；
* 通过 = 两次都 `completed/success`，且两次之间**没有任何 cancelled**；
* 不通过 = 任一次 cancelled ⇒ 立刻按两行回滚并重新裁定。

---

## 6. 本轮**没有**证明的东西（如实登记）

1. **没有证明「突发时合并提交真的会坏」**：本轮证明的是「合并提交在 CI 里没有结论」，
   不是「它真的有问题」。取消率与归因成本是实测量，故障率没有（历史 0 次 gate failure）。
2. **没有证明 Deploy 的 pending 丢弃是「官方语义」**：那是**观测**（3 次 +10s/+11s 的 cancelled、
   且都是排队中），我没有找到对应的官方文档引用。它不影响裁定方向（gate 侧是配置导致的，
   Deploy 侧的排队替换对部署而言是**正确语义**，见 §5.2.1）。
3. **没有量化「合成合并 vs 真实合并」的差异率**：我只证明了机制上二者是不同的 ref/提交，
   没有统计过有多少次 PR 门禁之后 base 又前进了（那需要逐 PR 比对 gate 的 base_sha 与合并时的 master）。
4. **没有做负载/排队压力测试**：并发数、checkout 缓存命中、runner 池拥挤等对「排队延迟」的影响没有实测，
   只有单次运行的耗时分布（中位 207s / 最大 696s）。
5. **没有验证 GitHub 对 `cancel-in-progress: ${{ … }}` 表达式求值的边界**（例如表达式报错时的兜底行为）。
   实测只覆盖 `github.ref == 'refs/heads/master'`（false ⇒ 排队）与 `!= master`（true ⇒ 取消）两种取值。
6. **`collect.yml` / `probe-sources.yml` / `ai-maintenance.yml` 的并发行为没有纳入**：本轮只处置
   `verify.yml`（唯一带 `cancel-in-progress: true` 且监听 master push 的门禁）。
