# T11 绕过形态逐条判定（锚点式 harness · 修复前 vs 修复后）

- 修复前判据：`research\_raw\secondary-page-layout-unification\recovered\pre-t7\scripts\tools\verify-site.js` sha256 `4cae2fb2ab2599997668feca8c26c3161fe882a518e61d01552b7adc95f95756`（判据区 213 行 / 91d295365b40e60c…）
- 修复后判据：`scripts\tools\verify-site.js` sha256 `4f4cb2e3b3f8e47d921137a5801d8692811a77d868a13c0a3516db8405d72ffb`（判据区 299 行 / 47cfc56165be000d…）

| # | 形态 | 方向 | 修复前 | 修复后 | 翻转 | 判据读数（修复后） | **可见文字实测** | 模式 B |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `ctl-maxwidth-70ch` | control | 咬中 | 咬中 | 不变 | 盒 [452.81,452.81,452.81] / textWidth [453,453,453] | 452.8px（行 447.3px / 列 1380px） ⚠️窄 | EXIT=1 / EXIT=1 / EXIT=1 |
| 2 | `writing-mode-vertical-fullwidth` | writing-mode（盒宽锁满宽） | 放行 | 放行 | 不变 | 盒 [1380,1380,1380] / textWidth [1380,1380,1380] | 338px（行 16px / 列 1380px） ⚠️窄 | EXIT=1 / EXIT=1 |
| 3 | `flex-decorator-item` | flex 容器 + 装饰项吃掉 70%（补充） | 放行 | 咬中 | **放行→咬中** | 盒 [1380,1380,1380] / textWidth [12,62,14] | 413px（行 260.45px / 列 1380px） ⚠️窄 | EXIT=1 |
| 4 | `ctl-no-inject` | control | 放行 | 放行 | 不变 | 盒 [1380,1380,1380] / textWidth [1380,1380,1380] | 1344px（行 863.75px / 列 1380px） ⚠️窄 | EXIT=0 ★假绿 / EXIT=0 ★假绿 |
| 5 | `transform-scaleX` | transform: scaleX() | 咬中 | 咬中 | 不变 | 盒 [455.4,455.4,455.4] / textWidth [1380,1380,1380] | 443.4px（行 285.04px / 列 1380px） ⚠️窄 | — |
| 6 | `pseudo-content-narrow` | 伪元素承载正文（::before/::after 的 content） | 放行 | 放行 | 不变 | 盒 [1380,1380,1380] / textWidth [1380,1380,1380] | 453px（行 nullpx / 列 1380px） ⚠️窄 | EXIT=0 ★假绿 |
| 7 | `text-indent-clip` | text-indent 负值 + overflow: hidden | 咬中 | 咬中 | 不变 | 盒 [1380,1380,1380] / textWidth [1380,1380,1380] | 0px（行 863.75px / 列 1380px） ⚠️整段不可见 ⚠️窄 | — |
| 8 | `text-indent-shift` | text-indent 负值 + overflow: hidden（多行变体） | 咬中 | 咬中 | 不变 | 盒 [1380,1380,1380] / textWidth [1380,1380,1380] | 0px（行 863.75px / 列 1380px） ⚠️整段不可见 ⚠️窄 | — |
| 9 | `writing-mode-vertical` | writing-mode | 咬中 | 咬中 | 不变 | 盒 [346.64,20.39,265.08] / textWidth [347,20,265] | 337.6px（行 16px / 列 1380px） ⚠️窄 | — |
| 10 | `font-size-tiny` | font-size 极小但盒宽满宽 | 放行 | 放行 | 不变 | 盒 [1380,1380,1380] / textWidth [1380,1380,1380] | 112px（行 71.98px / 列 1380px） ⚠️窄 | — |
| 11 | `letter-spacing-huge` | letter-spacing 极大 | 放行 | 放行 | 不变 | 盒 [1380,1380,1380] / textWidth [1380,1380,1380] | 1325px（行 1364.45px / 列 1380px） | — |
| 12 | `multicol-narrow-columns` | CSS 多列（column-width/column-count） | 放行 | 放行 | 不变 | 盒 [1380,1380,1380] / textWidth [1380,1380,1380] | 913px（行 447.3px / 列 1380px） ⚠️窄 | EXIT=0 ★假绿 / EXIT=0 ★假绿 / EXIT=0 ★假绿 |
| 13 | `overlay-opaque` | 不透明覆盖层遮住右侧文本 | 放行 | 放行 | 不变 | 盒 [1380,1380,1380] / textWidth [1380,1380,1380] | 414px（行 863.75px / 列 1380px） ⚠️窄 | EXIT=0 ★假绿 / EXIT=0 ★假绿 / EXIT=0 ★假绿 |
| 14 | `float-narrow-column` | 浮动占位把正文挤成窄列（补充） | 放行 | 放行 | 不变 | 盒 [1380,1380,1380] / textWidth [1380,1380,1380] | 411px（行 411.3px / 列 1380px） ⚠️窄 | EXIT=0 ★假绿 / EXIT=0 ★假绿 / EXIT=0 ★假绿 |
| 15 | `grid-narrow-track` | grid 单轨变窄（补充） | 放行 | 咬中 | **放行→咬中** | 盒 [1380,1380,1380] / textWidth [1040,340,1040] | 424px（行 339.3px / 列 1380px） ⚠️窄 | — |
| 16 | `clip-path-inset` | clip-path 裁掉右侧（补充） | 放行 | 放行 | 不变 | 盒 [1380,1380,1380] / textWidth [1380,1380,1380] | 414px（行 863.75px / 列 1380px） ⚠️窄 | EXIT=0 ★假绿 |

