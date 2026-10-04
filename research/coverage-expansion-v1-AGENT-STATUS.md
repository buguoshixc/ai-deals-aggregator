# coverage-expansion-v1 · 成员（subagent）状态快照

> 与 `coverage-expansion-v1-RESUME-STATE.md` 配套。写于停机窗口（2026-10-04T23:00 之后）。
> 目的：恢复后知道**谁能接活、谁会再死一次**，以及每个失败任务的最后一次 attempt 与续法。

## 1. 成员总表（按"还能不能用"排序）

| 成员 | 本轮做过的任务 | 当前状态 | 恢复后建议 |
|---|---|---|---|
| **research-firstparty** | t8（8 家 first-party 调查，429 中断但产物在盘）· **t45**（§41/§42 逐项核对，attempt 2 完成） | ✅ 活着，会话小 | **首选接活**：收尾、核对、只读审计类 |
| **research-inference** | t9（4 家推理平台 + 6 家国际 Coding 调查，429 中断但产物在盘）· **t41**（全量门禁收口到 48/49，完成）· **t19**（部署链路，停机时在飞） | ⚠️ 未知（停机打断 t19） | 恢复后**先探测 t19 停在哪一步**，让它续跑；若它自己已死，改派 research-firstparty |
| **coverage-engineer** | t5（覆盖目标层 + report v2）· t25（API 处置暴露 + 冻结契约）· t29（命名对照注释）· t35（两条盲区关闭）· t38（§87 预映射）· **t44**（4 条写死期望改关系式）· **t46**（§41 第 4 条五态普查 + 候选明细） | ✅ 活着，但会话已偏大 | 可接 t22（§87 验收）；合同要短 |
| **freshness-engineer** | t4（freshness 策略）· t15（数据质量审查，needs_revision）· t17（变异电池 27 例）· t36（登记表 §4.3）· t39（报告素材盘点）· t43（改派后 **429 TPM** 失败） | ⚠️ 活着但撞过 TPM | 适合 t20（最终报告，素材是它自己盘的）；一次别喂大材料 |
| **registry-schema-engineer** | t2/t3（registry v2 + 验证）· t23（API 侧处置双侧化）· t30（反绕过加固 + 成对调用机器牙）· t44（改派后 **400 上下文超限**） | ❌ 死（会话 ~562k > 512k） | 不要直接重派；同类活给小会话成员 |
| **page-engineer** | t6（/models/ Current 化）· t26（对抗性审查 pass）· t31（verify-site 假红修复）· t37（部署预检）· t40（线上基线对照物）· t43（**400 上下文超限**，615k） | ❌ 死 | 同上；其产物都在盘上 |
| **ci-gate-engineer** | t7（门禁登记 4 步）· t27（反向登记制 (19)）· t14（覆盖报告/页面审查，needs_revision）· t28（t14 闭环 + 残余登记表）· t34（登记表更新）· t18（全量 Gate 49 步）· t41（**400 上下文超限**，604k） | ❌ 死 | t21（self-audit）原定它 ⇒ **改派**给小会话成员 |
| **data-integrator** | t10/t11/t12/t13（currentness / 数据落盘 / 迁移 / source health）· t24（8 条国际 Coding 套餐）· t32/t33（t15 的 F1–F8 收口）· t42（写死期望清扫）· t45（**400 上下文超限**，670k） | ❌ 死 | 其产物都在盘上；不要再派大任务 |

**死因分布**：4 个成员死于 **会话上下文超限（400 CONTEXT_WINDOW_EXCEEDED，562k–670k > 512k）**；1 个（freshness-engineer）死于 **TPM 限流（429 tpm_limited）**；早期若干 attempt 死于 **并发限流（429 concurrency_limited，上限 6）**。
⇒ 恢复后的硬纪律：**契约短、报告限行数（≤60）、并发 ≤2–3、优先用小会话成员**。

## 2. DSH 侧 background subagent（每轮运行的临时进程）

AgentTeams 成员每跑一轮 = 一个 DSH background subagent。它们**没有跨轮状态**（会话与证据都在成员的 mailbox 与磁盘产物里），所以恢复后不需要"重启某个 subagent"，只需要**给成员派任务**。本轮观察到的运行实例（仅为留痕，id 是临时的）：

- 正常收尾：`f890afea`（freshness-engineer，多次）· `847e50c8`（ci-gate-engineer）· `ddd93eb0`（page-engineer）· `96434dd4`（research-inference）· `34b5295f`（coverage-engineer）· `063e41ae`（data-integrator）
- 异常结束：`422374b8`（停止，无收尾消息）· 另有数次以 429 / 400 结束（见上表死因）
- 具体 subagent id **不可复用**；恢复后交互一律走 AgentTeams：`agent_teams_status` 看板 → `agent_teams_reassign_task` 派活（`send_message` 在本环境多次报 "active teammate not found"，不可靠）。

## 3. 任务板状态（恢复时的判定基准）

- **在飞 / 需要判定**：`t19`（CI→merge→Deploy→冒烟；停机时在飞，远端尚无该分支、无 PR ⇒ 大概率停在 §0/§1）· `t21`（self-audit，等 t19）· `t20`（最终报告，等 t19）· `t22`（§87 验收，等 t20/t21）
- **已失败但内容已由后续任务覆盖**：`t8`/`t9`（429 中断，产物在盘）· `t11`（429/红，余项由 t23/t24 收口）· `t14`（needs_revision，四条 finding 已闭环，见 t28）· `t15`（needs_revision，F1–F8 已闭合）· `t16`（**已由队长取消**：两份审查的 P0/P1 全部被后续任务关闭，继续派发只会让实施者发明改动）· `t17`（已重跑并完成）· `t28`（交付完成、Verify 因 t31 修好的假红整体判失败 ⇒ 已改为 append-only 复核）· `t32`（F1/F2 的 API 侧卡边界，已由 t33 收口）· `t41`（attempt 1 上下文超限，attempt 2 完成）· `t43`（两次失败 ⇒ **队长决定不再重派**，内容并入 t19）· `t44`（attempt 1 上下文超限，attempt 2 完成）· `t45`（attempt 1 上下文超限，attempt 2 完成）
- **恢复后要派的最小集**：① t19 续跑（探测后从对应步骤开始）；② t20（最终报告，素材 `research/_raw/t39/report-inputs.md`）；③ t21（self-audit，**改派给小会话成员**）；④ t22（§87 验收，**47 条**，预映射 `research/_raw/t38/section87-precheck.md`）

## 4. 派活模板（恢复后直接抄，避免再把成员撑爆）

```
任务：<一句话目标>
前置：<需要读的文件路径，≤3 个>
要做：<3–5 条，动词开头>
禁止：<不碰的文件/不改的口径>
验收：<命令 + 期望读数>
报告：≤60 行，只写：状态 / 现场读数 / 反证 / 未做与边界
```

已验证有效的做法（本轮反复用到）：**每条改动配一条反证**（构造违规输入 ⇒ 必红 + 对照绿）· **报错要点名数据对象并给实际/期望两侧** · **只增不减**（断言条数）· **既有结论一律 append-only 更正**，不许追溯性改写。
