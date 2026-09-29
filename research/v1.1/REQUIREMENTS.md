# v1.1 学生 / 开发者模型 —— 契约核验与验收条目

角色：`t1`（requirements-analyst，**只读仓库 + 只写本文档**；未改任何代码 / `deals.json` / 测试 / 测试夹具）
方法：把 `docs/SCHEMA-v1.1.md` 当作**待证伪的设计提案**，用实跑命令核对它与仓库真实状态是否冲突。
**本轮 = 第 2 轮核验**（第 1 轮的 findings 已被契约 amend 吸收，见 §3「已修复」）；每个「现状」格子都是本轮跑出来的命令结果。
**本轮结论：`needs_revision`** —— 三条硬门禁当前是红的（`validate` / `--strict` / `build`），`selftest:audience` 直接崩溃。

---

## 0. 分析基线与红灯清单

| 项 | 值 | 怎么得到的 |
|---|---|---|
| 契约指纹 | `docs/SCHEMA-v1.1.md` **527 行 / 16925 字节 / sha1 前 12 位 `86f41016c7db`**（mtime 2026-09-29 16:34:31） | `node -e` sha1 + `Get-Item` |
| 本轮新增契约小节 | §2.6 `contrib` 行、**§5.2.2**（contrib 落点）、**§5.2.3**（editorial 必须来源可信）、**§5.2.4**（迁移优先级）、**§6.1**（`--audience` 确切范围）、**§7.2 amend 2**（探针构造路径） | 通读全文 |
| 代码核验时刻 | 2026-09-29 16:29–16:45（`validate.js` 16:29、`audience.js` 16:30、`schema.js` 16:31、`index.html` 16:33、`dedup.js` 16:33、`migrate.js` 16:34；策展文件 16:41） | 文件 mtime |
| `node scripts/validate.js` | **❌ 退出码 1**：`❌ 校验失败，共 6 项`（全部在策展文件，详见 §3·B1） | 实跑 |
| `node scripts/validate.js --strict` | **❌ 退出码 1**（同上 6 项） | 实跑 |
| `node scripts/tools/build-local.js`（= CI 的 Assemble 步骤） | **❌ 退出码 1**：内部 validate 门禁失败 → `❌ 构建失败`，`dist/` **未被改动**（仍是旧产物） | 实跑 |
| `npm run selftest:audience` | **❌ 退出码 1**：`TypeError: Cannot read properties of undefined (reading 'regionRestriction')` @ `scripts/tools/audience-selftest.js:320`（详见 §3·B2） | 实跑 |
| `node scripts/tools/audience-report.js --json` | ✅ 退出码 0；顶层键 `generatedFrom,denominator,coverage,tools,provenance,bySource,knownWithoutProvenance,curatedDropped`；含「书写期 / 发布期」双口径 | 实跑 |
| `deals.json` | 134 条 / **28 字段**；`audience 56 · benefitType 48 · eligibilityDetail 31 · claimRequirements 33 · availability 32 · provenance 56`（全部 `credibility:"collected"`；`provenance.contrib` 0 条、`provenance.verifiedAt` 0 条） | `node -e` 直读 |
| 旧数据守恒 | 与 HEAD 逐条比对：**134 个 id 一个不少、22 个既有字段值变化 0 处**（正是 §6.1 的验收判据） | `git show HEAD:deals.json` + 逐字段比对 |
| 全库新契约合法性 | 134/134 逐条 `validateDeal` 通过（`invalid=0`） | 实跑 |
| 覆盖率（`validate` 内置与报告一致） | audience 48/80（60.0%）· 学生 4/80 · 开发者 44/80 · benefitType 47/80 · 信用卡已知 0/80 · 学生身份 3/80 · 教育邮箱 0/80 · 中国可用性 27/80（yes 27 / no 0 / unknown 4 / 缺席 49）· 出处声明 48/80 · **有已知值但无出处 0 条 / 有已知值 56 条** | `validate.js` + `audience-report.js` |
| CI 门禁实际内容 | `.github/actions/gate/action.yml`：`validate --strict` → zh 三关 → 五个 selftest → `build-local.js` → 真浏览器 `verify-site.js` → 基线对比。**没有 `selftest:audience`** | 读 action.yml |

**红灯清单（阶段目标「validate / build / 浏览器验收全绿」当前不成立）**：
① `validate` / `--strict` 红（6 条策展 provenance 悬空）；② `build` 红（同一根因，走内部 validate 门禁）；③ `selftest:audience` 崩溃（夹具参数顺序 bug）且**不在 CI 门禁里**，所以它红了没人会知道。

---

## 1. 七条硬约束：在哪实现 / 怎么验证

