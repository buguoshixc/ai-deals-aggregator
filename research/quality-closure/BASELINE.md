# 质量收口 · 基线冻结（BASELINE）

> **任务**：T01（owner `evidence-analyst`，attempt 1）· **冻结时间**：2026-10-03 21:37:24（Asia/Shanghai）
> **独立 worktree**：`D:\OneDrive\Desktop\Code\AI Page\.worktrees\quality-closure-post-audit`，分支 `quality-closure-post-audit`，基点 `origin/master`
> **主仓库**：`D:\OneDrive\Desktop\Code\AI Page`（本轮只读；git 命令在主仓库执行，只有 `.worktrees/` 下被写入）
>
> **本文是 T02–T17 的唯一基线。** 凡本文已冻结的数字，下游**不得凭审计文字改写**；要推翻必须给出复现命令 + 输出。
> 本文所有数字都标明是「本轮实测」还是「审计已实测（下游需复现）」——后者在标题里用 `[审计事实·待下游复现]` 标注。

---

## 1. 冻结动作与命令证据（含退出码）

| # | 命令（cwd） | exit | 结果 |
|---|---|---|---|
| 1 | `git fetch origin`（主仓库） | 0 | 无输出（未下载任何新对象）；随后第 3 条的 `origin/master` 与第 2 条的远端值一致 |
| 2 | `git ls-remote origin refs/heads/master`（主仓库） | 0 | `21cf66d530de1124478824386ff95582c73afece  refs/heads/master` —— 与本地 `origin/master` 一致 |
| 3 | `git rev-parse origin/master`（主仓库） | 0 | `21cf66d530de1124478824386ff95582c73afece` ＝ 任务书期望值（**无需**走「≠ 期望值」分支，但仍额外跑了第 4 条做核对） |
| 4 | `git diff --stat 1c024db…effe2..origin/master`（主仓库） | 0 | 6 files changed, 467 insertions(+), 427 deletions(-)（详见 §6.1） |
| 5 | `git worktree add -b quality-closure-post-audit .worktrees/quality-closure-post-audit origin/master`（主仓库） | 0 | `Preparing worktree` → `HEAD is now at 21cf66d`；分支已 track `origin/master` |
| 6 | `npm ci`（新 worktree） | 0 | `added 51 packages, and audited 52 packages in 11s` / `found 0 vulnerabilities` —— `package-lock.json` 未被改写（见 §3 的 status） |
| 7 | `Copy-Item -Recurse research/audit → <worktree>/research/audit`（主仓库→worktree） | 0 | 56 个文件；逐文件 SHA-256 比对 `COPY_IDENTICAL`（见 §7） |
| 8 | `node .qc-t01/facts*.js`（worktree，只读脚本） | 0 | 生成 §6 的实测数字（脚本落 `.qc-t01/`，被 §2 新加的 `.qc-*/` 规则忽略，不入库） |

工作树登记（`git worktree list`）：新增 `D:/OneDrive/Desktop/Code/AI Page/.worktrees/quality-closure-post-audit  21cf66d [quality-closure-post-audit]`，其余既有 worktree 未触碰。

---

## 2. 本 worktree 的 `.gitignore` 变更（唯一被修改的 tracked 文件）

在 `.gitignore` 末尾追加（其余行原样未动）：

```
# 质量收口（quality-closure-post-audit）并行会话的隔离产物目录：
# dist.qc-* 是同一条构建路径的 --out= 目标（避免与别的会话正在用的 dist/ 互相踩踏），
# .qc-* 是各任务的一次性证据脚本/临时输出。两者都是过程产物，验证完即弃，绝不入库。
dist.qc-*/
.qc-*/
```

构建纪律复核：`node scripts/tools/build-local.js --out=dist.qc-analyst` 的产物 `dist.qc-analyst/` 与 `.qc-*/`（各任务 scratch）都被忽略；默认 `dist/` 仍是发布目录、其忽略规则未改。

`git check-ignore -v` 实测（exit 0 ＝ 命中忽略规则）：

```
.gitignore:66:dist.qc-*/        dist.qc-analyst/index.html
.gitignore:66:dist.qc-*/        dist.qc-integrator/
.gitignore:67:.qc-*/            .qc-t01/facts.js
.gitignore:2:dist/              dist/index.html
.gitignore:46:*.building/       dist.building/x
.gitignore:55:dist.v24/         dist.v24/x
```

> 说明：`dist.qc-*/` 带尾斜杠 ⇒ 只匹配目录；`git check-ignore` 对裸路径 `dist.qc-analyst`（未跟 `/`、且目录尚不存在）判为不命中，但其**内容**一律命中 ⇒ `git status` 不会出现它。这是 git 的目录匹配语义，不是规则失效。

---

## 3. 冻结点：HEAD 与完整 `git status --porcelain`

**worktree HEAD**（`git rev-parse HEAD`）：

```
21cf66d530de1124478824386ff95582c73afece
```

**与 `origin/master` 相等性**：`相等 ✓`（两者同为 `21cf66d530de1124478824386ff95582c73afece`）

**worktree `git status --porcelain`（全量，冻结完成时）**：

```
 M .gitignore
?? research/audit/
?? research/quality-closure/
```

> 说明：`M .gitignore` 是 §2 的授权改动；`?? research/audit/` 是 §7 的只读证据快照；`?? research/quality-closure/` 是本文所在目录。
> `node_modules/`、`dist.qc-*/`、`.qc-*/` 均未出现在 status 里 ＝ 忽略规则生效。

**主工作区 `git status --porcelain`**：

冻结前（T01 开始，HEAD `13b11a7e` on `fix/footer-repo-link`）与冻结后（T01 结束）**逐字相同**，各 3 项：

```
?? AI_DEALS_AGGREGATOR_ROADMAP_AND_PROMPTS.md
?? AI_DEALS_CODING_PLAN_PHASES_PROMPTS.md
?? research/audit/
```

即**仍是原有 3 个未跟踪项**（`AI_DEALS_AGGREGATOR_ROADMAP_AND_PROMPTS.md`、`AI_DEALS_CODING_PLAN_PHASES_PROMPTS.md`、`research/audit/`），主工作区 tracked 零改动。

> 附注（仅记录、非缺陷）：主工作区本地 checkout 是 `13b11a7e7356a40232f98ed64074879136da587d`（分支 `fix/footer-repo-link`），**不是** master；审计报告 §1 记录的当时值是 `49122adac7e063f9c65349d1e60855278a57a036`（分支 `v2.5-api-token-plans`）⇒ 主工作区在此期间被切过分支。审计命令一律只在基准工作树内执行，此变化不影响本轮基线。

---

## 4. 九份真值文件的 sha256（冻结值）

`sha256` 为 worktree 工作区文件的实测值；`git blob` 为 `HEAD:<path>` 的对象哈希；最后一列是「相对审计基准 commit `1c024db…` 是否逐字节一致」。

| 文件 | bytes | sha256 | git blob (HEAD) | vs 审计基准 `1c024db` |
|---|---|---|---|---|
| `deals.json` | 241698 | `3ba148dbc640e1b2afc68e9d7e4cfd6fed87b6151f796fd67e399b91826dd301` | `70ac94db9bace820a6dd19935104bb438cfab982` | **不同**（审计侧 `5a0e89049c10872a89de341f9386ba4c4f3bc7d3`） |
| `plans.json` | 45904 | `a72c91efea82b843141dfa9994f11a81ed38e2d2ca31c3c218fa31b15cb70938` | `84e9d1f6ea3d5c396845b404eb4ef8f25527e584` | 相同 |
| `api-plans.json` | 66091 | `962fc9c4ef8bddd99d92819141f563bbb1f8febbe3779ff6cf87f8b36a81ee46` | `4c55d53779d60de0e2a341adef0b4df31483d039` | 相同 |
| `models.json` | 18693 | `8fa85b1d0547b7ed54b671711f6a10585c1753b440713a16d210dad6746ae95b` | `a089434d955aca98942a9f967220dc2a2bfe6e25` | 相同 |
| `model-registry-links.json` | 39441 | `fd2336c86d07645779efc55a9b3bf05bf1aa99c4193854e5afa9d6503d9d1a2e` | `c60dffa78f1ad4f336f782070dd0e3771d2f4e06` | 相同 |
| `scripts/data/model-registry-gaps.json` | 6728 | `1e89ba04c43a0daf950cb747a0413336bc89db3a32a9f2de2c95bf5a017a6e5c` | `9b335889c85de3e88de5315f49efe5a5b9bbd811` | 相同 |
| `scripts/data/deal-history.json` | 88821 | `6c9909d991973f8ced083658ad939bc5949dbe85a7ee23374a5ed610a2242829` | `49e2dd24186e8c37ef2387cc6d66ba37c623b2ba` | 相同 |
| `scripts/data/plan-history.json` | 18839 | `67dbc7f141a4f891c0ef125788dbc02d948b18fd397a95d2ff669c6d8bb27b7a` | `bcd34557aa92c20912e34a46f1471491a305566b` | 相同 |
| `scripts/data/api-plan-history.json` | 50954 | `56685dd589dc348b63ee90193e8d44c4771c7f875202a83d9169f79a17f0ecf5` | `85f1899ae7e1405f6c2ad1be8f5e5a6b652e4284` | 相同 |

> 复核命令：`Get-FileHash <file> -Algorithm SHA256`（小写）/ `git rev-parse HEAD:<file>`。
> **下游注意**：只有 `deals.json` 相对审计基准变了；结构化比对证明差异**只有 `lastSeen`（127 条）与顶层 `updatedAt`**，无 id 增删、无字段值改写（见 §6.1）。引用审计期 `deals.json` 内容时，凡与「最近 7 天 / `lastSeen` 时间窗」相关的数字必须重算；其余内容类结论可直接沿用。

---

## 5. tracked 文件全量清单（`git ls-tree -r HEAD`，503 条）

共 **503** 个 tracked 文件（未含 `node_modules/`、`research/audit/`、`research/quality-closure/`）。以下为 `git ls-tree -r HEAD` 的完整原样输出（`<mode> <type> <blob> <TAB> <path>`）：

