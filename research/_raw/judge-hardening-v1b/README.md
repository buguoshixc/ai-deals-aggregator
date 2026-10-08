# judge-hardening-v1b（t10）· Tier-1 证据

修复对象：`lib/seo.js` / `seo-verify.js` 的注释伪造面（t5 的 F2 / F3 / A1）+ 观察 2 的登记表静默缩小。
装置与完整读数（Tier-3）：本机 `.worktrees/judge-hardening-v1b/.arch-v1/`（gitignore）——`forgery.cjs`（15 个 dist 副本）、
`sb-registry.cjs`（4 个沙箱）、`precheck-v1b.cjs`、`tree-digest.cjs`、`check-gap-a-patch.cjs`、`make-evidence-v1b.cjs`、`logs/`。

| 文件 | 内容 | 装置 |
| --- | --- | --- |
| `forge-pairs.json` | F2 / F3 / A1 十六条形态的「伪造副本 / 真删对照 / 原样」三段读数（`before` = `origin/master` 三文件，`after` = 本分支），含 `sameSolution` 逐对判定 | `.arch-v1/forgery.cjs run --phase=before\|after` |
| `registry-shrink.json` | 观察 2 的四段读数（表+转写一起裁 × pre-fix / 本分支；只裁表；复位） | `.arch-v1/sb-registry.cjs` |
| `precheck-dist.json` | 304 文件真产物的影响面普查（注释里的读点标记 / script 段里的行标记 / 单引号 href / sitemap loc） | `.arch-v1/precheck-v1b.cjs` |
| `build-digests.json` | 产物变化面：pre-fix `seo.js` 构建 vs 本分支构建，304 文件逐文件 sha256 全等 | `.arch-v1/tree-digest.cjs` |
| `assertion-counts.json` | 断言账（88 → 103 · 18 → 19 · 检查码 28 不变）与 t7 §八 补丁逐字核对 | 各套件实跑 + `.arch-v1/check-gap-a-patch.cjs` |

报告 `research/judge-hardening-v1b-report.md`（§2 三段读数、§3 逐处行号对照、§5 读数总账、§6 未验证清单）；
自审 `research/judge-hardening-v1b-self-audit.md`。
