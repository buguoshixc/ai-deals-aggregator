# deals.json v1.1 数据契约（学生 / 开发者模型）

阶段：`v1.1-student-developer-model`　·　状态：**冻结**（实现期的唯一契约，改它必须走 amend）
基线：`deals.json` schemaVersion 2、134 条、22 个字段（`scripts/lib/schema.js`）

> 这一版只回答一个问题：**「这条优惠适不适合一个中国大学生 / 开发者。」**
> 它不负责首页 IA，也不负责分类入口 —— 那是 v1.2 的事。

---

## 一、设计目标与硬约束

| # | 约束 | 落地方式 |
|---|---|---|
| 1 | 兼容现有 `deals.json` | 全部新字段**可缺席**（`undefined`/`null` 同义），旧 134 条无需人工补完 |
| 2 | 允许逐步补齐 | 字段逐个独立，不存在「填了一半就非法」的组合 |
| 3 | 采集器只填自己确定的 | 采集器不写 = 该字段缺失 = unknown，**不是** `false` |
| 4 | curated 可以提供更完整的字段 | `curated_*.json` 走同一套 `makeDeal`，字段更全 |
| 5 | merge 不得用低可信覆盖高可信 | 逐字段可信度仲裁（第五节） |
| 6 | validate 能发现非法枚举 / 类型 | `validateDeal` 硬拦非法枚举、类型、越界；`--strict` 再加「不猜」守卫 |
| 7 | build / 前端安全处理 null / unknown | 渲染函数只认「有明确数据」的字段组，缺项**不渲染**，unknown 有专门措辞 |

---

## 二、六个新字段

新增字段全部挂在 `allowed` 白名单里，**顺序固定**（写在 `zh` 之后，见 `scripts/lib/schema.js` 的 `AUDIENCE_FIELD_ORDER`）。

### 2.1 `audience` —— 适用人群

```jsonc
"audience": ["student", "developer"]
```

| 项 | 值 |
|---|---|
| 类型 | `string[]` \| `null` |
| 枚举 | `student` · `developer` · `educator` · `education` · `general` · `other` |
| 约束 | 非空数组、去重、每项必须是枚举值；`null` 等价于「未标注」 |

- **允许一人多属**：`["student","developer"]` 是合法且常见的取值（GitHub Student Developer Pack 就是）。
- `educator` 是教师 / 教研人员；`education` 是教育机构整体（学校采购、校园计划），
  两者刻意分开 —— 合并会让「教师免费」与「学校批量采购」看起来是同一件事。
- `general` 的含义是**来源明说面向所有用户**，不是「我们不知道它面向谁」。
  后者是 `null`。

### 2.2 `benefitType` —— 福利类型

```jsonc
"benefitType": ["free_subscription", "free_model"]
```

| 项 | 值 |
|---|---|
| 类型 | `string[]` \| `null` |
| 枚举 | `free_subscription` · `free_credits` · `free_api` · `free_model` · `discount` · `trial` · `student_plan` · `developer_credit` · `other` |

- 数组而非单值：一条优惠常常同时是「免费额度」与「免费 API」
  （阿里云百炼：赠送 Token 额度，且额度只能用于 API 推理）。
- `student_plan` 专指**要求学籍/教育身份**的计划；`free_subscription` 是「不要钱就能用完整订阅」，
  两者可以并存（GitHub Copilot Student = `["student_plan","free_subscription"]`）。

### 2.3 `eligibilityDetail` —— 资格门槛（三态）

```jsonc
"eligibilityDetail": { "studentRequired": true, "educationEmailRequired": false }
```

| 键 | 含义 |
|---|---|
| `studentRequired` | 是否必须是在校学生身份 |
| `educationEmailRequired` | 是否必须用教育邮箱（`.edu` / `.edu.cn` 等） |
| `identityVerificationRequired` | 是否需要实名 / 身份认证 |
| `newUserOnly` | 是否仅限新用户 |

| 项 | 值 |
|---|---|
| 类型 | `object` \| `null`；每个值是三态之一 |
| 三态 | `true` · `false` · `"unknown"` |
| 约束 | 键必须在白名单内；不得出现空对象（没东西就整体写 `null`） |

**为什么 `false` 与 `"unknown"` 是两个值而不是两个写法**：`false` 是**来源明说不需要**，
`"unknown"` 是**我们没看到证据**。页面替读者做决策时，这两者的后果完全相反
（「不用学生认证」可以立刻去领，「还没确认要不要认证」得先去看官方页）。
用 `unknown` 这个**字符串**而不是 `null`，是为了让三态在任何一次 JSON 往返后都还在 ——
`undefined` 会被 `JSON.stringify` 吞掉，`null` 与「字段没写」在对象里长得一样。

### 2.4 `claimRequirements` —— 领取要求（三态）

```jsonc
"claimRequirements": { "creditCardRequired": "unknown", "accountRequired": true }
```

| 键 | 含义 |
|---|---|
| `creditCardRequired` | 领取是否需要信用卡 / 绑卡 |
| `manualApplication` | 是否需要人工提交申请 / 等待审核 |
| `accountRequired` | 是否必须先注册账号 |

类型、三态、约束同 2.3。

### 2.5 `availability` —— 中国大陆可用性

```jsonc
"availability": { "chinaUsable": false, "regionRestriction": "官方条款限定美国/加拿大地区用户" }
```

| 键 | 含义 |
|---|---|
| `chinaUsable` | 中国大陆用户能否正常注册并领取使用 |
| `regionRestriction` | 来源写明的地区限制原文摘要（≤120 字） |

- `chinaUsable` 同样是三态 `true` / `false` / `"unknown"`，**`unknown` 是默认与绝大多数取值**。
- `regionRestriction` 只在来源**确实写了**地区条款时填；它是对原文的摘要，不是我们的推断。
- 与既有 `region` 字段的关系：`region` 说的是「这条优惠来自国内还是国外来源」，
  `availability.chinaUsable` 说的是「国内用户能不能用」。两者独立 ——
  `region: "global"` + `chinaUsable: true`（例如全球可用但需国际信用卡）是合法组合；
  `region: "cn"` + `chinaUsable: true` 也常见，但 `region: "cn"` **不构成** `chinaUsable: true` 的证据。

#### 2.5.1 什么算「明写」，什么只能算推断（**amend 3：2026-09-29 二次校准**）

这一条被反复讨论过（我先否掉了「国内厂商 ⇒ 可用」，数据侧又提出「需实名认证 ⇒ 可用」），
所以把边界写死，免得第三个人再来一轮：

| 证据 | 取值 | `basis` / `derived` | 例子 |
|---|---|---|---|
| 官方**明文地区条款**（限定/排除某地区） | 按条款取 `true` / `false` | `documented` / `stated` | Google 学生优惠按国家区分、Anthropic 非营利条款 |
| 官方**明确要求中国大陆实名认证 / 大陆手机号绑定** | `true` | `inferred` / `inferred` **+ note** | 百度千帆「需实名认证」、Kimi「需实名认证」、360智脑「绑定手机号」 |
| 只是**国内厂商 / 中文页面 / 面向国内开发者** | **`unknown`** | —— | 「火山引擎是国内厂商」这种不是证据 |
| 只是「需完成认证」（未说是哪种认证） | **`unknown`** | —— | 企业认证、邮箱认证都叫「认证」，推不出大陆实名 |
| 什么都没写 | **`unknown`** | —— | 绝大多数条目 |

**为什么第二档可以取 `true`**：大陆实名认证只能由持大陆身份证的用户完成，这条要求本身
就**排除了**「境外用户才能领」的可能，是所有「没有明文条款」里最强的一类信号；而且它写成
`inferred` + note（推理链逐条可核），不是伪装成官方原话。

**为什么第三、四档不行**：「国内厂商」证明不了任何一个具体用户能领到；
「需完成认证」连是哪种认证都没说。两者都属于「把相关性当证据」。