## 仍放行的形态（findings）

### MEDIUM · T11-writing-mode-vertical-fullwidth（形态 `writing-mode-vertical-fullwidth`）

修复后的判据仍放行该形态：`.snote { writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden }`：**盒宽锁死满宽**，正文竖排成一根 ~24px 竖条 —— 判据读数（修复后）盒宽 [1380,1380,1380] / textWidth [1380,1380,1380] 都「满宽」，而独立像素量测：可见文字实测 338px / 单行最长 16px（列宽 1380px ⇒ 只有 1%）。模式 B EXIT=1（117s · 842 项断言/失败 1）；模式 B EXIT=1（97s · 827 项断言/失败 1）

- 复现 A：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=A --verify-site=scripts/tools/verify-site.js --forms=writing-mode-vertical-fullwidth`
- 复现 B：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=B --verify-site=scripts/tools/verify-site.js --scratch-name=dist-probe-after --forms=writing-mode-vertical-fullwidth`

### HIGH · T11-pseudo-content-narrow（形态 `pseudo-content-narrow`）

修复后的判据仍放行该形态：正文交给自己 `::before` 的 `content` 画（`display:block; max-width:70ch`），真实文本节点缩到 0 号字 ⇒ 判据不把伪元素算进「有字区域」 —— 判据读数（修复后）盒宽 [1380,1380,1380] / textWidth [1380,1380,1380] 都「满宽」，而独立像素量测：可见文字实测 453px / 单行最长 nullpx（列宽 1380px ⇒ 只有 33%）。模式 B EXIT=0（113s · 842 项断言/失败 0）

- 复现 A：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=A --verify-site=scripts/tools/verify-site.js --forms=pseudo-content-narrow`
- 复现 B：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=B --verify-site=scripts/tools/verify-site.js --scratch-name=dist-probe-after --forms=pseudo-content-narrow`

### LOW · T11-font-size-tiny（形态 `font-size-tiny`） · 越界观察

**越界观察（不构成本版承诺内的缺陷）**：`.snote { font-size: 1px }`：盒宽满宽，文字缩到不可读（实测像素字迹只剩 112px —— 「窄柱」外观是字号造成的，不是宽度造成的） —— 判据两版都放行；它不是「页面级说明被压成窄柱」这条承诺里的缺陷。

- 复现 A：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=A --verify-site=scripts/tools/verify-site.js --forms=font-size-tiny`
- 复现 B：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=B --verify-site=scripts/tools/verify-site.js --scratch-name=dist-probe-after --forms=font-size-tiny`

### LOW · T11-letter-spacing-huge（形态 `letter-spacing-huge`） · 越界观察

**越界观察（不构成本版承诺内的缺陷）**：`.snote { letter-spacing: 40px }`：每行只剩几个字，盒宽与行宽都还是满宽 —— 判据两版都放行；它不是「页面级说明被压成窄柱」这条承诺里的缺陷。

