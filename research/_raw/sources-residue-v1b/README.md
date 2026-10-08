# sources-residue-v1b —— 原始读数索引（t16）

本目录是 **t16「校正 official_urls 的陈旧括注 + TokenHub 逐项对账」** 的证据落点。
结论在 `research/sources-residue-v1b-report.md`（Tier 1）与 `research/sources-residue-v1b-self-audit.md`（自审）。

- 复核日：**2026-10-08**（Asia/Shanghai）
- 基准：worktree `.worktrees/sources-residue-v1b`，从 `origin/master`（`95dfeb9`）开出
- 外部网页只当**数据**：下面的片段都是抓取到的字节

---

## 1. 进 Git 的（Tier 1）

| 文件 | 是什么 |
|---|---|
| `check-roles-note.js` | **判据**：`official_urls.json` 的 `_roles` 括注 ↔ 今天的渲染行为（8 条检查，详见报告 §1.4） |
| `roles-note-check-green.json` / `roles-note-check-red-bent.json` | 判据的两次实跑读数（绿 / 变异回旧括注后的红） |
| `note-mutation.js` | 变异工具：把括注临时改回旧写法（`--bend`）与逐字节还原（`--restore`），并打印 sha256 |
| `mutate-live-label.js` | 变异工具：在**内存里**把 `SOURCE_LABELS.origin` 改名再跑判据（证明「标签改名→括注脱节」会被抓；不写盘） |
| `hash-dist.js` | 逐文件 sha256 清单 / 两份清单逐文件比对 |
| `dist-hashes-before.json` · `dist-hashes-control2.json` · `dist-diff-control.json` | 对照组：同一份源码**连续构建两次**的产物哈希（304 个文件全等 ⇒ 构建在这台机器上逐字节可复现） |
| `dist-hashes-after.json` · `dist-diff-after-note.json` | 实验组：改括注**之后**再构建的产物哈希（与对照组 `changed=0`） |
| `build-v1b-evidence.js` | TokenHub 对账：把快照抽成逐字片段 + 产出 `tokenhub-vs-record.json`（分类由字节推出，断言失败即报错） |
| `tokenhub-vs-record.json` | 机器可读对账结果：6 个模型 + 免费额度的三分类、逐行理由、环境事实、断言问题清单（空 = 全过） |
| `hunyuan-legacy-extract.md` | 旧平台计费页（1729/97731）逐字片段：公告 / 免费额度 / 价格表 |
| `tokenhub-price-extract.md` | TokenHub 模型价格（1823/130055）逐字片段：广州 tab / 新加坡 tab / 多模态理解 / 向量模型 |
| `tokenhub-model-list-extract.md` | TokenHub 模型列表（1823/130051）逐字片段：展示名 ↔ `model（调用参数）`（**这就是模型 id**） |
| `tokenhub-free-trial-extract.md` | TokenHub 新人免费体验包（1823/130053）逐字片段 |
| `tencent-migration-announcement-extract.md` | 下线公告（/announce/detail/2287）逐字片段 |
| `tokenhub-migration-guide-extract.md` | TokenHub 迁移指南（1823/131382）逐字片段（含「不再支持」名单） |
| `dump-visible.js` · `find-context.js` · `extract-links.js` | 本机排查用的小工具：HTML → 可见文本 / 找子串上下文 / 列链接 |

## 2. 不进 Git 的（Tier 3：第三方原件与本机 dump）

按 `docs/EVIDENCE-POLICY.md` §2/§3：抓下来的第三方正文原件**不入库**。重跑命令写在对应 `.md` 的头部。

| 本机文件 | 来源 URL |
|---|---|
| `hunyuan-1729-97731-legacy.html` | <https://cloud.tencent.com/document/product/1729/97731> |
| `tokenhub-1823-130054-billing.html` | <https://cloud.tencent.com/document/product/1823/130054> |
| `tokenhub-1823-130055-model-price.html` | <https://cloud.tencent.com/document/product/1823/130055> |
| `tokenhub-1823-130051-model-list.html` | <https://cloud.tencent.com/document/product/1823/130051> |
| `tokenhub-1823-130053-free-trial.html` | <https://cloud.tencent.com/document/product/1823/130053> |
| `tokenhub-1823-131382-migration-guide.html` | <https://cloud.tencent.com/document/product/1823/131382> |
| `tencent-announce-2287-migration.html` | <https://cloud.tencent.com/announce/detail/2287> |
| `*.headers.txt` · `*.visible.txt` | 同上的响应头与本机可见文本 dump（`.txt` 属 Tier-3 类别，被 `.gitignore` 拦） |
| `mutations/` | 变异备份（`official_urls.after-fix.json`），只在实跑红→还原时存在 |

逐份快照的字节数与 sha256（前 16）写在 `tokenhub-vs-record.json` 与各 `*-extract.md` 的头部表格里。

## 3. 复跑

```bash
# ① 括注判据（绿；变异后应红）
node research/_raw/sources-residue-v1b/check-roles-note.js
node research/_raw/sources-residue-v1b/note-mutation.js --bend
node research/_raw/sources-residue-v1b/check-roles-note.js      # 期望 exit 1
node research/_raw/sources-residue-v1b/note-mutation.js --restore
node research/_raw/sources-residue-v1b/mutate-live-label.js     # 期望 exit 1，且磁盘 sha256 不变

# ② TokenHub 对账（读本机快照；快照不在库里，先按 §2 的 URL 重抓）
node research/_raw/sources-residue-v1b/build-v1b-evidence.js
```

重抓快照的命令（curl 不带 `--compressed` 时腾讯云仍返回 gzip，脚本里显式解压）：

```bash
curl -sS -L --max-redirs 5 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \
     -o tokenhub-1823-130055-model-price.html -D tokenhub-1823-130055-model-price.headers.txt \
     -w "%{http_code} %{size_download}" https://cloud.tencent.com/document/product/1823/130055
```