**一致性要求**：同一批数据里不许出现「A 条按第二档取 `true`、B 条同样证据却留 `unknown`」
—— 那会让覆盖率这个数字失去意义。`audience-report` 的「已知 / unknown / 缺席」三栏就是
让人能一眼看出有没有这种不一致。

### 2.6 `provenance` —— 「这条断言是谁说的」

```jsonc
"provenance": {
  "credibility": "curated",
  "sourceUrl": "https://docs.github.com/en/copilot/...",
  "verifiedAt": "2026-09-22",
  "fields": {
    "audience":        { "basis": "source", "derived": "stated" },
    "availability":    { "basis": "source", "derived": "inferred",
                         "note": "官方页面写明仅限美国与加拿大地区用户" }
  }
}
```

| 键 | 值 |
|---|---|
| `credibility` | `editorial` · `curated` · `collected` |
| `sourceUrl` | 断言所依据的官方页（http/https） |
| `verifiedAt` | 人工回访日期（仅 `editorial`/`curated`；禁止未来日期） |
| `fields` | 字段名 → `{ basis, derived?, note? }` |
| `basis` | `source`（来源明确写了）· `documented`（依据官方条款原文）· `inferred`（从原文推出） |
| `derived` | `stated` · `inferred`（`basis: "inferred"` 时**必须**给 `note`） |
| `contrib` | **逐字段记账**：字段名 → 该字段最终值的贡献者可信度数组（如 `["curated","collected"]`）。见 §5.2.2 |

**可信度次序**：`editorial` > `curated` > `collected` > （无 provenance）。

### 5.2.2 `provenance.contrib` —— 可信度的**落点**（amend：t1 核验发现的 blocker）

§5.2.1 要「整条可信度 = 最终值贡献者的最低档」，但第一版契约**没有说这份记账存在哪里**。
这是 blocker 而不是文档疏漏，因为它有一个按天复发的后果：

```
第 1 天  merge 时把 curated 的值与 collected 的值混合 → 内存里知道 contrib
        但 contrib 没落盘 → 写进 deals.json 的只有合并后的值
第 2 天  loadStore 读回来的记录**没有任何记忆**
        → entryCredibility 退回 provenance.credibility（书写期的、偏高的那个）
        → 它拿这个偏高的可信度去赢第 3 天的字段 …… 假可信度被继承并放大
```

也就是说：**不落盘就等于没做**。所以 `contrib` 是 `provenance` 的一个正式键，
必须写进 `allowed` 白名单与 §7.1 的校验，跟着记录一起落盘。

规则：

- 形状：`{ [字段名]: [可信度, …] }`，字段名限于六个 v1.1 字段，值是 `editorial|curated|collected` 的**非空数组**（去重）；
- 语义：该字段**最终值的每一个贡献者**各记一次。单来源时是一个元素的数组 ——
  仍然是它，因为「只有一个来源」本身就是需要记住的事实；
- `credibilityOf(deal)` = `min(contrib 里全部可信度)`；
  没有 `contrib` 时退回 §5.2 的来源推断（旧条目、手写数据走这条）；
- `contrib` 只在 merge 期写入与更新，**不参与渲染**，也不进覆盖率报告的分母；
- 它**不是**「出处声明」，所以 `fields` 的约束（必须指向有值的字段）不适用于它 ——
  两者分开校验。

### 5.2.3 editorial 档必须**来源可信**（amend：t1 核验 F5）

第一版的 `editorial` 判据只写了「`verified === true` 且带 `verifiedAt`」，于是
**任意自动采集条目只要带这两个字段就会被当成人工核验**（实测放行）。
「已人工对照官方页」是人的声明，它只能出现在人工维护的来源上。定稿：

```
editorial ← source ∈ {Curated, Curated-CN} 且 verified === true 且 verifiedAt 非空
curated   ← source ∈ {Curated, Curated-CN}（未核验）
collected ← 其余有 source 的
none      ← 无 source
```

### 5.2.4 迁移的两条规则撞车时的优先级（amend：t1 核验 F7）

§6.1 的两条规则在真实数据上 **32/32 同时命中**（策展条目全部是
`source ∈ {Curated, Curated-CN}` **且** `verified:true + verifiedAt`）。优先级定死：

> **editorial 优先于 curated。** 理由：人工核验是**更强**的依据（有人在那一天真的
> 回访过官方页），而「来源是策展文件」只说明它是人工写的。反过来取 curated 会
> 把一份更强的依据降级，属于丢信息。`curated` 档只对「Curated 来源但未核验」的条目生效。
>
> 实测佐证：renderer 的迁移夹具第一版把期望值写成 `curated` 而被自己的夹具抓出来 ——
> 这条优先级不定死，两个实现都会自认为对。

- `provenance` 在整个条目上只有一份，但**逐字段**声明依据 ——
  「人群是官方页写的、中国可用性是我们从条款推的」这种混合来源是真实现状，
  一个整条级别的标记说不清它。
- provenance 里出现的每个字段名，都必须是**这条记录上真的存在且非空的字段**；
  反之，`--strict` 下任何「已知值」（三态非 `"unknown"`、数组非空）都应当有 provenance 覆盖
  —— 这条由 `checkAudienceGuard()` 的探针与 `audience-report` 的覆盖率一起盯着。
- `note` ≤ 200 字。它是给我们自己看的，**不渲染到页面上**。

---

## 三、默认值 / 缺席语义

| 情形 | 存储 | 含义 |
|---|---|---|
| 旧条目、采集器没写 | 字段**不写入**（`makeDeal` 不产出该键） | unknown，页面不渲染该行 |
| 明确写 `null` | 允许；`makeDeal` 会把它省略掉 | 同「不写入」 |
| 三态 `"unknown"` | **写入** | 该维度我们查过、没有证据 |
| 空数组 `[]` | **非法**（validate 拦） | 「没有人群」不是一种人群 |
| 空对象 `{}` | **非法**（validate 拦） | 同上 |

> 为什么空容器要判非法：一个空数组在渲染层的分支与 `null` 完全不同
> （`[]` 会走进「有 audience」分支然后渲染出空行）。把「没写」与「写了但是空」
> 这两件事在**数据层**归一，渲染层就不需要为它写防御代码。

---

## 四、unknown 语义（本阶段最重要的一条）

1. **没有证据 ≠ false。** 页面没有写「不需要信用卡」，`creditCardRequired` 只能是
   `"unknown"`，绝不能是 `false`。
2. **unknown 有专门的措辞，不伪装成确定答案。** 详情页对三态字段一律走同一张映射表：

   | 值 | 中文措辞 |
   |---|---|
   | `true` | 是 / 需要（照字段而定） |
   | `false` | 否 / 不需要 |
   | `"unknown"` | **尚未确认** |

   「中国大陆可用性：尚未确认」是正确输出；「中国大陆不可用」是错误的输出。
3. **`unknown` 不等于「不可用」也不等于「可用」**：它不进任何筛选判定，也不参与打分。
4. **缺字段的整组行不渲染**：`availability` 整个缺席时，详情页不出现「中国大陆可用性」这一行
   （一行「尚未确认」是信息，一行「未收录」是噪音 —— 前者说明这条我们真的查过）。

---

## 五、merge 策略

`scripts/lib/dedup.js` 的 `merge(a, b)` 在两个方向上收紧：

### 5.1 逐字段可信度仲裁

对每个新字段，取「值 + 该值的可信度」两侧比较：

| 情形 | 结果 |
|---|---|
| 一侧缺席 | 取另一侧（保留其 provenance 可信度） |
| 两侧相同 | 保留，provenance 取较高可信度 |
| 一侧 `"unknown"`、一侧已知 | **已知值胜**（信息量优先，与可信度无关） |
| 两侧已知且冲突 | **可信度高者胜**；同可信度时取原 winner，并把冲突计入 `stats.audienceConflicts` 供人工复核 |
| 数组（`audience` / `benefitType`） | **取并集**，不删任何一侧的元素 |
| 对象（三态映射） | **逐键**做上面的仲裁，不整体替换 |

### 5.2 可信度归属

一条记录的可信度 = `provenance.credibility`，没有 provenance 时按来源推断：