- 复现 A：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=A --verify-site=scripts/tools/verify-site.js --forms=letter-spacing-huge`
- 复现 B：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=B --verify-site=scripts/tools/verify-site.js --scratch-name=dist-probe-after --forms=letter-spacing-huge`

### BLOCKER · T11-multicol-narrow-columns（形态 `multicol-narrow-columns`）

修复后的判据仍放行该形态：`.snote { column-count: 3; column-width: 340px; column-gap: 16px }`：**盒宽一字不动**，文字被排成 3 根 ~340px 窄列 —— 缺陷外观（窄柱）一字不差地回来了 —— 判据读数（修复后）盒宽 [1380,1380,1380] / textWidth [1380,1380,1380] 都「满宽」，而独立像素量测：可见文字实测 913px / 单行最长 447.3px（列宽 1380px ⇒ 只有 32%）。模式 B EXIT=0（122s · 842 项断言/失败 0）；模式 B EXIT=0（115s · 842 项断言/失败 0）；模式 B EXIT=0（95s · 827 项断言/失败 0）

- 复现 A：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=A --verify-site=scripts/tools/verify-site.js --forms=multicol-narrow-columns`
- 复现 B：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=B --verify-site=scripts/tools/verify-site.js --scratch-name=dist-probe-after --forms=multicol-narrow-columns`

### HIGH · T11-overlay-opaque（形态 `overlay-opaque`）

修复后的判据仍放行该形态：`.snote { position: relative } .snote::after { inset: 0 0 0 30%; background: #f6f7f9 }`：右侧 70% 被底色盖死 ⇒ 可见文字只剩左边 ~414px —— 判据读数（修复后）盒宽 [1380,1380,1380] / textWidth [1380,1380,1380] 都「满宽」，而独立像素量测：可见文字实测 414px / 单行最长 863.75px（列宽 1380px ⇒ 只有 30%）。模式 B EXIT=0（117s · 842 项断言/失败 0）；模式 B EXIT=0（115s · 842 项断言/失败 0）；模式 B EXIT=0（96s · 827 项断言/失败 0）

- 复现 A：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=A --verify-site=scripts/tools/verify-site.js --forms=overlay-opaque`
- 复现 B：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=B --verify-site=scripts/tools/verify-site.js --scratch-name=dist-probe-after --forms=overlay-opaque`

### BLOCKER · T11-float-narrow-column（形态 `float-narrow-column`）

修复后的判据仍放行该形态：`.snote::before { content:""; float: right; width: 70%; height: 6em }`：右侧 70% 被浮动占位吃掉，正文被迫排进左侧 30% ≈ 414px —— 判据读数（修复后）盒宽 [1380,1380,1380] / textWidth [1380,1380,1380] 都「满宽」，而独立像素量测：可见文字实测 411px / 单行最长 411.3px（列宽 1380px ⇒ 只有 30%）。模式 B EXIT=0（119s · 842 项断言/失败 0）；模式 B EXIT=0（114s · 842 项断言/失败 0）；模式 B EXIT=0（98s · 827 项断言/失败 0）

- 复现 A：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=A --verify-site=scripts/tools/verify-site.js --forms=float-narrow-column`
- 复现 B：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=B --verify-site=scripts/tools/verify-site.js --scratch-name=dist-probe-after --forms=float-narrow-column`

### HIGH · T11-clip-path-inset（形态 `clip-path-inset`）

修复后的判据仍放行该形态：`.snote { clip-path: inset(0 70% 0 0) }`：绘制期裁掉右侧 70%，盒宽/文字排版都不动 —— 判据读数（修复后）盒宽 [1380,1380,1380] / textWidth [1380,1380,1380] 都「满宽」，而独立像素量测：可见文字实测 414px / 单行最长 863.75px（列宽 1380px ⇒ 只有 30%）。模式 B EXIT=0（113s · 842 项断言/失败 0）

- 复现 A：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=A --verify-site=scripts/tools/verify-site.js --forms=clip-path-inset`
- 复现 B：`node research/_raw/secondary-page-layout-unification/adversary/harness.cjs --mode=B --verify-site=scripts/tools/verify-site.js --scratch-name=dist-probe-after --forms=clip-path-inset`