| # | 约束 | 在哪实现（本轮实测位置） | 怎么验证 |
|---|---|---|---|
| 1 | 兼容现有 `deals.json`（新字段可缺席） | `scripts/lib/schema.js` `validateAudienceFields()`：六字段缺席一律放行；`validate.js` `checkAudienceGuard()` 的 `mustPass` 第一例就是「旧条目（六字段全缺席）」 | A1 A3 A4 A9 A40 |
| 2 | 允许逐步补齐 | `attachAudienceFields()` 逐字段「有值才挂」；`scripts/lib/migrate-audience.js` 只补 provenance、**明确不写**五个值字段 | A8 A12 A42 |
| 3 | 采集器只填自己确定的 | `scripts/lib/audience.js` 的 `normalizeEnumList/normalizeTristateMap/normalizeAvailability`（非法值丢弃）；`scripts/lib/audience-audit.js` 把「声明了却归一后消失」变成可见报告 | A8 A12 |
| 4 | curated 走同一套 `makeDeal` | `scripts/lib/curated.js` → `makeDeal(raw,{trustType:true})`；`validate.js` 的 `checkCurated()` 额外跑一遍并检查 `region` | A5 A43 |
| 5 | merge 不得用低可信覆盖高可信 | `scripts/lib/dedup.js` 的 `mergeAudienceFields()/pickScalar()/pickArray()/pickMap()/pickAvailability()/rebuildProvenance()/credibilityOf()`；`scripts/lib/store.js` 传 `{stats:audienceStats}` | A24–A29、B3、B4 |
| 6 | validate 能发现非法枚举 / 类型 | `validateDeal()` 硬拦（本轮 13 类形状 `leaked=0`）；`checkAudienceGuard()`（`validate.js:188` 定义、`:497` 在 `--strict` 调用），内含 15 条 mustFail + 5 条 mustPass + 跨层措辞比对（`:259` 调 `au.checkWordingContract`） | A6 A7 A10–A23 A40 |
| 7 | build / 前端安全处理 null / unknown | `index.html` RENDER-CORE 的 `AUDIENCE:START/END` 块 + `audienceRows()`；`scripts/lib/audience.js` 的 `audienceRows()/triLabel()/chinaUsableLine()`；`detailHtml()` 实测已出行；`cardHtml()` 实测对新字段零影响 | A30–A36 |

---

## 2. 验收条目（43 条，现状 = 2026-09-29 16:45 前实测）

**通用约定**：命令在仓库根执行；判据一律退出码或精确字符串。
`node -e "…"` 外层双引号、内层单引号（PowerShell 与 bash 通用；**内层不要再嵌双引号**，会被 Windows 参数解析吃掉）。
`✓` = 本轮实测已满足（不得回退）；`✗` = 当前不满足（t4/t3 的活）；`—` = 本轮未跑（写清由谁跑）。

### A 组：兼容与不回归（5）

| ID | 断言 | 命令 | 现状 |
|---|---|---|---|
| A1 | `validate` 退出码 0 且末行以「✅ 校验通过」开头 | `node scripts/validate.js` | **✗ EXIT 1**（6 项，见 B1） |
| A2 | `validate --strict` 退出码 0 且含「（strict 模式）」 | `node scripts/validate.js --strict` | **✗ EXIT 1**（同 B1） |
| A3 | **旧数据守恒**（§6.1）：134 个 id 不变 + 22 个既有字段值逐条不变（新字段允许新增） | 见 §2·附录 M0 | ✓（`changed=0`） |
| A4 | 全库逐条合法 | `node -e "const {validateDeal}=require('./scripts/lib/schema');const d=require('./deals.json').deals;const bad=d.filter((x,i)=>!validateDeal(x,i).ok);console.log('invalid='+bad.length);process.exit(bad.length?1:0)"` | ✓（`invalid=0`） |
| A5 | 规模数字不退化：`总条数 134` / `真实优惠 80` / `国内 60` / `策展数据 32` | `node scripts/validate.js`（红时这些数字行仍必须正确） | ✓ |

### B 组：audience（4）

| ID | 断言 | 命令 | 现状 |
|---|---|---|---|
| A6 | 非法枚举**拦**、合法双值**放行**（同命令两侧断言） | `node -e "const {validateDeal}=require('./scripts/lib/schema');const d=require('./deals.json').deals[0];const s={...d};['audience','benefitType','eligibilityDetail','claimRequirements','availability','provenance'].forEach(k=>delete s[k]);const a=validateDeal({...s,audience:['students']}).ok;const b=validateDeal({...s,audience:['student','developer']}).ok;console.log(a,b);process.exit(!a&&b?0:1)"` | ✓（`false true`） |
| A7 | **13 类非法形状泄漏数 = 0**。cases：`audience:[]`、`audience:'student'`、`benefitType:['free']`、`eligibilityDetail:{}`、`eligibilityDetail:{studentRequired:0}`、`claimRequirements:{creditCardRequired:null}`、`availability:{}`、`availability:{chinaMainland:true}`、`availability:{regionRestriction:'x'.repeat(121)}`、`provenance:{credibility:'official'}`、`provenance:{credibility:'curated',fields:{audience:{basis:'source'}}}`（指向无值字段）、`{audience:['student'],provenance:{credibility:'curated',fields:{audience:{basis:'inferred'}}}}`（inferred 无 note）、`{foo:1}` | A6 的命令去掉两个断言、跑完整 case 表；**基底必须先把六个新字段从 `deals.json[0]` 删掉** —— 数据回填后 `deals.json[0]` 已带 `audience`，不删会让「指向无值字段」那条被误判（本轮实测：不删 `leaked=1`，删掉 `leaked=0`） | ✓（删字段后 `leaked=0`） |
| A8 | 构造期归一 = 静默丢弃：`['student','bogus','student']`→`["student"]`；标量 `benefitType:'free_api'`→字段整个缺席 | `node -e "const {makeDeal}=require('./scripts/lib/schema');const m=makeDeal({title:'Normalize Probe',url:'https://example.com/n',audience:['student','bogus','student'],benefitType:'free_api'},{source:'Curated',region:'global'});const ok=JSON.stringify(m.audience)===JSON.stringify(['student'])&&m.benefitType===undefined;console.log(JSON.stringify(m.audience),m.benefitType===undefined);process.exit(ok?0:1)"` | ✓ |
| A9 | 六字段**顺序固定**在末尾：`Object.keys(rec).slice(-6) === AUDIENCE_FIELD_ORDER` | `node -e "const {makeDeal,AUDIENCE_FIELD_ORDER:O}=require('./scripts/lib/schema');const m=makeDeal({title:'Order Probe',url:'https://example.com/o',audience:['student'],benefitType:['free_api'],eligibilityDetail:{studentRequired:true},claimRequirements:{accountRequired:true},availability:{chinaUsable:false},provenance:{credibility:'curated',fields:{audience:{basis:'source'}}}},{source:'Curated',region:'global'});process.exit(JSON.stringify(Object.keys(m).slice(-O.length))===JSON.stringify(O)?0:1)"` | ✓ |

