# 对齐 master 之后的复跑读数（t28 / 2026-10-08）

## 本地怎么造出「对齐后」的树

本机 `github.com:443` 不可达（`git fetch` 也不通），所以用 Git Data API 把 master `898f86f` 相对我基线 `9b72b9d` 改过的 **50 个文件**取回工作树（`.arch-v1/t28/align-local.js`），构成「master + 我的 17 个文件」的树。

- 上游改过的文件里**没有一个**与我改的 17 个文件重叠（`compare/9b72b9d...898f86f` 逐条核对）⇒ 取回上游文件不会覆盖我的改动。
- 其中包含 t32 的修复 `scripts/tools/verify-site.js`（`feed 条数 == 日志全部事件数` → 「feed 逐条 == 日志中落在窗口内的事件」）。
- **我自己的 lib 改动仍在这棵树里**（`scripts/lib/api-plan-schema.js` 的 `.change` 形态 + `scripts/lib/provenance.js` 的可选 `opts.max`）—— 这正是 t32 作者点名的那件事：只把数据文件搬到 master 上复现不出来。

## 门禁（对齐后）

```
npm run gate   →  合计 324.7s / 48 个脚本，失败 0
                  ✅ 本地门禁链全过（与 CI 读同一份 action.yml）   exit 0
```

（52 个步骤里 4 个非 node 步骤本地跳过：Install dependencies / Prepare browser / Browser availability decision / Gate conclusion。）

## 真浏览器验收（t32 的控制组）

```
npm run verify →  ✅ 验收 885 项，失败 0 项
✓ API 价格变化订阅的 guid 逐条等于日志里**落在当前窗口内**的派生事件身份（不是每次 build 重新生成）
   — JSON 12 条 / RSS 12 条 / 窗口内日志 12 条（日志全量事件 18 条 · asOf 2026-10-08 ·
     窗口 2026-10-02..2026-10-08，ended/restored 用 2026-09-09..）
```

与 captain 给的期望读数逐项一致：**885/0**、窗口内 12 条 / 全量 18 条、`asOf 2026-10-08`、窗口 `2026-10-02..2026-10-08`。
对照：t32 修复前同一条是 `JSON 12 条 / RSS 12 条 / 日志 18 条` ⇒ 红（本任务落地时撞上的那条假红）。

## 其它复查

- `npm run check:evidence` → ✅ 无新增 Tier-3（1283 个已跟踪的全部在清单内）· ✅ 清单自证通过
- `node scripts/validate.js --strict` → ✅ 校验通过（strict 模式）

## 对齐后的 PR

- 分支 head `5c202fa3cbce59b16874c0f52573aad5f68a769c`，**父 = master `898f86f`**，17 个文件，`MERGEABLE`；推送经 Git Data API（`force: true`，因为这是一次 rebase-on-master；推送前逐条核对：上游没有改过我这 17 个文件里的任何一个）。
