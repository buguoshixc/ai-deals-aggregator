# `ci-master-gate-concurrency-v1` · master 的 gate 被并发取消：取证 + 裁定 + 实测

> 装置与原始 API JSON：`.arch-v1/`（Tier-3，gitignore）· 入库证据：[`_raw/ci-master-gate-concurrency-v1/`](_raw/ci-master-gate-concurrency-v1/)
> 改动面：**只有 `.github/workflows/verify.yml` 的 concurrency 一行**（+ 那段理由注释）。
> `docs/DESIGN-RULES.md` / `NEXT-STEPS.md` 未动；`scripts/**` 未动。

---

## 0. 裁定：**改**（master 上不再取消，其它 ref 照旧取消）

```yaml
concurrency:
  group: verify-${{ github.ref }}
- cancel-in-progress: true
+ cancel-in-progress: ${{ github.ref != 'refs/heads/master' }}
```

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

| 维度 | 不改（现状） | 改（本 PR） |
| --- | --- | --- |
| 合并提交的结论 | 突发时 0/5（只有最新一次有） | **每次都有**（排队跑完） |
| 最新提交的反馈延迟 | ~中位 207s | 突发 k 次时最多 (k−1) × 207s（k=5 ⇒ ~14 分钟） |
| runner 分钟 | 少 | 多（突发时 k 倍）——但仓库是 **public**，标准 runner 分钟**不计费** |
| 并发/排队压力 | 小 | 同一 ref 串行，不影响 PR（组不同） |
| 失败定位 | 只能手工 bisect | CI 记录直接给出是哪一次合并红 |
| force-push 后的旧 run | 取消（正确） | **PR/其它分支仍取消**（只对 master 关闭） |

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

---

## 4. 改动、门槛与回滚

* 改动：`.github/workflows/verify.yml` 的 `concurrency.cancel-in-progress`（1 行）+ 一段理由注释（写进文件，
  让下一个人知道为什么 master 特殊、以及怎么回滚）。
* 冻结门槛：`npm run check:ci` → **39 项 / 0 失败**（`check-ci-consistency.js` **不读 `concurrency`**，
  未触及任何冻结断言；断言项数也没有变化，`--expect-checks=39` 不动）。
* `npm run check:evidence` → 通过（没有新增 Tier-3 文件）。
* 不新增 workflow（不触发 (0b) 的未登记硬红）；`on:` 触发面、job 结构、步骤体一字未动。
* **回滚**：把那一行改回 `cancel-in-progress: true`，提交即可（单文件、单行、无迁移）。
  回滚后行为与 2026-10-08 之前完全一致。

---

## 5. 改动后的实测

> 见 §5.1（等落地后回填）—— 本节的数据全部是 run 号可查的真实 CI 运行。

（待填）

---

## 6. 本轮**没有**证明的东西（如实登记）

1. **没有证明「突发时合并提交真的会坏」**：本轮证明的是「合并提交在 CI 里没有结论」，
   不是「它真的有问题」。取消率与归因成本是实测量，故障率没有（历史 0 次 gate failure）。
2. **没有证明 Deploy 的 pending 丢弃是「官方语义」**：那是**观测**（3 次 +10s/+11s 的 cancelled、
   且都是排队中），我没有找到对应的官方文档引用。它不影响裁定方向（gate 侧是配置导致的，
   Deploy 侧不可配）。
3. **没有量化「合成合并 vs 真实合并」的差异率**：我只证明了机制上二者是不同的 ref/提交，
   没有统计过有多少次 PR 门禁之后 base 又前进了（那需要逐 PR 比对 gate 的 base_sha 与合并时的 master）。
4. **没有做负载/排队压力测试**：并发数、checkout 缓存命中、runner 池拥挤等对「排队延迟」的影响没有实测，
   只有单次运行的耗时分布（中位 207s / 最大 696s）。
5. **没有验证 GitHub 对 `cancel-in-progress: ${{ … }}` 表达式求值的边界**（例如表达式报错时的兜底行为）。
   实测只覆盖 `github.ref == 'refs/heads/master'`（false ⇒ 排队）与 `!= master`（true ⇒ 取消）两种取值。
6. **`collect.yml` / `probe-sources.yml` / `ai-maintenance.yml` 的并发行为没有纳入**：本轮只处置
   `verify.yml`（唯一带 `cancel-in-progress: true` 且监听 master push 的门禁）。