### C 组：benefitType / 三态语义（4）

| ID | 断言 | 命令 | 现状 |
|---|---|---|---|
| A10 | 三态只认字面量：`0` / `1` / `'true'` 字符串 / `null` 全拦 | A7 的 case 表（含 `0`、`null`）；`checkAudienceGuard()` 另含 `'true'` 字符串一例 | ✓ |
| A11 | 空容器三连拦：`audience:[]` / `eligibilityDetail:{}` / `availability:{}` / `provenance.fields:{}` | A7 case 表 | ✓ |
| A12 | `"unknown"` 是**合法写入值且不算已知**：`eligibilityDetail:{newUserOnly:'unknown'}` 留在记录里，`hasKnown()` 返回 `false` | `node -e "const {makeDeal}=require('./scripts/lib/schema');const a=require('./scripts/lib/audience');const m=makeDeal({title:'Unknown Probe',url:'https://example.com/u',eligibilityDetail:{newUserOnly:'unknown'}},{source:'Collected',region:'global'});console.log(JSON.stringify(m.eligibilityDetail),a.hasKnown(m.eligibilityDetail));process.exit(JSON.stringify(m.eligibilityDetail)===JSON.stringify({newUserOnly:'unknown'})&&!a.hasKnown(m.eligibilityDetail)?0:1)"` | ✓ |
| A13 | 枚举数组允许并存：`['student_plan','free_subscription']` 放行 | 并入 A6 的放行侧（规则同 audience） | —（规则同 A6，未单独跑） |

### D 组：availability（4）

| ID | 断言 | 命令 | 现状 |
|---|---|---|---|
| A14 | 边界：`regionRestriction` 120 字放行、121 字拦；**构造期已截断** | A7 case 9 + `makeDeal(...,{availability:{regionRestriction:'限'.repeat(200)}})` 后断言 `length===120` 且 `validateDeal.ok` | ✓（121 拦 / 120 放行 / 200→120 截断） |
| A15 | 整组缺席 → 无行：`audienceRows({})` 为 `[]` | `node -e "const a=require('./scripts/lib/audience');process.exit(JSON.stringify(a.audienceRows({}))==='[]'?0:1)"` | ✓ |
| A16 | `unknown` 有专门措辞：`chinaUsableLine({availability:{chinaUsable:'unknown'}}) === '尚未确认'`，不含「不可用」不含「否」 | `node -e "const a=require('./scripts/lib/audience');const s=a.chinaUsableLine({availability:{chinaUsable:'unknown'}});console.log(JSON.stringify(s));process.exit(s==='尚未确认'&&!/不可用\|否/.test(s)?0:1)"` | ✓ |
| A17 | 只有 `unknown` 的单键**不出行**；`false` 必须出行且值为「否」 | `node -e "const a=require('./scripts/lib/audience');const n=a.audienceRows({eligibilityDetail:{studentRequired:'unknown'}}).length;const y=a.audienceRows({eligibilityDetail:{studentRequired:false}});console.log(n,JSON.stringify(y));process.exit(n===0&&y.length===1&&y[0].value==='否'?0:1)"` | ✓ |

### E 组：provenance（6）