```
editorial  ←  source ∈ {Curated, Curated-CN} 且 verified === true 且带 verifiedAt（见 §5.2.3）
curated    ←  source ∈ {Curated, Curated-CN}（未核验）
collected  ←  其余（自动采集）
none       ←  无 provenance（旧条目）
```

> **amend（2026-09-29，t1 核验的 B6——契约自相矛盾）**：这一段原文写的是
> 「`editorial` ← 人工核验（`verified === true` 且带 `verifiedAt`，来源不限于策展）」，
> 而 §5.2.3 要求「`editorial` 必须**策展来源**」—— 两套互斥定义同时躺在契约里，
> 实现跟了 §5.2.3。这里已改成与 §5.2.3 一致的口径，**§5.2.3 是唯一出处**。
> 留档的原因：一份自相矛盾的契约比一份不完整的契约更危险 —— 两边都能引经据典。

**5.2.1 一条记录的「整条可信度」= 它的**最终值贡献者**的最低档**（amend：t1 核验提出的口径缺口）

这是逐字段仲裁的**输入**，所以它必须比「provenance 里写了什么」更保守。两种可能的口径
差别很大，取错会让低可信的值在后续轮次里赢：

| 口径 | 一条 `provenance.credibility: 'curated'`、但某个字段的值实际来自采集侧的记录 | 后果 |
|---|---|---|
| ❌ 取 provenance 的声明值 | 整条算 `curated` | 下一轮它拿这个偏高的整条可信度去赢别的字段，**假可信度会被继承并放大** |
| ✅ 取**贡献者最低档** | 该字段拖低整条 → 整条算 `collected` | 与 5.3.2 同一套推理：不可信的来源不得靠别人的出处抬身价 |

落地口径（与 5.3.2 的 `contrib` 记号共用一份数据）：

```
entryCredibility(deal) = min(contrib 里每个最终值贡献者的 credibility)
                         → 无 contrib 信息时退回 provenance.credibility
                         → 无 provenance 时按来源推断（上表）
```

`none`（无来源可推断）比 `collected` 更低，参与比较时排在最后。

覆盖率报告必须用**同一个** `entryCredibility`，不许报告自己再推一套 —— 否则「报告说
curated、仲裁算 collected」这类分歧会出现，而且两边都觉得自己对。

### 5.3 绝不发生的事

- 采集器（`collected`）不得覆盖 curated / editorial 的已知值；
- 一次 merge 不得把已知值降级成 `"unknown"`（信息只增不减）；
- provenance 不得指向一个被 merge 掉的值（merge 后重新核对 fields 键，指向空字段的条目会被丢弃）。

**5.3.1 已复现的真实漏洞：`score()` 选出的 winner ≠ 可信度最高的来源**（2026-09-29 实测）

现有的「winner 为空则取 loser」兜底循环让「winner 被 loser 覆盖」不可能发生，所以危险不在
那边。真正会静默毁数据的是 **winner 选错人**：

```
采集侧  { source:'智谱AI', type:'deal', discountInfo:…, expiresAt:…, availability:{chinaUsable:true} }
        score = 50(deal) + 25(文案) + 8(日期) + 40(来源优先级) = 123
策展侧  { source:'Curated', type:'tool', verified:true, verifiedAt:…, availability:{chinaUsable:false} }
        score = 0(tool) + 20(已核验) + 100(来源优先级) = 120
→ winner = 采集侧；人工核过的 false 被机器推的 true 覆盖，validate 看不出、无任何记录
```

关键在于**策展条目一旦被推导成 `tool`，就先输掉 50 分**，而 `SOURCE_PRIORITY` 里 Curated 的
100 分追不回来。所以可信度仲裁必须是**独立于 `score()` 的一条路径**：`score()` 继续决定
「谁代表这张卡」（5.4 不变），而六个新字段的**取值**由逐字段仲裁决定。冲突必须留痕
（`stats.audienceConflicts` 要能说出哪条、哪个字段、谁覆盖了谁、双方可信度），不能只给计数。

**5.3.2 provenance 不得为一个它没提供过的值背书**

合并后的 `credibility` 是单值，而合并后的值可能是**多来源**的。若某字段的值实际来自采集侧、
而 provenance 的 `credibility` 是 `curated`，那份 provenance 就替一个它没提供过的值签了字
—— 与 v1.0 那 21 页伪造溯源同族，因此是本阶段的 blocker 级约束。

落地口径：

- 合并时记住每个字段值的**来源可信度**，不只知道值本身；
- 某字段的最终值来自**单一**可信度 → `fields[field]` 与该 `credibility` 可以保留；
- 来自**多个**可信度（数组取并集、或对象逐键混来源）→ **丢弃该字段的 `fields` 条目**
  （宁可没有出处说明，也不要一个错的出处），必要时把 `credibility` 下调到贡献者的最低档，
  或整块不写 provenance；
- provenance **永不凭空生成**：没有 provenance 的旧条目与采集条目，合并后仍然没有。

对应牙齿：构造「策展有 provenance、但字段值来自采集」的两轮 merge，断言结果里**不存在**
「credibility 高于该字段实际来源」的 `fields` 条目。

**5.3.3 一条必须提前写下的运维事实：provenance 会随合并**退化**，这是设计而不是 bug**

按 5.3.2 的规则，一条记录只要有一次被采集侧赢了某个字段的取值，那份 provenance 就会
被裁剪（丢条目、降 credibility，甚至整块消失），而且**没有任何路径会把它加回来**
（provenance 永不凭空生成）。

后果：`deals.json` 里的 `provenance` 覆盖率会**低于**人工书写时的覆盖率，跑几轮采集之后
可能明显偏低。这不是数据出了问题，而是「宁可不写出处、也不写一个错的出处」的代价 ——
本项目的立身之本是不说没证据的话，一个错出处比没有出处更糟。

所以 `audience-report` 必须把两个口径**分开报**，否则读者会把退化读成丢失：

| 口径 | 数据源 | 回答的问题 |
|---|---|---|
| 书写期覆盖率 | `scripts/data/curated_*.json`（人工文件，合并前） | 「我们人工核过多少条」 |
| 发布期覆盖率 | `deals.json`（合并后） | 「线上此刻有多少条带得出处」 |

并且报告里要有一行固定说明：**发布期低于书写期是预期**，差值 = 被采集侧赢走的字段数。

### 5.4 `score()` 不变

去重时的「谁代表这张卡」仍由既有 `score()` 决定（优惠 > 工具、有文案 > 无文案、来源优先级）。
新字段**不进 score**：把「填得更全」变成「更容易赢」会悄悄改变折叠卡的标题与落地页，
那是 v1.2 的事，本阶段不碰。

---

## 六、migration 策略

**不做一次性大重写。** 两条路径同时成立：

1. **读时归一（主路径）**：`makeDeal()` 对新字段一律做归一 —— 非法枚举丢弃、`null` 省略、
   三态字符串归一。`loadStore()` 读到的旧条目在**下一次采集写盘**时自动带上规范形态，
   无需人工跑脚本。
2. **一次性脚本（可选，`scripts/migrate.js --audience`）**：给存量补 provenance，
   规则只有一条 —— **只给「有据可查」的条目补**：
   - `source ∈ {Curated, Curated-CN}` → `credibility: "curated"`；
   - `verified === true` 且有 `verifiedAt` → `credibility: "editorial"`；
   - 其余：**不补**（它们的新字段本来就是空的，凭空盖一个来源就是造假）。

脚本的验收标准是「跑完 `validate --strict` 全绿」+「除 provenance 外，任何既有字段逐字节不变」。

**字段顺序**：新字段统一追加在记录**末尾**（`zh` 之后），迁移 diff 因此只是「每条约 6 行新增」，
不会因为重排 key 把 134 条全变成改动。

### 6.1 `migrate.js --audience` 的确切范围（**amend：补上原文只有一句「可选脚本」的空缺**）

