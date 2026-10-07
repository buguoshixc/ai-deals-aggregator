# `page-notes-disclosure-v1` 取证现场（Tier-3 索引）

> 按 `docs/EVIDENCE-POLICY.md`：**结论进 Tier-1 报告，过程产物留本机**。
> 这个目录是「哪些在本机、哪些入了库、怎么重建」的索引 —— 与 `scripts/tools/check-evidence.js`
> 的类别规则一一对应（`.txt` / `.log` / `.cjs` / `shots/` 一律不入库）。

## 入库的（小、机器可读、报告直接引用）

| 文件 | 回答什么 |
|---|---|
| `verify-counts.json` | 三次真浏览器验收的**项数与失败项名**：改动前 **855/0** → 改动后 **867/0**（= 861 + 6 条回归项）→ 变异复测 **861/5**（五条全部落在 §15b3，逐条点名缺了哪一件） |
| `diff-artifacts.json` | 「没有改到别的东西」的判据：303 → 303 个文件（无增删）· 非 HTML 产物逐字节相同 · JSON-LD 逐字节相同 · 45 个 HTML 差异**全部**由「页面级 `<style>` + summary 里的装饰 span」解释，剥掉后正文逐字节相同 |
| `contrast-readings.json` | hover 底色上的 WCAG 比值（亮色 4.83 / 暗色 6.08 / 跟随系统 6.08），含标题与 chevron |

## 留本机的（可重建，不入库）

| 路径 | 是什么 | 怎么重建 |
|---|---|---|
| `verify-pre-change.json` / `verify-after.json` / `m1-verify.json` | 三份完整验收快照（各约 1 MB，含 861+ 条断言的逐条 detail） | `node scripts/tools/verify-site.js --dir=dist --json=…` |
| `gate-final.log` | 本地 Full Gate 的完整输出（47/47，319.8s） | `npm run gate` |
| `mutations.json` | §22c 的变异牙读数（verify-site 自动写在 `--json` 旁边） | 同上 |
| `probe-*.cjs` / `make-mutation.cjs` / `diff-artifacts.cjs` / `extract-evidence.cjs` | 一次性探针：四视口几何 / 六态特写 / hover 对比度 / 产物对账 / 变异 | 逐个 `node` 跑（需要先 `node scripts/serve.js --dir=dist --port 8099`） |
| `shots/` | 20 张目检截图（收起 / hover / focus / 展开 / 暗色 / 390px / 系统跟随 / 无 JS） | `node probe-visual.cjs` + `node probe-zoom.cjs` |

## 结论在哪

- 规范层：`docs/DESIGN-RULES.md` 的「分类说明的 disclosure 可发现性」一节（H12）
- 报告层：[`research/page-notes-disclosure-v1-report.md`](../../page-notes-disclosure-v1-report.md)
- 判据层：`scripts/tools/verify-site.js` §15b3（六条断言，含 fail-soft 的点名式失败信息）