| ID | 断言 | 命令 | 现状 |
|---|---|---|---|
| A18 | `credibility` 枚举三值，其余拦 | A7 case 10 | ✓ |
| A19 | `sourceUrl` 必须 http(s) 且**含追踪参数要拦** | `node -e "const {validateDeal}=require('./scripts/lib/schema');const d=require('./deals.json').deals[0];const s={...d};['audience','benefitType','eligibilityDetail','claimRequirements','availability','provenance'].forEach(k=>delete s[k]);const a=validateDeal({...s,audience:['student'],provenance:{credibility:'curated',sourceUrl:'ftp://x.com/a'}}).ok;const b=validateDeal({...s,audience:['student'],provenance:{credibility:'curated',sourceUrl:'https://x.com/a?utm_source=weibo'}}).ok;console.log(a,b);process.exit(!a&&!b?0:1)"` | ✓（`false false`） |
| A20 | `verifiedAt` 未来日期拦（`2999-01-01`） | A7 同类 case | ✓ |
| A21 | `fields` 键必须①是六字段之一②该字段在记录上**有明确值**（缺席或只有 unknown 都拦） | A7 case 11 + `checkAudienceGuard()` 的「provenance 指向只有 unknown 的字段」探针 | ✓ |
| A22 | `basis:'inferred'` 无 `note` 拦 | A7 case 12 + `checkAudienceGuard()` 同名探针 | ✓ |
| A23 | `credibility` ∉ {editorial,curated} 时**不得**带 `verifiedAt`（§2.6「仅…」） | `node -e "const {validateDeal}=require('./scripts/lib/schema');const d=require('./deals.json').deals[0];const s={...d};['audience','benefitType','eligibilityDetail','claimRequirements','availability','provenance'].forEach(k=>delete s[k]);const r=validateDeal({...s,audience:['student'],provenance:{credibility:'collected',verifiedAt:'2026-01-01'}});console.log('被拦='+!r.ok);process.exit(r.ok?1:0)"` | **✗ 仍放行**（B7；风险已被 §5.2.3 部分兜住） |

### F 组：merge 仲裁（6）

| ID | 断言 | 命令 | 现状 |
|---|---|---|---|
| A24 | 并集 / 逐键 / `unknown` 让位已知（三条同时断言），且合并结果仍合法 | 第 1 轮 `M1` 命令 + `validateDeal(merged).ok` | ✓（`[["student","developer"],{studentRequired:true,educationEmailRequired:true},{creditCardRequired:false}]`，valid=true） |
| A25 | §5.3.1 反例：分数高但可信度低者不得赢得取值（collected 123 vs curated-tool 120 → 取 `false`） | 第 1 轮 `M2` 命令 | ✓（`score 123 120 chinaUsable=false`） |
| A26 | 冲突留痕**结构化**：能说出「哪条、哪个字段、谁覆盖了谁、双方可信度」 | 对该探针的 `mergeAll(...).stats` 做形状断言 | **✗ 部分**：`stats.audienceConflicts` 只是**计数**、`audienceConflictTitles` 只是标题数组；明细（`title/field/winner{credibility,value}/loser{…}`）在 `dedup` 的 `stats.conflicts` 里算得出来，但没有从 `mergeAll` 暴露 → 见 B3 |
| A27 | `score()` 不因新字段变化 | 第 1 轮命令（`score(b) === score({...b,...新字段})`） | ✓（180 = 180） |
| A28 | ① 已知值不得降级为 `unknown`；② provenance 永不凭空生成 | 第 1 轮 `M4` 命令 | ✓（`knownWins=true`、无 provenance 仍无） |
| A29 | **两轮 merge** 后不存在「`fields` 条目的 credibility 高于该字段实际来源」的条目，且 `contrib` 记的是**真正贡献者** | 两轮 `merge` 探针（第 1 轮 A29 命令） | **✗ 部分**：`fields` 裁剪正确、`credibility` 正确降到最低档，但 `contrib` 会把「来自 curated 的 `audience`」记成 `["collected"]` → 见 B4 |

### G 组：渲染 / 搜索 / 静态页（7）

| ID | 断言 | 命令 | 现状 |
|---|---|---|---|
| A30 | 详情页出现结构化行：带/不带新字段的 `detailHtml()` 必须不同，且带字段版本含 `适用人群`/`福利类型`/`中国大陆可用性` | `node -e` 探针（`render-core.load()` + `detailHtml`） | ✓（三项标签全部命中；RENDER-CORE 已暴露 `audienceRows()`） |
| A31 | 整组缺席不渲染该行（`availability` 缺席 → 无「中国大陆可用性」；`chinaUsable:'unknown'` → 必须出现该行） | 同上，两个方向断言 | ✓ |
| A32 | `unknown` 不得渲染成确定答案：含 `尚未确认`、不含 `中国大陆用户不可用`；`creditCardRequired:'unknown'` 的单键**不出行**（HTML 不含「需要信用卡」）；`accountRequired:false` 出行且值单元格为「否」 | `node -e` 探针 | ✓ |
| A33 | **首页卡片不改版**（护栏）：`cardHtml()` 对带/不带新字段逐字节相同 | `rc.cardHtml(w)===rc.cardHtml(b)` | ✓ |
| A34 | 搜索 haystack：`chinaUsable:true`/`false` 搜「中国大陆」命中、`unknown` **不**命中；`audience:['student']` 搜「学生」命中；`educationEmailRequired:true` 搜「教育邮箱」命中 | `node -e`（`matches(deal,{search})`） | ✓（true→true、false→true、unknown→**false**、学生→true、教育邮箱→true） |
| A35 | 静态详情页：`build-local.js` 后 `dist/deal/<id>/index.html` 含上述行、`dist/deal/` 目录数仍 80，且 `verify-site.js` 有对应无 JS 断言 | `node scripts/tools/build-local.js` + 目录计数 + `npm run verify` | **✗ 被 B1 阻塞**（build 红、`dist/` 未更新、`verify-site.js` 至今 0 处 audience 引用） |
| A36 | JSON-LD **不含**新字段（§9 非目标） | 构建产物内 `application/ld+json` 块断言 | —（被 B1 阻塞，无法在最新数据上验证） |

