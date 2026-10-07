# 测试（Testing）

> **这份文档回答四个问题**：每层测什么、什么时候跑、哪些是 required、**什么时候不该加 Mutation**。
> 分层声明的**唯一出处**是 `scripts/test/layers.js`；本文解释它、不复制它。

---

## 1. 六个层

判据是「**它需要什么才能跑**」，不是「它测什么」——因为「需要什么」决定了顺序、定位与失败含义。

| 层 | 测什么 | 前提 | 数量 | 典型耗时 |
|---|---|---|---|---|
| **L1 unit** | 纯函数 / parser / 映射 | 无 | 2 | 0.4s |
| **L2 domain integration** | 仓库数据 → 判据（真值边界、派生、身份、历史一致性、逐字节可复现） | 仓库数据，**不需要 dist** | 27 | ~35s |
| **L3 build integration** | `dist/` → 产物级对账（路由闭包、sitemap、manifest、SEO、逐字节可复现） | **需要先 build** | 9 | ~25s |
| **L4 browser** | 布局 / 可见性 / 溢出 / 交互 / 响应式 / JS 错误 | dist + playwright + Edge/Chrome | 2 | ~120s |
| **L5 release smoke** | 线上站点少量关键页 | 网络 + 已部署站点 | 1 | ~5s |
| **L6 mutation** | 定向篡改后**必须出现预期违规码** | 随宿主层 | 清单（见 §5） | — |