原文只说「一次性脚本（可选）」，没有说清它做什么、不做什么 —— 一个含糊的迁移脚本比没有
更危险（下一个人会以为它会把数据补全）。确切范围如下：

**它只做一件事**：给存量条目补 `provenance`，**并且只给有据可查的补**：

| 存量条目的形态 | 补什么 | 为什么 |
|---|---|---|
| `source ∈ {Curated, Curated-CN}` | `credibility: 'curated'`；`fields` 只列**它真的有值的**新字段，`basis: 'source'`、`derived: 'stated'` | 人工策展的字段值本来就来自它引用的官方页 |
| `verified === true` 且有 `verifiedAt` | `credibility: 'editorial'`，带 `verifiedAt` | 「已人工对照官方页」是有日期的既有事实（v1.0 的 `checkVerifiedGuard()` 已在守它） |
| 其余（自动采集 / 无来源） | **什么都不补** | 它们的新字段本来就是空的；凭空盖一个来源就是造假 |

**它明确不做的事**（这几条同样重要）：

- ❌ 不写 `audience` / `benefitType` / `eligibilityDetail` / `claimRequirements` / `availability`
  的**任何值** —— 补数据是 t3 的人工工作，不是迁移脚本的活；
- ❌ 不给任何条目的新字段填 `"unknown"` 占位：缺席就是 unknown，写出来只是噪音，
  还会让「覆盖率」这个数字失去意义（分母不变、分子虚高）；
- ❌ 不碰任何既有字段的值；`null` 保持 `null`。

**验收**：① 跑完 `validate --strict` 全绿；② `git diff` 里除 `provenance` 外
**任何既有字段逐字节不变**（这条要贴 diff 统计做证据，不能只说「没改」）。

---

## 七、validation 策略

### 7.1 `validateDeal()`（每次写盘、每次 CI 都跑，非 strict）

硬拦：

- `audience` / `benefitType`：必须是数组、非空、无重复、每项在枚举内；
- `eligibilityDetail` / `claimRequirements`：必须是对象、非空、键在白名单内、
  值是 `true` / `false` / `"unknown"` 之一；
- `availability.chinaUsable` 同上；`regionRestriction` 必须是 ≤120 字的字符串；
- `provenance`：`credibility` 在枚举内；`sourceUrl` 必须 http(s)；`verifiedAt` 不得是未来；
  `fields` 的键必须是白名单字段、且**该字段在记录上存在且非空**；
  `basis: "inferred"` 必须带 `note`；
- 新字段仍在 `allowed` 白名单内 —— 未知字段照旧报错（这条不许为了新字段放宽）。

### 7.2 `validate --strict` 的新守卫：`checkAudienceGuard()`

照 `checkOngoingGuard()` / `checkVerifiedGuard()` 的同一套模式（**探针式**，不读 deals.json 的运气）：

| 探针 | 期望 |
|---|---|
| 非法 `audience` 枚举 | `validateDeal` 必须拦 |
| 非法 `benefitType` 枚举 | 必须拦 |
| 三态写成 `0` / `1` / `null` | 必须拦（`null` 是「整个字段缺席」，不是单键的值） |
| 空 `audience: []` / 空 `eligibilityDetail: {}` | 必须拦 |
| `provenance.fields` 指向不存在的字段 | 必须拦 |
| `basis: "inferred"` 无 `note` | 必须拦 |
| **`unknown` 不得渲染成 `false`** | 详见表下 |
| 合法正例（双 audience + 三态混合） | 必须放行（守卫过严也是失效） |

最后一条是本阶段的红线，做法是**跨层**的：`checkAudienceGuard()` 断言
`chinaUsableLine(deal)`（`scripts/lib/audience.js` 的纯函数，与 RENDER-CORE 的
`audienceRows()` 同源）对 `chinaUsable: "unknown"` 返回的文案里**不含**「不可用」且**含**
「尚未确认」。判据、措辞、测试三层对齐 —— 这是 v1.0 最贵的那条教训。

> **amend（2026-09-29，由 t1 核验发现）**：这里最初写的是 `audienceSummary(deal)`，**函数名是错的**。
> `audienceSummary` 只拼 `deal.audience`（人群），对 `{availability:{chinaUsable:'unknown'}}`
> 返回**空串**，永远不含「尚未确认」—— 照原文写法这条探针**必红**，而且红得莫名其妙
> （断言说的是措辞，失败原因却是「取错了字段」）。实跑证据：`audienceSummary` → `""`、
> `chinaUsableLine` → `"尚未确认"`、`audienceRows` → `[{key:'availability.chinaUsable',
> label:'中国大陆可用性', value:'尚未确认'}]`。
> **教训值得留档**：契约文档引用了错误的函数名，而它自己写不出错 —— 文档没有类型检查。
> 所以探针断言里必须同时钉住「取到的是哪个函数」，而不是只钉住它的输出文案。

> **amend 2（2026-09-29，t1 核验 F2）：探针的构造路径必须写死，否则 6 条枚举探针全部假绿。**
> `makeDeal()` 对非法枚举是**静默丢弃**（`benefitType:['bogus']` 进去、字段直接消失），
> 而 `validateDeal()` 是**硬拦**。两者对同一份输入结论相反，于是：
>
> | 写法 | 结果 |
> |---|---|
> | ❌ `validateDeal(makeDeal({ benefitType:['bogus'] }))` | `makeDeal` 已经把非法值吃掉 → 剩下的是**合法**记录 → `ok=true` → 探针**永远绿** |
> | ✅ `validateDeal({ ...makeDeal(合法输入), benefitType:['bogus'] })` | 非法值真的进到校验器 → 红 |
>
> 定稿：**探针必须先构造一条合法 base，再 spread 非法值**，绝不能把 `makeDeal` 串在校验前
> 当输入通道。实测：13 类非法形状按 ✅ 写法 `leaked=0`（全部拦下），按 ❌ 写法会全部放过。
> `checkAudienceGuard()` 目前用的是 ✅ 写法，**改它之前请先读这一段**。

### 7.3 覆盖率报告（`scripts/tools/audience-report.js`）

只读工具，输出（同时支持 `--json`）：

```
学生适用信息覆盖率      18/80 优惠（22.5%）· 其中 student 明确 12 条
开发者适用信息覆盖率    ...
信用卡要求覆盖率        ...
中国可用性覆盖率        ...
benefitType 覆盖率      ...
按来源分组的分项覆盖率 + 「已知值但无 provenance」清单
```

覆盖率的**分母口径**：`type === "deal"` 的条目（80 条）。
工具类条目没有「领取条件」，把它们算进分母会让数字永远上不去且没有意义。
报告同时打印「分母之外还有 N 条工具条目可补 audience」（它们是 v1.2 分类页的原料）。

---

## 八、渲染契约（详情页 / 首页）

| 位置 | 规则 |
|---|---|
| 详情页（弹层 + 独立页，同一个 `detailHtml()`） | 有数据的字段组渲染成 `dgrid` 里的单元；**整组无数据则整组不渲染** |
| 三态措辞 | `true/false/"unknown"` → 是 / 否 / **尚未确认**，由 `triLabel()` 单一出处 |
| 五个 label 表 | `FIELD_LABELS` / `AUDIENCE_LABELS` / `BENEFIT_LABELS` / `ELIGIBILITY_LABELS` / `CLAIM_LABELS` **一并**进措辞同源块（详见 8.1） |
| 首页卡片 | **不改版**。只把新字段的中文标签词并入搜索 haystack（「学生」「教育邮箱」「中国大陆」等） |
| 首页 IA | 不动：不加 audience 筛选器、不加分类入口、不加 `/student/` 页面 —— 全属 v1.2 |
| 无 JS | 详情页是预渲染的静态 HTML，无 JS 也必须读得到这些行（由 `verify-site.js` 断言） |

### 8.1 措辞同源契约（**amend：2026-09-29，由实施准备阶段发现的空洞扩展**）