```
100644 blob 1dd45f73a2c39033f1c21a66477e77b9ceb4e376	.gitattributes
100644 blob 9e840478dbb86a5bc30988b753d268c1009caa9e	.github/actions/gate/action.yml
100644 blob daeb48043a8372b5d1fee2fa1cc2b3b1336c3a3b	.github/workflows/ai-maintenance.yml
100644 blob dafe5d915e65aeffced3f0e136e9918abc04357d	.github/workflows/collect.yml
100644 blob 9abbe64d1cf67cee63a2b2f08ae63337942cc7b3	.github/workflows/deploy.yml
100644 blob 219a3b0dc9ddbafed0cd6d72a387c563aab00e81	.github/workflows/probe-sources.yml
100644 blob 1e522fd0e05dc86f857c4a35479431a911ecdb8f	.github/workflows/verify.yml
100644 blob 9d1d97b4a16a5a39e24a48d74b15870177c44865	.gitignore
100644 blob e69de29bb2d1d6434b8b29ae775ad8c2e48c5391	.nojekyll
100644 blob e76793b28ee56b99f5031363c8c76d8620547f8a	NEXT-STEPS.md
100644 blob bc2faf7101691492b00e56f0d95e7f939906a22b	PROJECT_STATUS.md
100644 blob ab907df4589d66e980ca963bdcae97cfdd78ba6a	README.md
100644 blob 81b46899d6c339796217a6f653ba24a45640d4bf	SUMMARY.md
100644 blob 4c55d53779d60de0e2a341adef0b4df31483d039	api-plans.json
100644 blob b125b5567dc1abc678afbe0073c60f2d474f985c	assets/logos/README.md
100644 blob 89e11c5c4153781f8bf40167f4e37bb994c89a64	assets/logos/ai360.png
100644 blob 5604b248137a0f1ad6ecef67c93fe8c120a81645	assets/logos/aws.png
100644 blob 46fcaa95646c3f713250837606c425135d113169	assets/logos/baichuan.png
100644 blob bfa23f899b4cc3e414024c8a38d791a83c10bc20	assets/logos/canva.png
100644 blob 98dec551487843a44a531cc025a54cd71dc7f85b	assets/logos/cohere.png
100644 blob f814fdcc848f1dfe7c9196bbf4f0b979c350d8f8	assets/logos/cursor.svg
100644 blob e00197c12f452a3fe1dfa7ae53b8a8ce1c579ea4	assets/logos/groq.svg
100644 blob 43c5d3c0c97a9150b19d10bc68f4c9042c5034cd	assets/logos/huggingface.svg
100644 blob 004eeb43b5c213105c33ec114d9489a1ba6341a5	assets/logos/ideogram.png
100644 blob fb2d97de419e775a6251bb59ff8b903c1ff2d6a2	assets/logos/iflytek.png
100644 blob e4a30dc7921b7f9eb66a5ff40e8c5e76f48247b3	assets/logos/krea.png
100644 blob 7fd68c56a892e40fc9656ca1a78fe9f7067e2c31	assets/logos/leonardo.png
100644 blob d99a7b104101abe67dc523e53f3df325895495aa	assets/logos/make.png
100644 blob 4b2a96afa797eeb4bcf30c6b9ab885d07f12afdc	assets/logos/manifest.json
100644 blob 60dd7b9fcee51bc959c998468a4eb131e74b6697	assets/logos/midjourney.png
100644 blob 3b9abf6a7d346cf92dda07f5ad3cf6e2b55ca613	assets/logos/mistral.svg
100644 blob f07d8f1cced47a14073cf5a90bfba673682467d2	assets/logos/modelscope.png
100644 blob dd2a8c7697b6f24ab19f1c0e0a9987f6846b3015	assets/logos/n8n.png
100644 blob 16896d237ad8005795df81de450e3c5261aa2ffc	assets/logos/openai.png
100644 blob c9c017cf5aa7f1dbf13bbbb7a8c53fb263a87426	assets/logos/recraft.png
100644 blob 9a4f1f6d306b9dde14193f316d8cfd94d526741e	assets/logos/runway.png
100644 blob b7985e626db5166083c3901d2455ee1c6a68cbbd	assets/logos/sensetime.png
100644 blob 298d8a85fa9fc41f7c0582d61c3b54ac0a21ad49	assets/logos/siliconflow.svg
100644 blob 0ea930ccece281d00247bc22999988d56dd9d450	assets/logos/stepfun.svg
100644 blob ea16a268850aa2442acef04860d29dcaaacf8539	assets/logos/tencent-cloud.png
100644 blob bbcb702bc5f039bf6491aaf873a73cf4bdd0cdd2	assets/logos/together.png
100644 blob 97deb99784fcb2c38cb0eed8ac532e7655f69397	assets/logos/volcengine.png
100644 blob ffa57d0c356a14191a03919675f047a8aead478f	assets/logos/windsurf.svg
100644 blob d839f808803fcab94edae790982a12edb64924c6	assets/logos/xai.png
100644 blob 5d310dc8d6409605c3d69af7bbbcb404a1feed31	assets/logos/zhipu.png
100644 blob 70ac94db9bace820a6dd19935104bb438cfab982	deals.json
100644 blob 8afc6fcd7ffc392db4a7ed36e5fa3810d1497323	docs/AI-MAINTENANCE-v2.0.md
100644 blob 364401eb5cc8b13103e26231f417f744a2159a2f	docs/DESIGN-RULES.md
100644 blob 519935da04692565337c57eddc1b3e8e487be0d0	docs/SCHEMA-v1.1.md
100644 blob 2c72bc509427a3f854700158861d506e9e707b1b	docs/SCHEMA-v1.3.md
100644 blob 51738586ab41d5d27ccab3ea2799c2bd6efd3d20	docs/SCHEMA-v1.4.md
100644 blob 58bc671bcd9b8c3d63b94892e2544d0a81bb213a	docs/SCHEMA-v1.5.md
100644 blob a6210fbc11e7be286e65860945f4db9796ab9635	docs/SCHEMA-v1.6.md
100644 blob d8c7f6577c3f0a62862ceeffcbe674afb524f672	docs/SCHEMA-v1.7.md
100644 blob b8d02bddbf6dc9dd9cf6b3110b2163b15f0fecd2	docs/SCHEMA-v2.1.md
100644 blob 08d68367708fa2323266df9b1907cb9e86711302	docs/SCHEMA-v2.3.md
100644 blob d974fb1ce176b39f971ca5e93480c9c7b9c25aff	docs/SCHEMA-v2.4.md
100644 blob 2e53b9cd99a43831a6cf5a6696654024a5fbee73	docs/SCHEMA-v2.5.md
100644 blob 223c8d468290e862ee67840ec26997a9b7df6f47	docs/SCHEMA-v3.0.md
100644 blob 5fc891f7c20dbfc7b255f383822764117c6a8de8	docs/v3.0/A4-HANDOFF-feed-pipeline.md
100644 blob 18fc6665bb5ac8e2e491a937fee644073ab4a4a5	docs/v3.0/AGENT-REFERENCE.md
100644 blob 4ba4173a170c263eb83eee9d670a7da84684f760	docs/v3.0/IA-NOTES-t12.md
100644 blob 28ac2a2725249a13082518e4ec88593822013327	docs/v3.0/REVIEW-CONTEXT.md
100644 blob a042a05dfe4296390b72241eb58f045e9e93af00	docs/v3.0/STAGE-PLAN.md
100644 blob 32ad6e85103c09b5e5d9a875b422ec122af9f0a4	docs/v3.0/TASK-SPEC-v3.0.md
100644 blob 9796aa40b034ff3eac07815a97d85481a9621591	docs/v3.0/WIRING-t8-vendor-pages.md
100644 blob 343f45a246fc8f1d5da1ac6e0c3b323b5ec07cc9	favicon.svg
100644 blob e93e1282cd5541e54c6df9f59cc08902b2687edc	index.html
100644 blob 011599f829b72c8651c8149da0ee9da93518fa49	"mockups/001-\346\270\205\347\210\275\345\215\241\347\211\207.html"
100644 blob afc9b673f8196ebd37f58e975f733c86fcf15e98	"mockups/002-\351\253\230\345\257\206\345\272\246\346\270\205\345\215\225.html"
100644 blob e8a3d5e9071a7911e3d4515161cb2d22051613f5	"mockups/003-\347\274\226\350\276\221\347\262\276\351\200\211.html"
100644 blob ac0679c93cd72dad8a863e531ca47b750bab6c19	"mockups/004-\345\274\200\345\217\221\350\200\205\346\216\247\345\210\266\345\217\260.html"
100644 blob 7eeef36a632d3caeb265392030c8fcfdb3f7adea	mockups/_tools/build-009.js
100644 blob 51ec1ffac79d51fddcfb553eb18b20e87e66d4fa	mockups/_tools/check-logos.js
100644 blob 9ff6073528d5f94e43b3d1809b785981f2d1b8d8	mockups/_tools/find-logos.js
100644 blob 61dcb4df856727ddef12cfdc800f9eedd9929816	mockups/_tools/gen-manifest.js
100644 blob 3992a1372768adc8a5321ac2c0603c6aa85eb39e	mockups/_tools/verify-009.js
100644 blob b05318e8d44249b6e0918e2d0c31b7155f1a7ca0	mockups/index.html
100644 blob 1fafc314d912ae473c81935deee1342857e161f1	mockups/logos/README.md
100644 blob 655b2ac3f557dd786a24de3105c699ba16c2d3e8	mockups/logos/_brand-svg.json
100644 blob 134c749f2248915e49497cb2467edf4f3b200983	mockups/logos/_sources.json
100644 blob 5604b248137a0f1ad6ecef67c93fe8c120a81645	mockups/logos/aws.png
100644 blob 46fcaa95646c3f713250837606c425135d113169	mockups/logos/baichuan.png
100644 blob e00197c12f452a3fe1dfa7ae53b8a8ce1c579ea4	mockups/logos/groq.svg
100644 blob fb2d97de419e775a6251bb59ff8b903c1ff2d6a2	mockups/logos/iflytek.png
100644 blob 9a4f1f6d306b9dde14193f316d8cfd94d526741e	mockups/logos/runway.png
100644 blob b7985e626db5166083c3901d2455ee1c6a68cbbd	mockups/logos/sensetime.png
100644 blob 298d8a85fa9fc41f7c0582d61c3b54ac0a21ad49	mockups/logos/siliconflow.svg
100644 blob 0ea930ccece281d00247bc22999988d56dd9d450	mockups/logos/stepfun.svg
100644 blob ea16a268850aa2442acef04860d29dcaaacf8539	mockups/logos/tencent-cloud.png
100644 blob 97deb99784fcb2c38cb0eed8ac532e7655f69397	mockups/logos/volcengine.png
100644 blob 5d310dc8d6409605c3d69af7bbbcb404a1feed31	mockups/logos/zhipu.png
100644 blob 57d3e78a30f48d497317de9c9f48d60b044c17a3	"mockups/v2-dense/005-\351\253\230\345\257\206\345\272\246\347\275\221\346\240\274.html"
100644 blob fe78141ef588cf1ce61b4719169cd5ff650394b7	"mockups/v2-dense/006-\346\236\201\345\257\206\350\241\250\346\240\274.html"
100644 blob 343381aab8b49d064b493e0785c75ebddd2b1aa3	"mockups/v2-dense/007-\347\264\247\345\207\221\347\275\221\346\240\274\344\270\216\350\257\246\346\203\205\351\235\242\346\235\277.html"
100644 blob 7da896e69f257b85aa5b8fbc4d21c00ecfb82ece	"mockups/v2-dense/008-007\345\212\240Logo\344\270\216\346\203\240\346\260\221\346\216\222\345\272\217.html"
100644 blob 28f970bb3fd81499cfa553df0e25a32332ab20a7	"mockups/v2-dense/009-\347\234\237Logo\347\211\210.html"
100644 blob 4d6fd45f08fec4e4e8035c7e1fe357acd9b9ff69	mockups/v2-dense/index.html
100644 blob 9b91516ba380b47d89b18c5e6b14236bd3277c29	mockups/v3/A-conservative/PLAN.md
100644 blob ca0e5f37f81a034585477b899fbc44c3cf90fee2	mockups/v3/A-conservative/index.html
100644 blob 5d7f4f2190cc9df6013033f189037268573bac37	mockups/v3/B-balanced/PLAN.md
100644 blob efce3507d973996eee72fa733e0f13d866b5e27a	mockups/v3/B-balanced/affordances.html
100644 blob 9f3155b261d46c712f0d1ae6afbf594ad42f96d1	mockups/v3/B-balanced/dense-rows.html
100644 blob 3d2f036f4c948696c94957a0577df43f7a0a2c7f	mockups/v3/B-balanced/dense.html
100644 blob 804871a5cdcb9629715fe53f093db51a0f290fc9	mockups/v3/B-balanced/detail.html
100644 blob 2effa6f5f280da8ed5e874be9fabc21ade37a8c3	mockups/v3/C-ambitious/PLAN.md
100644 blob 3bf4242981c7b83c3544bd524503e94375d82125	mockups/v3/C-ambitious/home.html
100644 blob 0f8d2f334c05a400073a6f97ee1bc20c08cfcc85	mockups/v3/C-ambitious/i18n.html
100644 blob fe1daa83a8a0192fa7d1e29ffb7faadf68302ab8	mockups/v3/_tools/build.js
100644 blob 40dfa144168b21f815e9f3772d32a09502e9a366	mockups/v3/index.html
100644 blob 396d3089176ed9fed91cd57b3a4f89f59343d705	mockups/v3/shared/base.css
100644 blob 42df995531482b655081c5ebd030a86e681eadaf	mockups/v3/shared/tokens.css
100644 blob e63db713f191d891207012964330f5f8869df764	mockups/v4/README.md
100644 blob 1a4f0382cfc34fc491dbacc975878a3049361259	mockups/v4/_tools/build-intent.js
100644 blob c60dffa78f1ad4f336f782070dd0e3771d2f4e06	model-registry-links.json
100644 blob a089434d955aca98942a9f967220dc2a2bfe6e25	models.json
100644 blob 34f76b2297d0ca0193940f26594b892eab9a9411	package-lock.json
100644 blob d13424b7af47eb43e5899f31f9e0aeb72b87d9f0	package.json
100644 blob 84e9d1f6ea3d5c396845b404eb4ef8f25527e584	plans.json
100644 blob ff9c47ea0725f840ad93130edb1791bf720017c4	research/DESIGN-TOKENS.md
100644 blob c2b113a96f9a3257426a9fbe2e95eb21a30ed1f9	research/EVIDENCE.md
100644 blob ee93cd6abae2658505784483801c838e70dfd985	research/GAP-MATRIX.md
100644 blob 4d609727a56c1fc19cb8d753d9a569783560e626	research/README.md
100644 blob 65ff23f5e35ed89bcb37a14406671b4e939aab34	research/VISION-REVIEW.md
100644 blob d4eb62cffe6129b833d03cf583699296b27ba84d	research/_raw/AUDIT-CONTEXT.md
100644 blob 81b56c0e0bb6947fa6eeabae8f9d3fd52853ac97	research/_raw/ai-bot.cn/dom-outline.txt
100644 blob 75b2e186d85b1c69934a1ee20b2d831cf7788e98	research/_raw/ai-bot.cn/metrics.json
100644 blob 07ac96639f5ccf437d1d5fe94d404eaca297e55e	research/_raw/ai-bot.cn/tokens.json
100644 blob 4c1382eb15af68bd9cebce378f85d6c9e4044ecf	research/_raw/aitools.fyi/dom-outline.txt
100644 blob e4c2a1db2043ac1a12086d2f553cbe135ceb6400	research/_raw/aitools.fyi/metrics.json
100644 blob e052390cb42e617af9834652b9e2bf142a8da3b0	research/_raw/aitools.fyi/tokens.json
100644 blob 5f7c9285fc8238c8bdec9344218fc8ee21995a16	research/_raw/appsumo.com/dom-outline.txt
100644 blob 9026f2f594d13e6345f0ec100fd2808f489125c1	research/_raw/appsumo.com/metrics.json
100644 blob fce1a8db71b0d9a9ec3111e8c1688413b8596910	research/_raw/appsumo.com/tokens.json
100644 blob fac3b813a96531a9b465adf4fcf8de6f39d033e0	research/_raw/artificialanalysis.ai/dom-outline.txt
100644 blob 03b1afa43ca1d5863e7bb08c71c772d15d86223b	research/_raw/artificialanalysis.ai/metrics.json
100644 blob 80f97a758f3da257848b17ab7967b3ed5e518eb3	research/_raw/artificialanalysis.ai/tokens.json
100644 blob ae6b13d174a15b3fd936277a0fe45d634553ca5f	research/_raw/audit-2026-09-28/01-pipeline.md
100644 blob ea24f98f2edee5d9051eb293fdd77cf8993bcddb	research/_raw/audit-2026-09-28/02-data.md
100644 blob 625fc4bdb7914865234cf26d09ff79b08a798972	research/_raw/audit-2026-09-28/03-frontend.md
100644 blob a4fa361646c7fcd9f88b88524ab603c8356fb5e8	research/_raw/audit-2026-09-28/04-ops-docs.md
100644 blob f7185bc9b089f7ada336b1184a35cb5bf5bfefd2	research/_raw/audit-2026-09-28/PROJECT-AUDIT-2026-09-28.md
100644 blob b43c7e41e7e23a33aec5c429a1847e4435523c40	research/_raw/audit-2026-09-28/PROJECT-AUDIT-2026-09-28.verification.md
100644 blob acf1c5e324035594b066bb959b127d8082b36803	research/_raw/devtk.ai/dom-outline.txt
100644 blob f712958f805f200f3c34ac26a2d469ecbe614818	research/_raw/devtk.ai/metrics.json
100644 blob 2cba332d0a1538ae46a16d7963d602945e6d9996	research/_raw/devtk.ai/tokens.json
100644 blob 7aab7d2f722d5b2e7b3b6c8f8794ead5de2d5ca2	research/_raw/framer.com/dom-outline.txt
100644 blob 7eeaf28f89a281fe869eaa26fba58fdce1354820	research/_raw/framer.com/metrics.json
100644 blob e565a28d70aca19d85b7cca1a84c91d8f5e60fce	research/_raw/framer.com/tokens.json
100644 blob e4e6b5872d52fe04df8aa046640917657260e2c0	research/_raw/free-for-dev/dom-outline.txt
100644 blob ddd2e154d9617e511ae927a5eb551220f3eb3017	research/_raw/free-for-dev/metrics.json
100644 blob 732b5781e90538050389736c952360e53385b734	research/_raw/free-for-dev/tokens.json
100644 blob adc784bdc63c7fd253b6eb49f5a9a5572477d4dc	research/_raw/futurepedia.io/dom-outline.txt
100644 blob 979853bb45238057afeee7bffcbf93df819beefd	research/_raw/futurepedia.io/metrics.json
100644 blob ae122ca67ead1982b07d9b1b22fc25f4c6d98bd1	research/_raw/futurepedia.io/tokens.json
100644 blob c0b98391b17df5d416cad45c3ec67e993560ef8a	research/_raw/futuretools.io/dom-outline.txt
100644 blob 1beadd290d2424ab9524dc86dbb01511b04bcde1	research/_raw/futuretools.io/metrics.json
100644 blob b09f184ef59a1fc4d70fac6538911153e775ece5	research/_raw/futuretools.io/tokens.json
100644 blob 2eb6f03e95755b54a8c9c8d4b5ed3993d1bd0acd	research/_raw/linear.app/dom-outline.txt
100644 blob 221462828b0f680dc5b9bab6e9315a79d29bfb7e	research/_raw/linear.app/metrics.json
100644 blob 0f91726c4c1f21b7af3c9e13f3b5a084e1881265	research/_raw/linear.app/tokens.json
100644 blob 4e388d3fa0ff7b4316c3c34896ece5839f1bba19	research/_raw/llm-prices.com/dom-outline.txt
100644 blob 3020ae302c8066fc731bdb9d0a3edc01ad551c5a	research/_raw/llm-prices.com/metrics.json
100644 blob 52684f37da204da3df8239c7034ee9fa62c3f5f0	research/_raw/llm-prices.com/tokens.json
100644 blob 381bb8c51fd7c7cc7667804d394026c3f0197aa4	research/_raw/mock-A-dark/dom-outline.txt
100644 blob af623010c1f4339ce478697663fe4a986b419894	research/_raw/mock-A-dark/metrics.json
100644 blob 6463bf5198cf6f30357cbf00ec28405e75ffda00	research/_raw/mock-A-dark/tokens.json
100644 blob c127ef0a025367b5e6f4a5d43325d883a95b52a9	research/_raw/mock-A-light/dom-outline.txt
100644 blob f3fab0a20863832a11d8a40c6f88931cda0b9a40	research/_raw/mock-A-light/metrics.json
100644 blob f2aaa03a3ea3318103e992dd726f444a0974fab4	research/_raw/mock-A-light/tokens.json
100644 blob 3718b6105e2ed82f8d0246a6288a36fb6cf90f8d	research/_raw/mock-B-aff/dom-outline.txt
100644 blob 51eb7f7013a81a4b8b8198057e93c7d0a31e1e98	research/_raw/mock-B-aff/metrics.json
100644 blob 169cd17df223e78ef82d7ce9907b3703060e19c1	research/_raw/mock-B-aff/tokens.json
100644 blob 15b74f4582e93a4dbc0128b43a621c0fc6bb4fee	research/_raw/mock-B-detail-dark/dom-outline.txt
100644 blob b54e4a74f1bd9b6b0400ea92a76b07082002b74f	research/_raw/mock-B-detail-dark/metrics.json
100644 blob 3dd3d47df222ecc96ad276bbcaafc6d957c11898	research/_raw/mock-B-detail-dark/tokens.json
100644 blob eb5e598843d1f428c819601476339df670fa697c	research/_raw/mock-B-detail/dom-outline.txt
100644 blob d9e4e0244e00cf12203dca4c2e2ad03bbcbec88a	research/_raw/mock-B-detail/metrics.json
100644 blob ae5b3276093393c590c2cb5d978796bcaf60c5ce	research/_raw/mock-B-detail/tokens.json
100644 blob 5a7959e5e744bde3cee94293b7f909d7a48b672b	research/_raw/mock-B-rows-dark/dom-outline.txt
100644 blob ec347aa202787af99b5281c058a31348de5d106e	research/_raw/mock-B-rows-dark/metrics.json
100644 blob c9750919ee63c470721c860b533610f55e1362b1	research/_raw/mock-B-rows-dark/tokens.json
100644 blob 8552c0b193541fdacd851f12b952ede87be2ad94	research/_raw/mock-B-rows/dom-outline.txt
100644 blob 61d5fe68716b3bdf4c50c3e3d016a9ee7a6c93db	research/_raw/mock-B-rows/metrics.json
100644 blob 196994629f2208850b5baca03a839aea247ef213	research/_raw/mock-B-rows/tokens.json
100644 blob c5f90812169a5775b44b60a23d68f7b38fc44764	research/_raw/mock-C-home-dark/dom-outline.txt
100644 blob b40d269c195e218838bedd7850f48ba7a36f3f7f	research/_raw/mock-C-home-dark/metrics.json
100644 blob 163c12c9bac2716169d74702ab632877abb5ae7a	research/_raw/mock-C-home-dark/tokens.json
100644 blob c3570dcf4a28cefec6acde2952791e0e88ddb63d	research/_raw/mock-C-home/dom-outline.txt
100644 blob 75706995af5a47c208fcd6803ed184589e928041	research/_raw/mock-C-home/metrics.json
100644 blob f04f42d1723b451d61380841e416ccab7eb97b3e	research/_raw/mock-C-home/tokens.json
100644 blob ee977d7b68e2cbf58e4319813681807623e9c14a	research/_raw/mock-C-i18n/dom-outline.txt
100644 blob 54e2a10c3a926fe4bff32d0677573713db02ff67	research/_raw/mock-C-i18n/metrics.json
100644 blob 6250477bfba04832052b01f2c25bcfff07002fab	research/_raw/mock-C-i18n/tokens.json
100644 blob 1bd069e7b87a7b6d8174bd38ebbe7dadf4ad7dea	research/_raw/mock-index-dark/dom-outline.txt
100644 blob 4ef2d4dd49dbcf518e94ebf6deb3f007321da020	research/_raw/mock-index-dark/metrics.json
100644 blob 9df475ad2ecd1ad0e011c46d5075e36ddf3e1592	research/_raw/mock-index-dark/tokens.json
100644 blob de0a5f3600d6d1a57c5fd7706963bc9012ffa8f4	research/_raw/mock-index/dom-outline.txt
100644 blob 601d732df684d0f905cc5539dcb27ed64344a3ca	research/_raw/mock-index/metrics.json
100644 blob 3b94d0b7e93f2761f7cda8fd5f1807e18e2e47b6	research/_raw/mock-index/tokens.json
100644 blob cd418c14afb5ac5a831a904974f8e0599187f696	research/_raw/notion.com/dom-outline.txt
100644 blob 2500d03e3f2aa8a6affd8eeafb8cd3575b50921f	research/_raw/notion.com/metrics.json
100644 blob f4fb066f96959532918e30a9b9824dfc41810bc6	research/_raw/notion.com/tokens.json
100644 blob ed8e50075a3b68cc2dd0ec124ad63517f14da626	research/_raw/openrouter.ai/dom-outline.txt
100644 blob da4355f385fcfddc56c2b0df2eeda67f658019a5	research/_raw/openrouter.ai/metrics.json
100644 blob bbe3d945f1c4cecfed2278fa519f2bac3fc2eab9	research/_raw/openrouter.ai/tokens.json
100644 blob 41cc8d1703381b057f3c9bcc3d704dc44b78e2e7	research/_raw/ours-A-dark/dom-outline.txt
100644 blob 98e17b8b3e43e8439419843993f0fbb1c866d016	research/_raw/ours-A-dark/metrics.json
100644 blob 8e7ba3dfffef48109e091fe45ebcb9723ca50208	research/_raw/ours-A-dark/tokens.json
100644 blob dbc2d574e624afb74a6fce482f46ab447df27da5	research/_raw/ours-A-light/dom-outline.txt
100644 blob fc2ae2d128d9d4e7090ee9c486be07c6268c506d	research/_raw/ours-A-light/metrics.json
100644 blob c85f2411867734c94186bd3bf8dfcd986f4e0364	research/_raw/ours-A-light/tokens.json
100644 blob c3c792666b2f6ea990623ad0c6e314732ff0af9f	research/_raw/ours-baseline/dom-outline.txt
100644 blob b57c2c1006d21df9cdaba3c489b6e15d24e256d7	research/_raw/ours-baseline/metrics.json
100644 blob a3f49df8c60994e98792f98565c5e33d5fa3b4e6	research/_raw/ours-baseline/tokens.json
100644 blob de663c734208f1eed4e7916eb1bc6e8d52ef2008	research/_raw/ours-baseline/verify-pre-fold.json
100644 blob e7342ee7e7bfbc52a37a883e71c9295ce2de0483	research/_raw/ours-baseline/verify.json
100644 blob b6d2c3a53e901db5e7734345c2e026c3ebff0366	research/_raw/ours-rows/dom-outline.txt
100644 blob fa2e271f71d6ca0375de3e953989b41e50cc9493	research/_raw/ours-rows/metrics.json
100644 blob 3ed3c54436e01cec931d71f431be82da4f58db77	research/_raw/ours-rows/tokens.json
100644 blob ae48b7814df718a38038d9634a520bfa821e1c4d	research/_raw/possible-deal-plan-links.json
100644 blob 676df45fb1edf34fa9fd7435dd7211863ff537fa	research/_raw/raycast.com/dom-outline.txt
100644 blob a2de786ba1063bc11f550fdc0a945c9fa4a8f85c	research/_raw/raycast.com/metrics.json
100644 blob 4bcaa0b9bd24cc102c8b2e5803431213b1feb0ac	research/_raw/raycast.com/tokens.json
100644 blob bb5a9c7952a648b4192d7d8eb527b8253b8fd7d5	research/_raw/stripe.com/dom-outline.txt
100644 blob 1c74f8f8df09a79b1885a409ec63a2d80cfb3f51	research/_raw/stripe.com/metrics.json
100644 blob faed25a37ab29c7018b5a53d3ea3a8e7ec19a0dd	research/_raw/stripe.com/tokens.json
100644 blob 8469d07cfbd8d2abffe03890da3bbc4ed30b9d5f	research/_raw/superhuman.com/dom-outline.txt
100644 blob da8d3247d9f9fea8195a357c7de7ecaccbbf52e8	research/_raw/superhuman.com/metrics.json
100644 blob 0b65cf53dc7316ac041866164319c27583ab052f	research/_raw/superhuman.com/tokens.json
100644 blob 630a3989ffe5eef1afc32d54b7f92ab978afaae7	research/_raw/thebrowser.company/dom-outline.txt
100644 blob a87abf18e2d8b2d8e671126c93470732f7e40bfa	research/_raw/thebrowser.company/metrics.json
100644 blob a5badd9be946b985b2bc41edc6cbfa3f6535dcdb	research/_raw/thebrowser.company/tokens.json
100644 blob 0550442c66897785c4619fc01a5c7e2d8497436e	research/_raw/theresanaiforthat.com/dom-outline.txt
100644 blob f5cca4b4bd3249220cc225988462c45d749286a2	research/_raw/theresanaiforthat.com/metrics.json
100644 blob 432d6f8b95fc14148aa065ce537b8c9e4787efc3	research/_raw/theresanaiforthat.com/tokens.json
100644 blob c5319e07b0475f3d592d2c3de3a3c40e4d0a6270	research/_raw/toolify.ai/dom-outline.txt
100644 blob c38339203f9c01dad0d217708a1c4ce704099adf	research/_raw/toolify.ai/metrics.json
100644 blob 40b23b90eb4f0cc68200a24eae98aabc6425ad21	research/_raw/toolify.ai/tokens.json
100644 blob c6b925ed3f4a1c5b32c74f7cb8be9925120f6dd6	research/_raw/v3.0-antigaming.js
100644 blob 247b15bc58f638e4f460b898d1bedbdcfcbb2825	research/_raw/v3.0-gate/t12-verify.json
100644 blob fff063a226bf797d686b42176978d8762a2ff846	research/_raw/v3.0-gate/t12-verify2.json
100644 blob d2645ba15b0e9dcf83e5e1a8c8fafbbe6cd69b48	research/_raw/v3.0-gate/t12-verify3.json
100644 blob 73486c68b576c1f7ff46688b4e98c25718fbdda4	research/_raw/v3.0-gate/t12-verify4.json
100644 blob c46aa627a5ac67ea6c46f3c0931134db44147e1a	research/_raw/v3.0-gate/t12-verify5.json
100644 blob a04896058fa7722388bc24bb6f2df1f7c8cbe6dd	research/_raw/v3.0-sources/README.md
100644 blob 18542dbec0be1f0080ed6014c744d51e618fd675	research/_raw/v3.0-sources/adopted.backup.json
100644 blob 5b218b8d0eb13362be452be02a49bbc614d1b12e	research/_raw/v3.0-sources/build-candidates.js
100644 blob 87e68e2d996a0ee9b3ec7d0f895cfdfc0d485c05	research/_raw/v3.0-sources/candidates.backup.json
100644 blob 2577c640fe9fd56923bbdf8027ea7c0f3b0a2dde	research/_raw/v3.0-sources/index.json
100644 blob 387d799193904cfb47fcd25c91dd9bf99ba1eb28	research/_raw/v3.0-sources/probe.js
100644 blob a434145fe6fcde39cf6d1c0053c31e8419f8198a	research/_raw/v3.0-sources/validate-candidates.js
100644 blob 2948bada0570b742abce1264b9aca865e9cb1751	research/_raw/v3.0-teeth-run.js
100644 blob 5a2fd3ade0decae8b2ec034f9b7f972444258ff4	research/_raw/v3.0-teeth-run.txt
100644 blob f9b62267b31bfa2ac677d5fe99378bd815570302	research/_raw/vercel.com/dom-outline.txt
100644 blob 27cd80f36c67274c5e6e8da1edab5ac92e372f20	research/_raw/vercel.com/metrics.json
100644 blob 7ec490065cee5addca79e531099ede827e12fdfc	research/_raw/vercel.com/tokens.json
100644 blob 6893665ff32e50b5952e47076804c00ad52a1810	research/benchmark/framer.com.md
100644 blob 242634ca6a6241f49d6111cd62c6136dbe6c29b8	research/benchmark/linear.app.md
100644 blob c0db92b8a94ff1f188621369c55c3365424ab57b	research/benchmark/notion.com.md
100644 blob dd8e183a1945a9f8789da174182e7c5dbce43874	research/benchmark/raycast.com.md
100644 blob 2e340a6da9c4b3ea58bb8cad6b8547760810b6c7	research/benchmark/stripe.com.md
100644 blob 3692d6a0c9ad04e52ae447a2eebe2eedf0a3a289	research/benchmark/superhuman.com.md
100644 blob 5f1d883f10772e52dca7220c650b9be570fefc92	research/benchmark/thebrowser.company.md
100644 blob a7ec2e93472349edd28395e7fb4df2eb0ebb57e5	research/benchmark/vercel.com.md
100644 blob 9d7a9de9a339923bb029dfaa1a0c2b68ea9992b5	research/v1.0-public-readiness-report.md
100644 blob 5e870effb1b8f24131c77a5ebef1a6e44e1fc2f8	research/v1.1-closure-report.md
100644 blob 5ff1ce26369a78818c755d6eb3e11b4e53b76f5d	research/v1.1-student-developer-model-report.md
100644 blob 97afe81a07d295ac294fb330b72507a78759b014	research/v1.1/DATA-BACKFILL.md
100644 blob dd9c7ed7b23ba35b2c8a307b1fd89d5cd2203a1d	research/v1.1/REQUIREMENTS.md
100644 blob 27462565fcf3768ce7a6324162002af243d9b279	research/v1.1/VERIFICATION.md
100644 blob cbcb2a7dcce819c620d1966e32fd03dc4f916c6f	research/v1.2-intent-first-home-report.md
100644 blob dfe90962514fb6069c1e3fdc69e96a2502c6647f	research/v1.3-evidence-provenance-report.md
100644 blob 8b0deb0dfb6fe836dea680e3df98b748158e06c9	research/v1.4-deal-history-report.md
100644 blob 6e972ea34cee3084179230767cc177477ca16c96	research/v1.5-change-radar-report.md
100644 blob fa9de8a43f7eda4fe7f822a9523e2c4185ed42f8	research/v1.6-subscription-report.md
100644 blob 2c3df1cfb2c63b1d4c5cab3a6d7a33764b53b2f6	research/v1.7-seo-expansion-report.md
100644 blob 514e5a2cc2f1f7dc90c51515ff30d45073f73ddb	research/v2.0-ai-assisted-maintenance-report.md
100644 blob d714989c161550358fb8dd44b0161ac53afc762a	research/v2.0-ai-eval.json
100644 blob 0e1371ebda0ae824d45b79043b6a7e792e6f84be	research/v2.0-maintenance-cost-audit.md
100644 blob df1e4973f387e8b80895a033e0edcf8bcfe71495	research/v2.1-coding-plan-data-model-report.md
100644 blob 205e568dcd36eea7ff225acdeaf686b4d53a238d	research/v2.2-coding-plan-compare-report.md
100644 blob a4ec769a8f44701925ef0e33a5da90d59b810d4d	research/v2.3-plan-history-report.md
100644 blob beea5babed3ff139098c20892accc2790e7e0461	research/v2.4-deals-plans-linking-report.md
100644 blob 18542dbec0be1f0080ed6014c744d51e618fd675	research/v3.0-adopted-candidates.json
100644 blob 017b312c544422cda404dfceb6a2e6b02200f309	research/v3.0-adopted-candidates.md
100644 blob 5dca9b73077f86482cc1633b6297758092df59ec	research/v3.0-ai-deals-knowledge-base-report.md
100644 blob e246ab4237030ae7c17e6e6702ab5dfe0e5f0101	research/v3.0-file-manifest.md
100644 blob 87e68e2d996a0ee9b3ec7d0f895cfdfc0d485c05	research/v3.0-source-candidates.json
100644 blob 98ec6b850410bdf8555d9a6332ad8dc04046016d	research/v3.0-source-candidates.md
100644 blob 56b6dad93bbec7362e49c50210cd237364abbe60	research/vertical/ai-bot.cn.md
100644 blob 97565d4cdc54346a87da47bcc161d7f31e7c31d7	research/vertical/aitools.fyi.md
100644 blob 4fb59afcbf11b56776b0c5d561b916a9b95fe8d3	research/vertical/appsumo.com.md
100644 blob 9a824f3dfe694a7c94334f1847748741fb5f58a3	research/vertical/artificialanalysis.ai.md
100644 blob 2c66b8c0dc21e32e197ff154361fb6f0a742bf0f	research/vertical/devtk.ai.md
100644 blob 2f44e59a1184ecb88b139fc7ef981d3af07b6999	research/vertical/free-for-dev.md
100644 blob 645220723eef4f85dbbe1487bdc9566eb949e347	research/vertical/futurepedia.io.md
100644 blob 5d34f833b221e11fc47481fea939264601fe4376	research/vertical/futuretools.io.md
100644 blob bb54e48f77d05576927528fed9e41e6d520e96fa	research/vertical/llm-prices.com.md
100644 blob fd11b3dd361c269af03f95b206049d88f7b2dcfd	research/vertical/openrouter.ai.md
100644 blob 90207ef8ed250566e371fea8cae027f3dfab28a9	research/vertical/theresanaiforthat.com.md
100644 blob f805a76a616b632f7c823aa9e5e2725bb8023125	research/vertical/toolify.ai.md
100644 blob f0a5b4ba734002a48d13c3ad7af6ff6f53df0f8b	robots.txt
100644 blob f0aed1887cebff9f15e9742643a6a137bb4404a2	scripts/ai/audit.js
100644 blob c693d6627f9cec061bd9867163e95516e997062a	scripts/ai/cache.js
100644 blob e10043641fb64fb79b7f26f82cfa2d8e50d192ec	scripts/ai/candidates.js
100644 blob 382fd72b6ca30975f5e28152b24802654772d387	scripts/ai/dedup.js
100644 blob 1d55ec9465909f212ee9e0856687f2202ad9094a	scripts/ai/diagnose.js
100644 blob f94e572226e0a6dd16bb4b6799eb2055855ecdc0	scripts/ai/extract.js
100644 blob adb79c64a87b451bb3528ec7e36d46f7c0ea7d7a	scripts/ai/json-schema.js
100644 blob 6e44fa442bd9efc15787822ad34dfbfcec67f4cf	scripts/ai/maintenance.js
100644 blob 5ad9e2daa6bd7a77d4c15eaa19b16b255d4058d7	scripts/ai/patch.js
100644 blob 4d8319096ca4fe4888ba7633ffd7b3dd09ae1c2f	scripts/ai/pricing.js
100644 blob cb3c36affceca2cee335e9cdb7acca57ff9a6c4f	scripts/ai/provider.js
100644 blob 2422a314fcca153bd6eceae5e0f31c2e47c8908d	scripts/ai/providers/anthropic.js
100644 blob 33036d262b8d8642f10fcc0cacd770649f52d93a	scripts/ai/providers/fail.js
100644 blob 3174506a2d9cb40cf54f44446e5110c55d7c3756	scripts/ai/providers/mock.js
100644 blob 86b7a57005cd500ed1a2c1a94afde11175a2d0ab	scripts/ai/providers/openai-compat.js
100644 blob f4ea8e91cf1e47a11a77186012451e9f9dca64a5	scripts/ai/redact.js
100644 blob 77f95086a2b9e74cc3e6ab1ba3110507ea1f83e9	scripts/ai/schemas.js
100644 blob 4d665bda278e78edfce3de54e815ae2b692b71eb	scripts/ai/translate-guard.js
100644 blob aaa98c6b303cf0b95efea6451d20806e78971d80	scripts/ai/translate.js
100644 blob 60bd5e8592d85d9d1d4782a1d5b3ccba738c38fa	scripts/ai/usage.js
100644 blob eb2db2cf565af1492f733d5f7ee697d1e2d9c503	scripts/collect.js
100644 blob 0d23e47366227bda805d8797edddd74fb973b3d4	scripts/collectors/cn_docs.js
100644 blob 213747b99d58b285b65853b8a826775e0fd01fff	scripts/collectors/global_deals.js
100644 blob 0c405084658dd8d4580a21a9f80b4b5f4b7e26be	scripts/collectors/global_directories.js
100644 blob eda77335ac880300810af8376e8ced75467e048f	scripts/collectors/headless.js
100644 blob f5d750ab66ec75e016f2f7bf9d2e6f0c9ab6870d	scripts/collectors/index.js
100644 blob 7a3f6aaf4c462235b7fb366475823c541272601d	scripts/data/ai-eval/dedup.golden.json
100644 blob 63f9e6ae85ed1c46b854e7aeede8c591bf427e63	scripts/data/ai-eval/dedup.mocks.json
100644 blob f7c54ae5d6a317a95d2b434ed71fe413414525ea	scripts/data/ai-eval/extraction.golden.json
100644 blob cdb5fdc9be264a462ebd005e4b489c42b245d64f	scripts/data/ai-eval/extraction.mocks.json
100644 blob 637ac6eee6743670817e1c14ac73f16085ce4f34	scripts/data/ai-eval/translation.golden.json
100644 blob c75761c7e1b74d5c1d6521f0b612d545bc3c7799	scripts/data/ai-eval/translation.mutations.json
100644 blob 61136959c855499fafe62d7db34831d217341fd5	scripts/data/ai-pricing.json
100644 blob 1341c6d7475f99fc2a04b846e85c698dadc5aa12	scripts/data/aliases.json
100644 blob 85f1899ae7e1405f6c2ad1be8f5e5a6b652e4284	scripts/data/api-plan-history.json
100644 blob 61e3b8cdf730c1520bc67717bb568ae27bb23826	scripts/data/audience-overrides.json
100644 blob d977f9d81e6c4c63a31373c805ce5fc6b648ab1a	scripts/data/backfill-cards.js
100644 blob d810e33b22f8d4b6833a138cad341787dfd1449e	scripts/data/category-slugs.json
100644 blob 8ad516a25772328b20fabe9b493d1a8968626168	scripts/data/curated_api_plans.json
100644 blob fea0ddf4872690b965ff905c15582b38476ca7be	scripts/data/curated_cn.json
100644 blob 536a3f7ec318c266efc4e92aa76034e3440f8da3	scripts/data/curated_global.json
100644 blob 8c3937b29ca173cfefee36a53f98eefe0be8b54b	scripts/data/curated_plans.json
100644 blob 49e2dd24186e8c37ef2387cc6d66ba37c623b2ba	scripts/data/deal-history.json
100644 blob f611e6d459da4e3213582d7021a47cf9d1e092a7	scripts/data/deal-plan-links.json
100644 blob cca659f8602e86513aa398e2886bd57ceafad005	scripts/data/fixtures/cn_qianfan.deals/PROVENANCE.md
100644 blob f4be214054cdd735c9fbc792183b3c10327c1965	scripts/data/fixtures/cn_qianfan.deals/expected.json
100644 blob 1de08243f9e7388142650d2341baaaa7b7d3368e	scripts/data/fixtures/cn_qianfan.deals/page.min.html
100644 blob 4488c36b70967329c24dab0ea0832cf7ba4e6297	scripts/data/fixtures/futurepedia.list/PROVENANCE.md
100644 blob 61c2d64793248a824a0f1b457c91e80bc56f3f3f	scripts/data/fixtures/futurepedia.list/expected.json
100644 blob a957f4b6710af70d3aad6c84ece3c9fa925736a8	scripts/data/fixtures/futurepedia.list/page.min.html
100644 blob f2b340d32b3df3483ede4d2c96f98b58348a2b58	scripts/data/fixtures/futuretools.list/PROVENANCE.md
100644 blob f36f708a6719bb42259c796337b96afce98fe14d	scripts/data/fixtures/futuretools.list/expected.json
100644 blob bb46da4619f8f65220b717498e6d96b6089ee18d	scripts/data/fixtures/futuretools.list/page.min.html
100644 blob a1afa906c57c799baab10bf2c8a1411bfda94319	scripts/data/fixtures/layer3labs.deals/PROVENANCE.md
100644 blob 0e69286cc056845a3d36109b6c6434bd7e4d41bc	scripts/data/fixtures/layer3labs.deals/expected.json
100644 blob 473d943934e8244639206be280ea7314b5e8a6ed	scripts/data/fixtures/layer3labs.deals/page.min.html
100644 blob 7378f44ee2878a613cdff19b9dcf4f0b7c7e44a3	scripts/data/fixtures/migrate-audience-after.json
100644 blob 3b6ab9aac7ac0cf2d0761bf1e66a0d8dcc4b3560	scripts/data/fixtures/migrate-audience-before.json
100644 blob 9cf21074f0098ea12b050499890b33d0fc456758	scripts/data/landing-aliases.json
100644 blob 3d17cfa54b255e6e53a25f223738e1157f2d2661	scripts/data/landing-pages.json
100644 blob 9b335889c85de3e88de5315f49efe5a5b9bbd811	scripts/data/model-registry-gaps.json
100644 blob c17edd445c876a5705e91c2c7226540a83161edb	scripts/data/model-registry-links.json
100644 blob 63504c39c5c8a7b854120c35a407826a9408f30f	scripts/data/models.json
100644 blob cad21b7b2507d0720246df6814b95ccee3da343a	scripts/data/official_urls.json
100644 blob bcd34557aa92c20912e34a46f1471491a305566b	scripts/data/plan-history.json
100644 blob e1d01b2c351c9b5886721f47eaa992e37073d628	scripts/data/providers.json
100644 blob dc40bf1c37caa5ec6ebd344fc62fc1163cfe5fb3	scripts/data/source-health.json
100644 blob 1ab8de9b7dbca7fd8b1a953c13faba59736e0160	scripts/data/source-probes.json
100644 blob 3ce68d7259de3fb1d1575c3f51865380e11f81c0	scripts/data/source-snapshots.json
100644 blob e36dc0edb23fd983feb6cd45bf1a8d8eccb04c3a	scripts/data/translations_zh.candidates.json
100644 blob 0c8f0611c6a5e8190c135351e013d06bc5041a9a	scripts/data/translations_zh.json
100644 blob 598ecd514b98dabd9558bf5815de130536fc01b4	scripts/data/vendor-slugs.json
100644 blob 406c7c4fd755827c55a2cca02581ce3c38bb2f0b	scripts/data/zh-pending.json
100644 blob ef525ff61f77d68bfa54e1ceca035e72cf03661b	scripts/lib/api-plan-history.js
100644 blob 51043b95758be1d4b7a06797a74c34df253be905	scripts/lib/api-plan-schema.js
100644 blob 4b27fba0c9048fe26304ddf1d6e0f6806d8edb56	scripts/lib/api-plans-page.js
100644 blob 94ef75a4b0dd397cdf13bef2bef15967d76434f8	scripts/lib/archive.js
100644 blob 930d57f26848b92a955b88f4aa16e87839bf666a	scripts/lib/audience-audit.js
100644 blob 18cdd6b8419c3b6b8e6938e2a8ba2c04e410916a	scripts/lib/audience-overrides.js
100644 blob ce2e5b1b4262ac4c3d946575aaf59d00129a0f55	scripts/lib/audience.js
100644 blob 77e129cd2dec9554e519652e7ee2be3fe439049f	scripts/lib/browser.js
100644 blob dc15c9e5f74fb49795c0dd3fe3b76292c3cf6c1c	scripts/lib/categories.js
100644 blob 0ce483489b479b6f0181c9799a5b34bcc722cdd4	scripts/lib/changes.js
100644 blob ee20bbbb52832c9d61fbe37cc72b9893d3f166b1	scripts/lib/classify.js
100644 blob cc1b516666b6567a0e5cb4402d693d20b203efe5	scripts/lib/curated.js
100644 blob ad5ce2dade4c063200f88e7370b063925177a82e	scripts/lib/data-docs.js
100644 blob 771c92d2db9a2cca536596327be9411b0e8e4910	scripts/lib/deal-plan-links.js
100644 blob caf9d07925a99cf3df03738d0ab0ddd9dc6ce0f7	scripts/lib/dedup.js
100644 blob ef60dab992f73cc55fa05b0f696c508fa6519246	scripts/lib/dom-digest.js
100644 blob 1824c7b466d1f8da12584f9fc661d4744e939e56	scripts/lib/expiry.js
100644 blob 5e45ae471d33e182781393934aee5b2764658681	scripts/lib/feeds.js
100644 blob c2c271c1fa152978a4f60f50030153575b6a4713	scripts/lib/health.js
100644 blob 4c30371be620d75f2b8020fe8393b12ba04ac200	scripts/lib/history-core.js
100644 blob f43fb3becd35657fb04f520d8d60e8672628db0f	scripts/lib/history.js
100644 blob ba7702ed1a8f83e3d7ec4e8d529205d4e952795c	scripts/lib/http.js
100644 blob b585e14c633f39a5e5a2c422e52bbb3cacfdbbfc	scripts/lib/landing.js
100644 blob a908d4e19af501c76dca5eb1da1b3d8d15a7a697	scripts/lib/logos.js
100644 blob 3803e0b60e0ff021353357b39ad3719ede6ff449	scripts/lib/migrate-audience.js
100644 blob eb905d79e054a6f468f69456dc3c274096a2c26c	scripts/lib/model-registry.js
100644 blob 1b6895d59476cd8b5bef2283ec398ac839eda5cb	scripts/lib/models-page.js
100644 blob 97c4b06181c8d5852b438169c99bb2cdc646f5f9	scripts/lib/official.js
100644 blob a035757d7615d25a898825e18bfb6b6440543dce	scripts/lib/og-image.js
100644 blob fdc7a408229a3532e135fa827f46f425cfd1d7f4	scripts/lib/page-kinds.js
100644 blob 16bbc4576575a7765d54d762b20c7acd9c236ac5	scripts/lib/plan-changes.js
100644 blob 91222af2d4018ae0e2830a3ec1a222014aa5b2f9	scripts/lib/plan-history.js
100644 blob bfb7aaa8347f18ab193353d15cf887dd6f85b889	scripts/lib/plan-schema.js
100644 blob 045e910b85b887754c304e6eac8e141845378b0c	scripts/lib/plans-compare.js
100644 blob 852645ede059f792060d3d02400d086e6bbeec46	scripts/lib/plans-hub-page.js
100644 blob 2b5c389c9e018faf6ea118343cea1ed1ab837830	scripts/lib/plans-page.js
100644 blob 7a9590557a3d8ba8fc3ba52b753416867764761a	scripts/lib/provenance.js
100644 blob 702e85d737cc338d55654aee12dfbc2f3a18c659	scripts/lib/providers.js
100644 blob f5433991c30da3ab599d5192467038fc85b78d57	scripts/lib/render-core.js
100644 blob 0ee836b3fa20eaeba81125606ed3004e5300153b	scripts/lib/report.js
100644 blob c425c7145976a23e774eee289defa561f0e78df5	scripts/lib/schema.js
100644 blob 3da7873af52b7a133bdbc127c7c95a9a12675d21	scripts/lib/secret-scan.js
100644 blob c9916a09deb5180f98264936ba1861c2c0cc7c9f	scripts/lib/seo.js
100644 blob 423585156146cfa06ccc1d2748ba2b21d14e23e8	scripts/lib/store.js
100644 blob 1f87f30238d2e2ee744e4ee0a472b0739679569f	scripts/lib/vendor-page.js
100644 blob 03849228b1c620f2cd59a87646ef71818926d6fa	scripts/lib/zh.js
100644 blob 7bcda5953ed0cb732a841c7acdbf98b8b6419b05	scripts/migrate.js
100644 blob 623b333637bdc5211f54ad52938b0dcc87bc7d37	scripts/serve.js
100644 blob 3b0e109c03a2f5fb8b65a7577a0ae7288ae03996	scripts/tools/ai-accept.js
100644 blob 1c3b0884bd36e39ee4c57539f90f598fe2725cfc	scripts/tools/ai-apply.js
100644 blob 979111fc30969fecaa9dafb4c3a297e2dd28a579	scripts/tools/ai-eval.js
100644 blob dae04f7425d0ed6128e72365cedb09a3c1399cdc	scripts/tools/ai-review.js
100644 blob 4f74205b537f6aa5ad9965db50642666a439b8db	scripts/tools/ai-selftest.js
100644 blob 64da040471db24649c496b41b2a09944be52418c	scripts/tools/ai-usage.js
100644 blob 630ed65fb224fbf8cfe394fd731839bcb7d47bb1	scripts/tools/api-model-rename-report.js
100644 blob 93d8409045524f4188083b180966a96fda37d445	scripts/tools/api-plan-history-baseline.js
100644 blob b2240c7e77d7203533bc3fadb5759444014d266e	scripts/tools/api-plans-selftest.js
100644 blob 17174148d1ab10cabd8075c9c362f3c7259af436	scripts/tools/app-token-selftest.js
100644 blob 4d6a0c5e24b7d7d71730b8f6b2a44a4c27355838	scripts/tools/app-token.js
100644 blob 515df3057064f70190f7cf0c3a112e2d3e6100e6	scripts/tools/archive-selftest.js
100644 blob feb9f1747a69d069f2dde6fda124957c9126acde	scripts/tools/audience-backfill.js
100644 blob 991e2b18c638ed921c42ac7fa873862e01f3e78c	scripts/tools/audience-overrides-extract.js
100644 blob 70019cd493fb77656f0db40f04c2843a42197f0f	scripts/tools/audience-rebuild.js
100644 blob 6cbee92e7b2b1cc66d1fdf6bb0034b70831b937d	scripts/tools/audience-report.js
100644 blob 5337de589e0b4a28950b0192a58eeb51e1a0f194	scripts/tools/audience-restore-history.js
100644 blob 6421f402b65a70099e8d81b218528f97a1d5cb2a	scripts/tools/audience-selftest.js
100644 blob b8cc587d6b4a2cfd64f1853b1d9ac3e20b85e0ca	scripts/tools/build-fixtures.js
100644 blob 3e3d1cb437c66e8335831b237da3125dc3c69b5d	scripts/tools/build-local.js
100644 blob 1984f84797d6b836a5d2cbc8bfcc564c941fc88a	scripts/tools/changes-report.js
100644 blob 6c24be8a6ca2925b75645456d5fbdc8946737d0f	scripts/tools/changes-selftest.js
100644 blob 748a15a1d89c0cc312421d3d7f92fb43de5a55b9	scripts/tools/check-api-plan-history.js
100644 blob 959c7fbac6432a88a7fd67cd924071544b913c6a	scripts/tools/check-api-plans-reproducible.js
100644 blob 8d98f59a1dc1dadc140c175f01255cfb724ad065	scripts/tools/check-ci-consistency.js
100644 blob 8d517a3b447b0d056bb38d4336e28ba6b6aedc5e	scripts/tools/check-feeds-reproducible.js
100644 blob 0b5567759a095b409959ae23929ba3e0df5d1f5b	scripts/tools/check-mobile-chrome.js
100644 blob 1996f7235ab8aba31589843467da7dc2680cfbd5	scripts/tools/check-model-registry-links.js
100644 blob d5dac3d669114ee8e15d2d9525ed0b8baacf47d0	scripts/tools/check-models-reproducible.js
100644 blob 2343e9f7da7cf0c17c8e1534ca54af6da4ce5f9f	scripts/tools/check-plan-history.js
100644 blob ee79ee8b267ceffe144203246355587f5b7025ab	scripts/tools/check-plans-reproducible.js
100644 blob a8f71ec20e02c67c4cf2bb6dc68a87a4264a5f98	scripts/tools/check-reproducible.js
100644 blob 76e6b00874ecef8a611cd563631c14045b0e3fda	scripts/tools/coverage-report.js
100644 blob 6cfc350d49848d1d7f875265466bd2ce58b525e1	scripts/tools/data-docs-selftest.js
100644 blob e9888000102cc0adc9799138a6b186f686d87bb2	scripts/tools/deal-plan-link-candidates.js
100644 blob c92c4f4a753955b33248b919f32fcc62cc770dd5	scripts/tools/deal-plan-links-selftest.js
100644 blob 4bd8170f9beeca79cc748554771d315f3d063866	scripts/tools/expiry-selftest.js
100644 blob 480dbf6085c73ece48b71d600d5ea41cdbb6e6b5	scripts/tools/feeds-report.js
100644 blob 54c26e84c4e49cca013a4b320df345b930d21d26	scripts/tools/feeds-selftest.js
100644 blob ee2f32f0f26c755259f1cbbd617be4b9a038680e	scripts/tools/fetch-logos.js
100644 blob 8849c51c36b13328fcd80ab7bc66d9cf67aad587	scripts/tools/find-offers.js
100644 blob 4b915741fa67a3666abe51e25124b10ae326731a	scripts/tools/fixture-test.js
100644 blob d7e8a3d69ec245bea0205e684bb6aad752f638ce	scripts/tools/health-selftest.js
100644 blob 08ca713ebc96dd20aa07e56b5e3ff6f5c3df9620	scripts/tools/history-audit.js
100644 blob 47a285e8f182e81b0aa738549100253a7d7851f4	scripts/tools/history-baseline.js
100644 blob ae69b1097b5005e01ce06bdc7e8155f22efd4c98	scripts/tools/history-selftest.js
100644 blob ce894bda67dc5210b36fd119fe1f277c97316f7f	scripts/tools/history-verify.js
100644 blob 40d29fe1b3128722a7e0a68f867f6ac092101147	scripts/tools/inspect-source.js
100644 blob c5694149731926fa391516ae9092ac98e567a521	scripts/tools/migrate-audience-verify.js
100644 blob f659fb657be0de18a8b49f8a5d60ddddfef147c0	scripts/tools/models-page-selftest.js
100644 blob 7a4438744a3f2b62fb134a9b088a968fd2b71c07	scripts/tools/models-selftest.js
100644 blob 5e80361d0587e54eeb16cff0f64e73ec7b27a182	scripts/tools/plan-changes-report.js
100644 blob 1dad5e4af9bd3d6a2df2b13367d8c3a815902b5e	scripts/tools/plan-history-baseline.js
100644 blob 604c5fd1c33686f35581800021d23d0e374d8132	scripts/tools/plan-history-selftest.js
100644 blob 8efc57a992c700d6dc53c4a6196646039e3233fe	scripts/tools/plans-selftest.js
100644 blob 3c64ac22142a2a5ed2db782e3cfceffc70a927cf	scripts/tools/planshub-selftest.js
100644 blob d492194bede089a6f87d36d18a2d72f98fa44717	scripts/tools/probe-offers.js
100644 blob d80f3435f835aeac995e6f7a1728140f2bef7aad	scripts/tools/provenance-selftest.js
100644 blob 19835dacb55c2498775a89ed13b4ec63f1b4c68c	scripts/tools/rebuild-api-plans.js
100644 blob df206147cbbf1fbd67be08a718455bb381ced42d	scripts/tools/rebuild-deals.js
100644 blob ac95997002e62f044d5ee53236880ac3eafeaecb	scripts/tools/rebuild-models.js
100644 blob 840e474e800a1e348eea220a23bb95f1a7e86e37	scripts/tools/rebuild-plans.js
100644 blob 58d60a07db9885e9bbd7f3a514352b2f5f836b9e	scripts/tools/render-source.js
100644 blob 2b4a115cc3daccfb25d5191f2927396584bb02a8	scripts/tools/restore-from-git.js
100644 blob b700bc03602118338cd3dad0c91daf40d36b45df	scripts/tools/rows-by-link.js
100644 blob 229110bc10949b17ee5a25de2b8a317a258eebda	scripts/tools/seo-report.js
100644 blob 557c4ed17f07d202f41c85963e19b3323fbe4ebb	scripts/tools/seo-selftest.js
100644 blob c3bce9b04a42cf17146c977a357fb43b5807a75c	scripts/tools/seo-verify.js
100644 blob e87e4a6d38e8a5dcd8a4ae1b7e16f49798c7bc75	scripts/tools/study-site.js
100644 blob 1f7f9e70e50344b12b1c7ec086d3f229234f20a1	scripts/tools/term-count.js
100644 blob 491300d17945c60c9af51a59b0dfaa45b988479e	scripts/tools/text-selftest.js
100644 blob 7fb46b6bfa9b307333e24eebc0ec3601be17e6f3	scripts/tools/tier-report.js
100644 blob c68ea940310ed766137a885481e63084c8f696fd	scripts/tools/vendor-page-selftest.js
100644 blob 694093820dd736fefa3bf3305e9e5310e0c2486f	scripts/tools/verify-site.js
100644 blob 19abbd2962add373250a7d1fa10dd14171b721aa	scripts/tools/yaml-recheck.py
100644 blob 649bf778910802546ece28222fc1c5a688eae044	scripts/tools/zh-apply-candidates.js
100644 blob 3286a02ad360601b33fd94bf6d7f6541df4a6e59	scripts/tools/zh-selftest.js
100644 blob 1e60d3589fa67c478fdae51d6876c187203b7033	scripts/tools/zh-todo.js
100644 blob bd5852b99f7dffddb22589df36aec3ab656c5258	scripts/validate.js
```

