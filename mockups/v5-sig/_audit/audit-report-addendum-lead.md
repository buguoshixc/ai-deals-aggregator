# 复核报告附录（Lead，2026-11-11 21:3x）

复核员的 `audit-report.md` 是**修复前**的历史快照（结论 FAIL：family.html 30/32 相对链接写成
`../../dist/dist/…`）。该 FAIL 已在复核结束后由 Lead 修复：

- 根因：`_tools/build-sig.js` 的 `buildFamily()` 里 `rewriteUrls(h, 'dist/plans/api/')` 的基准多了一层
  `dist/`；改为 `rewriteUrls(h, 'plans/api/')`（站根 = dist/）后重新生成 family.html。
- 复测：用与复核员 `_audit/linkcheck.js` 同一判据（相对 mockup 目录解析、目录要存在 index.html）重跑，
  **5 个页面共 488 个站内相对链接，失败 0**：
  `home-light 152/152`、`home-dark 152/152`、`home-390 152/152`、`family 32/32`、`compare 4/4`。
  结果存 `_data/linkcheck-final.json`（`summary.totalBad: 0`）。
- 复核员提出的信息项（compare 裁切窗口文案 680×342、390 页高 −36px、25% 色块余量、42px 本轮无实例）
  已并入 `NOTES.md`。

除这一条外，复核员的其余 7 项 PASS 结论保持不变；页面/样式/度量在修复后未再变（只改 family 链接前缀）。
