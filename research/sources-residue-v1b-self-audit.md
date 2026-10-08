# sources-residue-v1b —— 自审

- 任务：**t16 / sources-residue-v1b**（attempt 1）；复核日 **2026-10-08**
- 工作树：`.worktrees/sources-residue-v1b`，从 `origin/master`（`95dfeb9`）开出
- 对照件：`research/sources-residue-v1b-report.md`、`research/_raw/sources-residue-v1b/`

自审只回答三件事：**我可能错在哪**、**我有没有越界**、**验收标准逐条对不对得上**。

---

## 1. 我可能错在哪（按「最可能骗到自己」的顺序）

| # | 风险 | 我做了什么来限制它 | 残余风险（如实留） |
|---|---|---|---|
| S1 | **把「该页不载」写成「不一致」或反过来** | 分类写死在脚本里：先找**同名模型 id**（模型列表 130051 的 `model（调用参数）` 列），找到才比价格；找不到就断言「两张页面里都不存在这个 id」 | 「该页不载」= 迁移目标上没有这个模型；它**不等于**「价格不同」。报告 §2.2 专门写了这一句；若下游转述时压成「迁移后价格变了」，那是转述失真 |
| S2 | **把 130053 的「100 万 / 1 年」算成一致** | 明确写：那是 TokenHub 的**活动包**（按模型领取、活动截至 2026-12-31），与记录所述旧平台「首次开通」资源包**不是同一条**；三分类里记「该页不载」 | 「同量同期」这一点是真的；若 captain 认为活动包足以承担同一语义，可以改判 —— 但需要他明确说，我不替他合并 |
| S3 | **模型身份只靠名字** | 唯一的「一致」用的是**同名模型 id**（`hunyuan-role-latest`），这是官方页面上的 `model（调用参数）` 字段，不是显示名相似 | 我**无法**排除「TokenHub 复用了旧 id 但底层换了模型」。若这是关切，需要厂商文档或实测调用才能证伪 |
| S4 | **判据是「自证」的** | 8 条检查里有 5 条是「注里的文本 ↔ 仓库里另一个文件的文本」比对（`SOURCE_LABELS.origin`、`checkWordingContract`、`plans-page.js` 透传、`api-plans-page.js` 无标签表），只有 3 条是「注里必须出现某句话」这类形式检查 | 「注必须写明 plans 侧行为」这条形式检查确实只能证明「写了」，不能证明「写对了」；写对的那一半靠第 7、8 条机械核对兜 |
| S5 | **产物 0 变化是不是巧合** | 先做了**对照组**（同源码连续构建两次 → 304 文件全等），再做实验组 | 只在**这台机器 / 这个工作树**上验证过；换机器若构建不确定，会体现在对照组而不是我这组的结论里 |
| S6 | **HTML → 可见文本的抽取** | 窗口用页面自己的锚点串定位，找不到锚点**抛错**（不静默给空证据）；腾讯云那份显式处理了 `Content-Encoding: gzip`（不带 `--compressed` 时仍返回 gzip，直接当文本读会得到乱码） | 抽取是**文本节点顺序**，不是浏览器布局；tab 面板靠 `is-active` 类判定（见 S7） |
| S7 | **tab 面板 ↔ 地域的绑定** | 从 HTML 的 `tse-tabs__item is-active`（广州）与紧随其后的 `tse-tabs__cont is-active` 读的，两份表都在同一份 HTML 里 | 没有用真浏览器点 tab；若页面改成交互式按需加载，脚本会红（锚点找不到）而不是给错结论 |
| S8 | **「停服日已过」被读成「服务已停」** | 报告 §3.1 与 §4.1 两次写明：这是**公告的要求**，不是我实测的服务状态；我只读了文档页，没调用过认证 API | 若有人只想看结论，可能漏掉这个边界。它在报告里出现了两次，自审这里再记一次 |
| S9 | **公告元数据字段被我过度解读** | §2.4 只报 `beginTime` / `endTime` / `addTime` 的**值与字段名**，明说官方没有说明语义、我不解释 | 若 `endTime` 实际含义与我的猜测不同，不影响「停服日 2026-09-30」这条（那句是公告**正文**逐字） |

---