### H 组：报告 / 守卫 / 迁移 / CI（7）

| ID | 断言 | 命令 | 现状 |
|---|---|---|---|
| A37 | 报告可机读：`--json` 退出 0，含 `denominator={deals:80,tools:54,total:134}` 与 9 项 coverage | `node scripts/tools/audience-report.js --json` | ✓（顶层 8 键、coverage 9 项） |
| A38 | **两个口径分开报**（§5.3.3）：纯文本含「书写期数据源…（32 条，人工文件、合并前）」与发布期口径说明 | `node scripts/tools/audience-report.js` | ✓ |
| A39 | 「已知值但无 provenance」清单存在（JSON 键 `knownWithoutProvenance`），当前应为 0 条 | 同上 `--json` | ✓（键存在；实测 `有已知值但无出处 0 条 / 有已知值 56 条`） |
| A40 | `--strict` 真的调用 `checkAudienceGuard()`（防被删/被注释），含 mustFail/mustPass/红线/跨层措辞比对 | `node -e "const fs=require('fs');const v=fs.readFileSync('scripts/validate.js','utf8');process.exit(v.includes('checkAudienceGuard')&&v.includes('checkWordingContract')?0:1)"` + `--strict` | ✓ 已接线（`:188` 定义、`:497` 调用、`:259` 措辞比对） |
| A41 | `npm run selftest:audience` 退出 0，且覆盖「前后端措辞各改坏一次都要红」「merge 逐字段仲裁」 | `npm run selftest:audience` | **✗ EXIT 1（崩溃）** → B2 |
| A42 | 迁移只补 provenance：`--audience --dry-run` 报告 + `migrate-audience-verify.js --before= --after=` 逐字节比对；**未知 flag 必须非 0 退出** | `npm run migrate:audience:dry` / `migrate:audience:verify` / `node scripts/migrate.js --bogus` | ✓（`unknownArgs → process.exit(2)`；数据侧 `changed=0`） |
| A43 | CI 接线：gate 里 `validate --strict` 与 build 必须绿；新守卫/新自测要进 gate | 读 `.github/actions/gate/action.yml` + CI 结果 | **✗**：gate 第一步 `validate --strict` 与 Assemble 步当前都会红；**`selftest:audience` 不在 gate 里**（B5） |

**合计 43 条编号条目**（13 类非法形状折进 A7 的 case 表，独立判定命令约 30 条）。

### §2 附录：长命令

- **M0（A3，旧数据守恒）**：
  `node -e "const {execSync}=require('child_process');const fs=require('fs');const head=JSON.parse(execSync('git show HEAD:deals.json',{encoding:'utf8',maxBuffer:64e6})).deals;const now=JSON.parse(fs.readFileSync('deals.json','utf8')).deals;const L=['id','title','vendor','url','source','sourceUrl','region','type','discountInfo','pricingModel','priceLine','features','category','description','eligibility','validity','expiresAt','firstSeen','lastSeen','verified','verifiedAt','zh'];const byId=new Map(now.map(x=>[x.id,x]));let bad=0;for(const h of head){const n=byId.get(h.id);if(!n){bad++;continue;}for(const k of L) if(JSON.stringify(h[k])!==JSON.stringify(n[k])) bad++;}console.log('changed='+bad);process.exit(bad?1:0)"`
- **M1（A24）/ M2（A25）/ M4（A28）**：见第 1 轮同名命令（本轮重跑结论未变）。
- **A29 两轮 merge 探针**：`r1 = merge(策展带 provenance, 采集)` → `r2 = merge(r1, 第三条采集)`，断言 `r2.provenance.fields` 中每个字段的来源不可低于 `credibility`、且 `contrib.audience` 仍为 `['curated']`。

---

## 3. 发现的设计冲突与漏洞（本轮）

### B1 · `[blocker]` 三条硬门禁当前是红的：6 条策展 provenance「写了却没生效」
- **file**：`scripts/data/curated_cn.json`（5 条：`火山方舟 豆包全系模型…`、`讯飞星火 Spark Lite…`、`商汤日日新 Token Plan…`、`阶跃星辰 StepAudio 3…`、`百川智能 海纳百川计划…`）与 `scripts/data/curated_global.json`（`Anthropic Claude 非营利组织折扣`）；报错来自 `scripts/validate.js` 的 curated 检查
- **problem**：这 5 条 CN 记录的 `eligibilityDetail` 只有 `{newUserOnly:'unknown', identityVerificationRequired:'unknown'}`，Anthropic 那条的 `availability` 只有 `{chinaUsable:'unknown'}`；**全是 unknown ⇒ `hasKnown()` 为 false**，于是它们 `provenance.fields` 里声明的 `eligibilityDetail` / `availability` 变成「指向一个没有值的字段」。validate 判为**错误**（`❌ 校验失败，共 6 项`，`EXIT 1`），`--strict` 同样红，`build-local.js` 内部的 validate 门禁因此也红（`❌ 构建失败`，`dist/` 保持旧版）；CI gate 第一步就是 `validate --strict` → **整条流水线红**。
- **requiredFix**：数据侧修（契约立场正确、不该为它放宽校验）：① 从这 6 条的 `provenance.fields` 里**删掉**指向 unknown-only 字段组的条目（unknown 是「查过没证据」，不能给它盖出处章，§2.6/§5.3.2）；或② 若该条其实有更强证据，把 `eligibilityDetail` / `availability` 补成真实的 `true`/`false`。修完必须让 `node scripts/validate.js`、`--strict`、`node scripts/tools/build-local.js` **三条命令同时退出 0**。