> 复核命令：`git ls-tree -r HEAD | wc -l` → `503`；本文清单与命令输出逐行一致（生成方式：命令输出直接注入，未人工转写）。

---

## 6. 公共事实基线

### 6.1 [本轮实测] `origin/master` 相对审计基准 commit 仅 6 文件差异

命令：`git diff --stat 1c024db6029feb6ecaf9ddfb32d88e51bf08fee2..origin/master`

```
 deals.json                         | 430 ++++++++++++++++++-------------------
 index.html                         |   7 +-
 scripts/data/source-health.json    |  56 ++---
 scripts/data/source-snapshots.json | 362 +++++++++++++++----------------
 scripts/data/zh-pending.json       |   2 +-
 scripts/tools/verify-site.js       |  37 +++-
 6 files changed, 467 insertions(+), 427 deletions(-)
```

逐文件 `--numstat`（插入/删除）：

| 文件 | + | − | 变更来源（`git log --oneline 1c024db..origin/master -- <file>`） |
|---|---|---|---|
| `deals.json` | 215 | 215 | `ebb2303` / `9cfeaeb` 两条采集提交（`chore(data): 更新优惠数据、来源健康与变更记录 … [skip ci]`） |
| `index.html` | 6 | 1 | `13b11a7` `feat(footer): 页脚加入 GitHub 仓库入口` |
| `scripts/tools/verify-site.js` | 36 | 1 | 同上 `13b11a7`（**注意：不是**数据提交改的；审计对门禁脚本的结论需按本文件重核） |
| `scripts/data/source-health.json` | 28 | 28 | `ebb2303` / `9cfeaeb` 采集提交 |
| `scripts/data/source-snapshots.json` | 181 | 181 | `ebb2303` / `9cfeaeb` 采集提交 |
| `scripts/data/zh-pending.json` | 1 | 1 | `ebb2303` / `9cfeaeb` 采集提交 |

