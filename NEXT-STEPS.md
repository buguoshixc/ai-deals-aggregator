# 下一步：需要你点头的两件事

> 这份文件是给「回来时的你」看的。**除了下面两件事，其余工作都已完成并在合并态验证过。**
> 全貌总览见 [`SUMMARY.md`](SUMMARY.md)；逐步的详细记录见 `PROJECT_STATUS.md` 的 2.17–2.21。

---

## 一、C 方案的三项做不做（需要你的产品判断）

A 与 B 已全部落地（分支栈，未合并）。C 的三项我**没有擅自动手**，因为它们要么改变首页形态，
要么带持续人工成本：

| 项 | 内容 | 为什么需要你定 |
|---|---|---|
| 收藏 / 对比 | `localStorage` + 可分享 URL，最多 4 条并排对比关键字段 | 改变卡片交互与信息层级 |
| 首页按意图重排 | 把「一个列表 + facet」升级成按意图直达的一级入口（免费 / 学生 / 国内厂商…），每个入口独立静态路径 | 改变首页结构；需先看 mockup 定稿 |
| 英文覆盖 | `/en/` 首页 + 详情页，`hreflang` 4 条 | **唯一带持续人工成本的项**：每条新数据都要有人写英文译文（与现在的中文译文覆盖层同等工作量）。建议先做首页 + 20 条高价值条目 |

已备好的参考：`mockups/v3/C-ambitious/PLAN.md`、`mockups/v3/C-ambitious/home.html`、`i18n.html`。

## 二、合并与上线

合并命令（两种任选，彩排已验证零冲突）：

```bash
# ① 推荐：直接用彩排分支。它基于**最新 master**，已含另一个会话的 waitForApp 修复
#    与我的集成，是「跑过全部门禁」的那个状态（99 项 0 失败）
git switch master
git merge --no-ff trial/merge-rehearsal-2

# ② 分层合并：想要到哪层就停在哪层（只要 A 就跑第一条）
git switch master
git merge --no-ff feat/visual-token-layer   # A 视觉层：token/暗色/对比度/语义
git merge --no-ff feat/b-extras             # + 订阅 feed / 纠错入口 / WebSite / 同页锚点
git merge --no-ff feat/detail-pages         # + 每条优惠一个独立静态页（URL 1 → 81）
git merge --no-ff feat/row-view             # + 紧凑行视图（首屏 13 行 / 手机 5.5 屏）
git merge --no-ff feat/polish               # + 圆角间距收敛与键盘可达
git cherry-pick 044dd51                     # 走这条路径时补上 waitForApp 集成（见 SUMMARY.md 第八节）
```

> 注：`trial/merge-rehearsal`（第 9 轮那个）已被 `trial/merge-rehearsal-2` 取代 —— 前者基于旧 `master`。
> 两条路径都**零冲突**（已实测）。

**`git push` 我一次都没执行**：它会触发 CI 采集与 GitHub Pages 部署，需要你明确同意。
部署前建议先本地看一眼：

```bash
npm run build && node scripts/serve.js --dir=dist   # 打开 http://127.0.0.1:8080/
npm run verify -- --url=<线上地址>                   # 部署后当冒烟测试用
```

---

## 已经做完的部分（可复核）

**落地内容**：A（token 层 / 暗色 / 对比度 / 语义与无障碍）+ B（独立详情页 / 紧凑行视图 /
订阅 / 纠错入口 / WebSite / 同页锚点）+ 收尾（圆角间距收敛 / 键盘可达与焦点归还）。

| 指标 | 原始 | 现在 |
|---|---|---|
| 可索引 URL | 1 | **81** |
| 同源内链 | 1 | **308** |
| 首屏完整可见 | 9 张 | **13 行**（列表视图） |
| 手机滚动屏数 | 15.1 | **5.5**（列表视图） |
| 对比度不达标 | 100/400（最低 2.84） | **0**（亮 min 4.51 / 暗 min 5.98） |
| 暗色模式 | 无 | 跟随系统 + 手动三态 |
| `verify` 断言 | 55 | **99 项 0 失败** |

**门禁**：`npm test` / `test:strict` / `check:zh` / `selftest:zh`(7 项) / `build` 产物自检 /
`verify:regress`(99 项 + 5 项回归) / 两次构建 SHA256 一致 —— 全绿，且在**合并态**上验过。

**证据与规范**：

- `research/`：20 个参考站的拆解报告 + `EVIDENCE.md`（原始数字）+ `GAP-MATRIX.md`（差距与取舍）
  + `DESIGN-TOKENS.md`（token 对照）+ `README.md`（方法与已知限制）
- `docs/DESIGN-RULES.md`：9 节可执行规范，逐条标注落地情况与 3 处偏差
- `mockups/v3/`：三套方案的可点开 demo + 各自的 `PLAN.md`

**分支地图**（全部未推送）：

```
master                      dbf0d59  ← 你的原版 + 文档（2.17–2.21）
 ├─ feat/visual-token-layer  874cd6b  A
 │   └─ feat/b-extras        ec05252  + 四条零成本项
 │       └─ feat/detail-pages f1213d5  + 独立详情页
 │           └─ feat/row-view 7bfc607  + 紧凑行视图
 │               └─ feat/polish f55e8a9  + 收尾
 │                   └─ trial/merge-rehearsal 4066a17  ← 合并彩排（全门禁已验证）
```

---

## 一件如实说明的事

原计划里「把参考站截图交给视觉模型独立复核」这一步**没做成**：该模型所在 provider 返回
HTTP 402（余额不足），5 个视觉审阅任务全部失败。补偿手段是所有结论都基于 DOM/样式/度量与
对比度计算，且三套方案 demo 都用同一把尺子量过（对比度 0 条不达标、外部请求 0、断链 0）；
截图留在 `research/_raw/*/shots/`（不入库）供你自己看。