RENDER-CORE 在 vm 沙箱里跑、**不能 require**，所以它必须自带一份措辞副本。副本的防漂移
机制是 `index.html` 里的 `/* AUDIENCE:START */ … /* AUDIENCE:END */` 标记块 +
`scripts/lib/audience.js` 的 `checkWordingContract(html)`，由 `selftest:audience` 与
`validate --strict` 共用（**解析实现只有一处**，两处各写一份解析就会出现「一处解析失败被
当成通过」的假绿）。

**比对范围必须覆盖详情页上真正会显示的全部中文**，最初只放了 `triLabel` 与
`chinaUsableLine` 两个对象，而详情页那 5–9 行的文字**几乎全部**来自五个 label 表 ——
前端把「仅限新用户」改成「新用户专享」，那时两边测试都会继续全绿。所以：

```
WORDING_CONTRACT = { triLabel, chinaUsableLine, FIELD_LABELS, AUDIENCE_LABELS,
                     BENEFIT_LABELS, ELIGIBILITY_LABELS, CLAIM_LABELS }
```

前端块里的常量名是 `AUDIENCE_WORDING`，形状是**一个整 JSON 对象**（由 `JSON.stringify`
生成，因此含斜杠与空格的标签如「教师 / 教研人员」是安全的 —— 旧的正则字面量解析法会在
这里翻车，`parseWordingBlock` 刻意改用 JSON 解析）。块存在但解析不出 = **漂移**，不是
「没写」，两种失败都要报出具体是哪一项。

牙齿（两条都要，缺一条就漏一种改坏方式）：① 前端把 `unknown` 的措辞改掉 → 红；
② 后端 `triLabel()` 改掉 → 同一条红。

---

## 九、非目标（本阶段刻意不做）

- ~~首页 audience 筛选器 / `/student/` `/developer/` `/free-api/` 静态页 / 分类 RSS~~ ——
  **v1.1 收口已做**，见第十节；
- ~~`audience` 参与折叠与排序~~ —— **v1.1 收口已做**，见第十节（范围有意收窄）；
- 机器翻译或从文案里猜 audience（**绝对不做**：这是本阶段立身之本）；
- 把新字段塞进 JSON-LD（等字段覆盖率上去再说，现在塞进去是给搜索引擎喂 unknown）。
  收口时补的是**页面级** JSON-LD（`CollectionPage` / `BreadcrumbList` / `ItemList`），
  仍然没有把 `unknown` 当成取值喂给搜索引擎。

---

## 十、v1.1 收口（2026-09-29）

本节记录**契约之外的第三次修订**：不是新增字段，而是把「值从哪里来」补齐，
以及把六字段真正接到站点上。触发它的是一条实测结论，不是一个想法。

### 10.1 第二个人工来源：`scripts/data/audience-overrides.json`

**问题**（`scripts/tools/check-reproducible.js` 可复现）：`deals.json` 里 56 条
**采集侧**条目的 **203 个六字段值没有任何源**。把六字段剥掉重放一轮 merge，一个都产不出来 ——
采集器不产出六字段（`makeDeal` 生成 0/6），人工策展文件里也没有它们。
它们的依据写在 `research/v1.1/DATA-BACKFILL.md` 第四节那张逐条表里（带引文），
但**那是一份报告，不是数据源**：管线读不到它，于是 `deals.json` 成了这些值的唯一保存处。

**决定**：把它们落成声明式源，`mergeAll` 按 id 注入。

- 文件是**第二个人工来源**，与 `curated_*.json` 并列；`credibility` 记 `curated`
  （人读官方页写下、带引文，但**没有**人工回访核验 —— 与 `CREDIBILITY_RANK` 的定义一致）；
- **不塞进 `curated_*.json`**：那会让这些记录变成策展条目（`source` 变 `Curated`、
  `score()` 的 SOURCE_PRIORITY 抬高、卡片上的来源标签跟着换），
  而它们事实上是采集来的条目，只是六个字段由人补的。**改一个字段的来源不该改一条记录的身份。**
- **不做成「第三方记录参与 merge」**：合成记录一旦按 `score()` 胜出，
  `merged = {...winner}` 就把它当成整条记录的代表 —— `source` 会变成 `Curated`
  （非空，所以 loser 的真实来源填不进来）、`discountInfo` 等字段全被顶掉。
  §5.4「score() 不变」这条约束正是为拦住它而写的。
- `contrib` **只增不减**（§5.3.3）：第二轮采集时既有记录已带着上一轮的记账，
  直接覆盖成 `['curated']` 会把采集侧真的提供过某个值的记账抹掉。

**判据用「存在」而不是 `hasKnown`**（这一条踩过）：`{chinaUsable:'unknown'}` 有键、有值、
是**明确查过之后写下的「没有证据」**，但 `hasKnown` 判它「没有数据」——
用它筛，4 条 `availability` 会进不了 overrides，继续无源。`unknown` 是一个 known 答案。

### 10.2 「可重建」的五个判据（`check-reproducible.js`，已进 CI 门禁）

| 判据 | 问的是 | 必须 |
|---|---|---|
| ① 策展**值**保真 | 策展条目的五个值字段 = 人工文件的投影？ | 0 处不一致 |
| ② 采集侧**值**可推导 | 剥掉五个值字段 + provenance 后重放，值得不得到？ | 0 孤儿 / 0 凭空出现 |
| ③ 出处一致 + 管线不动点 | 把采集器再跑一遍，产得出同一份文件？ | 0 漂移 |
| ④ 补充自身完整性 | 没有非法条目、过期条目、与策展撞 id？ | 全 0 |
| ⑤ 人工文件的档位 = 规则算出来的档位 | 手写的 `provenance.credibility` 有没有跟规则分家？ | 0 处矛盾 |

①**只比「值」**，`provenance` 交给 ③ 与 ⑤：第一版把 provenance 也放进 ①，在一次**真实采集**后
立刻报了 32 处 —— 那不是缺陷，是断言写错了。`provenance` 是**合并算出来的**，不是人工输入：
那 32 条策展记录文件里手写 `credibility:'curated'`、不带 `contrib`，而 `credibilityOf()` 的定义是
「人工策展来源 **且** 核验过且有日期 → `editorial`」，它们全都 `verified:true` + `verifiedAt`。
**拿算出来的值去比手写的输入必然不等。**

#### 10.2.1 那 32 条手写 `credibility` 的矛盾：已按「文件服从规则」修掉

**当时的判断是「不作为缺陷处理，只留记录」**（理由见本节历史版本：它不参与决策、不渲染，
且最顺手的修法 —— 让 `credibilityOf` 读声明值 —— 会让这 32 条掉档）。
**2026-09-29 收口时改成了修掉它**，理由是那条「只留记录」的结论只解决了一半问题：

- 留记录能拦住「有人去改 `credibilityOf`」，但拦不住**下一个人重新发现这处矛盾**，
  然后判断「手写值才是人的意图，代码算错了」—— 两个方向看起来都讲得通；
- 而**代码侧根本没有第二种读法**：`dedup.credibilityOf` 与 `migrate-audience.migrationCredibility`
  这两个各自独立的实现，对这 32 条的同一组输入**一致地**给出 `editorial`。
  所以「两种改法各有理由」这个说法本身是错的 —— 只有一种。
- 修它是**行为中性**的（实测：改完重跑，134 条逐字节一致，忽略 `lastSeen`/`firstSeen`）。

于是：**改人工文件去服从规则**（32 条 `curated` → `editorial`），并加上 ⑤ 这条门禁，
让它们不能再分家。`validateDeal` 两种档位都放行，所以这条门禁是这处矛盾唯一的守卫。

> 判据直接调用 `credibilityOf` 本体，不在门禁里重写规则：这条门禁存在的理由就是
> 「只有一处口径」，重写一遍等于把刚修掉的问题换个地方种回去。
>
> 一句话：**声明值是派生字段的残影，不是事实来源；要让文件服从规则，而不是让规则去读文件。**

#### 10.2.2 ⚠️ 「之前是 `curated`」这句话无法从 git 复核（独立验证代理的发现）

上面一直在说「那 32 条手写的值从 `curated` 改成了 `editorial`」。**这句话当时为真，
但在版本历史里查不到** —— 那个中间状态**从未提交**：

