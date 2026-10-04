# T25 复跑入口与变异证据

这些文件原先只存在于 gitignore 的 `.qc-registry/`（临时沙箱）里。本轮收尾清理沙箱前把它们
移进交付物目录，保证「逐格数值对账」这条新守卫的复跑入口与变异证据不随沙箱一起消失。

## 复跑入口

```
node research/quality-closure/t25-work/t25-mutate.cjs <backup|m-swap-cells|m-blank-cell|m-m19-shaped|restore|hash>
```

- 在**树副本**（`.qc-registry/sandbox`）里改渲染层/产物，共享树只读；`restore` 逐字节还原。
- 判据脚本本体：`scripts/tools/models-page-selftest.js` 第 ⑨ 节（已随 T25 提交入库）。

## 证据（三条变异，均 exit≠0 且点名到格）

| 文件 | 变异 | 结果 |
|---|---|---|
| `t25-A-build.txt` | 渲染层 input ↔ output 对调 | exit 1：`claude-fable-5.1 (4f8bae91f9f8, claude-fable-5.1, standard): 格「输入价」渲染为 "$50"，按数据应为 "$10"`（共 6 红） |
| `t25-B-build.txt` | 记录 `646f01c662e6` 的 cache 格置空（行仍在、行数不变） | exit 1：`glm-4.5v (646f01c662e6, glm-4.5v, long_context): 格「Cache 价」渲染为 ""，按数据应为 "—"` |
| `t25-sandbox-build.txt` | **M19 原形**：glm-4.5v 两行 × 输入/输出/Cache 三格互换 | exit 1：4 条点名（输入价 ¥2 vs ¥4、输出价 ¥6 vs ¥12 …） |
| `t25-restore-build.txt` | 还原后 | exit 0 · 61 → **75 项 0 失败** · 44 页 / 67 条 / 536 格 |

关键对照（洞确实存在）：**同一 M19 形状下** `validate --strict`、`check-models-reproducible`、
`models-selftest`、`check-model-registry-links`、`coverage-report` **全部 exit 0**，只有
`models-page-selftest` 判红 —— 这正是 T20 的 N2。详见 `QUALITY_CLOSURE_REPORT.md` §4 / §5 / §19。