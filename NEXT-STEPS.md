# 下一步：现在的状态，以及还需要你点头的事

> 更新于 **2026-09-23 10:45**（本次会话：全合 → 合并态复验 → 文档同步 → 视觉复核重试）。
> 全貌总览见 [`SUMMARY.md`](SUMMARY.md)；逐步记录见 `PROJECT_STATUS.md` 的 2.17–2.21。

---

## 一、已经办掉的（都可复核）

| 事项 | 结果 |
|---|---|
| **合并** | ✅ 按你的点单「全合」：`git merge --no-ff trial/merge-rehearsal-2` → 合并提交 **`10cc923`**，零冲突 |
| 合并前复核 | 用 `git merge-tree --write-tree`（**不动任何 ref**）预演：exit 0 零冲突。**注意**：彩排分支的基点是 `006819d`，其实**不含** master 之后那两个文档提交 —— 旧文档里「基于最新 master」这句话严格说不成立，但仍零冲突 |
| 保险 | tag `backup/pre-ab-merge` → `fb08832`（合并前的 master） |
| **合并态门禁** | ✅ `test` / `test:strict` / `check:zh` exit 0；`selftest:zh` **7/7**；`build` ×2 清单 SHA256 **完全一致**（139 文件）；`verify:regress` **99 项 0 失败** + 5 项回归全过 |
| **文档同步** | ✅ 补上原先缺失的 `PROJECT_STATUS.md` **2.21**；全仓「未合并」表述改为实际状态（`SUMMARY.md`、`docs/DESIGN-RULES.md`、`research/GAP-MATRIX.md`） |
| **本地预览** | ✅ `node scripts/serve.js --dir=dist` → `http://127.0.0.1:8080/`（200，标题正确） |
| **收藏 / 对比（G11）** | ✅ 已实现并合并为 **`30d547f`**。门禁抓出「62 张卡集体 3px 纵向溢出」并修掉（纯 CSS 一行，判据一字未动）；合并态 **110 项 0 失败**、`selftest:zh` 7/7、两次构建一致 |
| ~~首页按意图重排（C2）~~ | ⛔ **已按你的决定撤下** —— 不额外加一个主页、入口级别先不议。评审页已删，只留生成器与口径（`mockups/v4/README.md`）；**线上首页一行未改** |

> ⚠️ **一条会误导后来人的环境坑**：本会话沙箱（`workspace-write`）**禁止子进程管道 stdio**。
> `selftest:zh`（用 `spawnSync` 调构建）与 `verify:regress`（用 playwright 启 Edge）会以 **EPERM** 失败，
> 表现为「每一项都失败 + 子进程输出为空」，看着像回归，其实是环境。用独立探针确认 `errorCode=EPERM`
> 后，以更宽模式重跑同样的命令才拿到上表的绿。**判据：每项都失败且子进程无输出 → 先怀疑环境。**

---

## 二、还需要你的三件事

### 1. 视觉复核：仍被余额阻塞（唯一没做成的原计划项）

重试时**单张截图的连通性探针返回空** —— 该 provider 依旧不可用；因为探针先跑，所以**没有**消耗那 5 个正式审阅任务。

模型本身没有问题：`deepseek-v4-flash-vision-exp` 在 provider 目录中**确实存在**且声明
`input: ["text", "image"]`（provider=`deepseek` → `api.deepseek.com`），因此仍是**该账号余额**问题。

**需要你三选一**：

- ① 给该账号充值 → 我立刻补跑（脚本已就绪：20 个参考站 + 4 个自有产物，分 6 批并发）；
- ② 指定另一个**有余额的图像模型**（provider + 模型名）→ 我改路由重跑；
- ③ 放弃这一步 —— 现有全部结论都基于 DOM / 样式 / 度量与对比度计算，且三套 mockup 用同一把尺子量过。

> 附带一条如实说明：**主模型 `deepseek-v4.1` 不声明图像输入**（`read_image` 直接被拒），
> 所以我自己也读不了截图，**无法替代**视觉模型充当替代读者。

### 2. C 两项：一项已落地、一项已按你的决定撤下（英文覆盖不做）

| 项 | 状态 | 说明 |
|---|---|---|
| 收藏 / 对比 | ✅ **已落地并合并**（`30d547f`） | 卡片星标 + 详情弹层完整动作 + 底部对比条 + `?compare=` 可分享链接；合并态 110 项 0 失败 |
| 首页按意图重排 | ⛔ **已撤下（暂缓）** | 你的决定：**不额外加一个主页**，入口的级别/分层先不议。评审页已删除，线上 `index.html` 一行未改；生成器与口径留在 `mockups/v4/`，将来想重看一条命令即可恢复（见该目录 `README.md`） |
| 英文覆盖 | **不做** | 唯一带持续人工成本的项（每条新数据都要人工译） |

### 3. 是否上线

**`git push` 仍一次都没执行** —— 它会触发 CI 采集与 GitHub Pages 部署，需要你明确同意。
部署后可用 `npm run verify -- --url=<线上地址>` 当冒烟测试。

> ⚠️ **推送前必须先并一次上游数据**：`origin/master` 已被**定时 CI 采集**推了一个提交
> `43e81cc chore(data): 更新优惠数据 2026-09-23 11:29 CST`（**只动 `deals.json`**，+205/−64）。
> 并进来之后卡片数与各入口计数都会变，`mockups/v4` 的计数要重新生成、门禁要重跑一遍。

---

## 三、分支地图（全部未推送）

```
master                       30d547f  ← A + B + 收尾（10cc923）+ 收藏/对比（G11）全部已合并
 ├─ feat/visual-token-layer  874cd6b  A：token 层 / 暗色 / 对比度 / 语义与无障碍
 │   └─ feat/b-extras         ec05252  + 订阅 feed / 纠错入口 / WebSite / 同页锚点
 │       └─ feat/detail-pages f1213d5  + 每条优惠一个独立静态页（URL 1 → 81）
 │           └─ feat/row-view 7bfc607  + 紧凑行视图（首屏 13 行 / 手机 5.5 屏）
 │               └─ feat/polish f55e8a9  + 圆角间距收敛与键盘可达
 ├─ trial/merge-rehearsal-2  044dd51  ← A/B/收尾 的合并来源
 └─ feat/favorites-compare   e0cd50d  ← 收藏/对比（c2310d8 实现 + e0cd50d 修 3px）
backup/pre-ab-merge          fb08832  ← A/B 合并前的 master（保险）
```

> 分层合并的老命令已用不上了（A/B 已在 `master` 里）。要回退：`git reset --hard backup/pre-ab-merge`
> 或 `git revert -m 1 10cc923`。
