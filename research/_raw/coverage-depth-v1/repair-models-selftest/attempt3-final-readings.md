# t11 / attempt 3：终态读数（T2-F1 修复后的第一次全绿）

- 时间：2026-10-05（t11 attempt 3）
- `scripts/tools/models-selftest.js` 中本任务（T2-F1）的修复块**逐字仍在**：`attempt 2` 写的三段现在位于 `:907-940`（行号整体后移，是因为同轮其它写域在同一文件上方追加了内容；块内每一行与提交时逐字相同）
  - `:909` `dateNoEvidence['glm-5.3'].releaseEvidence = [];`
  - `:913` `evidenceNoDate['glm-5.3'].releasedAt = null;`
  - `:918-940` 解耦牙（`bothHalvesValid` → `onlyDate` / `onlyEvidence` 两份半成品各自报红）

## 五条 verify（全部 exit 0）

| 命令 | exit | 读数 |
|---|---|---|
| `node scripts/tools/models-selftest.js` | 0 | ✅ **148 项通过，0 项失败**（T2-F1 两项 ✓ + 解耦牙 ✓） |
| `node scripts/tools/model-freshness-selftest.js` | 0 | ✅ 100 项通过，0 项失败 |
| `node scripts/tools/check-models-reproducible.js` | 0 | ✅ 逐字节一致；51 个模型 · 92 条映射 · `updatedAt=2026-10-05T00:00:00+08:00` |
| `node scripts/validate.js --strict` | 0 | ✅ 校验通过（strict 模式） |
| `node scripts/tools/coverage-report.js` | 0 | ✅ 覆盖报告自检通过（0 处问题） |

T2-F1 相关四条检查在本次全绿运行里的原样读数：
```
✓ 真实数据：releasedAt 与 releaseEvidence 互为充要（有日期必须有官方证据；有证据必须有日期）
✓ 【v2】写了 releasedAt 却不给官方证据 → 红
✓ 【v2】给了官方证据却不写 releasedAt → 红（互为充要的另一半）
✓ 【v2】解耦牙：起点两半都合法时，夹具仍能各自造出"只有一半"的非法表并报红（T2-F1 自指盲区）
```

## 断言条数的完整链条（只增不减）

| 时点 | 通过 / 失败 | 断言总数 | 说明 |
|---|---|---|---|
| 改前（attempt 2 开始） | 139 / 4 | 143 | 含 T2-F1 两项 ✗ |
| 改后（本任务的 29 行新增落地） | 142 / 2 | 144 | T2-F1 两项 ✓ + 新增解耦牙；剩 2 项为 api-plans 声明对账（写域外） |
| 终态（本次，写域外那 2 项已被其负责人修好） | **148 / 0** | **148** | 另 +4 条断言来自同轮其它写域在该文件上的追加 |

## 上一轮阻塞项（T11-B1）的处置

`attempt 2` 判 failed 的唯一原因 —— 工作区 `scripts/data/model-registry-gaps.json` 的 API 侧声明由 12 条被改成 24 条（含 `23643dfd94f8/ernie-5.1` 重复 ×2），与 `models-selftest.js` 里 `=== 12` 的期望冲突 —— 已由该写域在本轮修好（对应两条断言现已 ✓）。本任务**始终未改** `scripts/data/**`、`scripts/lib/**` 与那两处期望值。