基准点之后的提交共 **4** 条（`git log --oneline 1c024db…..origin/master`）：`9cfeaeb`（10-03 01:36 数据）、`ebb2303`（10-03 11:59 数据）、`13b11a7`（页脚，＝主工作区当前 HEAD）、`21cf66d`（Merge PR #31，＝`origin/master`）。

`1c024db…` 是 `origin/master` 的祖先（`git merge-base --is-ancestor` exit 0），即审计基准之后是**线性新增**的 6 文件改动，没有回退/重写。

**`deals.json` 差异的真实构成（本轮结构化比对，重要）**：`git show 1c024db:deals.json` 与 `git show HEAD:deals.json` 各解析为 JSON 后逐字段比对 ——

| 项 | 结果 |
|---|---|
| 记录数 | 134 → 134（`count` 一致） |
| 新增 / 删除 deal id | **0 / 0**（id 集合逐字相同） |
| 有字段变化的记录 | **127** 条 |
| 变化字段直方图 | `{"lastSeen": 127}` —— **只有 `lastSeen` 一个字段**（`2026-10-02` → `2026-10-03`） |
| 顶层 `updatedAt` | `2026-10-02T12:14:02+08:00` → `2026-10-03T11:56:44+08:00` |

⇒ 审计期关于 `deals.json` 的**内容类**结论（134 条 identity、字段值、`needs`/`audience` 判定等）在本基线上**仍然成立**；唯一系统性差异是 `lastSeen` 日期前移一天与 `updatedAt`。凡涉及「最近 7 天确认率」等与 `lastSeen`/时间窗相关的 finding，必须**重新计算**（不得沿用审计数字）。