### B2 · `[blocker]` `npm run selftest:audience` 崩溃：夹具把字段当 `makeDeal` 的 opts 传了
- **file**：`scripts/tools/audience-selftest.js:303`（`const carve = (raw, opts) => Object.assign(probeDeal(raw, opts), raw);`）→ 崩在 `:320`
- **problem**：`carve(raw, opts)` 把调用方的 `extra`（`{availability:{…}}`、`{audience:['student']}` 这类**记录字段**）当成 `probeDeal(raw, opts)` 的第二参传下去，而 `probeDeal` 的第二参进的是 `makeDeal(..., {source, region, sourceUrl, trustType, vendor, now})` —— **`makeDeal` 忽略未知 opts 键**，于是夹具里的 `availability` 从来没进过记录。实测：`collectedSide({availability:{chinaUsable:true}}).availability === undefined`、`verifiedCurator({availability:{chinaUsable:false,regionRestriction:'…'}}).availability === undefined` → `merge()` 结果的 `availability` 也是 `undefined` → `m1.availability.regionRestriction` 空指针。第 316 行那条断言用了 `m1.availability &&`（null-safe），所以真正报错的是第 320 行；而异常抛出在汇总打印之前，**第 1–5 组的结论也一并消失**。
- **requiredFix**：`const carve = (base, extra = {}) => Object.assign(probeDeal({ ...base, ...extra }), base, extra);`；并给 check 6 的夹具加形状前置断言（`if (!a.availability || !b.availability) throw new Error('夹具没带上 availability')`），让「夹具错」与「实现错」报出不同信息。实测按该修法后 `merge → {chinaUsable:false, regionRestriction:'官方条款限定美国/加拿大'}`，即**仲裁逻辑本身是对的，坏的只是夹具**。

### B3 · `[medium]` 冲突留痕只暴露了计数，明细在 `mergeAll` 出口被丢掉（§5.3.1 明确「不能只给计数」）
- **file**：`scripts/lib/store.js:148/178`
- **problem**：`dedup` 内部的 `stats.conflicts` 条目已含 `{title, field, detail, winner:{credibility,value}, loser:{credibility,value}}`，但 `mergeAll()` 返回值里只剩 `audienceConflicts: conflicts.length`（数字）与 `audienceConflictTitles`（标题数组）。§5.3.1 要求「要能说出哪条、哪个字段、谁覆盖了谁、双方可信度」，采集日志按现在的形状说不出来。
- **requiredFix**：在 `stats` 里直接暴露明细数组（如 `audienceConflicts: audienceStats.conflicts`）或另加 `audienceConflictDetails`，保留计数供汇总；A26 据此改为形状断言。

### B4 · `[medium]` 二轮 merge 的 `contrib` 归因错误：curated 的值被记成 `collected`
- **file**：`scripts/lib/dedup.js` 的 `mergeAudienceFields()` / `credibilityOf()`
- **problem**：实测两轮 merge —— 第 1 轮得到 `contrib:{audience:['curated'], benefitType:['collected']}`（正确）；第 2 轮再与一条采集记录合并后 `contrib.audience` 变成 `['collected']`，而 `audience` 的值**从来没被采集侧贡献过**。原因是取某侧的值时写的是 `credibilityOf(该侧)`（整条最低档），而不是继承该侧**同字段**的 `contrib[field]`。后果：逐字段账本失真，`audience-report` 的按来源/可信度分组会跟着错（§5.2.1 要求报告与仲裁同一口径）；仲裁本身暂时是**保守方向**（同档保留原值），危害是「说不清」而不是「被覆盖」。
- **requiredFix**：取值时继承贡献者账本 —— 若被选中侧已有 `provenance.contrib[field]`，直接抄那份数组；否则记 `[credibilityOf(该侧)]`。A29 增断言：两轮 merge 后 `contrib.audience` 仍为 `['curated']`、`credibility` 为 `'collected'`（值来自 curated、整条被最低档拖低 —— 两者不矛盾）。

### B5 · `[medium]` 新的 `selftest:audience` 不在 CI 门禁里
- **file**：`.github/actions/gate/action.yml`
- **problem**：merge 逐字段仲裁与 `contrib` 账本（B4）**只在 `audience-selftest` 里有牙**，而 gate 不跑它；因此 B2 的崩溃在 CI 上完全不可见，B3/B4 这类回归也不会被拦。措辞跨层一致性因为同时挂在 `validate --strict`（`:259`）反而有 CI 覆盖 —— 覆盖不对称。
- **requiredFix**：把 `npm run selftest:audience` 加进 gate（其它 selftest 之后、`build-local` 之前），并同步 `check-ci-consistency.js --expect-checks=N` 与 `verify.yml`。