**为什么 L1/L2/L3 的划分可信**：它与门禁自己的步骤顺序一致 —— 排在该 action
「Assemble site」**之前**的检查都不需要 dist，排在之后的都需要。所以
`npm run test:l1 && npm run test:l2` 在**没有 dist/** 的干净检出里也必须全绿；
某个「L2」测试若偷偷读了 dist，在那里就会红 —— 这正是分层要暴露的隐藏依赖。

---

## 2. 什么时候跑什么

| 场景 | 跑什么 | 命令 |
|---|---|---|
| 改了一个纯函数 | L1 | `npm run test:l1` |
| 改了数据 / 判据 / 注册表 | L1 + L2 | `npm run gate:fast` |
| 改了页面正文 / 构建 / SEO | L1 + L2 + **build** + L3 | `npm run build && npm run gate:build` |
| 改了布局 / CSS / 交互 | ↑ + L4 | `npm run build && npm run gate:browser` |
| 提交前（与 CI 同一条链） | **门禁本体** | `npm run gate` |
| 发布前 | 上面全部 + L5 | `npm run build && npm run gate:release`（L5 需线上站点） |
| 改了架构边界 | + 架构不变量 | `npm run fitness` |
| 提交证据前 | + 证据政策 | `npm run check:evidence` |

### `npm run gate` 是什么

**它就是 CI 门禁本体**：`scripts/test/run.js --gate` 解析
`.github/actions/gate/action.yml`（**唯一出处**），按顺序执行其中的 `node <script>` 步骤，
非 node 步骤（`npm ci`、浏览器探测、Summary）明确列出跳过原因。

于是「本地 gate == CI gate」不是因为大家记得同步，而是因为**只有一份步骤定义**。
本轮之前仓库里**没有**这个入口 —— 48 个步骤只存在于 bash 复合 action 里，
「本地全绿、推上去才红」是结构性风险。

---

## 3. 哪些 required

| 层 | required？ | 理由 |
|---|---|---|
| L1 / L2 / L3 | **是**（门禁步骤） | 红了就是判据坏了 / 产物坏了 |
| L4 browser | **是**（CI 里浏览器不可用会**硬失败**，除非人工显式降级） | 布局 / 可见性 / 溢出只有浏览器能证明 |
| L5 release smoke | **否**（发布后手动 / `workflow_dispatch`） | 需要线上站点 |
| L6 mutation | **CORE / REGRESSION 是**；ADVERSARIAL 手动 / nightly；THEORETICAL 不阻塞 | 见 §5 |

**分级门禁**（对外仍保留 `npm run gate` 兼容既有的「一条命令跑完」习惯）：

```
npm run gate:fast      L1 + L2            （~35s）
npm run gate:build     + build + L3       （~65s）
npm run gate:browser   + L4               （~185s）
npm run gate:release   + L5               （需线上）
npm run gate           门禁本体（与 CI 同一份 action.yml，~277s）
```

---

## 4. 分层表怎么维护（只有一处要改）

新增一个测试时的顺序：

1. 写脚本，在 `package.json` 里登记（**存在性**的唯一出处）；
2. 在 `.github/actions/gate/action.yml` 里加一步（**CI 真的跑到**的唯一出处）——
   `check-ci-consistency.js` 的断言 (17)/(19) 双向把守这一步；
3. 在 `scripts/test/layers.js` 里声明它属于哪一层（**层归属**的唯一出处）。

第 3 步之后 `npm run fitness` 会检查三件事：表里没有幽灵条目、每个 `selftest:*` 恰好属于一层、
同一 script 不出现在两层。「每个测试都被门禁跑到」这个方向**刻意不重复**——
它的 owner 是 `check-ci-consistency.js` 的 (17)/(19)。**同一个不变量两处证明**正是本轮要消灭的形态。

---

## 5. Mutation / Tooth Test 治理

### 5.1 现状（从源码派生，`npm run test:layers` 会打印）

| 文件 | 说明 |
|---|---|
| `scripts/tools/coverage-targets-selftest.js` | 分支覆盖最密的一支 |
| `scripts/tools/verify-site.js` | §22b 的 M1–M5（浏览器内变异）+ 反空洞守卫 |
| `scripts/tools/data-docs-selftest.js` | 声明与产物对账 |
| `scripts/tools/ai-eval.js` | AI 层抽题用例 |

### 5.2 四类与默认处置

| 分类 | 含义 | 默认 |
|---|---|---|
| **CORE** | 守护**全站级**不变量（稳定 ID、路由闭包、逐字节可复现） | required CI |
| **REGRESSION** | 守护**历史上真的发生过**的回归 | required CI |
| **ADVERSARIAL** | 对抗性构造（畸形输入、极端规模） | 手动 / nightly |
| **THEORETICAL** | 理论上可能、但无实证路径 | 不阻塞 |

`verify-site.js` §22b 的 M1–M5 归 **REGRESSION**：它们守护的是
`leaf-detail-layout-v1` 的叶子详情页统一内容列（commit `f2dec0c` 记录的真实回归），
且带着**反空洞守卫** —— 变异锚点必须恰好出现 1 次、变异不生效即判红、另有 M4 正对照与
「零磁盘污染」断言。这是高质量变异测试的形态，**留在 required CI**。

### 5.3 新增 Mutation 前必须回答的四个问题

1. **防什么真实 invariant？**（说不出具体不变量的，不加）
2. **历史上是否出过？**（出过 ⇒ REGRESSION；没出过但结构上必须成立 ⇒ CORE；都没有 ⇒ 不加或 THEORETICAL）
3. **普通断言为何抓不到？**（抓得到的，普通断言就够了 —— 变异测试的价值只在那条缝隙里）
4. **维护成本是多少？**（锚点会不会随无关改动漂移？漂了谁修？）

**四个问题里有一个答不上来，就不加。**

### 5.4 什么时候**不该**加 Mutation

- **同一个 invariant 已有普通断言**：加牙只是把同一件事说两遍，而牙更脆（锚点会漂）。
- **断言本身是恒真的**：先修断言，别加牙去「证明」它。（本轮审计记录过同类教训：
  `/status/` 与分类页的「预渲染正文过短」断言当年在数 CSS —— 一个量错了东西的断言比没有断言更糟。）
- **锚点是代码形状而非语义**：例如锚 `class="x y"` 的顺序 —— 无害重构会让它失效，
  而失效的表现是「变异不生效却算通过」（§22b 的反空洞守卫正是为了拦这个）。
- **它会拖慢 required CI 而没有换来定位能力**：昂贵且只证明理论可能性的，放 nightly 或干脆不加。

### 5.5 一句话原则

> **靠近真值源的一条 + 必要的一条端到端**，即可。
> 同一个 invariant 被三个 selftest 各证明一遍，是成本而不是保障。

---

## 6. 断言该写在哪一层（避免重复证明）

| 想验证的东西 | 写在哪层 | 为什么 |
|---|---|---|
| 一个纯函数的边界 | L1 | 最快、最稳、失败定位最准 |
| 数据契约 / 真值边界 / 身份映射 | L2 | 判据在 lib，数据在仓库 |
| 页面之间的一致性（路由闭包、sitemap、canonical、ItemList 对账） | L3 | 只有产物才回答得了 |
| 布局 / 可见性 / 溢出 / 交互 / 响应式 / JS 错误 | **L4** | 静态检查看不见；这是浏览器唯一不可替代的价值 |
| 线上真的存在且是同一份 | L5 | 只有线上能回答 |

**不要用浏览器重复验证 schema / count** —— 那类断言在 L2/L3 里更快更准，
放进 L4 只会让浏览器那一层的失败含义变模糊（§29-Q5 问的就是这件事）。