### 6.1b [本轮实测] 另两个非采集文件差异的语义（供下游做「存在性检查」）

| 文件 | 差异实质（本轮读 diff 确认） |
|---|---|
| `index.html` | 页脚「数据源状态」那一行末尾**同排追加**一枚绝对 URL 的 `GitHub 仓库` 链接（`target="_blank" rel="noopener noreferrer"`）；**未新增页脚行** |
| `scripts/tools/verify-site.js` | 新增 `sharedFooterExternalHrefs`：从**产物首页的共享页脚片段**里现取站外链接白名单，并新增 `outboundCount` / `outboundHrefs`；枢纽页断言由 `data.officialCount === 0` 改为 `data.outboundCount === 0`（报文附带「另有 N 条本项目仓库入口，不计」）。`--url=` 线上冒烟读不到 `dist` 时白名单为空集（回到更严的一侧，不会假绿） |

⇒ **任何引用 `verify-site.js` 断言文本 / 计数 / 行号的审计 finding（`F-gate-*`、`F-r1-ui-*` 等），必须在本基线的 `6940938…` 版脚本上重核**：脚本第 4852 行附近新增了 21 行，之后所有行号相对审计期**后移**。

### 6.2 [本轮实测] 审计发现计数：99 条覆盖 104 个 finding ID

