# captain-recon —— 队长的裁定记录与终验判据

> `docs/EVIDENCE-POLICY.md` 要求：留在 `research/_raw/` 的**可复跑脚本必须被本文件点名引用**。
> 本文件就是那份点名清单 —— 被点到的 4 个 `.cjs` 是**判据**，不是一次性探针。

## 1. 结论（Tier 1）

- **`captain-rulings.md`** —— 本轮 5 条裁定（含一条**队长自纠**）。每条按「争议 → 裁定 → 依据 →
  我否决了什么 → 怎么被证伪」写，含 t6 的 F1（豁免自证，判真缺陷）与 t7 的交办附录。
- **`captain-preflight-notes.md`** —— 队长预读：8 类容器的三种来源拆分、口径提醒、
  以及第 1 节那条**作废的自纠**（把 `.dsrc-note` 165 误报为 162 的完整错误现场）。

## 2. 队长的复算方法（脚本**不入库**，公式与命令在这里）

`check-evidence.js` 对 `research/_raw/**/*.cjs` 是**一刀切**规则（`check-evidence.js:62`），
README 点名只是那条报错文案里的提示、**不是豁免机制**。所以按政策办：**脚本留在本机**，
结论上移到 Tier 1，并把「怎么算的」写清楚 —— 复算不依赖我那份脚本。

| 判据 | 怎么算 | 命令 |
|---|---|---|
| **数据面逐字节** | 收集根目录 `*.json\|*.txt\|*.xml` + `scripts/data/**` + `dist/feed/**` + `dist/data/**` + `dist/{sitemap,robots,deals,plans,api-plans,models,_notes.ndjson,index.html}` 共 117 个文件；每个算 `sha256(file)`，输出 `"<hex>  <relpath>"` 每行一条，**UTF-8 写入**（不要用 PowerShell 的 `>`：它默认 UTF-16LE，本轮实测把 117 行读成 0 条、还报出「116 个文件全是新增」这种**看起来像结论的垃圾**）；两份快照按 path 对齐做 diff | `node -e` 见下方「最小复算片段」 |
| **对抗修复独立复核** | 把 `dist` 复制三份到临时目录，分别：① 不动；② 在 `index.html` 的共享页脚保留句前插入 `价格与条款最终以厂商官方页面为准。`；③ 把 `residue-guard.json` 的 `.dsrc-note` `floor` 改成 `1`（跑完复原）；另有一份注入零宽字符。然后**走仓库自己的** `node scripts/tools/check-residue.js --dir=<副本>`，比对退出码 | 期望 `0 / 1 / 1 / 0` |
| **`.dsrc-note` 元素数** | 双数法对照：A = `<tag … class="…">` 一次正则；B = 只扫 `class="…"` 属性。两者在 165 上一致 ⇒ 争议判死 | 见「最小复算片段」 |
| **全树摘要** | **以仓库自带 `scripts/tools/tree-digest.cjs` 为准**（`59db0aa5…`）。队长自写公式得到 `e4b7aaa3…` —— 两者不同，本目录**不保留**自写值，避免两个数并存 | `node scripts/tools/tree-digest.cjs dist` |

**最小复算片段（数据面快照，UTF-8 安全）**：

```bash
node -e "const fs=require('fs'),p=require('path'),c=require('crypto');const R=process.cwd();const L=[];const w=d=>{for(const e of fs.readdirSync(p.join(R,d),{withFileTypes:true})){const r=d+'/'+e.name;e.isDirectory()?w(r):L.push(r)}};
for(const n of fs.readdirSync(R)) if(/\.(json|txt|xml)$/.test(n)) L.push(n);
w('scripts/data'); w('dist/feed'); w('dist/data');
for(const f of ['dist/sitemap.xml','dist/robots.txt','dist/deals.json','dist/plans.json','dist/api-plans.json','dist/models.json','dist/_notes.ndjson','dist/index.html']) L.push(f);
[...new Set(L)].filter(f=>!/^dataplane-/.test(f)).sort().forEach(f=>console.log(c.createHash('sha256').update(fs.readFileSync(p.join(R,f))).digest('hex')+'  '+f));"
```

