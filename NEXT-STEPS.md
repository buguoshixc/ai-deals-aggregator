# 下一步：现在的状态，以及还需要你点头的事

> 更新于 **2026-09-23 13:1x**（本次会话：并回上游两次 → 修掉两个手机端横向问题 → 门禁补 3 条断言 →
> 合并态全门禁复验 → **已按你的「push」上线**）。
> 全貌总览见 [`SUMMARY.md`](SUMMARY.md)；逐步记录见 `PROJECT_STATUS.md` 的 2.17–2.28。

---

## 一、已经办掉的（都可复核）

| 事项 | 结果 |
|---|---|
| **合并 A+B+收尾** | ✅ 按你的点单「全合」：`git merge --no-ff trial/merge-rehearsal-2` → **`10cc923`**，零冲突 |
| **收藏 / 对比（G11）** | ✅ **`30d547f`**。门禁抓出「62 张卡集体 3px 纵向溢出」并修掉（纯 CSS 一行，判据一字未动） |
| ~~首页按意图重排（C2）~~ | ⛔ **已按你的决定撤下** —— 不额外加一个主页、入口级别先不议。评审页已删，**线上首页一行未改** |
| **视觉复核** | ✅ 已补齐（原计划 B4）：**23 条**独立视觉评述，逐条在 [`research/VISION-REVIEW.md`](research/VISION-REVIEW.md) |
| **并回上游（第一次）** | ✅ **`71d020a`** —— 并回 `origin/master` 的 13 个提交（**被重写过的 A/B 线** + 数据更新 + 活动期限三分类）；6 个文件冲突逐个人工解，两侧内容零丢失（见 2.27） |
| **并回上游（第二次）** | ✅ **`0d6b869`** —— 集成期间上游又推了 `fix/detail-close`（删掉详情里重复的「关闭」死链），零冲突 |
| **修掉 chip 折行** | ✅ 390px 下 `rows=2 perRow=[3,1]`、右侧空 **269px** → **`rows=1 perRow=[4]`、余量 0px** |
| **窄屏横向溢出（新发现）** | ✅ 门禁只量 390px，所以从没报过：**320px 溢出 42px、360px 溢出 2px**（根因 `.grid` 的 `1fr` = `minmax(auto,1fr)`，下限被卡片顶在 345.5px）。改成 `minmax(0, 1fr)` 后**均归 0**，且卡内被裁元素 0 个 |
| **门禁补盲区** | ✅ `verify-site.js` §10 新增 3 条断言（逐个控件是否被裁 / chip 是否排满一行 / **360px 页面级溢出**），前两条同时验 390 与 360 两档；**§4 既有判据一字未改**（该文件 +78/−0 纯新增） |
| **本地预览** | ✅ `node scripts/serve.js --dir=dist` → `http://127.0.0.1:8080/`（200，标题正确） |
| **上线** | ✅ 按你的「push」：`git push origin master` **快进** `c70706b..ecbc815`；Deploy 工作流 **success**；线上 `verify --url=` **108 项 0 失败**（见 2.28） |

**合并态门禁（在 `0d6b869` + 本轮改动这一棵树上实跑）**：`test` / `test:strict` / `check:zh` exit 0（漂移 0、待译 0）；
`selftest:zh` **7 项 0 失败**；`selftest:expiry` **55 项 0 失败**；`build` ×2 → **139 文件**、全树摘要两次一致
（`8be46e1581651038a7662e41…`）、产物自检通过；`verify:regress` **验收 113 项 0 失败** + 5 项回归比对全过。

> **环境坑已过时（如实更新）**：2.21 / 2.26 都记着「沙箱 `workspace-write` 禁止子进程管道 stdio，
> playwright 与 `spawnSync` 会以 `spawn EPERM` 失败」。**本会话策略已改为 `danger-full-access` 且关闭审批**，
> 所以上面这些门禁全是**直接跑通**的，没有再绕。前两节的记录是当时的真实情况，后来人不必再照着绕。

---

## 二、已上线；剩下可选的只有观感项

### 是否上线

**已上线（2026-09-23）**：你说「push」后执行了 `git push origin master` ——
`c70706b..ecbc815` **快进**推送成功，Deploy 工作流 [run 35841045158](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/35841045158) **success**。

> **一处口径纠正（原先写错了，已改）**：旧文档说「`push` 会触发 CI 采集与 Pages 部署」。
> 实际 `deploy.yml` 是**纯发布**流程（它自己的注释就写着「不做采集（采集由 collect.yml 负责）」）：
> **push 只触发发布**；采集由 `collect.yml` 按**定时**（北京时间 08:00 / 20:00）或手动 dispatch 跑，
> 跑完再由 `workflow_run` 唤起发布。所以推送后线上会立刻更新，但数据采集不会因此多跑一次。

### 不用点头、但你可以点单的：三个观感项

`research/VISION-REVIEW.md` §6 第 4–6 条：控制带偏厚、强调色重复节奏、暗色卡片与底色的明度差。
**它们都不是缺陷，是取舍**；要做的话我按同一套流程来（改 → 门禁 → 视觉复核）。

> 已撤下的两项不算「待办」：**C2 首页按意图重排**（你的决定：不额外加主页）与**英文覆盖**
> （唯一带持续人工成本的项）。素材：`mockups/v3/C-ambitious/PLAN.md`、
> `mockups/v4/README.md`（含一条命令恢复评审页）。

---

## 三、分支地图

```
master = origin/master            ecbc815  ← 已上线：A/B/收尾 + G11 + 两次并回上游 + 两个手机端横向修复
 ├─ ecbc815   fix(mobile): 修掉两个手机端横向问题 + 门禁补 3 条断言
 ├─ 0d6b869   merge: 并回 origin/master 的 fix/detail-close
 ├─ 71d020a   merge: 并回 origin/master（重写过的 A/B 线 + 数据 + 活动期限三分类）
 ├─ feat/visual-token-layer      874cd6b  A：token 层 / 暗色 / 对比度 / 语义与无障碍
 │   └─ feat/b-extras            ec05252  + 订阅 feed / 纠错入口 / WebSite / 同页锚点
 │       └─ feat/detail-pages    f1213d5  + 每条优惠一个独立静态页（URL 1 → 81）
 │           └─ feat/row-view    7bfc607  + 紧凑行视图（首屏 13 行 / 手机 5.5 屏）
 │               └─ feat/polish  f55e8a9  + 圆角间距收敛与键盘可达
 ├─ feat/favorites-compare       e0cd50d  ← 收藏/对比（c2310d8 实现 + e0cd50d 修 3px）
 └─ feat/expiry-window           c02e017  ← 活动期限三分类
backup/pre-ab-merge              fb08832  ← A/B 合并前的 master（保险）
backup/pre-origin-merge-b261add  b261add ← 并上游前的 master（保险）
```

> **现在本地与上游完全一致**（`git status -sb` 无 ahead/behind）。要回退**已上线的**东西，
> 不要 `reset`（历史已经推出去了），用 `git revert -m 1 <merge>` 或直接 revert 单个提交。
> 两个 backup tag 只对「本地还想回到某个旧状态」有用，且它们都没推送过。
> 若已经推上去了，就不要 reset，用 `git revert -m 1 <merge>` 反向提交。