### B6 · `[medium]` 契约内部对 `editorial` 有两套定义，实现只认第二套
- **file**：`docs/SCHEMA-v1.1.md` §5.2（`editorial ← rare: 人工核验（verified === true 且带 verifiedAt，**来源不限于策展**）`）vs §5.2.3（`editorial ← source ∈ {Curated, Curated-CN} 且 verified === true 且 verifiedAt 非空`）
- **problem**：同一份契约两处定义互斥；实现（`dedup.js:credibilityOf`）跟的是 §5.2.3 —— 非策展来源永远拿不到 `editorial`。按 §5.2 写测试会红，按 §5.2.3 才会绿。
- **requiredFix**：把 §5.2 那段代码块替换为 §5.2.3 定稿（或删掉 §5.2 的阶梯、只留一个出处），并加一条实测断言：`credibilityOf({source:'aitools.fyi',verified:true,verifiedAt:'2026-01-01'}) === 'collected'`。

### B7 · `[low]` §2.6「`verifiedAt` 仅 `editorial`/`curated`」仍未进 §7.1，实测仍放行
- **file**：`docs/SCHEMA-v1.1.md` §2.6（`verifiedAt` 行）vs §7.1 硬拦清单；实现 `schema.js` 的 provenance 段
- **problem**：实测 `provenance:{credibility:'collected',verifiedAt:'2026-01-01'}` 仍被放行。§5.2.3 已堵住「靠 verified 冒充 editorial」，风险降为「字段语义不一致」（collected 记录带人工回访日期），但契约说「仅…」、硬拦清单不查，仍是两说。当前数据 0 违反。
- **requiredFix**：§7.1 增「`credibility` ∉ {editorial,curated} 时不得带 `verifiedAt`」并在 `validateAudienceFields` 实现。

### B8 · `[low]` §7.3 的示例数字仍未标注为示例，而报告已输出真实数字
- **file**：`docs/SCHEMA-v1.1.md` §7.3 示例块（`学生适用信息覆盖率 18/80（22.5%）· 其中 student 明确 12 条`）
- **problem**：报告已打印真实值（`学生 4/80（5.0%）`、`开发者 44/80（55.0%）`、`任一 48/80（60.0%）`），文档示例与它们同名同形，容易被当成基线/阈值引用；18/12 两个数字没有任何实测对应。
- **requiredFix**：示例块标注「示例 / 目标，非实测」，并写明「基线以 `audience-report` 输出为准」。

### B9 · `[low]` `derived:'inferred'` 无 `note` 仍放行（§2.6 只约束 `basis`）
- **file**：`docs/SCHEMA-v1.1.md` §2.6（`derived` 行）与它自己的示例（`{basis:'source', derived:'inferred', note:…}`）；实现 `schema.js` 的 `entry.basis === 'inferred'` 判断
- **problem**：实测 `{basis:'source', derived:'inferred'}` 无 `note` 放行；当前数据 0 违反。契约的示例证明该组合真实存在，而它恰恰最需要推理链。
- **requiredFix**：note 要求改为 `basis === 'inferred' || derived === 'inferred'`，并在 `checkAudienceGuard()` 增一条同名探针。

### 已修复（第 1 轮 findings → 本轮实测确认）
| 第 1 轮 | 修复证据（本轮实跑） |
|---|---|
| F1 `contrib` 无数据落点 | §2.6 表 + §5.2.2 定稿；校验三例全对（合法放行 / 非法值拦 / 指向非 v1.1 字段拦）；`credibilityOf()` 读 `provenance.contrib` 取 min |
| F2 探针构造路径未定义 | §7.2 amend 2「先构造合法 base、再 spread 非法值」；`checkAudienceGuard()` 实测用 `validateDeal({...base,...patch})`，15 条 mustFail + 5 条 mustPass |
| F3 §8.1 措辞同源契约与实现不一致 | `WORDING_CONTRACT` 已 8 项（含五个 label 表）；`index.html` 有 `AUDIENCE:START/END` 与 `AUDIENCE_WORDING`；`checkWordingContract(html)` 存在且被 `validate --strict` 调用；`package.json` 有 `selftest:audience` |
| F4 未知 flag 静默全量迁移 | `migrate.js` 增 `unknownArgs` → `process.exit(2)`；`--audience` + `migrate-audience-verify.js` 齐备 |
| F6 `regionRestriction` 构造期不截断 | 实测 200 字 → 截断为 120 字且 `validateDeal.ok` |
| F7 迁移两条规则撞车未定优先级 | §5.2.4 定死「editorial 优先于 curated」；`migrate-audience.js` 按该次序实现 |
| §7.2 红线探针引用错函数名 | 已改为 `chinaUsableLine(deal)`；`checkAudienceGuard()` 实测同时钉住 `chinaUsableLine` 与 `triLabel` |

**未变（第 1 轮已报、仍成立的观察）**：§5.3.1 的算例复算一致（123 vs 120）；§5.3.2 的方向同意，且实测 `rebuildProvenance` 确实做到「混来源丢 fields 条目、credibility 降到最低档」（B4 是账本归因问题，不是这条被推翻）；`score()` 仍不含新字段；`F10`（验收基线随工作区漂移）本轮继续成立 —— 32 分钟内 `validate.js`/`audience.js`/`schema.js`/`index.html`/`dedup.js`/`migrate.js`/两个策展文件相继变动，`research/_raw/ours-baseline/verify.json` 仍是未提交的改动版。

---

## 4. 旧数据兼容性实测（12 条抽查，本轮 = 数据回填之后）

