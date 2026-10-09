#!/usr/bin/env node
'use strict';
/* 队长：把提交信息写进临时文件（避免 PowerShell 引号/编码把中文提交信息弄坏）。
 * 用法：node write-commit-msg.js <输出文件>
 */
const fs = require('fs');
const msg = `feat(residue): 收口两件遗留 —— 扫描面外 8 类容器 + 47 行待确认，并把「删掉不许回流」扩到新扫描面

上一轮（#106）清的是四类已定案容器（.snote / .pnote / .vsnote / <caption>），
留下两件没做完：① 47 行「待用户确认」只登记未处置；② 四类之外的 8 类小字容器只盘点未判。
这一轮把两件都做完，并把「删掉之后不许回流」做成机器断言。

## 一、扫描面外 8 类容器（352 次出现 / 86 组）

- A/B 类实删 97 条：A 17 = \`.ddesc\` 的采集方式「（无头浏览器渲染后提取）」，
  B 80 = \`.dsrc-note\` 的尾半句「；最终以厂商官方页面为准。」（与共享页脚同义）；
- 其余 255 条逐条给出保留理由：\`.fdesc\` 25/25 是 Feed description 槽位（改它=改 Feed 字节）、
  \`.chgnote\`/\`.pchnote\`/\`.pftdesc\`/\`.chgmeta\` 是控件标签与时间/证据口径（C/D 类）、
  \`.hint\` 54 是交互提示、\`.dsrc-note @ .dhist\` 80 是空态解释；
- **被正文下限钉住 0 条**（最小删后余量 651，deal floor 500）。

## 二、47 行待确认：全部处置完毕（不是挂到下一轮）

- 42 条目录页题注 / \`/status/\` 32 字 / \`/feeds/\` 21 字与 133 字 / \`/status/\` 128 字 → **保留**，
  理由是**机制**而不是「余量够」：题注是 a11y 可访问名 + 题注形状牙的承重面；
  \`/feeds/\` 与 \`/status/\` 被页族结构下限 \`main-snote >= 4 / >= 2\` 钉住
  （\`/feeds/\` 那条用**两个真实数据态**各跑一次构建证明：现构态 4==下限，普查锚定态 3<4 当场红）；
- \`/models/\` 题注末句（内部标识符与列来源，A 类形状）→ **删**；
- \`PLANS_HUB_NOTES[3]\` 句首分句 → **删**（与同页导语尾句是同一个判断，只做一半会留不一致），
  保留「「最近更新」是…不是官方承诺不变的日期。」这个 C 类语义。

## 三、改真源，不做渲染层遮盖（队长裁定）

\`.ddesc\` 的采集方式本体在数据面（\`deals.json\` 17 + \`collectors/headless.js\` 3）。
「渲染层正则剥离」会让字符串仍留在 \`deals.json\` 与 \`dist/deals.json\` 里 —— 审计时等于没落地。
故改**两处真源**（模板防回流 + 存量让本轮产物真的清掉），这也是本仓既有修法
（\`fdea9f8\`「三项修法 + N 条存量订正」）。

**数据面承诺随之收窄并逐条验证**：\`deals.json\` 的 17 条 \`description\` 是**唯一**被授权的
数据面改动；其余 113 个数据面文件（含 \`dist/feed/**\` 全部 48 个、\`scripts/data/**\` 全部）
**逐字节不变**，逐文件 sha256 对照见 \`research/_raw/.../captain-recon/dataplane-*.sha256.txt\`。

## 四、新牙：删掉不许回流 + 扫描面不许收缩

- \`build-local.js\` 新增 \`scanResidue()\`（构建期主守卫）：整篇产物 304 文件，
  HTML 剥 script/style/注释，**非 HTML 原样判**（Feed 与公开数据也在射程内）；
- 登记表 \`scripts/data/residue-guard.json\`：32 条被删文案（活字面下限 40）+ 8 类容器下限
  + 2 条关系式（\`.ddesc >= 1 x 详情页数\`、\`.dsrc-note >= 2 x 详情页数\`）；
- **三遍比对并存**：原样字面 · 归一化（实体解到不动点 / 剥标签 / 零宽 / 全角半角 / 标点同类归一）·
  JSON \`\\uXXXX\`（只对 .json/.ndjson）；
- **下限自守**：\`floor >= measured x floorRatio\` 且 \`floorRatio\` 不得低于硬下限 0.5 ⇒
  「把门槛改 0/改 1 让牙变绿」被机器挡住；
- 独立复核入口 \`npm run check:residue\`（\`require\` 同一个 \`scanResidue\`，不复制逻辑），
  并**接进分层门禁**（\`action.yml\` 的 \`[45] Residue guard\`，\`--dir=dist\`，
  同步 \`GATE_STEP_NAMES\`/\`GATE_STEP_RUN\`/\`GATE_ARTIFACT_STEPS\`）；
- 反向变异（不是「能红」，是「去掉哪条会绿」）：13 条全部 as-expected。
  最有价值的两条：**M2b** 把 \`.fdesc\` 唯一构造点改名 ⇒ 只触发「低于下限」这唯一 1 项失败
  （没有下限这条守卫，整族改名会让构建全绿且文案扫描不命中）；
  **T1a** 把被删文案写回**共享页脚** ⇒ 修前**绿**（豁免名单的取值面与作用域同源 ⇒ 白名单自证）、
  修后 **exit 1** 并点名，同批删掉整条自证豁免通道（基线受益者 0 条）。

## 五、验收读数（全部原始命令 + 退出码在报告与 _raw/ 里）

- \`npm run gate\`（**全量，49 个脚本**）：**348.8s / 失败 0 / exit 0**（[45] Residue guard 在链上）
- \`verify-site.js --dir=dist\` 真浏览器：**892 项 / 失败 0**；六档视口 186 页无横向溢出
- \`verify:seo\` 19/0 · \`validate --strict\` ✅ · \`check:ci\` 39/0 · \`selftest:seo\` 103/0
- 真浏览器四面回流检测（\`innerText\` / \`textContent\` / 剥脚本序列化 / **不剥**脚本整份 DOM）：
  48 条被删文案 **0 命中**（阳性对照 7 -> 0）
- 8 类容器「构建期测量 == 真浏览器 DOM 计数」逐类相等
- 几何：\`.ddesc\` 行盒 44 -> 22px（390 宽，页高 -22px），桌面 Δ0；无顶高/裁切
- 正文下限：17 页余量 639–1074（floor 500），**跌破 0 页**

## 六、如实登记的边界（不许把读数当射程）

\`<script>/<style>\` 整段剥离 ⇒ **运行期**渲染的文案不在字面扫描射程（那一面归真浏览器四面读数）；
UTF-16LE+BOM 产物页扫不到；登记表是**静态快照**（连跑 10 次 0 误报）；keep 面**未登记**字面没有牙；
同义改写不可判。另：本轮队长自己出过一次读数错误（把 \`.dsrc-note\` 165 误报为 162 并据此"更正"
上一轮普查），已自纠并留档 —— 三方独立实现（我的扫描器 / 构建期 / 真浏览器）一致为 165。
`;
const out = process.argv[2];
if (!out) { console.error('usage: node write-commit-msg.js <file>'); process.exit(2); }
fs.writeFileSync(out, msg, 'utf8');
console.log(`wrote ${out} (${Buffer.byteLength(msg)} bytes)`);
