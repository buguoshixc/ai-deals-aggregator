# T19 证据索引（sidecar）

- 主报告：`research/quality-closure/review-registry/T19-P0-REVIEW.md`
- 评审对象：t5（T05 Registry 身份唯一性 P0 + §10.6 完整性守卫）
- 提交 verdict：**pass**（findings 均 LOW；F-T19-1 的两种读法见主报告 §0 诚实注记）

## 沙箱（**不在仓库内**，可整目录删除；共享 worktree 全程只读）

| 路径 | 内容 |
| --- | --- |
| `D:\qc-t19\wt` | 金样本：共享 worktree 整树副本（含 `node_modules`）+ 在副本内复算派生物；`.qc-t19/` 是我的脚本与日志 |
| `D:\qc-t19\run\<case>` | 9 个变异副本（每个独立、含自己的 `.qc-t19/out/<case>.json` 与 `.qc-t19/fingerprints.json`） |

## 我自己的脚本（沙箱内）

| 文件 | 作用 | 最后一次 exit |
| --- | --- | --- |
| `D:\qc-t19\wt\.qc-t19\identities.cjs` | 独立遍历 `api-plans.json` + 来源层 links 推导 67/55/12/0 并与实现读数对照 | 0 |
| `D:\qc-t19\wt\.qc-t19\unit-teeth.cjs` | 用自造小夹具重建 §8 牙与 §10.6 两侧完整性 | 0 |
| `D:\qc-t19\wt\.qc-t19\mutate.cjs` | 变异器（改来源层或仓根产物，规范序写回） | 0 |
| `D:\qc-t19\wt\.qc-t19\gates.cjs` | 门禁跑手（exit code / 耗时 / 输出尾部 → `.qc-t19/out/<label>.json`） | 0 |
| `D:\qc-t19\wt\.qc-t19\run-case.cjs` | 建副本 → 变异 → 跑门禁 → 落指纹 | 0 |
| `D:\qc-t19\wt\.qc-t19\empty-registry.cjs` | 把来源层删成只剩 `_` 元信息键（空 registry 探针） | 0 |

## 关键数字（三方可比）

| 项 | 我的独立推导 | 实现读数 | T01 基线 |
| --- | --- | --- | --- |
| 计价条目（记录内真实 `pricing item`） | 67 | 67 | 67 |
| 被认领 identity / 多 owner | 67 / 0 | 67 / 0 | — |
| API 映射（全为 `variant: null`） | 55 | 55 | 55 |
| Coding 映射 | 9 | 9 | 9 |
| 多变体组 / 受影响 slug | 12 / 9 | 12 / 9（join 工具） | 12 组 |
| 通配展开分布 | 多条 12 · 单条 43 · 空展开 0 | — | — |
| 仓根 links 与来源层（去 `registryModelId`） | 逐字节同构（64 条） | — | — |

## 变异电池（全部改**来源层** `scripts/data/*.json`）

| case | 期望 | 实测 | 判定 |
| --- | --- | --- | --- |
| `append-legal-wildcard`（P0 原始形态） | ≥1 道非 0，且 `rebuild-models` 拒绝写盘 | 8/17 门禁非 0；`rebuild-models` exit 1 | 关闭 |
| `append-legal-explicit` | 非 0 | 3/3 非 0 | 关闭 |
| `adjacent-explicit`（自造） | 非 0 | `check-model-registry-links` exit 1 | 关闭 |
| `remove-mapping`（M09） | `check-model-registry-links` 自己非 0 | exit 1（点名未认领条目） | 关闭 |
| `duplicate-slug-valid`（自造，排除干扰判据） | 门禁非 0 | `check:model-registry-links`=1 · `selftest:model-registry`=1 · **`validate:strict`=0** | F-T19-1（LOW） |
| `unresolved-wildcard`（自造） | 非 0 | 2/2 非 0 | 关闭 |
| `root-links-only`（自造） | 产物可重建性门禁非 0 | `check:models:reproducible` exit 1 | 与 T02 一致 |
| `empty-registry`（自造） | 非 0 | 5/5 非 0 | 空输入不假绿 |
| 绿对照（未变异） | 全 0 | 17/17 = 0（`green-prod` / `green-full` / `green-rest` 三批） | 对照成立 |

## 合同 Verify 五条

| # | 命令 | exit |
| --- | --- | --- |
| 1 | `node scripts/tools/check-model-registry-links.js` | 0 |
| 2 | `node scripts/tools/models-selftest.js` | 0（88 项通过） |
| 3 | `node scripts/validate.js --strict` | 0 |
| 4 | 自写合法追加变异 + `rebuild-models` | 1 / 1（预期非 0） |
| 5 | `node scripts/tools/build-local.js --out=dist.qc-review` → `registry-join-audit.js --dist=dist.qc-review` | 0 / 0（missing 0 · extra 0 · duplicate 0 · multi-owner 0） |

## 生产数据指纹（评审时点实测，未改写）

```
3594e4da5df5a3db4b864e19b95dc963a7003b234849ec92b940cf08d84a7b40  scripts/data/model-registry-links.json
05b72c2dcc8f642e61182d4439649ce68a50e5ac73c5b419a966b7784e9bff0e  scripts/data/models.json
1e89ba04c43a0daf950cb747a0413336bc89db3a32a9f2de2c95bf5a017a6e5c  scripts/data/model-registry-gaps.json
8fa85b1d0547b7ed54b671711f6a10585c1753b440713a16d210dad6746ae95b  models.json
fd2336c86d07645779efc55a9b3bf05bf1aa99c4193854e5afa9d6503d9d1a2e  model-registry-links.json
962fc9c4ef8bddd99d92819141f563bbb1f8febbe3779ff6cf87f8b36a81ee46  api-plans.json
a72c91efea82b843141dfa9994f11a81ed38e2d2ca31c3c218fa31b15cb70938  plans.json
```

（前 3 份与 5 份中的后 2 份与 T05 交付所报前缀一致；`model-registry-gaps.json` / `models.json` /
`model-registry-links.json` / `api-plans.json` / `plans.json` 同时命中 T01 BASELINE 的冻结 sha256。）

## 清理指引

`D:\qc-t19\` 是**仓库外**的一次性沙箱（金样本 31 MB + 10 个变异副本，各含 `node_modules` 副本）。
确认证据已被主报告引用后可直接 `Remove-Item -Recurse D:\qc-t19`；共享 worktree 内我只落了
`research/quality-closure/review-registry/` 下这两份文件。

## live 复检（评审期间另有任务改了 `api-plans.json`）

- 并发改动：`api-plans.json` + `scripts/data/curated_api_plans.json`（4 条记录 `freeTier` 加 `stability`、1 条 description 扩写）。
- 身份相关口径未变：67 条计价条目 · 新增 0 / 消失 0 · 55 个互异组；registry 两份来源文件与两份仓根产物哈希未动。
- 在 `D:\qc-t19\run\live-recheck`（共享树 live 快照）重跑：`check-model-registry-links`=0 ·
  `validate.js --strict`=0（44 条 · 55/9）· `models-selftest`=0（88 项）· `check-models-reproducible`=0（44 模型 / 64 映射 /
  「67 条 = 认领 67 + 未认领 0」）。