在**只读快照** `research/audit/AUDIT-SUMMARY-ALL.md` 上独立重算：

| 项 | 本轮实测 | 出处 |
|---|---|---|
| P0 条目 | 1（标题 `**P0-1 …**`） | §5 / 本文 §6.3 |
| P1 条目 | 12（表格行 `| P1-1 | … | P1-12 |`） | §6 |
| P2 条目 | 32（列表 `- **P2-1** … - **P2-32**`，编号连续） | §7.1 |
| P3 条目 | 54（列表 `- **P3-1** … - **P3-54**`，编号连续） | §7.2 |
| **合计条目** | **99** ＝ 1+12+32+54 | §7 首行自述 |
| **全文唯一 finding ID** | **104**（正则 `F-[a-z0-9-]+-\d+` 去重计数） | 与「覆盖 104 个 ID，因同根因合并」一致 |
| ID 前缀分布 | `F-gate`12 · `F-r2-api`11 · `F-r1-history-ai`9 · `F-online`8 · `F-r1-residual`7 · `F-r1-ui`7 · `F-v3-registry`6 · `F-mutation`6 · `F-v3-pages`6 · `F-integration`6 · `F-r1-identity`6 · `F-verify-x`5 · `F-v3-residual`5 · `F-v3-export`5 · `F-r2-plans`5 | 同上 |
| 四态合计 | 906 = ✅804 + ⚠️85 + ❌11 + 🐛6（A 297 / B 289 / C 320 逐轮相加自洽） | §4 定稿值 |