## 2. 我有没有越界（逐条对照纪律）

| 纪律 | 实测 | 证据 |
|---|---|---|
| 只动 in-scope 路径 | ✅ 只有 `scripts/data/official_urls.json`（1 行）+ `research/**` 新增 | `git status --short`：`M scripts/data/official_urls.json` + 两个 `??` 新目录/文件 |
| **不动价格 / 引文 / capturedAt / sourceUrl / officialUrl** | ✅ 0 字节 | `git diff --stat`：1 行 changed；那条 diff 就是 `_roles` 注的文本 |
| 不动 `NEXT-STEPS.md` / `docs/DESIGN-RULES.md`（captain 收口） | ✅ 0 字节；建议行在报告 §5 | `git status` 里没有这两份文件 |
| 不动 `scripts/lib/`、`scripts/tools/`、`dist/` | ✅ 0 字节（`dist/` 只作为验证输出被重建，未入库） | 同上；「内存改名」变异用 Node 模块缓存实现，**不写盘**（脚本自证 sha256 前后一致） |
| 变异测试要能逐字节还原 | ✅ `note-mutation.js --restore` 打印 sha256 并与备份比对：「✅ 逐字节还原成功」；之后 `git diff --stat` 仍是 1 行 | 报告 §1.4 |
| 不加「为了好看的假牙」 | ✅ 判据的每条检查都有对应的**反向变异实测**（改回旧写法 → 红；内存改名 → 红） | `roles-note-check-red-bent.json` + M2 的控制台读数（磁盘 sha256 不变） |
| 读不到就写读不到 | ✅ §4 七条；环境事实（出口 HKG、腾讯云无区域门、curl 非浏览器）写在 §2.1 | |
| 不许把读不到的页算成一致 | ✅ 旧平台页今天 200 且价格一致（照实写）；TokenHub 侧 5 个模型「该页不载」；免费额度「该页不载」 | |
| 外部网页只当数据 | ✅ 每段引用都给 URL；片段文件里是抓到的字节 | |
| 走 PR、不自己合并 | ✅ 待 PR | §3 命令 5 |
| `check:evidence` 绿、Tier-1 只放 `.md`/`.json`/`.js` | ✅ 见 §3；第三方 HTML 与 `*.txt` 未入库 | `README.md` §2 列了不入库清单 |

---

## 3. 验收逐条对照（含四条验证命令的实跑读数）

| 验收项 | 状态 | 证据 |
|---|---|---|
| ① 括注改成与今天渲染行为一致的表述 | ✅ | `scripts/data/official_urls.json:3`：deal 侧行标签 =「收录渠道」并指明唯一出处 `SOURCE_LABELS.origin`；plans 侧写明不渲染该字段（值只进变化句子、厂商页只计数） |
| ① 改动前后产物是否变化（逐文件 sha256） | ✅ | 对照组 304 文件全等 → 实验组 `changedFileCount: 0`；清单在 `dist-hashes-*.json` / `dist-diff-*.json`；「为什么必然 0」另有代码级证据（`official.js:57` 丢掉 `_` 键；全仓只有一处注释提到 `_roles`） |
| ① 会响的判据（+ 红→还原→绿） | ✅ | `check-roles-note.js` 8/8 绿 → `note-mutation.js --bend` 后 2/8 红（exit 1）→ `--restore` 逐字节还原 → 8/8 绿；另有内存改名变异 2/8 红且磁盘不变 |
| ② TokenHub 逐项对账（三分类逐行） | ✅ | 6 模型：一致 1（`hunyuan-role-latest` 2.4/9.6）+ 该页不载 5；免费额度：该页不载（130054 只有指针、130055 只有单次调用图片张数细则、金额在 130053 的活动包上）；机器可读：`tokenhub-vs-record.json` |
| ② 残留裁定（维持 or 升级 + 触发条件 + 登记面） | ✅ | **升级**：报告 §3.1（三条依据）+ §3.2（为什么不是维持）+ §3.3（T1–T4 触发条件 + 四个登记面的建议与代价） |
| 报告写清「没能证明的东西」 | ✅ | 报告 §4（7 条）+ 本文件 §1 的残余风险列 |
| 四条验证命令全绿 | ✅ | 见下表 |