方法：对 `deals.json` 真实记录直接跑新契约的 `validateDeal`，并列出六字段的**存在 / 缺席 / 已知**三态。全库判据 A4：`invalid=0`。

| # | id | 标题 | 类别 | type/region/source | 本轮六字段状态 | 合法 | 为什么这样是对的 |
|---|---|---|---|---|---|---|---|
| 1 | `219f6fca7f31` | GitHub Student Developer Pack 学生开发者工具包 | 策展 | deal/global/Curated | **六个全缺席** | ✅ | 策展文件里的回填（t3）尚未落进 `deals.json`。缺席 = unknown（§3 第一行），不是错；回填前不得由脚本代填（§6.1 明确迁移脚本不写值）。 |
| 2 | `5253b5ed77b1` | Figma for Education 学生与教师免费 | 策展 | deal/global/Curated | 六个全缺席 | ✅ | 同上；且这条同时命中 `student` 与 `educator`（§2.1 刻意分开的两档），必须人工决定。 |
| 3 | `913211f6d165` | 火山方舟 豆包全系模型 个人开发者 50 万 tokens 免费额度 | 策展（国内） | deal/cn/Curated-CN | 六个全缺席 | ✅ | **正是 B1 的那条**：curated 文件里已写 `eligibilityDetail`，但只有 unknown 值 → 归一后不算有值，于是 provenance 悬空、validate 报错。缺席形态本身合法；问题在「声明了却没值」。 |
| 4 | `f5ffff50772c` | ChatGPT / OpenAI | 工具 | tool/global/Layer3Labs | `audience` + `provenance` 已回填 | ✅ | 工具条目不进覆盖率分母（§7.3），但有 `audience` 就能当 v1.2 分类页原料；`credibility='collected'` 与来源一致。 |
| 5 | `654e05ed3453` | Sorank | 工具 | tool/global/aitools.fyi | 六个全缺席 | ✅ | 采集器只填自己确定的（约束 3）：upstream 没有受众/门槛信息 → 不写；给它盖 provenance 就是造假（§5.3.2）。 |
| 6 | `314fb9d43531` | GPT Image 2.5 | 工具 | tool/global/aitools.fyi | 六个全缺席 | ✅ | 同上。 |
| 7 | `2eae0e246de2` | ERNIE-4.5-Turbo-128K 新用户免费额度 | 国内采集 | deal/cn/百度千帆 | **六个全有且全部已知** | ✅ | 回填的典型形态：`audience:[developer]` + `benefitType:[free_credits,free_api]` + `eligibilityDetail{newUserOnly,identityVerificationRequired}` + `availability.chinaUsable=true` + `provenance{credibility:'collected', basis:'inferred'+note}` —— 推出来的结论带 note（§2.6）。 |
| 8 | `9c12f13df3ba` | ERNIE-4.5-Turbo-32K 新用户免费额度 | 国内采集 | deal/cn/百度千帆 | 六个全有且全部已知 | ✅ | 同上（同来源不同型号）。 |
| 9 | `bf156583e97c` | DeepSeek-R1-250528 新用户免费额度 | 国内采集 | deal/cn/百度千帆 | 六个全有且全部已知 | ✅ | 同上。 |
| 10 | `c05dc74bfd78` | Perplexity | 带译文 | deal/global/Layer3Labs | 五个有；`claimRequirements` 缺席 | ✅ | **部分回填是合法形态**（约束 2：字段逐个独立，不存在「填了一半就非法」）。缺 `claimRequirements` 说明来源没写领取条件 → 不猜。 |
| 11 | `9c553dd82d2d` | Cursor | 带译文 | deal/global/Layer3Labs | `audience` + `availability` + `provenance`；其余缺席 | ✅ | 同上；也是「首页卡片不得改版」（A33）的回归样本。 |
| 12 | `a67c07bf4993` | Ankon AI | 工具带译（Futuretools） | tool/global/Futuretools | 六个全缺席 | ✅ | 只译了 description 的工具条目；`zh` 完整度与新字段存在性无关（约束 2）。 |

**结论**：新契约对旧数据仍是**纯增量**的 —— 134/134 合法、id 与 22 个既有字段值 0 变化、新字段「有值才有键」。数据层已出现三种诚实形态（全缺席 / 部分回填 / 全回填）且都通过校验。唯一的问题是**第 3 条那类「声明了出处但字段没有值」**，它现在被新校验正确地判为错误（B1），修数据即可。

---

## 5. 一句话结论

**契约本身已经能在不重写 134 条数据的前提下落地**（134/134 合法、既有字段 0 变化、六字段缺席即 unknown、合并仲裁与渲染都已接线），**但本轮不允许放行**：三条硬门禁当前是红的（`validate`/`--strict`/`build` 因 6 条策展 provenance 悬空，B1），`selftest:audience` 因夹具参数顺序 bug 直接崩溃且**不在 CI 门禁里**（B2/B5），另有 3 条中等口径问题（冲突明细未暴露 B3、`contrib` 二轮归因 B4、契约内部 `editorial` 双定义 B6）。**B1 修数据、B2 修一行夹具、B5 加一行 CI**，之后 `validate`/`--strict`/`build`/`selftest:audience` 四条命令应同时绿，本轮的 43 条验收条目即可原样交给 t4/t5 当回归网。
