# t28 落地读数（改前 / 改后）

## 1. 全树摘要（`npm run report:digest`，产物 `dist/`）

| | 文件数 | 字节 | 全树摘要 | 清单摘要 |
|---|---|---|---|---|
| 改前 | 304 | 20,386,654 | `67d1d0bdcdffe29f1b2bd0185c35408da897d53d20e44c495fec385f7ec1337d` | `2b8fe49fa776a8789e592d79fb507c2c1e9cac233801a9425b4e9e8f55f638de` |
| 改后 | 304 | 20,381,609 | `9b6f2dc8f8fb3c2b7ac7bfa5924dc308f066ee7de738128762550e9afc44ed77` | `ea8a9fb47c90850dd92b1b7ea6f92ae48cd2fb841d768a6f1837f12fcb52bbe5` |

## 2. 渲染面：Sonnet 5.5 行缓存读价 + 两条引文的落点

| 命中（按文件） | 改前 | 改后 |
|---|---|---|
| `dist/plans/api/index.html` 的 `data-item="claude-sonnet-5.5|standard"` 行 | `$0.2`×1 | `$0.1`×1 |
| 旧行引文（`Hits and refreshes $0.20 / MTok`） | 3 个文件（`dist/api-plans.json` / `dist/model-registry-links.json` / `dist/plans/api/index.html`） | 同 3 个文件（未删） |
| 变更记录引文（`Cache reads now cost 50% less …`） | 0 | 同 3 个文件（新增） |

**受影响产物清单**：新价 = `dist/plans/api/index.html`；新事件 = `dist/changes/index.html`、`dist/feed/plans/api/changes.json`、`dist/feed/plans/api/changes.xml`、`dist/plans/api/index.html`、`dist/vendor/anthropic/index.html`、`dist/api-plan-history.json`；引文层 = `dist/api-plans.json`、`dist/model-registry-links.json`。

## 3. 其它模型一个字节未动（全量逐条）

`dist/api-plans.json` 的**全部 308 行费率**（provider × 记录 × modelKey × dim）逐条 diff：**只有 1 行不同** ——

```
- 4f8bae91f9f8 anthropic claude-sonnet-5.5 cachedInput=0.2
+ 4f8bae91f9f8 anthropic claude-sonnet-5.5 cachedInput=0.1
```

Anthropic 同记录其它模型：`claude-fable-5.1 cachedInput=0.25` · `claude-opus-5.5 cachedInput=0.2` · `claude-haiku-4.5 cachedInput=0.1`（逐条相同）。

## 4. 改动面收敛（24 条记录 / 51 模型 / 92 关系）

- 记录级：改前改后都是 **24 条、id 集合相同**；**有变化的记录只有 1 条**（anthropic：`evidence` / `models(费率)` / `lastSeen` / `verifiedAt` / `models[claude-sonnet-5.5].note`）。
- 抽样三家别的记录引文列表「改前 = 改后」**逐字节相同**：`deepseek / API 按量计费`（2 条）· `zhipu / 模型 API 按量计费`（3 条）· `openai / API 标准价格`（3 条）。
- 重生成产物：根 `models.json` 51 条中**只有 4 条（全部 Anthropic）**变化，且只变**派生** `lastSeen` 2026-10-01→2026-10-08（内容未变）；根 `model-registry-links.json` 92 条中**只有 1 条**（`claude-sonnet-5.5` / `apiPlanId 4f8bae91f9f8`）变化 = 新增变更记录引文副本。抽样 `claude-opus-5.5` / `deepseek-v4-pro` / `glm-5.3` / `gpt-6.1-sol` 与 3 条 link 全部逐字节相同。

## 5. 公开变化事件

`scripts/data/api-plan-history.json`（由 `npm run api-plans:rebuild` 生成，未手写）追加 **1 条**：

```
2026-10-08 4f8bae91f9f8 price_decreased models
  from: { name:"Claude Sonnet 5.5", …, rates:{ input:2, output:10, cachedInput:0.2, cacheWrite:2.5, cacheWriteLong:4, … }, note:null }
  to:   { name:"Claude Sonnet 5.5", …, rates:{ input:2, output:10, cachedInput:0.1, cacheWrite:2.5, cacheWriteLong:4, … }, note:"缓存读取价按官方变更记录修正：官方 2026-10-07 生效，本站 2026-10-08 复核。缓存写入（5m / 1h）官方未说明变化，保持原值。" }
```

累计 18 条事件；`check:api-plan-history` 绿（基线 + 事件重放逐字段等于当前 `api-plans.json`，18/18 带派生 eventId）。