- 提交 `08d81cc`（v1.1 之前）里，两个策展文件**一个 `provenance` 都没有**，自然也没有 `credibility`；
- `git log -S'"credibility"' --all -- <两个文件>` 为空；24 个悬空对象里也没有；
- 整个 v1.1（含 `provenance` 块本身）随收口一起进了 `f4c17d5` ——
  于是**相对历史看，那些值一出现就是 `editorial`**。

独立验证代理据此把那半条声明判成 **REFUTED**，判得对：它是对的**事实**，但不是可**复核**的事实。

这条纪律比这个具体问题重要：**未提交的中间状态不是证据**。
今后凡是要说「我改之前它是什么样」，要么动手前先留痕（临时提交 / `git stash`），
要么把话说成「工作区当时是 X（不可从历史复核）」—— 不要写成「文件里写的是 X」。
`check-reproducible.js` 的文件头已把这条记在代码里。


### 10.3 分类页与筛选器：判据只有一处

`/student/` `/developer/` `/free-api/` 与首页筛选项的归属判据**只有一个实现**：
`audience.collectionsOf()`，构建期算好写进 `dist/deals.json` 的 `collections` 字段。
前端只做 `deal.collections.includes(slug)`。

**不在 RENDER-CORE 里再写一份判据**：那样「首页筛出 12 条」与「/student/ 列出 12 条」
就是两份实现的结果，任何一侧改动都会让两个数字分头变化，而两边各自的测试都会是绿的。
（§8.1 的措辞同源契约能管住「抄得像」，管不住「判据有两份」。）

**覆盖率口径与分类口径刻意不同，且写进了代码注释**：

- 覆盖率（`audience-report.js`）问「我们**有没有**关于学生适用性的信息」→ `studentRequired:false` **算**；
- 分类页问「这条**是不是**给学生的」→ `false` 是**否定**信号，不能收进来。

实测两者今天都得到 12（数据里 `studentRequired` 只有 `true` 3 条与缺席 77 条，**一条 `false` 都没有**），
差异不可见 —— **正因为不可见才必须写下来**：等第一条 `false` 出现时，覆盖率会 +1 而分类页不该 +1。

### 10.4 五条既有约定：`/status/` 原先只满足两条（**已补齐**）

子代理核查结论（代码级）：`/status/` 原先只满足 **预渲染** 与 **无 JS 可读**；
**sitemap / feed / JSON-LD 三条当时根本没做**，且 `verify-site.js` 对它有 **0 处覆盖**。
所以「照抄 `/status/`」对三条约定而言没有先例。三条新路由补齐并**各自断言**：

- sitemap：进 sitemap（priority 0.9 > 详情页 0.7），`build-local.js` 的条数断言同步改为 `+ 1 + N`；
- feed：分类页自己**不产出**条目（订阅是「内容更新」语义，一页目录不是更新），
  但声明两个 `rel="alternate"`，可被发现；
- JSON-LD：三段（`CollectionPage` / `BreadcrumbList` / `ItemList`），**一段一个对象**；
- 预渲染 + 无 JS：表格构建期写死，`verify-site.js` 用 `javaScriptEnabled:false` 再读一遍。

#### 10.4.1 `/status/` 的补齐（2026-09-29 收口）

上面三条当时**没有回头改 `/status/`**（它被列为独立收口项）。现已补齐，五条逐条对上：

| 约定 | `/status/` 现在怎么做 | 谁来断言 |
|---|---|---|
| sitemap | 进 sitemap，`priority 0.3`（**低于**详情页 0.7） | `build-local.js` 的条数算术 `+ 1 + 1 + N` + 逐条 `status/` 在不在 |
| feed | 声明两个 `rel="alternate"`（自己不产条目，同分类页） | 静态自检 + 浏览器断言各一条 |
| JSON-LD | 两段：`WebPage` + `BreadcrumbList`（**一段一个对象**） | 静态自检 + 浏览器断言各一条 |
| 预渲染 | 表格构建期写死（正文下限按有无来源分档：**900 / 350** 字，见下） | 静态自检（字数 + `<tbody>` 里真有 `<tr>`） |
| 无 JS 可读 | `<time datetime>` 承载绝对时间，相对时间只由内联脚本换算 | 无 JS 上下文再读一遍 |

**为什么 priority 是 0.3 而不是跟分类页一样的 0.9**：它是给维护者与技术读者核对
「本站还在不在更新」的工具页，不是搜索入口。priority 是**声明**，不是排序实现的细节 ——
给它 0.9 会把「哪一页才是入口」说反。

**为什么状态页不发 `Dataset` / `ItemList`**：机器可读的那一份是 `source-health.json`，
页面上直接链着它。把同一份事实声明两次，两次迟早会分家，而分家时**没有任何东西会红**
（两边各自看都自洽）。宁可少声明一次。

⚠️ 上面这句话在 2026-09-29 之前**是一句没有守卫的承诺**：静态自检与浏览器断言都只判
「**包含** WebPage / BreadcrumbList」，所以多出第三段 JSON-LD（乃至一个 `Dataset`）
不会有任何东西红 —— 恰恰是这句话自己说的那种危险。独立验证代理指出后已改成
**集合恰好相等**（含重复也拦），分类页的三段同样处理。

#### 10.4.2 为什么「补齐」之外还必须补 `verify-site.js` 的覆盖

静态自检查得出「页面上写的是不是数据里的那些值」，查不出「这张表在 390px 的手机上
会不会把整页撑出横向滚动条」。而这恰恰是这一页最可能的坏法：三列数字与时间都是
`white-space: nowrap`，来源一多必然溢出；`.stable-wrap { overflow-x: auto }` 就是为它写的，
**而此前没有任何断言证明那一层还在**。

反证（把 `overflow-x` 改成 `visible` 后实测）：390px **溢出 121px**、360px **溢出 151px**，
桌面端毫无变化 —— 这类缺陷会静默上线。现在两个视口各一条断言，判据只看**结果**
（页面级 `scrollWidth` 有没有超出视口），不看**机制**（`.stable-wrap` 的 `overflow-x` 是不是
`auto`）：机制是实现细节，写进断言会让「将来把宽表换成移动端卡片式排版」这种**正常改进**
被判红。机制只在明细里报出来供排查。

#### 10.4.3 「预渲染正文过短」这条断言原先在数 CSS（同一次收口发现的）

`/status/` 与分类页都有「预渲染正文过短」这条断言，它们看起来在守「无 JS 可读」。
实际上它们**剥 `<script>` 却没剥 `<style>`**，而站点的样式是内联进每一页的（约 39 KB）。
下表是 2026-09-29 实测（旧口径 = 只剥 `<script>` 再剥标签；内容 = 再剥 `<style>`）：

| 页面 | 旧口径量到的 | 真正的内容 | CSS 占比 |
|---|---|---|---|
| `/status/`（9 来源） | 40489 字 | **1186 字** | 97.1% |
| `/student/`（12 条） | 40823 字 | **1871 字** | 95.4% |
| `/developer/`（67 条） | 45537 字 | **6585 字** | 85.5% |
| `/free-api/`（45 条） | 43764 字 | **4812 字** | 89.0% |

也就是说，**整张表都没渲染出来时，这个数字照样是四万**。原来的阈值（分类页 800、
状态页 600）与之相比等于不存在 —— 一个量错了东西的断言比没有断言更糟，
因为它看起来在守着什么。

修法是加 `prerenderedText()`（同时剥 `<script>` 与 `<style>`），阈值按**实测的内容长度**重定。
重定之后暴露出**第二次**错误，而且两个页面各犯了一次：

- `/status/` 第一版取常数 600，而把表体掏空后实测 **600 字** —— **正好压线放行**；
- 分类页第一版取常数 500，掏空表体后实测 **602 / 651 / 678 字**（developer / free-api / student）
  —— **全部放行**。

现在的阈值都是「高于表体空掉时的字数」：

