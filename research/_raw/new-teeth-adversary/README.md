# new-teeth-adversary 证据目录

> 任务 **t24**：对今天新进 master 的**四颗牙**做独立对抗验证（只读；全部变形落在 `.arch-v1/` 副本）。
> 报告：`research/new-teeth-adversary-v1-report.md` · 自审：`research/new-teeth-adversary-v1-self-audit.md`

## 装置与纪律

* **产品零改动**：`dist` 逐文件 sha256 前后全等（304 文件 · 全树 `df43587c…`，见 `integrity.json`）；
  `scripts/**` 一个字节未改；全部变形只写 `.arch-v1/` 下的副本（`dist-notes` / `dist-thin` / `sb-seo` / `sb-roles` / 三个 roles 副本）。
* 每个副本的**逐文件 sha256 前/后**在各自的 attack manifest 里（`json/notes-attack-manifest.json` · `json/thin-attack-manifest.json`）。
* 门禁读数一律读**门禁自己**的输出（`verify-site --json` / `seo-verify` / `seo-selftest` / `roles-note-selftest`）。

## 文件

| 文件 | 是什么 |
| --- | --- |
| `tooth-1-thin-content.json` | 牙 1：规则层边界两侧（余量 50/49/51）+ 产物级砍 1 个可见字 + 登记表被裁（单侧红 / 一致绿） |
| `tooth-2-notes-ndjson.json` | 牙 2：六形态矩阵（一致 +1 / 单侧 ×2 / 一致 −1 / 删页 / 空行）+ 强度边界一句话 |
| `tooth-3-roles-note.json` | 牙 3+4：注记改词 / 缺注记 / 极简注 / 搬到别处 / JSON 无注释 —— 及两条边界 |
| `integrity.json` | 产品零改动证明（dist 摘要前后 + 变形副本清单） |
| `new-findings.json` | 4 条新登记的边界 + 「没证明的东西」清单 |

## 复跑

```bash
npm ci && node scripts/tools/build-local.js                     # 产物（304 文件 · df43587c…）
node .arch-v1/tree-sha.cjs dist --out=.arch-v1/sha/dist-baseline.json

node .arch-v1/attacks.cjs notes && node scripts/tools/verify-site.js --dir=.arch-v1/dist-notes --json=.arch-v1/json/notes-attack.json
node .arch-v1/attacks.cjs thin  && node scripts/tools/seo-verify.js --dir=.arch-v1/dist-thin
node .arch-v1/attacks.cjs roles && node scripts/tools/roles-note-selftest.js --roles=.arch-v1/roles-word.json
node .arch-v1/attacks.cjs sandbox-seo && node .arch-v1/sb-seo/scripts/tools/seo-selftest.js
node .arch-v1/attacks.cjs sandbox-roles && node .arch-v1/sb-roles/scripts/tools/roles-note-selftest.js
node .arch-v1/thin-boundary.cjs                                  # 规则层边界两侧
node .arch-v1/make-evidence.cjs                                  # 重新生成本目录
```
