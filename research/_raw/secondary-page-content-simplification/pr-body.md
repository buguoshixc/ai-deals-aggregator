## 本轮版本名：`secondary-page-content-simplification`

二级数据页**信息层级简化、首屏去解释化、维护口径下沉**。不是布局重构，也不是数据扩张。

**基线** `origin/master = a795ce3`（本地 `master` 当时落后 20 个提交，全部按最新树重新定位行号）
**分支** `secondary-page-content-simplification` @ `93c8a29`

---

### 核心改动

二级数据页（`/need/*` `/student/` `/developer/` `/free-api/` `/category/*` `/vendor/*` 两个枢纽）
首屏改为 **标题 → 条目数 → 最多一句必要限制 → 数据摘要 → 表格**；
分类判据、字段模型与维护边界从可见正文移进 `docs/DESIGN-RULES.md` 的口径归档。

三层说明模型（`why: string[]` → `userIntro` + `userNotes?`，覆盖 6 处定义）：

| 层 | 载体 | 本轮实测 |
|---|---|---|
| intro | `<p class="snote">`，0~1 句 | 顶部说明 **133–306 字 → 20–41 字**（平均 32，最长 41） |
| secondary | `<details class="page-notes">`，只放三类 | 45 页渲染；13 页有页级 `userNotes`（共 14 条） |
| maintenance | `docs/DESIGN-RULES.md` §8 口径归档 | **21 条**逐 slug 条目 |

**真没有用户价值的内容直接不展示**：`/category/chat|audio|image|agent` 4 页**完全没有** `userIntro`
（prompt §6C：「顶部只是解释为何属于这个分类 ⇒ 优先移除」）。

---

### 实测读数（Before → After）

**首屏几何 @1440×900**

| 路由 | intro 字数 | intro 行数 | 首个数据区距离 | 页高 |
|---|---|---|---|---|
| `/need/ai-coding/`（编程开发） | 232 → **28** | 2 → 1 | 60.78 → **40.39** | 1066 → 1017 |
| `/need/free-tier/`（免费额度） | 221 → **28** | 2 → 1 | 60.78 → **40.39** | 6729 → 6680 |
| `/need/free-model/`（免费模型） | 155 → **20** | 2 → 1 | 60.78 → **40.39** | 1724 → 1675 |
| `/student/` | 212 → **33** | 2 → 1 | 60.78 → **40.39** | 1902 → 1837 |
| `/vendor/zhipu/` | 283 → **23** | 3 → 1 | 81.17 → **40.39** | 2646 → 2577 |
| `/need/china-usable/` | 306 → **41** | 3 → 1 | 81.17 → **40.39** | 3487 → 3417 |
| `/category/`（枢纽） | 137 → **22** | 2 → 1 | 60.78 → **40.39** | 900 |
| `/status/` | 226 → **133** | 2 | 60.78 | 1106 |

**移动端 390×844（收益最大）**：`/vendor/zhipu/` intro **9 行 → 1 行**、页高 **4021 → 3580（−441px）**；
`/need/ai-coding/` **8 → 1 行**、`1616 → 1310`；`/student/` **7 → 2 行**、`2643 → 2267`。三档 **0 横向溢出**。

---

### 0 变化（逐字节证据）

| 检查项 | 读数 |
|---|---|
| 非 HTML 产物（Feed / sitemap / JSON / logo / 图片） | **117/117 逐字节相同** |
| **JSON-LD 三段** | **186/186 逐字节相同** |
| `data-item` / `data-child` 行集合 | **186/186** |
| 全部 `href` 集合 | **186/186** |
| canonical / `<title>` / `meta description` / `robots` | **186/186** |
| HTML 剥掉 5 条 Diff Allowlist 后 | **186/186**（原样相同 140/186） |

`index.html` **完全未改**（共享页脚 `:1295` 已有免责声明，
45 个目录页 + `/status/` 上逐页重复的那句删除即可）。
JSON-LD / sitemap / Feed / 路由 / 分类逻辑（`needsOf()` 等）**一处未动**。