**重要口径（下游必读）**：99 是**待修条目数**，104 是**被覆盖的唯一 finding ID 数**，906 是 **requirement 判定行数**。三者不可混用，也不存在「99 条审计发现」以外的第二种计数口径。

### 6.3 P0：同一价格记录可映射到两个 registry 身份（守卫缺口，非现行错数据）

- **[本轮实测·源码级]** 守卫位置与语义：`scripts/lib/model-registry.js:523-526`
  - 冲突键 `triple = ${apiPlanId}\u0000${modelKey}\u0000${variant === null ? '(all)' : variant}`（第 523 行）；
  - 仅当**同一个 triple** 指向不同 `registrySlug` 时报错（第 524-525 行，报文「同一条价格记录不许映射到两个 registry 模型」）；
  - 第 519 行 `link.variant !== null && !variants.has(link.variant)` 说明 `variant: null` 是**通配**：它不需要在记录里存在该 variant。
  - ⇒ **结构性缺口**：同一条 `(apiPlanId, modelKey)` 的 `variant:null` 通配映射与 `variant:'standard'` 精确映射是**两个不同的键**，可以同时指向不同 registry 身份而不触发任何报错。
- **[本轮实测·只读推导]** 冻结数据当前 **0 冲突**：`model-registry-links.json` 的 55 条 API 映射的 `(apiPlanId, modelKey)` 组合**两两互异**（去重后仍 55 条），故按 `(all)` 键也无任何重复 triple。
- **[审计事实·待下游复现]** 端到端变异复现（追加一条 `basis:'explicit-mapping'` + note 的合法映射 → `models:rebuild` → 11 道生产门禁全 exit 0 → 产物页 `glm-5.3` 多出 `data-model-key="qwen3-max"` 行 → restore 逐字节一致）由审计 `verify-x` 完成，本任务**未复跑变异电池**（会写生产文件，超出 T01 只读范围），修复条目 `REPAIR_PLAN.md` R-P0-1。

### 6.4 [本轮实测] `api-plans.json` / `model-registry-links.json` 的真实结构

| 量 | 实测值 | 说明 |
|---|---|---|
| `api-plans.json` 顶层 | `schemaVersion, updatedAt, count, plans` | `count` 与 `plans.length` 一致 |
| API 计费记录 | **13** 条 | 与审计 §14「v3.0 增至 13」一致 |
| `plans[].models[]` 条目 | **67** 条 | 带真实 `variant` 的价格行 |
| 互异 `(apiPlanId, modelKey)` 组 | **55** 组 | 与 `model-registry-links.json` 的 55 条 API 映射**一一对应**（双向差集均为 0） |
| 其中带 **两个**真实 variant 的组 | **12** 组（`long_context`+`standard`） | 即任务书说的 12 组 |
| 其中只带 **一个** variant 的组 | **43** 组（均为 `standard`） | 67 = 12×2 + 43 ✓ |
| `model-registry-links.json` 映射总数 | **64** | 55（API，`apiPlanId`）+ 9（Coding，`planId`），无「两者都无」 |
| API 映射 `variant` 取值 | **55/55 全为 `null`** | 即通配 —— 与 6.3 的缺口同源 |
| Coding 映射 `variant` 取值 | 9/9 全为 `null`（该字段对 Coding 侧无语义） | `planId` 侧字段是 `modelName` 而非 `modelKey` |

**口径澄清（防下游误读）**：任务书写「12 组 … 而 55 条 API 映射全为 variant:null」容易被读成「这两组数彼此互斥」。实测口径是：`api-plans.json` 里**共 55 组** `(apiPlanId, modelKey)`，**其中 12 组**各自带 `standard`+`long_context` 两个真实 variant，另 43 组只有一个；而 `model-registry-links.json` 里对应这 55 组的 55 条 API 映射**全部**是 `variant:null` 通配。⇒ 「多变体组无法被通配映射区分」的影响面是 **12 组**，不是 55 组。

### 6.5 [本轮实测] 历史层事件计数

| 文件 | 顶层键 | `events` 条数 | 事件构成 |
|---|---|---|---|
| `scripts/data/deal-history.json` | `schemaVersion, startedAt, baseline, absence, events` | **0** | 无任何事件（连 `created` 都没有） |
| `scripts/data/plan-history.json` | `… , anomalies, events` | **14** | 审计记录：14 条**全为 `created`** |
| `scripts/data/api-plan-history.json` | `… , anomalies, events` | **6** | 审计记录：6 条**全为 `created`** |