| 页面 | 阈值 | 表体正常 | 表体空掉 |
|---|---|---|---|
| `/status/`（有来源） | `900` | 1186 | 600 |
| `/status/`（无数据） | `350` | — | 646（合法状态，页面明说没有记录） |
| 分类页 | `600 + 60 × 条数` | 1871 / 6585 / 4812 | 678 / 602 / 651 |

分类页用**成比例**而不是常数，是因为条目数从 12 到 67 不等：常数要么对多条目页形同虚设，
要么对少条目页变成假红。实测每条约 90–100 字，取 60 字/条留余量。
另外每个页面都补了一条**独立的结构断言**（`<tbody>` 里真的要有内容），
并且**先把 `<script>` 摘掉再匹配** —— 否则将来某个内联脚本里出现 `<tbody>…</tbody>`
就会让这条断言永远为真。

> 这几处都不是「实现有 bug」，而是**断言在测一个与它声称无关的量**（数 CSS）、
> 或者**阈值落在失败值下方**（差几个字放行）。
> 与 §10.8 那条「同义反复」是同一族：**先问这条断言红了意味着什么，再问它会不会红。**

#### 10.4.4 作者正文里不许残留 Markdown 记号

`audience.js` 的 `why` 与状态页/分类页的正文是**直接写进 HTML 的**，不是 Markdown。
它们曾把强调写成 `**这样**`、把字段名写成 `` `这样` ``，于是 **16 个 `**` 与 14 个反引号
原样出现在读者眼前**，跨 4 类页面（`/status/` `/student/` `/developer/` `/free-api/`）。
这没有任何门禁会红 —— 更糟的是上面那条长度断言还把星号当作正文内容算了进去。

现在构建期扫描**全部产物的作者容器**（`.snote` / `<caption>`），出现字面 `**` 或反引号即失败。
扫描面刻意收在作者容器里而不是整页文本：采集来的文案（标题 / `discountInfo`）里出现这些记号
是**数据**，不是排版错误，拿它判红会变成一条「在正常数据上失败」的守卫。



### 10.5 `audience` 参与折叠与排序（范围有意收窄）

- **折叠**：人群进 `foldKey` **与合并轮的桶**。理由：一张折叠卡只写得下一份人群摘要、
  只链到一个代表成员的详情页；把「仅限学生」与「人人可用」并成一张卡，
  那张卡上的每句话都会对一半成员不成立。
  实测（用 RENDER-CORE 本体在 vm 里跑，不是第二份实现）：当前 6 个多成员组里人群不一致的 **0 个**
  → **这条约束今天一条卡片都不改变**（构建自检断言卡片数仍为 50）。
  现在加它，是因为「今天恰好成立」靠数据碰巧，「结构上不可能不成立」靠代码。
- **排序**：只加**完全同分时的收尾比较**（档位 + 截止情况 + 最近更新都相同 → 按人群、再按标题）。
  首页没有用户画像，所以「学生优先」这类偏好**没有依据** —— 那要先问用户是谁，而不是替他假设。
  这条只让次序确定、可复现、与数据文件行序无关。

### 10.6 `dist/deals.json` 与源的一致性门禁（v1.0 就记着的债）

`dist/deals.json` 是**发布出去的那一份**（浏览器 fetch 的就是它），而此前没有任何东西比对过它与源：
构建只断言了它的几个**属性**（`schemaVersion` / `count`），属性对了而内容是旧的照样发布。

口径：dist = 源 + 构建期声明过的变换，逐字段比对。
`collections` 是**只增**的派生字段；`zh` **不是只增** ——
覆盖层会按指纹停用「原文已变」的译文、也会把撤回的译文去掉（`selftest:zh` 的两个用例正是这两件事），
所以它**不比字节**，只断言「不多出别的字段」；译文自身的正确性由它自己的门禁管。

> 第一版把 `zh` 也按字节比了，`selftest:zh` 的两个用例当场变红 —— 不是译文坏了，
> 是**这条门禁对 `zh` 的语义断言错了**（它假设覆盖层只增不减）。
> 一个把正常行为判成失败的守卫比没有守卫更糟：它会被绕过或被改松。

### 10.6b 从干净基线重新推导，暴露了「一直绿着、其实靠历史累积撑着」的状态

**触发它的是一件与代码无关的事**：把 v1.1 分支合 master（好让 PR 能跑 CI），
master 上有两次采集机器人的自动提交，与本支改同一批数据文件 → 冲突。
比对后发现本支那份 `deals.json` 的 `firstSeen` 有 **32 条**被刷成了当天，
而 master 保留着正确的 `2026-09-21`（就是 `dedup.js` / `store.js` 里记着的那次事故的残留）。
于是合并取 master 那一侧 —— **六字段归零**，然后重跑采集让管线把它们重新推导出来。

**结果**：六字段**精确地长回了 425 个**（与收口前逐个持平），说明声明式来源是完备的 ✅
—— 但同一次 `check-reproducible` **变红了**，而且是两节一起红：

```
① 策展值保真        不一致          7~8 处
③ 出处一致/不动点   provenance 漂移  7 处
```

一条条看，全是同一件事：**人工文件里显式写的 `unknown` 键，从零推导时不见了。**
实测规模：人工文件声明 **28** 个显式 `unknown` 键，重新推导后只剩 **17** 个。

#### 两个根因，都在 `dedup.js` 的合并侧

**① `pickScalar` 只在 winner 身上找 `unknown`（不对称）**

```js
if (!lKnown) return { value: winnerValue, source: wKnown ? winnerSource : null };
```

两侧都「不是已知值」时一律返回 **winner** 的值。于是 loser 单方面写了 `unknown` 时，
返回的是 winner 的 `undefined`，`pickMap` 随后 `continue` 把**整键丢掉** ——
「查过、没有证据」被静默降级成「没写」，而 §3 说这两件事不是一回事。

修法：两侧都不是已知值时，**显式写了 `unknown` 的一方**胜出，并把贡献者记成它
（与 `pickMap` 里「只要某一侧提供了值，那一侧就是贡献者」同一条规矩）。

**② `pickMap` 的键序没有规范化**

```js
for (const key of new Set([...Object.keys(w), ...Object.keys(l)])) {
```

键序 = `[...winner 的键, ...loser 独有的键]` —— **值一样、字节不一样**，
同一条记录换个 winner 就换个写法。修好 ① 之后它立刻以
「**16 处策展值不一致**」的形式浮出来，逐条看值完全相同：
`{"identityVerificationRequired":"unknown","newUserOnly":true}` vs
`{"newUserOnly":true,"identityVerificationRequired":"unknown"}`。
而 ① 是拿 `JSON.stringify` 逐字节比的 —— 所以这不是「断言太严」，是**产出本身不确定**。

修法：加 `canonicalMapOrder()`，按 `audience.ELIGIBILITY_KEYS` / `CLAIM_KEYS`
（与 `makeDeal` 归一化**同一份出处**）重排键序。

#### 为什么它藏了这么久

因为 `deals.json` 是**增量累积**出来的：那些键是早期某一轮**正好由 winner** 写进去的，
之后每一轮它都在 winner 身上被原样带走 —— 于是每一轮门禁都是绿的。
**只有从零重放才会问出「这些键到底能不能被推导出来」，而答案是不能。**

> 这正是 `check-reproducible` 存在的理由，也是它第一次真正兑现价值：
> 它不是被新代码弄红的，是被**一次与代码无关的合并**推到「从零重推」的位置上才红的。
> 一个只在增量路径上验证过的「可重建」，其实没有验证过可重建。

两条不变量现在各由 `audience-selftest.js` 的断言钉住（121 → **125** 项），
并且**分别**做过反证：只回退 ① → `unknown` 那一条红；只回退 ② → 键序那一条红；
都不回退 → 全绿。（第一次反证是**无效**的：两处一起回退时，① 让那个键整个消失，
② 的断言于是因为「两边都没有这个键」而空转通过 —— 反证必须**单独**做。
夹具也返工过一次：第一版两个键的书写顺序让「谁当 winner」碰巧产出同一键序，
三条键序断言全都测不到东西。）

