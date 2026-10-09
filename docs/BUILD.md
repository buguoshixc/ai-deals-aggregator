# 构建与门禁（Build）

> 本地、CI、发布**走同一条路径**。这份文档写清四种动作：local build / clean build /
> verify / full gate / release。

---

## 1. 环境

| 项 | 值 |
|---|---|
| Node | **>= 20.18.1**（`engines`；CI 与本地实测用 24） |
| 依赖 | `npm ci`（51 个包） |
| 真浏览器 | L4 需要 `playwright-core` + 一个 Chromium：`DSH_EDGE` 环境变量指定可执行文件；不设时默认 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`（Windows）/ CI 里由门禁的探测步骤给出 |
| 外网 | **构建不需要**（offline deterministic）；只有 collector / research / L5 smoke 需要 |

```bash
npm ci
```

---

## 2. local build

```bash
npm run build                 # node scripts/tools/build-local.js
npm run build -- --out=dist.x # 换输出目录（隔离验证用；不要与别人正在用的 dist/ 抢）
```

**产物写到哪 / 失败会怎样**：

1. 先写 `<输出目录>.building`（默认 `dist.building`）；
2. 全部自检通过后，**原子替换**到 `<输出目录>`；替换瞬间旧目录先搬到 `.stale` 作备份，
   新目录就位后立即删除；
3. **任何一步失败**：清掉暂存目录，`dist/` **原封不动**（不会留下一个像构建成功的半成品）。

实测耗时：**2.9s**（186 页 + 303 个产物文件）。

**确定性**：同输入 ⇒ 逐字节相同输出。构建期不看当前时刻（相对时间由页面内联小脚本在浏览器里换算）。

---

## 3. clean build

```bash
rm -rf dist dist.building dist.stale node_modules
npm ci
npm run build
```

用途：① 排除增量污染；② 做 A/B 确定性对比（**clean build A → 全树 hash → clean build B → 全树 hash**，
两次必须相同）。判据也可用现成的：

```bash
npm run check:reproducible            # deals.json 侧
npm run check:plans:reproducible      # plans.json
npm run check:api-plans:reproducible  # api-plans.json
npm run check:models:reproducible     # models.json
npm run check:feeds:reproducible      # 构建两次逐字节比对 Feed
```

---

## 4. verify

| 命令 | 做什么 |
|---|---|
| `npm run verify` | **真浏览器验收**：起本地静态服务器 + 真实 Chromium，跑 852 项断言（几何 / 可见性 / 溢出 / 交互 / 响应式 / JS 错误 / 分析端点）。约 120s |
| `npm run verify:shots` | 同上 + 截图（调试用） |
| `npm run verify:baseline` | 写基线 JSON 到 `research/_raw/ours-baseline/verify.json`（**会覆盖已入库的基线，谨慎**） |
| `npm run verify:regress` | 与基线比对回归：覆盖条数 / 卡片数 / 首屏不减少，页高 ≤ +15%，外部请求不增加，JS 错误 = 0 |
| `npm run verify:seo` | 独立 SEO 门禁（从 `dist/` 解析；与构建期规则层**各自解析、执行路径不合并**） |
| `npm run verify -- --url=https://…/` | 直接验线上站点（发布后冒烟用） |

常用参数：`--dir=<目录>`（默认 `dist`）、`--json=<文件>`（写机器可读报告）、
`--compare=<基线>`、`--keep`（保留浏览器窗口）、`--url=`。

---

## 5. full gate（本地 == CI）

```bash
npm run gate          # 与 CI 读同一份 .github/actions/gate/action.yml
```

它**解析 action.yml**（唯一出处）并按顺序执行其中的 `node <script>` 步骤；
非 node 步骤（`npm ci`、浏览器探测、Summary 输出）会**明确列出跳过原因**。
任何一步非 0 立即停（与 CI 的 fail-fast 一致）。

实测：**50 个 node 步骤 / 277s**（基线 45 步 / 264s；新增 2 步架构与证据门禁 + 正常波动，+5%）。

### 分级门禁（按改动范围选，别每次跑全量）

```bash
npm run gate:fast      # L1 + L2（不需要 dist）                ~35s
npm run gate:build     # + build + L3                          ~65s
npm run gate:browser   # + L4 真浏览器                         ~185s
npm run gate:release   # + L5 线上冒烟（需要线上站点）
npm run gate:layers    # 架构不变量（4 条，<0.1s）
npm run check:evidence # 证据政策（Tier-3 拦截）
```

分层定义见 `docs/TESTING.md`；分层表的唯一出处是 `scripts/test/layers.js`。

---

## 6. release

```bash
# 1) 合并到 master（PR 的必需检查就是 verify.yml 的 gate job）
# 2) 发布由 deploy.yml 负责：prepublish（跑同一个门禁）→ build → deploy(Pages)
# 3) 发布后冒烟（只抽关键页，不全站爬）
npm run smoke                                   # 站点地址取 lib/feeds.js 的 SITE_URL
npm run smoke -- --url=https://…/               # 指定其它部署
```

`npm run smoke`（L5）只回答三个问题：**线上真的存在这些页面吗**、
**线上那一份和本地构建的是同一份吗**（canonical 自指、无残留占位符）、
**最要命的几个 SEO 事实还在吗**（title / JSON-LD 可解析）。
它**刻意不重复 Full Gate** —— 那是两件不同的事。

