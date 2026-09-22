# 方案 A · 保守 —— 只动视觉层，信息架构与 URL 结构一个都不碰

**一句话**：把 `:root` 那一层重做（暗色、动效、对比度、字阶、层级），页面长什么样、有多少个 URL、
数据怎么组织**完全不变**。适合「先要一个明显更成熟的界面，不想冒结构风险」。

**适合谁**：只想让站点看起来与用起来更专业，对 SEO 长尾与功能扩展没有迫切需求。

---

## 1. 目标指标（改前 → 改后，全部可测）

| 指标 | 改前（实测） | 改后（目标） | 怎么测 |
|---|---|---|---|
| 对比度不达标文本节点 | **100 / 400**（最低 2.84） | ≤20 | `verify-site.js` 新增断言，亮/暗两套各测一次 |
| 字号种类 | **12 种**（含 9/9.5/10/10.5/11/11.5px） | 6 级（11/12/13/14/16/19） | 静态检查 `:root` + 抽查 computed style |
| 假字重（系统字体无此实例） | **354 处**（650×162、680×124、800×66、750×2） | 0（只用 400/500/600/700） | grep + 断言 |
| 动效 | 3 组 ad-hoc（`.13s ease` ×62、`.18s cubic-bezier(.34,1.4,.64,1)` ×65…） | 4 个 token + `prefers-reduced-motion` 全局降级 | 断言：reduced-motion 下计算样式 `transition-duration` ≤ 0.01ms |
| 暗色主题 | 无（`prefers-color-scheme` 规则 0 条、无 `color-scheme` meta） | 跟随系统 + 手动三态（auto/light/dark，记 localStorage） | 断言：切换后 `data-theme`、`color-scheme`、持久化、刷新保持 |
| 卡片层级 | `1px border` + hover 大扩散投影 | 发丝环 + 微投影（`0 0 0 1px` + `0 2px 8px -4px`） | 断言：hover 前后卡片高度/网格行高不变 |
| 语义骨架 | `header=0 nav=0 main=0` | 各 ≥1，且 facet 用 `aria-pressed` 表达选中 | 断言 + 键盘 Tab 顺序完整 |
| 首屏密度 | 9 张（卡片模式） | **9 张（不变，本方案不追密度）** | `verify-site.js` 既有断言 |
| `verify` 断言数 | 55 项 | ≥64 项 | 脚本输出 |

## 2. 具体做什么（逐条对应 `research/GAP-MATRIX.md`）

| 项 | 内容 | 出处 |
|---|---|---|
| 色彩 token | `--mut: #8c94a6 → #6b7280`（2.84:1 → 4.50:1）；原值降级为 `--mut-deco`（不承载文字）；新增暗色整套（底/面/环三件套） | DESIGN-TOKENS §1、§7 |
| 排版阶梯 | 收敛为 6 级；正文 13.5 → **14px**；只用真实字重 | DESIGN-TOKENS §2 |
| 圆角/描边 | 卡片保留 `--r:10px`，chip/按钮统一 6px，弹层 12px；**发丝环替代大投影** | DESIGN-TOKENS §3 |
| 间距 | 卡片内边距 `13px 14px → 12px 14px`，小节间距 `9px → 8px` | DESIGN-TOKENS §4 |
| 动效 | 4 个 token（100/150/250ms + 两条曲线）+ 显式属性过渡（禁 `all`）+ reduced-motion 降级 | DESIGN-TOKENS §5 |
| 暗色 | `prefers-color-scheme` + `[data-theme]` 双通道；`<meta name="color-scheme">` 与两段 `theme-color`；暗色下 logo tile 保留浅底 + 环（保 30+ 家第三方 logo 可辨识） | DESIGN-TOKENS §6 |
| 状态 | 空/错/加载/骨架四态补齐（无 JS 时仍以预渲染正文可读） | G12 |
| 语义 | `header/nav/main` 落地；facet 用 `aria-pressed`；焦点可见 | G13 |

## 3. 明确不做

- 不做独立详情页（G1）、不做紧凑行视图（G2）、不动 URL 结构 → 可索引 URL 仍是 1
- 不做 feed、纠错入口、收藏/对比（G9/G10/G11）
- 不引入任何依赖、不改 `deals.json`、不改采集器与 CI 门禁

## 4. 改动面（预估）

| 文件 | 改动 |
|---|---|
| `index.html` | `:root` token 层重写 + 各规则块改用 token + 主题切换约 20 行 JS（不新增依赖） |
| `scripts/tools/verify-site.js` | +9～12 项断言（对比度×2 主题、reduced-motion、主题持久化、焦点、语义骨架） |
| `PROJECT_STATUS.md` / `README.md` | 新增章节与命令说明 |
| `deals.json` / 采集器 / `.github/workflows` | **零改动** |

## 5. 风险与对冲

| 风险 | 对冲 |
|---|---|
| 暗色下 30+ 家第三方厂商 logo（多为深色图形）可辨识度下降 | 暗色下 logo tile 保留浅色承载底 + 1px 环；`verify` 断言 tile 与其底色对比度 ≥3:1 |
| 档位 5 档配色在暗色下语义漂移 | 不自动反色，逐档重算并断言「文字/色条 vs 卡片底」≥3:1 |
| 正文从 13.5 → 14px 撑破 192px 定高卡片 | 保留「每张卡最后一个元素底边不越界」断言；卡片高度是变量，必要时微调 192 → 196 |
| 对比度修正改变品牌观感 | 只动 `--mut`（辅助灰），品牌色与档位色不动 |

## 6. 验收

```bash
npm test && npm run test:strict && npm run build && npm run verify   # 全绿
npm run verify   # 断言 ≥64 项，其中对比度 0 条不达标（亮/暗各一遍）
# 确定性：连续两次 build 的 dist/index.html SHA256 一致
# 红线：外部请求 0、控制台错误 0、npm test 仍零依赖
```

**工作量**：中（S×4 + M×1）。**风险等级**：低。**可回退性**：高（只动 token 与规则块）。