---

### 门禁改动

**重瞄（不是删除）既有断言** —— 三处方向相反的旧断言都换成了守新形态的等价物：

- `audience-selftest`「每条 why 至少三句」（`why.length >= 3`，方向与本轮相反）→
  **4 张注册表 × 7 条反向形状断言**（`userIntro` 非空且 ≤60 字 / 不含内部词 /
  旧的 `why` **回流即红** / 归档逐页可查 / 无空容器 / 无 Markdown / 无写死条数）
- `verify-site` §15b2 需求页探针：旧断言在改动后**仍然会绿**（`这一页` 由**表头**保证），
  但它声称守的「判据说明」已经不在页面上 —— 属于「数错了东西的断言」⇒ 重瞄为
  「条目 + 首屏那一句 + 底部折叠说明」
- `thin-content` 下限公式**一字未改**，作为删除预算的承重闸门

**新增**：

- **R1** `verify-site` §22c 新码 `note-intro-long`（首个数据区之前的 `.snote` ≤ 2 行）
  + **M14 隔离变异牙**（DOM 注入只推高行数，实测命中 `[note-intro-long]` 无伴随码）
  + 适用范围自检；违规码 **12/12 可达**
- **R2** 构建期首屏内部措辞扫描（45 页 × 8 禁词，扫描面**只限 intro 区**；
  `判据` 不在禁词表 —— 它是业务语义，prompt §18 明确不做机械全站禁词）

**顺带修一个真实缺陷**：`vendor-page.js` 的 `.vsnote` 直接吐裸 Markdown
（`**套餐变化日志**` 且没过 `rich()`），**25 个厂商页**上读者看到字面星号而构建全绿。
同时把「作者正文无 Markdown 记号」的扫描面扩到 `.vsnote` / `<details>`
（原扫描面照不到新容器 —— 「换个位置就静默失去覆盖」）。

---

### 门禁读数

```
Full Gate        51 步 → 执行 47 / 通过 47 / 失败 0 / 跳过 4 · exit 0
CI 口径检查      38 项 / 0 失败
verify-site      855 项 / 0 失败（§22c 逐条判 352 条 / 186 页）
§22c 违规码      note-narrow 0 · note-ink-narrow 0 · 藏字 0 · 不同轴 0 · 裁切 0 · 首屏过长 0
冻结串           186/186 页内联样式里恰好 1 次
```

**P0 = 0 · P1 = 0 · REPAIR_NOW = 0**（`P2/DEFERRED` 1 条，见下）

---

### 已知遗留（P2 / DEFERRED，不阻断）

正文下限余量收窄到三位数：`/category/` 枢纽 333 → **146** 字、`/need/no-card/` 514 → **152** 字。
下限按数据现算（条目/子页越多越高），两道独立检查全过，**不是缺陷**；
但若将来继续删正文，`/category/` 枢纽会第一个变红。
**处置：不要调低下限公式**（`research/_raw/v3.0-antigaming.js` 有下限单调性规则）。

---

### 证据与文档

- 报告 `research/secondary-page-content-simplification-report.md`（逐族 before/after/归类/动作）
- Self-Audit `research/secondary-page-content-simplification-self-audit.md`（prompt §39 七问逐条）
- 一次性装置 `research/secondary-page-content-simplification-verify/`（读数 + Diff Allowlist 比对 + Gate 读数）
- 原始读数 `research/_raw/secondary-page-content-simplification/`（`before.json` / `after.json` / `diff-verify.json`）
- 规范 `docs/DESIGN-RULES.md`（H11 + 口径归档 + 落地情况表）、`docs/SCHEMA-v1.1.md`、`docs/ARCHITECTURE.md`

**过程缺陷记录在案（4 条里 3 条是量具/判据自己的问题）**：
`note-intro-long` 第一版漏了「阅读列宽」物理前置条件，@360 把 **17 个本轮没改过**的页面判红 ——
判据自己也要被咬，这次是被真实门禁读数咬住的。