---

## 7. 门禁的步骤定义改了怎么办

`check-ci-consistency.js` **冻结**了门禁 action 的步骤序列与每一步的 `run` 体
（先剥注释再比对规范化后的命令），并且 `verify.yml` 里钉着 `--expect-checks=38`
（断言项数的**唯一出处**）。所以：

- **加/删/改一个门禁步骤** ⇒ 必须同步 `GATE_STEP_NAMES` + `GATE_STEP_RUN`
  （产物依赖步骤还要进 `GATE_ARTIFACT_STEPS`），然后跑
  `node scripts/tools/check-ci-consistency.js --expect-checks=38` 自证；
- **增删一条断言** ⇒ 才需要改 `--expect-checks`，并在 `verify.yml` 的注释里写明理由
  （那行注释就是这项变更的留痕）；
- 本轮新增的两个步骤（`Architecture fitness` / `Evidence policy`）**没有**改变断言项数
  —— 它们是新的**步骤**，不是新的**断言**，所以 `--expect-checks` 仍是 38。
- secondary-page-residue-v2 新增的一个步骤（`Residue guard (deleted copy must not return;
  container floors)`）同理：**只是步骤，不是断言**，`--expect-checks` 不变。
  它的判据本体在 `build-local.js` 的 `scanResidue()`（构建期主守卫，每次构建都跑，
  含登记表缩表检查），`check-residue.js` 是对**已就绪产物**的再复核 + `--dir=<沙箱>` 入口
  ——「删掉不许回流 / 扫描面不许收缩」的规则与登记表读 `docs/DESIGN-RULES.md`、
  `scripts/data/residue-guard.json` 的 `_why`。

  ⚠️ 顺带记一处**本轮没动**的文档漂移：本节正文里的 `--expect-checks=38` 是旧值，
  实际（`verify.yml` 的 gate 调用行）已是 **39**；`PRIVATE-ANALYTICS-v1.md:273` 也提到同一处口径。
  本轮不改它们（不属本轮 scope，改文档口径要连同 `verify.yml` 那行注释一起留痕），
  登记在 `research/secondary-page-residue-v2-report.md` 的「已知边界」里。

---

## 8. 手工维护工具（**不在门禁里**，由人按需运行）

这些工具**故意**不进 CI：它们要么改数据、要么需要人工判断、要么只在事故恢复时用。
把它们列在这里，是为了让「文档里提过但没人接线」这种中间态消失 —— 每个都有明确身份。

| 工具 | 用途 | 危险度 |
|---|---|---|
| `scripts/tools/restore-from-git.js` | 从 Git 历史恢复某个数据文件（事故恢复） | **高**（改工作树） |
| `scripts/tools/audience-overrides-extract.js` | 从现有数据里抽取受众覆盖候选（人工复核后并入 `audience-overrides.json`） | 中（只出新文件） |
| `scripts/tools/probe-offers.js` | 探测某个来源页的优惠结构（研究用） | 低（只读 + 打印） |
| `scripts/tools/inspect-source.js` | 检查单个来源的原始响应（排查采集问题） | 低（需要外网） |
| `scripts/data/backfill-cards.js` | 回填历史条目的卡片字段（一次性迁移用） | **高**（改数据） |
| `scripts/tools/study-site.js` | 参考站拆解（WCAG 对比度近似算法出自这里，`verify-site.js` 的注释引用它） | 低（需要外网） |

**纪律**：跑任何一个**改数据**的工具（前两类）之前，先 `git status` 确认工作树干净，
跑完立刻 diff 并跑 `npm run gate:fast`。

> 本轮（architecture-modernization-v1）删掉了 4 个**零引用**的死代码文件
> （`history-nonempty-e2e.js` / `audience-backfill.js` / `audience-restore-history.js` /
> `rows-by-link.js`，共 102,940 B）—— 它们满足 §17 的六条判据（无 require、无 package script、
> 无 workflow、无 registry discovery、无 dynamic load、**无 docs promise**）。
> 上表这 6 个**不满足第六条**（文档承诺过），所以处置是**确认身份并写清楚**，而不是删。

---

## 9. 排障速查

| 症状 | 先看哪里 |
|---|---|
| 构建失败但看不出哪一步 | 输出里 `=== N) … ===` 的分段；失败时 `dist/` 未被改动，可直接重跑 |
| 产物里出现 `__SITE_URL__` / `__PREFIX__` / `ANALYTICS:BOOTSTRAP` | 页壳的 `finalizePage()` 收尾断言会先红；检查是不是绕过了 `docStart/docEnd` |
| 某页面上线后少了样式 | 该族的 `extraCss` 是否还在（页壳只管**文档脚手架**，不接管页面级 CSS） |
| 手机端整页横滚而静态检查全绿 | `npm run verify`（L4）—— §22c 的全站几何门禁；这类问题只有浏览器抓得到 |
| 本地全绿、CI 红 | `npm run gate`（与 CI 同一份 action.yml）；再看 `npm run check:ci` |
| CI 红在「CI consistency」 | 有人改了 workflow / action 而没同步冻结表，见 §7 |
