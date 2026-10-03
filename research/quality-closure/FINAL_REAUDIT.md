# T23 · 精简独立再审计（§28）

- 审计人：verifier（t23，attempt 2 / attempt_id `67697724-e234-4228-9044-cf8021e9e60a`）
- 审计对象：分支 `quality-closure-post-audit`，**HEAD = 3edb9cfd7d9653bed37ef70169bdd0b61046b4f0**（基点 `origin/master` 21cf66d，10 个根因 commit，仅本地未 push；`git status` 仅 `?? research/audit/` `?? research/quality-closure/`）
- 我在提交态**自己重跑**：40 个 node 步骤里的 **39 个**（唯一没重跑的是 `npm ci`：依赖已装、全部步骤当场通过）+ 回归比对 + 6 组定向变异/现场实验；退出码逐条见 §H
- 隔离：全部变异在**仓库外** `D:\qc-t23\`（`gold\` = 提交态逐块复制；`cases\`/`extra\` 每例独立副本）；共享树只读；每次变异后用文件级备份覆盖恢复并复核 sha256 **BYTE-EXACT**（日志 `reauth-work/logs/*.json`）
- 判据自建：`reauth-work/{reauth-probe,gate-sample,extra-sample,R5-api-page,a-evidence,E1-E2,E4-build-disk-recheck,E5-heal-or-miss,extract}.cjs`；复用 T18/T20 的自写 harness（`verify-work/`、`mutation-work/`），**不 require 被测判定模块自证**
- 线索来源：`CAPTAIN-LEDGER.md` 只作线索；本文每条结论都对应我自己跑出的命令与退出码；**未发现自述与我的复跑不一致**（§H.3）

## 0. 结论速览

| 项 | 结果 |
| --- | --- |
| 原 P0（1 条） | **1/1 CLOSED** |
| 全部 P1（12 条） | **12/12 CLOSED**（其中 5 条以 FIXED 关闭、7 条以 GUARDRAIL_ADDED 关闭，逐条有我的变异证据） |
| 本轮 REPAIR NOW（FIXED 10 条） | **10/10 有我的独立证据** |
| 指定 GUARDRAIL（GUARDRAIL_ADDED 19 条） | **19/19 有我的独立证据** |
| 十个领域面（Registry / API Pricing / Changes / Archive / Provenance / AI / Manifest / Source Health / degraded / artifact-missing） | 全部复核，无未覆盖面 |
| 新增 P0/P1 | **无**（0 条） |
| 我独立重跑的门禁 | **39/40 node 步骤 + 回归比对，全部 exit 0** |
| **是否适合继续开发新功能** | **适合**（条件见 §I） |

## A. 原 P0（Blocker）

### P0-1 同一价格记录可同时属于两个 registry 模型身份，11 道生产门禁全部放行

| 项 | 内容 |
| --- | --- |
| before（审计 1c024db） | `scripts/lib/model-registry.js` 的冲突键是三元组字面量 `planId\0modelKey\0(variant===null?'(all)':variant)` ⇒ 通配 `null` 与显式 `"standard"` 是**两个键**，同一条 `(apiPlanId, modelKey)` 的两种写法可分别归属两个 slug 而不报警；审计实测「合法追加一条映射 → 11 道门禁全 exit 0 → 产物页多出一行」 |
| after（提交态） | 唯一性判据 = **link 展开后的真实 identity 集合**（`sourcePricingIdentitiesOf`，从 `plan.models[].variant` 推导，不写死 `standard`/`long_context`）；认领集合不相交才允许分属两个 slug；通配展开 0 条即红；API 侧完整性（每条计价条目必须有映射认领）与 Coding 侧同级 |
| evidence（我的命令 + 退出码） | ① `battery --only=M01/M13`（沙箱）→ **CAUGHT：9 道红**，其中 `validate --strict=1`（原文「已经映射到 glm-5.3 …同一条价格记录不许映射到两个 registry 模型」）· `check-models-reproducible=1` · `rebuild-models=1`（拒绝写盘）· `models-selftest=1` · `models-page-selftest=1` · `coverage-report=1` · `MY-join-audit=1` · `build-local=1`；② `unit-teeth.cjs` 自造夹具 **17/17**（两方向撞车、相交/不相交、冗余认领、空展开）；③ 我的独立 join：`join-audit` 44 页 / 67 行 / 四计数 0（`exit 0`）；④ `check-model-registry-links` exit 0 |
| mutation | 来源层 `scripts/data/model-registry-links.json` 规范序追加 `{registrySlug:'glm-5.3', apiPlanId:'ebc4af9a71b6', modelKey:'qwen3-max', variant:null}`（恢复 BYTE-EXACT：`3594e4da…→b31de1b0…→恢复`） |
| status | **CLOSED** |

## B. 全部 P1（12 条）

| # | 原 finding | before | after（提交态） | evidence（我的命令/退出码或变异） | mutation | status |
| --- | --- | --- | --- | --- | --- | --- |
| P1-1 | AI 候选「必须人工 accept」红线无门禁守卫（M17 = 审计唯一盲区） | `ai-apply.js` 行内 filter；改恒真后 ai-selftest 37/37 与 validate 全绿 | accept 判定收敛到 `candidates.acceptedOf`（人工决定+状态一致+schema/enum/evidence 三关）；生成侧写不出带 `review.decision` 的候选；ai-selftest 63 项含牙7/8/9 | `battery --only=M11,M12,MM17` → 三条全 CAUGHT，`exit 0`；MM17：`ai-selftest=1`（牙8e「M17 回归钉」/8i/8k 三红，其余 27 道全绿）；`ai-selftest` 63/0（现场） | 把 `const accepted = candidates.acceptedOf(payload);` 改成 `payload.candidates.slice()`（恢复 BYTE-EXACT） | **CLOSED** |
| P1-2 | 门禁步骤体没被冻结：任意步骤可换成空操作而 36/36 全绿 | 无步骤体指纹 | `check-ci-consistency` 断言(10) 加**规范化 run 体指纹**（先剥整行注释）+ 步骤级 `if` 冻结 + 禁 `continue-on-error` 步骤键 | `ci-fingerprint-experiment`：**g1 注释 exit 0 · g2 空行 exit 0**（不误报）、**g3 改名 exit 1**（步骤名序列冻结，比自述更严）、**g4 `continue-on-error` exit 1**、**g5 `--dir` 语义变化 exit 1**；`ci-step-order`：44 步 · Assemble site #30 · 六个产物步骤 31–36 全带 `--dir=dist` · 无 `continue-on-error` 键 · 判定三分支齐（exit 0）；`check-ci --expect-checks=36` exit 0 | g1–g5 五种工作流变异（均文件级恢复） | **CLOSED** |
| P1-3 | `allow_degraded_run` 取值无断言，必需检查可静默降级 | 只在 YAML 里写 `${{ … }}`，没人求值 | 断言(11) 把每个调用方的表达式**按触发事件真的求值**（PR/push/schedule/workflow_run/dispatch 默认必须 false；只有人工 dispatch 显式勾选 true；deploy 恒 false） | `failclosed-replay` E：我的自求值 3 文件 × 6 事件全部符合（exit 0）；f6「verify.yml 恒 true」→ `check-ci-consistency=1`（原文「verify.yml @ pull_request: 解析成 true —— 必需路径不得静默降级」）；现场 `check-ci` 36/0 | 把 verify.yml 的 `with.allow_degraded_run` 改成字面量 `'true'`（恢复 BYTE-EXACT） | **CLOSED** |
| P1-4 | `/changes/` 只要有一条变化条目，产物自检必然失败 | arity/members/内部链接在非空分支崩 | 非空渲染修复 + §15 合成非空夹具；`history-nonempty-e2e` 可复现非空态 | `battery --only=M03`（要求面模式）：setup 移植 T07 生成器产出的 7/19/12 事件 → `prepare=0` · **`build-local=0`** · 要求面 27/29 绿（`seo-verify=0` · `MY-join-audit=0` · `MY-browser-matrix=0`（48/48）· 三支历史门禁 0 · `validate --strict=0`）；独立重放 `verify-site=0（704 项 0 失败）`；exit 0 | 非空历史夹具（T07 生成器产物移植进当前代码副本） | **CLOSED** |
| P1-5 | `/archive/<kind>/<id>/` 详情页相对链接少一层前缀 | 深度派生前缀少一层 ⇒ 24/27 相对引用死链 | 前缀由 `lib/archive.js` 的唯一 helper 给出；archive-selftest 用 `--dir` 对现场产物逐页对账 | 同 P1-4 夹具：`archive-selftest` 的详情页/相对引用断言全绿（该例仅 5 条**空态牙**红，非链接面 —— 见 §G-③）；`MY-browser-matrix`（48/48，含 /archive/ 360/390/768/桌面 × JS 开关）exit 0；`subpath-check`（T18 口径，229 次取回非 200=0）| 非空 archive 夹具 + 我的浏览器矩阵 / 链接检查 | **CLOSED** |
| P1-6 | 第三方目录站内容被页面写成「官方页面明写」 | 措辞只看 basis | 措辞由 basis + derived + sourceType 三轴决定；新增 collected 档「第三方收录页原文（非官方页直引）」；官方域白名单（providers/official_urls 48 域）由 `validate --strict` 守 | 现场措辞检查（E2）：173 页里「第三方收录页原文（非官方页直引）」出现 **18 次**、「由官方原文推断」出现在 **16 页**；`provenance-selftest` **114/0**、`validate --strict` 0；T20 M05 复跑：`validate --strict=1` + `rebuild-api-plans=1`（两道防线分别记录） | T20 M05（聚合站 URL 写成官方定价页） | **CLOSED** |
| P1-7 | 来源层 input/output 互换没有任何判据 | 无判据 | `evidenceBindingProblems` B2：模型级绑定里输入值必须先于输出值出现（来源层与派生数据两个入口都红） | `battery --only=M07`：**CAUGHT · 5 道红** —— `validate --strict=1`（1 项）· `rebuild-api-plans=1`（拒绝写盘）· `check-api-plans-reproducible=1` · `build-local=1` | 把一条绑定引文里的输入值/输出值**位置对调**（两者仍在引文里；恢复 BYTE-EXACT） | **CLOSED** |
| P1-8 | 单位枚举翻转（per_1M→per_1K）零判据 | 无判据 | B3：引文/unitNote 点名的「百万/千」必须与 `pricing.unit` 同类；每条记录必须有单位见证 | `battery --only=M08`：**CAUGHT · 5 道红**（同上四道 + `api-plans-selftest=0` 不变）；现场 `api-plans-selftest` **175/0** | 只把 `pricing.unit` 改成 `per_1K_tokens`（引文仍是「每百万」；恢复 BYTE-EXACT） | **CLOSED** |
| P1-9 | 页面第 7 列（其他计费维度）单位错位无门禁 | 无 | 第 7 列纳入逐格对账（判据独立于渲染）；真浏览器侧对 `/plans/api/` 三列价格逐格与数据对账 | **R5 现场变异**（改 `dist/plans/api/` 第一行输入价 → ¥999999）→ **`verify-site --dir=dist` exit 1，原文点名到行到格**：`✗ /plans/api/ 输入价 / 输出价 / 缓存命中输入 三列逐格与数据对账（互换输入输出必红） — 第 1 行 deepseek-v4-pro：页面 ["¥999999","¥24","—"] / 数据 ["¥12","¥24","—"]`；同类牙（第 7 列每张→每秒）在 `api-plans-selftest` 175/0 内 | R5（恢复 BYTE-EXACT） | **CLOSED** |
| P1-10 | 页面第 8 列可把 tokens 额度标成 credits | 无 | 第 8 列由 `freeTier.type` 派生（第三份手写单位表已收敛）；`assertPageHonesty` 有该列的常驻判据（渲染器产出页 + 空转/长期能力/性质词） | `api-plans-selftest` **175/0**（含牙·P1-10「把 tokens 额度印成 credits → 变红」与牙「未变异页 0 问题」）；构建期 `build-local` 在内存与**写盘后**各跑一次 `assertPageHonesty`（exit 0）；我另做现场实验：**手改 dist 第 8 列后 → 下一次 build 重建覆盖（自愈，sha 回到 gold）**，见 §G-① | 手改现场产物第 8 列（E1/E4/E5），非构建路径 | **CLOSED**（构建路径有双层断言；落盘篡改属已登记的 DOCUMENTED 类） |
| P1-11 | freeTier 把新用户赠送收成稳定长期能力 | 只按 `basis`/无 stability | 三档 `stability` 必填（`new_user`/`standing`/…）+ 与 Deal 分工；页面性质词与数据联动 | `battery --only=M06`（stability `new_user → standing`）：**CAUGHT · 5 道红**（`validate --strict=1` · `rebuild-api-plans=1` · reproducible=1 · build-local=1）；现场 `api-plans-selftest` 175/0 | M06（恢复 BYTE-EXACT） | **CLOSED** |
| P1-12 | 模型详情页多变体静默吞行（幸存的是更贵档） | `apiTargetOf` 首匹配 | 一条 pricing item = 一行；行身份 `data-item=planId\|modelKey\|variant` + `data-variant`；页面自测按期望行集合逐身份对账 | 我的独立 join（`--dist=dist`）：44 页 · 67 行 · 四计数 0（exit 0）；`models-page-selftest --dir=dist` **75/0**（含 T25 的第 ⑨ 节逐格数值）；`battery --only=M02`（删一行）→ `models-page-selftest=1`（`missing:1`）+ `MY-join-audit=1` | M02（产物层删行；恢复 BYTE-EXACT） | **CLOSED** |

## C. 本轮 REPAIR NOW（FIXED 10 条）

除上表 P1-4/P1-5/P1-6/P1-11/P1-12 与 P0-1 外，另有 4 条 P2/P3 级：

| # | finding | evidence（我的命令/退出码） | status |
| --- | --- | --- | --- |
| P2-15 | `headless_unavailable` 在真实接线路径不可达 | `health-selftest` **72/0**（现场）；**R2 结构变异**（把 `headlessReady` 写死成 `return true`）→ `health-selftest=1`（否则该判定无人守）；T20 M16 代码形态复跑 → `health-selftest=1`（7 项红，原文「H2 Collect Summary 里无头来源落到 headless_unavailable」） | **CLOSED** |
| P2-16 | 声明为「推断」的字段页面写成「官方页面明写」 | 同 P1-6：三轴措辞 + `provenance-selftest` 114/0 + 现场「由官方原文推断」出现在 16 页 | **CLOSED** |
| P3-4 | `/feeds/` 汇总页漏列 5 个分类 Feed | 我自己的计数（§E-Manifest）：`/feeds/` 子订阅唯一地址 **48**（+根 2 个两种写法）、Feed 家族文件 **48 = 24 JSON + 24 XML**、`feeds-selftest` **131/0** | **CLOSED** |
| P3-11 | 同一条记录两个互相冲突的「来源 URL」 | `validate --strict=0`（含出处交叉守卫）+ `provenance-selftest` 114/0；T20 M05 变异（官方域/措辞）被抓 | **CLOSED** |

## D. 指定 GUARDRAIL（GUARDRAIL_ADDED 19 条）

| # | guardrail | 我的证据（命令 → 退出码 / 变异） | status |
| --- | --- | --- | --- |
| P1-1 | accept 唯一实现 + 静态牙 + allowlist | 见 §B P1-1（MM17 → ai-selftest 1） | CLOSED |
| P1-2 | 步骤体指纹 / if 冻结 / 禁 continue-on-error | §B P1-2（g1–g5 + step-order） | CLOSED |
| P1-3 | allow_degraded_run 语义求值 | §B P1-3（E 自求值 + f6 红） | CLOSED |
| P1-7 | input/output ↔ evidence 绑定（B2） | §B P1-7（M07 → 5 红） | CLOSED |
| P1-8 | unit evidence 必存 + 同类（B3） | §B P1-8（M08 → 5 红） | CLOSED |
| P1-9 | 第 7 列逐格对账 | §B P1-9（R5 → verify-site 1，点名到格） | CLOSED |
| P1-10 | 第 8 列对账 + 类型词一致 | §B P1-10（175/0 含牙；构建期双层 assertPageHonesty；现场篡改自愈） | CLOSED |
| P2-9 | 删一条 registry→API 映射必须由关系层门禁自己红 | `battery --only=M13`：**CAUGHT · 9 红**，`check-model-registry-links=1` 自己点名「未认领的计价条目 …（4f8bae91f9f8, claude-fable-5.1, standard）」 | CLOSED |
| P2-10 | `data-docs-selftest --dir` + 缺产物 fail-closed；seo-verify 与 Manifest 对账 | §E-artifact-missing（空产物 6/6 非 0；`--allow-missing-dist` 6/6 exit 0 且带 OPTIONAL DIAGNOSTIC；真实产物 6/6 exit 0）；`seo-verify --dir=dist` 11/0；`data-docs-selftest --dir=dist` 57/0 | CLOSED |
| P2-12 | unknown 三态不得降级 | `battery --only=M09`：**CAUGHT · 6 红**（`validate --strict=1`「无法对账三态」+ `rebuild-plans=1` 拒绝写盘） | CLOSED |
| P2-14 | `--out` 落点白名单 | `battery --only=M10`：CLI **exit 1**（`maintenance --out=<沙箱>/deals.json`），且 `deals.json` sha 前后一致；M12：`writeCandidates(cause=generation)` **exit 1** | CLOSED |
| P2-20 | 全仓单位换算静态扫描 | `api-plans-selftest` **175/0**（扫描含在其中）+ 我自造的 M08（unit 翻转）被 B3 抓 | CLOSED |
| P2-25 | Manifest 方向 2（未登记数据集必红） | §E-Manifest：口径 9/36/11/1/24 与 48（我自己数）；`battery --only=M15`（多放一份 JSON）→ `data-docs-selftest=1`；真实产物 57/0 | CLOSED |
| P2-26 | 共享 dist 并发保护 + 缺产物不静默跳过 | §E-artifact-missing + 步骤指纹 g5/`--dir` 冻结（check-ci exit 0） | CLOSED |
| P2-27 | 两侧覆盖都成立 | `check-model-registry-links` exit 0（现场）+ M13（删映射）/M01（跨 slug 认领）多道红 + 我的 tooth 夹具 API/Coding 两侧 | CLOSED |
| P2-28 | 手写来源层重复顶层 slug 键 | `battery --only=M14`：**CAUGHT · 6 红**，`validate --strict=1`（「顶层键 "glm-5.3" 重复出现」）+ `rebuild-models=1` 拒绝写盘 | CLOSED |
| P2-32 | 字符串型断言必须先剥注释 | g1/g2（插注释/空行不误报，exit 0）+ g5（语义变化必红） | CLOSED |
| P3-34 | 浏览器门禁里的第三份手写单位表 | 收敛到 schema 的 `FREE_TIER_UNIT_LABEL`；`MY-browser-matrix` 48/48 exit 0 + `verify-site` 703/0 | CLOSED |
| P3-41 | 「官方来源」机器门禁 | T20 M05 复跑（两道防线红）+ `provenance-selftest` 114/0 + 官方域白名单在 `validate --strict` 内 | CLOSED |

## E. 十个领域面的独立复核

| 面 | 我的命令 | exit | 结论 |
| --- | --- | --- | --- |
| Model Registry | `models-selftest` · `check-model-registry-links` · `check-models-reproducible` · `rebuild-models` · 我的 join-audit · M01/M13/M14 | 0 · 0 · 0 · 0 · 0；变异 9/6 红 | 身份唯一 + 两侧完整 + 可重建 + 落盘不可手改，**全绿** |
| API Pricing | `api-plans-selftest` · `check-api-plans-reproducible` · `rebuild-api-plans` · M06/M07/M08/M09 | 0 · 0 · 0；变异各 5–6 红 | 输入/输出、单位、三态、stability、官方域：**全绿** |
| Changes | 非空夹具（M03）：`build-local` · `verify-site` · 三支历史门禁 · `changes-selftest` | 0 · 0（704 项）· 0 · 101/0 | 非空路径**绿**（空态牙失真见 §G-③） |
| Archive | 非空夹具（M04）：`verify-site` · `MY-browser-matrix`（含 /archive/）· `archive-selftest` | 0 · 48/48 · 69/0（现场） | 相对前缀/详情页/内链**绿** |
| Provenance | `provenance-selftest` · `validate --strict` · E2 现场措辞 · M05 | 114/0 · 0 · 18 次 collected / 16 页 inferred · 两道防线红 | **绿** |
| AI candidate isolation | `ai-selftest` · M10/M11/M12/MM17 | 63/0；四条变异全 CAUGHT | **绿** |
| Manifest | 我自己的口径计数 + `data-docs-selftest --dir=dist` + M15 | 9 份 / 36 JSON（根 11 + data/index 1 + feed 24）/ Feed 48 / `/feeds/` 48 子地址 + 2 rel=alternate；57/0；变异红 | **绿** |
| Source Health | `health-selftest` · R2（写死 headlessReady）· T20 M16 复跑 | 72/0；R2 exit 1；M16 exit 1（7 项红） | **绿** |
| Gate degraded path | f6（恒 true）· E 自求值 · `check-ci` | f6 exit 1；3 文件 × 6 事件全符合；36/0 | **绿** |
| artifact missing path | 6 工具 × {空产物, `--allow-missing-dist`, 真实产物} | 空 6/6 非 0；放行 6/6 exit 0 且带 `⚠️ OPTIONAL DIAGNOSTIC`；真实 6/6 exit 0 | **绿** |

## F. T20 关键变异抽样复跑（§28 Verify 要求的七类）

| 类别 | 用例 | 我的复跑结果 | exit |
| --- | --- | --- | --- |
| 原 P0 | M01 identity→两模型 | CAUGHT（9 道红，含 rebuild 拒绝写盘） | 0（跑手） |
| API input/output | M07 引文数字对调 | CAUGHT（`validate`=1 · `rebuild-api-plans`=1 等 5 道） | 0 |
| unit | M08 unit 翻转 | CAUGHT（同上 5 道） | 0 |
| AI `--out` | M10 `--out=deals.json` | CAUGHT（CLI exit 1，deals.json 未变） | 0 |
| Manifest | M15 未登记 JSON | CAUGHT（`data-docs-selftest`=1） | 0 |
| artifact missing | M18 空 `--dir` | CAUGHT（6/6 非 0；`--allow-missing-dist` 对照 0） | 0 |
| degraded | M17 `allow_degraded_run=true` | CAUGHT（`check-ci-consistency`=1） | 0 |

（`logs/t20-sample.json`；全部恢复 BYTE-EXACT，gold/共享树逐字节未变。）

## G. 新增发现与观察（本次再审计）

**新增 P0/P1：0 条。** 三条观察（均非产品缺陷，逐条给复现）：

1. **落盘产物被手改的"篡改类"面**（与 T20 的 N1 同类，T21 §5 已记 DOCUMENTED）：
   - ① `dist/plans/api/` 第 8 列（免费额度）手改成 credits：`verify-site --dir=dist` **exit 0**、`api-plans-selftest` 0、`data-docs-selftest` 0、`models-page-selftest` 0（复现：`reauth-work/E1-E2.cjs`）；随后跑 `build-local` → **exit 0 且产物重建覆盖回数据真值**（sha 回到 gold，`E5-heal-or-miss.cjs`）⇒ 该面**自愈**，且构建路径有内存 + 写盘后两次 `assertPageHonesty`。
   - ② 参考量：`scripts/data/source-health.json`（观测产物）直接改成 healthy → 无门禁（T20 M16-artifact 形态）。
   - 建议保持 **DOCUMENTED**（产物是构建输出；真值层与构建路径都有断言），若要做，就在 `verify-site` 的 `/plans/api/` 段加第 8 列文本对账（那一段已拿到 `api-plans.json` 真值与页面 DOM）。
2. **`/plans/api/` 的三列价格**由 `verify-site`（真浏览器）逐格对账 —— 该面在**无浏览器**的降级运行里无人守；这是 `allow_degraded_run` 的已知代价（只有人工 dispatch 显式勾选才允许，且 fail-closed 判定步骤会明确记录），**不是缺陷**。
3. **空态牙在非空现场失真**（T20 F-T20-1）：`archive-selftest` 5 项 / `feeds-selftest` 1 项在非空历史夹具上红，而同夹具的 `build-local` / `verify-site`（704 项）/ 自写浏览器矩阵（48/48）全绿 ⇒ 测试套件状态敏感，产品链无恙。T21 已记 DOCUMENTED。

## H. 我自己重跑的门禁（40 node 步骤中的 39 个 + 回归比对）

### H.1 抽验 29 道（`reauth-work/logs/gate-sample.json`，全部 exit 0）

`validate --strict` 0 · `check-ci-consistency --expect-checks=36` 0（36/0）· `check-reproducible` 0 · `history-verify` 0 · `check-plans-reproducible` 0 · `check-api-plans-reproducible` 0 · `check-models-reproducible` 0 · `check-model-registry-links` 0 · `check-api-plan-history` 0 · `check-plan-history` 0 · `models-selftest` 0（**90/0**）· `models-page-selftest --dir=dist` 0（**75/0**）· `api-plans-selftest` 0（**175/0**）· `plans-selftest` 0（**264/0**）· `ai-selftest` 0（**63/0**）· `data-docs-selftest --dir=dist` 0（**57/0**）· `feeds-selftest` 0（**131/0**）· `health-selftest` 0（**72/0**）· `provenance-selftest` 0（**114/0**）· `archive-selftest --dir=dist` 0（**69/0**）· `seo-verify --dir=dist` 0（**11/0**）· `coverage-report` 0（0 处问题）· `deal-plan-links-selftest` 0（**80/0**）· `audience-selftest` 0（**191/0**）· `changes-selftest` 0（**101/0**）· `build-local` 0 · **我的** `join-audit` 0 · **我的** `browser-matrix` 0（48/48）· `verify-site --dir=dist` 0（**703/0**，真浏览器 Edge）。

### H.2 补跑 10 道 + 回归比对（全部 exit 0）

`migrate-audience-verify` 15/15 · `zh-todo --check` ✅ · `zh-selftest` 15/0 · `expiry-selftest` 94/0 · `text-selftest` 46/0 · `fixture-test` 4/0 · `plan-history-selftest` 132/0 · `seo-selftest` 63/0 · `app-token-selftest` 67/0 · `history-selftest` 61/0 · **回归比对**（`verify-site --dir=dist --compare=research/_raw/ours-baseline/verify.json`）**exit 0 · 709 项 0 失败**（页高 4589→4665px 在容差内、外部请求 0→0、JS 错误 0）。唯一没重跑：`npm ci`（依赖已装；它不是判据步骤）。

### H.3 与自述一致性

- 与 T22 自述**逐条吻合**（我复跑的读数：models 90/0 · models-page 75/0 · api-plans 175/0 · plans 264/0 · ai 63/0 · data-docs 57/0 · feeds 131/0 · health 72/0 · provenance 114/0 · archive 69/0 · seo 11/0 · deal-plan-links 80/0 · audience 191/0 · changes 101/0 · verify-site 703/0 · check-ci 36/0 · validate 0）。
- 与 T18 自述吻合（join 67 行四计数 0；浏览器矩阵 48/48；子路径 229 次取回非 200=0 —— T18 已跑、本轮我在提交态复跑 join/浏览器，未复跑子路径脚本，但 H.1 的 `verify-site`/canonical 断言覆盖同一面）。
- **不一致：0 处。**

## I. 是否适合继续开发新功能

判定条件（逐条给依据）：

| 条件 | 状态 | 依据 |
| --- | --- | --- |
| 真正的 Blocker 全关 | ✅ | 原 P0-1 **CLOSED**；12 条 P1 全部 **CLOSED**（§A/§B） |
| 指定 Guardrail 完成 | ✅ | 19 条 GUARDRAIL_ADDED 逐条有我的变异/命令证据（§D） |
| 完整 Gate 全绿 | ✅ | 我独立重跑 **39/40 node 步骤 + 回归比对全 exit 0**；唯一未重跑的是 `npm ci`（依赖已装）。T22 自述 40/40 与我的读数一致（§H.3） |
| 无新增 P0/P1 | ✅ | §G：新增 0 条；三条观察均有复现且不改变产品行为 |

**结论：适合继续开发新功能。**（唯一保留条件：发布/合并前由 CI 在提交态把完整 40 步再跑一遍 —— 我未重跑 `npm ci` 这一非判据步骤；其余每一步我都当场跑过并记录退出码。）

## J. 复现指引与边界

```powershell
cd <worktree>   # 提交态 3edb9cf
# 1) 提交态逐块复制到仓库外沙箱（含 dist / node_modules）
#    D:\qc-t23\gold  ← 由 reauth-probe 第一次运行时自动准备（也可手工复制）
# 2) 我独立重跑的 29 道（只读 + 默认 dist）
node research/quality-closure/reauth-work/gate-sample.cjs
# 3) 三项独立重做 + 两项「把判定写死」变异
node research/quality-closure/reauth-work/reauth-probe.cjs --gold=D:\qc-t23\gold
# 4) AI 三连 / 非空历史要求面 / 来源语义 / 第 7 列
node research/quality-closure/reauth-work/extra-sample.cjs
# 5) /plans/api/ 现场逐格（R5）+ 第 8 列（E1/E4/E5）
node research/quality-closure/reauth-work/R5-api-page.cjs
node research/quality-closure/reauth-work/E1-E2.cjs
# 6) t17 面（空产物 / 放行 / 指纹 / 降级）与 T20 七类抽样
node research/quality-closure/verify-work/failclosed-replay.cjs --gold=D:\qc-t23\gold
node research/quality-closure/verify-work/ci-fingerprint-experiment.cjs --gold=D:\qc-t23\gold
node research/quality-closure/mutation-work/battery.cjs --only=M01,M07,M08,M10,M15,M17,M18 --gold=D:\qc-t23\gold --work=D:\qc-t23\m20cases
```

**边界（未验证项，如实记录）**：
1. 我没跑 `npm ci`（依赖现成）；也没在真实 GitHub Actions runner 上跑——CI 语义由静态断言 + **真执行那段判定 shell** + 我的自求值覆盖。
2. 浏览器只有 Edge（headless，Windows）；与仓库自己的门禁同一支。
3. 非空历史夹具的三份历史由 T07 生成器产出后**移植进当前代码副本**（生成器要求夹具是 git worktree，直接同步会产生跨版本混合 —— 这是 T20 记录过的口径坑）。
4. 我在本次审计里修过自己两处 harness 缺陷（`/plans/api/` 现场脚本的注释终止符、`--only` 前缀匹配早已在 T20 修）；修好后重跑才取数，未把 harness 缺陷当成产品结论。