## 3. 终验读数（原始命令 + 退出码）

### 3.1 全量 `npm run gate`（本轮**首次**跑；此前无人跑过）

```
node scripts/test/run.js --gate
合计 348.8s / 49 个脚本，失败 0  ⇒ exit 0
  ✓ [44] Feeds reproducibility (build twice, byte-compare)   6.5s
  ✓ [45] Residue guard (deleted copy must not return; container floors)  0.4s
  ✓ [51] Real-browser acceptance (verify-site.js)          144.8s
  ✓ [52] Regression verify (baseline compare)              146.1s
跳过的 4 个非 node 步骤：Install dependencies · Prepare browser · Browser availability decision · Gate conclusion
```

### 3.2 数据面逐字节（snapshot 差分，非目测）

对 116→117 个数据面文件（根目录 `*.json|*.txt|*.xml` + `scripts/data/**` + `dist/feed/**`(48)
+ `dist/data/**` + `dist/{sitemap,robots,deals,plans,api-plans,models,_notes.ndjson,index.html}`）取快照差分：

| 阶段 | 变化 |
|---|---|
| 写入前 → t9 后 | `deals.json` · `dist/deals.json` **仅此 2 个**（t9 的 A 类改真源，唯一被授权的数据面改动） |
| t9 后 → 终态（全量门禁重建之后） | `package.json`（新增 `check:residue` script）· 新增 `scripts/data/residue-guard.json`。**Feed 48 个逐字节不变** |

### 3.3 独立复核 t10 的三条修复（在产物副本上，不动真产物）

```
✅ baseline（未改动副本）      exit=0   期望 0
✅ F1 共享页脚注入（应红）     exit=1   期望 1   ← 修前是绿，这条就是那条 high
✅ F6 下限改 1（应红）         exit=1   期望 1
✅ F3 零宽字符注保留句（应绿） exit=0   期望 0   ← 验「归一化比对没有引入误报」
```

### 3.4 判据侧哈希与报告锚定值一致

`build-local.js f5c2914b0ee7ada63578…` · `residue-guard.json e5108bd77ec06a5b82f8…` ·
`check-residue.js cfc012ad76427aab1e7a…` —— 与 `research/secondary-page-residue-v2-report.md`
§11 的锚定值逐字符相同 ⇒ 报告的门禁/变异/边界三节读数**有效**。

## 4. 不保留的东西（Tier 3，可重建 ⇒ 不入库）

| 曾经存在 | 为什么删掉 |
|---|---|
| `dataplane-pre-t9.sha256.txt` · `dataplane-after-t9.sha256.txt` · `dataplane-final.sha256.txt` | 三份快照是**可重建的中间 dump**（每条 11–23 KB）。**结论已上移到本节 §3.2 的表**；需要明细时用 §2 的 `dataplane-diff.cjs` 现取 |
| `gate-full.log` | 完整日志属 Tier 2（CI Artifact）。**结论已上移到 §3.1**；本地复跑一条命令即得 |
| `dataplane-pre-t9.sha256.utf8.txt` | 上一项转码后的副本，纯冗余 |
| `dataplane-hash.cjs` | 被 `dataplane-diff.cjs` **取代**（前者根路径算浅一层、且经 shell 重定向写文件 ⇒ UTF-16LE 陷阱）。两份并存会让人用错那一份 |
| `write-commit-msg.cjs` · `write-pr-body.cjs` | 一次性用途（把中文提交信息/PR body 写进临时文件，绕开 PowerShell 的引号与编码问题）。内容已进提交与 PR，脚本无保留价值 |

> `check-evidence.js` 正是拦住这件事的那台机器 —— 它报出 9 个「基线之后新进的 Tier-3 文件」，
> 其中 5 个应删、4 个应被本文件点名。**这不是误报，是它按设计工作。**