⇒ 任何依赖「真实非 created 事件」的判定（`price_changed` / `promo_*` / `quota_*` / `model_*` / `restriction_changed` / `ended` / `restored`）在**当前生产数据上无法被数据检验**，下游不得据生产数据声称其成立或证伪。

### 6.6 [本轮实测] 其它基数（下游对账用）

| 文件 | 计数 |
|---|---|
| `deals.json` | **134** 条（`schemaVersion, updatedAt, count, deals`） |
| `plans.json` | **23** 条（`count` 与 `plans.length` 一致） |
| `models.json` | **44** 条（`count` 与 `models.length` 一致） |
| `model-registry-gaps.json` | **10** 条 `declarations`（另有 `_note` / `_rules` / `schemaVersion`） |
| `research/audit` 快照 | 56 文件 / 共 2198926 B |

---

## 7. 只读证据快照 `research/audit/**`（56 文件，逐文件 sha256）

复制自主工作区 `D:\OneDrive\Desktop\Code\AI Page\research\audit`（**只读证据**：T02–T17 **不得修改**任何文件；改证据视为返工）。复制后逐文件 SHA-256 与源端比对结果：`COPY_IDENTICAL`（56/56 相同）。在新 worktree 里它仍是**未跟踪**（`?? research/audit/`），不会被队长之外的提交带走。

| 相对路径 | bytes | sha256 |
|---|---|---|
| `AUDIT-SUMMARY-ALL.md` |   55406 | `84f59f50ddad6bd8cb63bbee223feb9b1f4624486ba89d9c54776a1fbf42f5c4` |
| `CROSS_VERSION_INTEGRATION.md` |   40805 | `b1e50136e4b8408b3cc7558b8c9d381b21a9bc5418b2bf13e69386cf73a3e8ed` |
| `DEFECTS_AND_GAPS.md` |  106453 | `48ab9a67e1213f78fa9beb762ef929412f5a820b9d4c813e3bda877f0fc78b9d` |
| `EVIDENCE-INDEX.md` |   29136 | `9adf15ad000e7a88ecdf5394ed00ff568df47409d17357deb13482b9cc64bd96` |
| `FINAL_VERDICT.md` |   34461 | `184d00bed1ded01da48cb8fb303a7f462042edcb37bc47d4fe55144f00a5d9e0` |
| `MASTER_ACCEPTANCE_MATRIX.md` |  367134 | `38ba038b4a08b6f05211c7771f00e98b51f3e38a595d0fc20ce2279bd46e1337` |
| `PREFLIGHT-FREEZE.md` |    3222 | `4107ca8a839b9d55109fc9fda229247531a41a8b6747695be7e23d77ea66a6e0` |
| `QUALITY_AUDIT_REPORT.md` |   34293 | `2ca94cc7eff86214dfe2084abf0861c776e4c5dc592a456104b05076e2c3939e` |
| `REPAIR_PLAN.md` |   31768 | `52bec8d257466703f3bc8d3dcec3a6bd56c2e3ea81fb7adab9dd4cf5cdb7ac41` |
| `TEST_EVIDENCE.md` |   62043 | `e8f464d9476900f408f9a0a7e4659a47b524b2ca1b053c4ad05265c0f0ea4304` |
| `_fragments/_r2-plans-table.md` |   46128 | `10ba8e0a7bc6ee4c3fe5f5501ebd991c8363720badd6479076e6a7f1b19358dd` |
| `_fragments/gate.md` |   47283 | `0f07e0bff6df6f34e266c4138962ace52e26982ad646fb438c7cd521ed37a342` |
| `_fragments/mutation.md` |   26537 | `de7a7c14d9f6fa56351f7254d440b2ea4a6534408c00e449ffe0e3b39172ff3f` |
| `_fragments/online.md` |   46460 | `0364aad9193e386b3287dba79510f41993bc19f8ffde42f46821d88ff107681c` |
| `_fragments/r1-history-ai.md` |   43965 | `1f37613aecdaafbfa7ba7e4f97a7c0a7e78143e845d6ec0c468e3d07c6d7b997` |
| `_fragments/r1-identity.md` |   53571 | `f0c7a75fe05190372b749311a0148809c9d403cf65f2d411147182e313ea18ba` |
| `_fragments/r1-residual.md` |   57018 | `da81560fb3bd180338dcd498bc90d728fdf3965c3b0dcab6ea61b3a97cf584cb` |
| `_fragments/r1-ui.md` |   46901 | `a8809aadb18a396db895559755e6e4c40a6f1fc11b0ca65cf121dfc0d36a4df6` |
| `_fragments/r2-api.md` |   54735 | `ff77bdc0b8c8606fcd555ca29abb0719d4ceb1369ed71883348d1e98af56e453` |
| `_fragments/r2-plans.md` |   72196 | `1134c675cab9844a15a90a65895b348de8c6d5eed5c7ca28ee050b80c304137e` |
| `_fragments/v3-export.md` |   41678 | `b13be802939ee55fd0f3c145d4bbbf182cbd18b4bb32297b75b3b1c645fb9392` |
| `_fragments/v3-pages.md` |   35290 | `b03d04105e0c1aa15df25a2caa9bd2f1739bc96873db5cca477559658f5515cb` |
| `_fragments/v3-registry.md` |   49750 | `7ba0363a4e3468eca72006840607a7d34b9f82f5d23449414cbc3c843bf4239d` |
| `_fragments/v3-residual.md` |   51415 | `31a0d9260eb432b578812b415a2a9bee21e93d234f4557aea46d1b56691989bf` |
| `_fragments/verification-r1.md` |   65742 | `800e4bbc71cf7b49ec36569c14b5474b30e9966731f453e179d8e026691873f2` |
| `_fragments/verification-r2.md` |   39096 | `ddc39a6d92cd996ac63dea78a861ff80d176d4876e33d8edf8d0b0f870214ad7` |
| `_fragments/verification-r3.md` |   59798 | `f1c78d7dbe707b3ccc9e15a424ed313be220b87eaed16a6512510e991d29e768` |
| `_fragments/verification-x.md` |   53267 | `eb2f214261fce6e73beaf8af87fbde788008e1a1a31a17e350b4663776eeba13` |
| `logs/captain-acceptance-final.json` |   24789 | `34f11f1897aed16535fc1ae3ee0c742c94926fead38424993fe1987fca5fe0d2` |
| `logs/captain-acceptance.json` |   24789 | `f39efb3edf5b7ad73c660656f6aed25461257409510080accb8939001049e761` |
| `logs/captain-dist-manifest-check.json` |     291 | `81ede813d146f531f6b19198859e5e5674744af1b8642ac64ac1069771447df2` |
| `logs/captain-process-incidents.md` |    4098 | `788a9bc40ebdb632de8241dcecc7950ed099474adca181014f44657e7356c4f5` |
| `logs/captain-verification-handoff.md` |   13270 | `3d2d58965d35b42eda4474032bd3d6b9c45755de4b3f926c8e2e522f42cab772` |
| `logs/evidence-dist-recheck.json` |     291 | `81ede813d146f531f6b19198859e5e5674744af1b8642ac64ac1069771447df2` |
| `scratch/captain-acceptance.cjs` |   10528 | `f00b316cab2328b52c767509f57613b7fefc547e27690814cf2eb7eee2028f7a` |
| `scratch/captain-check-summary.cjs` |    2019 | `fa36f9f00372df06472b2894454bdc1c08d64deff511d0be689e056c427436ee` |
| `scratch/integrator/analyze-matrix.cjs` |    3645 | `467848beac90abd9a353ba83083b1d458bcdecae1b98277e83bb725d23bed733` |
| `scratch/integrator/analyze2.cjs` |    2697 | `ffa4425e32f7f8f1d96ab5e47c3caa521226bb41c06e4648c337ff14727b1b69` |
| `scratch/integrator/analyze3.cjs` |    3021 | `0232bafab030892606b79923785ac9667fccba8ffa5431f0d6a91da52042caac` |
| `scratch/integrator/build-final-verdict.cjs` |   26822 | `f47993433dd2ce33a4e030149031c61b5fd63e3db37e1e70aca9cd25f6f0e01b` |
| `scratch/integrator/check-5rows.cjs` |    1419 | `866da3e50fcf51a615237af43dbf3566e0d5cce9c20a3dd2a92c61e264c46487` |
| `scratch/integrator/check-ss.cjs` |    2328 | `4ccd96d9092155261377197a9cb6a44d4116986197962aa6ea90c95c0c58f505` |
| `scratch/integrator/copy-fragments.cjs` |    1339 | `b41c1e3930720518954d630b9f9000b11d726ccaa2640e4fc7e783a6a644a194` |
| `scratch/integrator/crosscheck-status.cjs` |     952 | `4381f9da794bef8ac2ce9eba771e5f681df851a76aeac460d18abcb0259f2490` |
| `scratch/integrator/distinct-ss.cjs` |     843 | `1807d37643167053e1860b929726ec3ee0ab4e778dad53c7300bb5464fc08c8e` |
| `scratch/integrator/e0-classified.json` |  105956 | `acb9db2c2a7bf598bb911eb0712360f72df70576a837733bfdfdc160169510b2` |
| `scratch/integrator/e0-matrix-rows.json` |  273459 | `921c7f360ba0fd223906a732e5e05255e5636e66bbadd8ab9743c73e75b80b1e` |
| `scratch/integrator/final-check.cjs` |    6165 | `a99ff4d066824e6913c78cab083a37b6be4265539b523bd2d6cc3ada4093c99d` |
| `scratch/integrator/finalize-cross-version.cjs` |    4433 | `9fa1aed4dcbf591e3f2854c6df97a0ee7d0d189e3c3a084880ae8798531c032a` |
| `scratch/integrator/finalize-matrix-stats.json` |     920 | `6f748bd76ae48fdb5b6cb69f34f2642ec1aaff8d25055762efaa660681318599` |
| `scratch/integrator/finalize-matrix.cjs` |   17459 | `faa78aa9088c7c4a2e027f0f2492a1ac3930fbf7325c065b6ca3a691a239e235` |
| `scratch/integrator/fragments-manifest.json` |    2571 | `ff0aca92d2fed13f8ffb62899355f36a762a8443a07724f498765508bc332be2` |
| `scratch/integrator/inspect-matrix.cjs` |    2824 | `81c481578438996689f0bdffe46c8a08d3553f7142c7c9ae0433aab2cb54a7a1` |
| `scratch/integrator/scan-check.cjs` |     349 | `d2bbd8fe8888941413230774ace364ab6a8877687734331b08a2006840e96fc7` |
| `scratch/integrator/verify-matrix.cjs` |    2027 | `4973c3049ca5da28c0c1611bfa74b650408821b352512efd059c0fc9ab1f4267` |
| `scratch/verify-dist-manifest.cjs` |    4071 | `95f1249467926966906255ed6534c8bba8e2e441436f422f3b8fa9ae6fe42d56` |

> 复核命令：`Get-ChildItem -Recurse -File research/audit | % { (Get-FileHash $_ -Algorithm SHA256).Hash }`，逐条与上表比对。

---

## 8. 下游纪律（由本文派生）

1. **先复现再下结论**：任何 finding 判定都要在本 worktree（HEAD `21cf66d…`）上给出命令 + exit code；不得写「应该仍在」「审计说如此」。
2. **真值层只认冻结值**：改任何 §4 文件前先记录 before 计数；`deals.json` 与审计期不同，引用审计数字前重跑。
3. **构建一律** `node scripts/tools/build-local.js --out=dist.qc-<name>`；默认 `dist/` 不属于本轮任何任务。
4. **禁改**：`research/audit/**`（证据）、`.gitignore` 的既有行、`node_modules`。
5. **越界先问**：超出任务 `inScope` 的改动先发 captain。
6. 文档漂移修正（Prompt §27 收口项）以本文 §6 的实测口径为基准，**不得把 99/104/906 三个数字混用**。