### 10.7 同一个洞只堵了一半：`migrate-audience` 的 editorial 规则（2026-09-29 收口时发现）

**发现路径**：给 `migrate-audience-verify.js` 做 CI 夹具时，为了让夹具**逐分支覆盖**，
我按规则表一条条写期望，写到「自动采集来源 + `verified` + `verifiedAt`」这一条时，
期望是「不该补」—— 而它补了。

**缺陷**：同一件事有两份实现，只有一份被加固过。

| 实现 | 规则 | 状态 |
|---|---|---|
| `dedup.credibilityOf` | `editorial` **要求来源也是人工策展** | ✅ 已加固 |
| `migrate-audience.migrationCredibility` | `verified === true && verifiedAt` → `editorial`（**不看来源**） | ❌ 一直是旧规则 |

`dedup.js` 里那段注释记着加固的理由与代价：「早先只判 `verified && verifiedAt`，于是任意自动
采集条目只要带上这两个字段就被当成『人工核验过』……（t1 核验实测放行过这条）」。
**同一个洞在 `dedup` 堵上了，在 `migrate-audience` 没有。**

**后果**：`migrate.js --audience` 会给一条自动采集来的、恰好带这两个字段的记录盖上
`credibility:'editorial'` 的出处声明，而 `fields` 里同时写着 `basis:'source'`
（「这个值是官方页明说的」）—— **两句都不成立**。而 `validateDeal` 两种档位都放行，
不会有任何东西变红。这正是 v1.0「21 页伪造溯源」的同族。

**影响面（实测，不夸大）**：当前 `deals.json` 里 `source` 非策展且 `verified === true` 的记录是
**0 条**，`migrationCredibility` 与 `credibilityOf` 的分歧条数也是 **0 条**。
所以这是**潜伏**缺陷 —— 等某个采集源开始写 `verified` 才会发作，不是正在流血。

**修法**：让 `migrationCredibility` **直接调用 `credibilityOf`**，不再自己算一遍
（连 `CURATED_SOURCES` 也从 `dedup` 引，两份常量合成一份）。
于是 `migrationCredibility(deal)` 恒为 `null` 或 `credibilityOf(deal)` —— 这条不变量
由 `audience-selftest.js` 三条断言钉住，而不是只靠「这次写对了」。

**这条修正值得单独记一段的理由**：它不是靠读代码找出来的，是靠**给一条门禁补齐分支覆盖**
找出来的。原来那条「验收比对」跑不起来（缺基线文件），于是这个洞活了整整一程 ——
**一条跑不起来的门禁与没有门禁的区别，只在于它会让人以为有**。

### 10.8 夹具为什么是合成的，而不是把真实数据冻进仓库

`migrate-audience-verify.js` 此前接不进 CI，卡点是「缺一个 before 基线文件」。
当时看起来只有一条路：把某次真实迁移前后的整份 `deals.json` 冻进仓库。那样做有两个问题：

1. **覆盖不足**：真实数据里 `verified:false` 的策展记录**一条都没有**，`curated` 那一档
   根本没人走。真实快照只能覆盖「这批数据恰好走过的分支」。
2. **维护负担**：几万行的数据快照会随 schema 演进而失效，每次都要重新生成，
   而**重新生成时没人会逐条核对**它是否仍然是对的 —— 那就成了一份没人看的绿灯。

改用 **9 条合成夹具**（`scripts/data/fixtures/migrate-audience-{before,after}.json`），
每条对应一个分支（见 `migrate-audience-verify.js` 文件头那张表）。
生成时**先写死期望表再生成**：函数行为与期望不符就拒绝写盘，于是入库的 `after`
是「人核对过的期望」，不是「函数吐出来的东西」。

> 这个区别在反证里被证实是有意义的：把 `migrationCredibility` 回退成旧规则后，
> 夹具红了（冻结的 `after` 与重跑结果不一致），而验收脚本里那条
> 「新 provenance 的 credibility 都等于规则推出的那一档」**没红** ——
> 因为它拿同一个（已经坏掉的）函数去算期望，是**同义反复**。
> 「传过去再传回来」式的断言测不出任何东西，这一课的第二个实例。

---

## 十一、v1.2 补充：派生字段 `needs`（**不是 v1.1 契约的一部分**）

**一句话：v1.1 的字段契约一个字没改。** v1.2 只在 `dist/deals.json` 里多了一个
**派生字段** `needs`，与已有的 `collections` 完全同构。

### 11.1 它是什么

```jsonc
{
  "id": "…",
  "audience": ["student"],
  // 输入字段（v1.1 契约，未改）
  "needs": ["student-only", "free-tier"]   // ← v1.2 派生，构建期算出
}
```

- 取值是 `NEED_PAGES` 里 slug 的子集，**顺序固定**为注册表顺序（所以序列化稳定、可 diff）；
- 判据只在 `scripts/lib/audience.js` 的 `NEED_PREDICATES` 写一遍；
  `needsOf(deal)` 是唯一入口，**前端只做 `includes()`，不做任何判断**；
- 它进的是**构建产物**，不进 `scripts/data/*`，也不参与采集与 merge。

### 11.2 为什么是派生字段而不是新字段

v1.2 的十条需求（学生专享 / 教育身份可领 / 无需信用卡 / 国内可用 / 完全免费 /
免费 API / 免费 Tokens / AI Coding / 免费模型 / 开发者 Credits）**全部**是 v1.1 六个新字段
加 `pricingModel` / `category` 的函数，没有一个需要新的采集项 —— 除了 `ai-coding`，
它是**明确没有字段支撑**的那一条（用 `category==='编程开发'` 兜着，只有 4 条，
页面直说是数据缺口）。

所以：
- **不新增契约字段**：避免「加了一个字段但采集器不产、人工也不填」的第二类空字段；
- **不改 `schema.js` / `store.js` / `dedup.js`**：v1.2 没有碰采集链；
- 「派生」这个选择带来一个必须牢记的纪律：**`needs` 永远不许被当成数据源读回来**。
  任何需要判断「这条是不是学生优惠」的地方都必须调 `needsOf` / 对应谓词，
  否则判断就会有第二份实现（v1.1 已经因为同类原因踩过一次漂移）。

### 11.3 三态与红线的继承

`needs` 的十条判据一律遵守 v1.1 第四节的三态语义，**只认肯定信号**：

- `no-card` 只在 `creditCardRequired === false` 时命中；`"unknown"` **不命中**
  （没证据 ≠ 不需要卡）；字符串 `"false"` 也不命中（只认布尔字面量）；
- `china-usable` 只在 `chinaUsable === true` 时命中；`region:'cn'` **单独不构成证据**
  （这是 §2.5 已经写下的契约，v1.2 只是照着执行）；
- 十条判据对 `null` / 数组 / 数字 / 缺字段一律返回布尔值、不抛异常
  （8 类脏输入 × 10 条判据，断言在 `selftest:audience` §9）。

### 11.4 断言位置

| 断言 | 在哪 |
|---|---|
| 注册表结构（slug 唯一/kebab-case、group 合法、why ≥3 句、无 Markdown 记号、无写死条数、`short` 存在且更短） | `scripts/tools/audience-selftest.js` §9 |
| 判据三态行为（含 `"false"` 字符串、`"unknown"`、脏输入不抛） | 同上 |
| `needsOf` 顺序稳定、无重复、空记录返回 `[]` | 同上 |
| 真实数据不变量（每条 slug ≥1 条命中、命中都在注册表内） | 同上 |
| 首页入口数字 == 数据条数、双向无缺失、无 JS 控件、两套标签齐全 | `scripts/tools/build-local.js` 产物自检 + `verify-site.js` §15b2 |
| 10 条路由的 id 集合、canonical 自指、双 feed、三段 JSON-LD、「为什么在这一页」证据列、内链前缀真的能到 | `verify-site.js` §15b2 |
| 无 JS 可读（首页入口行 + 三页抽查）、390/360px 几何 | 同上 |