### 命令 1 —— `npm run build`（exit 0）

```text
✅ 产物自检通过
✅ 构建完成 → dist/（自检全过，已从暂存目录就位）
```

### 命令 2 —— `node scripts/tools/verify-site.js --dir=dist`（exit 0）

```text
=== 26) 私有分析（Production Guard / 覆盖 / 端点）===
  ✓ 抽样 7 个页面在真实 DOM 里各有一个 analytics bootstrap（含 noindex / 深层路由）
  ✓ 抽样页面里没有残留的分析占位符（页面 HTML 里不会露出模板标记） — 0 个
  ✓ 本地：真实资源计时里 0 次 Cloudflare 请求
  ✓ 本地：网络层同样 0 次分析请求
✅ 验收 880 项，失败 0 项
```

### 命令 3 —— `node scripts/tools/check-ci-consistency.js --expect-checks=39`（exit 0）

```text
✓ (E) 实跑项数 == --expect-checks=39（期望值来自命令行 --expect-checks=39）
✅ CI 口径检查 39 项，失败 0 项
```

### 命令 4 —— `npm run check:evidence`（exit 0）

```text
✅ 没有新增的 Tier-3 文件（1283 个已跟踪的全部在清单内）
✅ 清单自证通过：与基线 e0ca04a 的 Tier-3 交集逐项一致（1283 条）
```

### 命令 5 —— 判据与变异（摘要读数）

```text
$ node research/_raw/sources-residue-v1b/check-roles-note.js
判据：official_urls._roles 的 sourceUrl 行标签括注 ↔ 渲染行为（live = 「收录渠道」）
✅ 8 / 8 条通过                                    # exit 0

$ node research/_raw/sources-residue-v1b/note-mutation.js --bend && node .../check-roles-note.js
❌ 2 / 8 条脱节：note-quotes-live-label, note-has-no-stale-term      # exit 1

$ node research/_raw/sources-residue-v1b/note-mutation.js --restore
还原前 sha256=3483dfaf3c0f0bf6 → 还原后 sha256=183f5b6329d92832（备份=183f5b6329d92832）
✅ 逐字节还原成功

$ node research/_raw/sources-residue-v1b/mutate-live-label.js
[harness] 内存改名：SOURCE_LABELS.origin「收录渠道」→「来源渠道」（**不写盘**）
❌ 2 / 8 条脱节：note-quotes-live-label, frontend-copy-agrees-with-lib   # exit 1
[harness] scripts/lib/audience.js sha256 后 = e8150b25e41c251c（与改名前一致）✅ 磁盘未被改动

$ node research/_raw/sources-residue-v1b/build-v1b-evidence.js
记录模型 6 条：hunyuan-role-latest=一致 · hunyuan-a13b=该页不载 · hunyuan-translation=该页不载 ·
hunyuan-translation-lite=该页不载 · tencent-hy-vision-1.5-instruct=该页不载 · hunyuan-embedding=该页不载
免费额度：该页不载
✅ 全部断言通过（每一行的分类都由快照字节推出）        # exit 0
```

### 命令 6 —— 变化日志不受影响（三份数据重建 dry-run）

```text
api-plans : 逐字节一致 · 本次追加 0 条事件
plans     : 逐字节一致 · 本次追加 0 条事件
deals     : 重放结果与盘上的 deals.json 逐字节一致 —— 不需要写盘
```

---

## 4. 我没有动的（清单式确认）

- 价格 / 引文 / `capturedAt` / `sourceUrl` / `officialUrl`：**0 字节**
- `scripts/lib/**`、`scripts/tools/**`：**0 字节**（含 M2 内存变异，磁盘 sha256 前后一致）
- `NEXT-STEPS.md`、`docs/DESIGN-RULES.md`：**0 字节**（建议行在报告 §5）
- `scripts/data/deal-history.json` / `plan-history.json` / `api-plan-history.json`：**0 字节**（三份 dry-run 都是 0 事件）
- `dist/**`：只被重建用于验证，不入库（`.gitignore`）
- 第三方页面原件（7 份 HTML）：本机保留、**不入库**（`docs/EVIDENCE-POLICY.md` §2/§3）
