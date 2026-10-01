#!/usr/bin/env node
/**
 * CI 口径一致性门禁：把「四条 workflow 的 action 版本 / runner / Node 版本 / 触发面」与
 * 「package.json 的 engines 下限 vs 锁文件里依赖要求的下限」固化成**可失败**的断言。
 *
 * 为什么需要它（实证）：deploy.yml 曾经是全仓唯一跑在**已被移除的 Node20 runtime** 上的一代
 * （checkout@v4 / setup-node@v4 / configure-pages@v4 / upload-pages-artifact@v3 / deploy-pages@v4、
 * node-version '20'、runs-on ubuntu-latest），而 collect.yml 与 probe-sources.yml 早就在 v5。
 * 这种漂移当时没有任何门禁会报出来，只有人肉审计才发现——本脚本就是为了不再发生第二次。
 *
 * 用法：
 *   node scripts/tools/check-ci-consistency.js                 # 检查本仓库
 *   node scripts/tools/check-ci-consistency.js --root=<目录>    # 检查另一份副本（负向演练用）
 * 退出码：0 = 全部通过；1 = 有断言失败（输出里逐条给 ✗ 与原因）。
 *
 * ── 三条刻意的设计 ──────────────────────────────────────────────────────────────
 *  1. **零外部依赖**（只用 fs / path）：CI 里这一步跑在 `npm ci` 之前也不缺东西，
 *     而仓库并没有 YAML 解析库（js-yaml 不是依赖）。所以这里自带一个**够用的**
 *     缩进式读取器：只认「块映射 / 序列项 / 块标量(| >) / 流式序列([...])」这几种形状，
 *     块标量（run: | …）整体跳过，因此 `run:` 里的 `#`、`-`、HTML 都不会干扰解析。
 *  2. **断言「取值 / 路径」而不是「文本里有没有某个字符串」**：runner 一律看 `runs-on` 的**值**，
 *     node-version 一律看它是否真的落在某个 setup-node 步骤的 `with:` 之下（按 path 判）；
 *     绝不用「文件里不得出现 ubuntu-latest」这类字符串判据——注释里合法提到它就会误报（t9 踩过）。
 *  3. **按 SHA 钉死是允许且推荐的**：`owner/repo@<40 位 sha>` 永远不判红（比 `@v5` 更安全）。
 *     只有「旧主版本（@v1..v4，含 @v4.1.1 这类点分写法）」与「浮动引用（@main / @master / 裸分支名）」
 *     才判红。版本上界不在这里设：各 workflow 的**冻结 uses 集合**（断言 (2)）已经钉住了每个 action
 *     的期望主版本，所以 checkout@v6 会被 (2) 抓住，而不必在 (1) 里再设一条上界规则。
 *
 * ── 覆盖范围（历次修复的边界都写在这里） ──────────────────────────────────────────
 *  · (0)/(0b) 必需 workflow 清单写死并要求逐个存在，同时**硬断言「磁盘集合 == 必需清单」**：
 *    **未登记的新 workflow 一律硬红（哪怕它的 runner / Node 版本全都合规）** —— 这是**登记制**：
 *    新增一条 workflow 必须同步改**三处**（`REQUIRED_WORKFLOWS`、(2) 的 `FROZEN_USES`、
 *    `FROZEN_ASSERTION_NAMES`），并把 verify.yml 里的 `--expect-checks` 数字一并更新；
 *  · (1)/(1b)/(3c)/(4)/(4b)/(4c) 扫的是**磁盘集合**（不是写死的四条）：这样「删/改名」由 (0)/(0b) 报红，
 *    而「新文件漂移」也会被这几条直接抓住 —— t24 曾把视野收窄成写死的四条，导致未登记的新文件能穿过去（F7）；
 *  · (2) 刻意**只**遍历 `FROZEN_USES` 的键（不扫磁盘集合）：没有冻结条目就无从比对，扫了必然判「多出」而全红。
 *    这正是登记制自洽的原因 —— 未登记的文件由 (0b) 硬红，而不是靠 (2) 误伤；
 *  · (1)/(1b) 跨文件的 uses 版本与引用形式检查（t21/t23/F3：点分写法、@main 这类浮动引用）；
 *  · (2) 每个必需 workflow 的 uses 集合等于**各自冻结集合**（t23/F4：以前只有 deploy.yml 有集合断言）；
 *  · (3)/(3c)/(4) runner 与 Node 版本跨所有磁盘上的 workflow 一致（t21），且 node-version 必须**按 path**
 *    落在 setup-node 的 `with:` 下（t23/F5：job 级 `env: node-version` 曾能骗过检查器）；
 *  · (9) 触发面：verify.yml 的 `on:` 不得被 `paths` / `paths-ignore` 过滤（t24/F6）。**为什么**：
 *    它将来会被设成**必需检查**，而必需检查一旦被 path 过滤，PR 只改别的目录时 workflow 根本不触发，
 *    检查既不是红也不是绿，而是**永久 pending** —— 分支保护会把 PR 卡死，且没人能从红绿看出原因。
 *
 * ── 看门狗、带外项数与它们各自的边界（如实记录，不做过度设计） ───────────────────────
 *  末尾的「(W) 断言名单与冻结清单等值」断言：**删掉任意一条断言**、或**把任意一条断言改名**，
 *  都会在这里变红（比"只比数量"更强）。它有一条**保护不了自己的固有边界**：如果被删的是最后一条
 *  或这条看门狗本身，就没有东西还能报出来了 —— reviewer 明确记为 info（不是 blocker），这里只如实写明。
 *  为了**减少**（不是消除）这条边界，末尾的 (E) 用「实跑项数 == 期望项数」从**外部**钉住总项数。
 *  期望项数的**唯一出处是 verify.yml 的调用行**（gate 步骤里的 `--expect-checks=24`）：
 *   · CI 里由 verify.yml 显式传入；命令行显式传 `--expect-checks=<N>` 时以传入值为准（兼容旧用法）；
 *   · **不带参数（本地裸跑）时同样从 verify.yml 读那个数字** —— 所以本地也一样受这条边界保护：
 *     删掉末尾那条看门狗，本地裸跑同样会红（此前这里只打印一行"本轮无人守护"，是个静默降级的口子）；
 *   · 读不到那个数字（verify.yml 少了该参数 / 那条 run 被改成读取器会跳过的块标量）⇒ **fail-closed**：
 *     直接判红并给出修复指引，绝不悄悄退化成"没人守护"。
 *  两者刻意保持互相独立：一次删除带不走两个机制（除非连 verify.yml 里的数字与名字清单一起改）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const rootArg = process.argv.find(a => a.startsWith('--root='));
const ROOT = rootArg ? path.resolve(rootArg.slice('--root='.length)) : path.join(__dirname, '..', '..');
/**
 * 带外钉住的实跑项数（F8）：数字的**唯一出处**是 verify.yml 的 gate 调用行（`--expect-checks=N`）。
 * 命令行显式传 `--expect-checks=<N>` 时以传入值为准（兼容旧用法）；**不带参数时也从 verify.yml 读那个数字**
 * （读取与断言都在末尾 (E) 处），于是本地裸跑同样被这条边界保护；取不到即 fail-closed。
 */
const expectArg = process.argv.find(a => a.startsWith('--expect-checks='));
const CLI_EXPECT_CHECKS = expectArg ? Number(expectArg.slice('--expect-checks='.length)) : null;
const WF_DIR = path.join(ROOT, '.github', 'workflows');

/* ────────────────────────── 冻结口径（唯一事实来源） ────────────────────────── */

/** 必需 workflow：**写死**这份清单并要求逐个存在（不能只依赖 readdirSync 的结果集） */
const REQUIRED_WORKFLOWS = ['ai-maintenance.yml', 'collect.yml', 'deploy.yml', 'probe-sources.yml', 'verify.yml'];

/** 每个必需 workflow 的 uses 冻结集合（含主版本；SHA 钉死的等价写法见 parseUses 的 allowed） */
const FROZEN_USES = {
  // AI 维护层：只读仓库 + 上传 artifact。**刻意没有 pages / deploy 相关动作** ——
  // 这条链路的产物永远只是候选，不发布任何东西（见 (16) 断言）。
  'ai-maintenance.yml': [
    'actions/checkout@v5',
    'actions/setup-node@v5',
    'actions/upload-artifact@v5'
  ],
  // 三个 workflow 都调用同一个复合 action（门禁的唯一实现）——本地引用按逐字相等匹配。
  'collect.yml': ['actions/checkout@v5', 'actions/setup-node@v5', './.github/actions/gate'],
  'deploy.yml': [
    // checkout / setup-node 在 prepublish 与 build 里各出现一次 —— 冻结表是**多重集**，
    // 每个 job 自己都要 checkout + setup-node，少一个就红。
    'actions/checkout@v5',
    'actions/checkout@v5',
    'actions/setup-node@v5',
    'actions/setup-node@v5',
    'actions/configure-pages@v6',
    'actions/upload-pages-artifact@v5',
    'actions/deploy-pages@v5',
    './.github/actions/gate'
  ],
  'probe-sources.yml': ['actions/checkout@v5', 'actions/setup-node@v5'],
  'verify.yml': ['actions/checkout@v5', 'actions/setup-node@v5', './.github/actions/gate']
};

const EXPECT_RUNS_ON = 'ubuntu-24.04';
const EXPECT_NODE_VERSION = '24';
/** deploy.yml 的 job 名与**顺序**（发布链必须是 prepublish → build → deploy） */
const EXPECT_JOBS = ['prepublish', 'build', 'deploy'];
/** 「采集失败就不发布」的语义：build job 的 if 必须逐字保持 */
const EXPECT_BUILD_IF = "github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'";
const BRIDGE_WORKFLOW = 'Collect AI Deals';
/** 必须保持「无路径过滤」的 workflow（它要当必需检查；被 paths 过滤 = PR 永久 pending） */
const NO_PATH_FILTER_WORKFLOWS = ['verify.yml'];
/** 门禁的唯一实现（三个 workflow 共用它；步骤序列在下面被逐项冻结） */
const GATE_ACTION = '.github/actions/gate/action.yml';
const GATE_ACTION_REF = './.github/actions/gate';
/** 门禁步骤的冻结序列：**顺序与数量**都算契约——谁把真浏览器验收从门禁里拿掉，(10) 立刻红 */
const GATE_STEP_NAMES = [
  'Install dependencies',
  'Validate data (strict)',
  // v1.1 收口新增：可重建性（值必须有源）。与 strict 分开，因为红的含义不同 ——
  // strict 红 = 值不合法；这一条红 = 值合法但**没有任何文件能重建它**。
  'Reproducibility gate (no value without a source)',
  // v1.4 新增：历史一致性的机器守卫（一次性基线 + 追加事件重放必须等于当前 deals.json）。
  // 与可重建性分开的理由相同：红的含义不同 —— 前者是「值没有源」，后者是「变化没有账」。
  'History verify (log consistent with deals.json)',
  // v1.1 收口新增：`migrate.js --audience` 的验收比对。它此前**跑不起来**（缺 --before
  // 基线文件），于是「能改写 deals.json 的命令行工具」没有任何 CI 守卫。改成 9 条合成
  // 夹具逐分支覆盖后才接得进来；接进来之前它就已经抓到一处潜伏缺陷（见 action.yml 注释）。
  'Migration verifier (audience provenance backfill)',
  'Translation gate (drift blocks, pending ages out)',
  'Translation self-test',
  'Expiry self-test',
  'Text / cleanText self-test',
  'Source-health self-test',
  // v1.3 新增：信息来源（evidence / provenance）的全部红线 —— 引文的版权上限、
  // 「最近成功采集」四种状态的语义、以及「不许给自己盖有效性章」的措辞红线。
  // 与 Audience self-test 同一条判断标准：它红的时候没有别的步骤会替它红。
  'Provenance self-test',
  // v1.4 新增：变更记录层（只记重要字段 / 锚点 / 链 / 来源失败不误报 / 上限）。
  // 同一把尺子：它红的时候没有别的步骤会替它红。
  'Deal-history self-test',
  // v1.5 新增：变化雷达（分栏与窗口 / 覆盖不变量 / 文案微调不算变化 / 元信息不上首页 /
  // 上限 / 纯函数 / 墓碑与「不可用」的措辞）。它与 v1.4 那一支互补：
  // 前者管「记录对不对」，这一支管「取出来的视图对不对」，红的含义不同。
  'Change-radar self-test',
  // v1.6 新增：订阅层（Stable ID / 时间只来自数据 / 10 次构建逐字节一致 / 排除项 /
  // 空 Feed 策略 / 厂商门槛与 slug / XML 良构 / 4 项 Tooth Test）。
  // 与 v1.5 那一支互补：前者管「取出来的视图对不对」，这一支管
  // 「把视图序列化成订阅源之后还对不对」，红的含义不同。
  'Feeds self-test',
  // v1.7 新增：SEO 门禁自测（27 个检查码逐条定向篡改 + 干净夹具必须静默 +
  // 门槛分支 + 注册表不变量）。它红的时候没有别的步骤会替它红：
  // 构建期那一遍跑的是真数据，验不到「某个检查码其实永远不会响」。
  'SEO self-test',
  // v1.1 新增：受众字段（三态语义 / merge 可信度仲裁 / 措辞同源）的全部红线守卫都在这支自测里。
  // 它原先只在本机跑，于是这几类回归在 CI 里看不见（t1 核验的 B5）。判断标准不是"多新"，
  // 而是"它红的时候有没有别的步骤会替它红"——没有，所以必须进来。
  'Audience self-test',
  'App-token self-test',
  // v2.0 新增：AI 层边界自检（离线）。它红的时候没有别的步骤会替它红 ——
  // 「没有证据的断言进不来」「非法枚举进不来」「AI 挂了确定性链路不变」
  // 「候选里的密钥会被扫出来」「去重模块根本没有合并能力」全都只在这一步被验证。
  'AI layer self-test',
  // v2.0 新增：采集器 fixture 回放（离线）。把解析器行为钉成契约，
  // 让"改采集器"这件事第一次有了可判定的回归判据。
  'Collector fixtures (offline replay)',
  // v2.1 新增：Coding Plan 数据模型（plans.json）与套餐对比页的离线自测。它红的时候没有别的
  // 步骤会替它红 —— "requests 套餐不得生成 Token 单价""限速套餐不得写固定额度"
  // "原价未知不得填 0""改价不得换 id""三态不得与 false 混用""页面上不许出现结论性词汇"
  // "算不出的单价必须显示成 —"这些承诺只在这一步被验证。
  'Plans self-test (data + page)',
  // v2.3 新增：套餐变化日志（只记重要字段 / 数组顺序不误报 / 值决定类型 / Stable event ID /
  // 一次没见到不算下线 + 批量熔断 / 日期倒填被拒 / 机制只有一份实现）。它与 v1.4 那一支
  // 互补：后者管优惠的历史，这一支管套餐的历史，红的含义不同。
  'Plan-history self-test',
  // v2.4 新增：优惠 ↔ 套餐关系（引用完整性 / provider 归一与显式 override / 状态不读墙上时钟 /
  // 已结束不得显示成「当前优惠」/ 节省金额四道门 / 派生值不落盘 / 候选报告没有写生产关系的路径）。
  // 与上一支互补：那一支管套餐自身怎么变，这一支管优惠与套餐之间那条显式关系对不对。
  'Deal-plan-links self-test',
  'Assemble site (same path as deploy.yml)',
  // v1.6 新增：**真实连续构建**两次，逐字节比对全部 Feed 文件。自测证明的是
  // 「纯函数同输入同输出」，证明不了「构建脚本没把时钟写进产物」——两者红的含义不同。
  'Feeds reproducibility (build twice, byte-compare)',
  // v2.1 新增：plans.json 可重建性 —— 盘上那份必须等于人工来源层产出的那一份（逐字节）。
  // 与上一条红的含义不同：Feeds 那条问「构建产物里有没有被塞进时钟」，
  // 这一条问「有没有人手改了派生产物 / 改了来源层却忘了重建」。
  'Plans reproducibility (curated → plans.json, byte-compare)',
  // v2.3 新增：套餐变化日志与当前 plans.json 的一致性（基线 + 事件重放必须等于今天的数据）。
  // 与上一条红的含义不同：前者问「文件是不是来源层产出的」，这一条问「这份数据是怎么变过来的」。
  'Plan-history verify (log consistent with plans.json)',
  // v1.7 新增：**只读 dist/** 的 SEO 独立验收（可索引性 / 条目集合 / sitemap 成员 /
  // Feed 清单全部现场重新推导）。它是唯一一处「输入与构建期完全不同源」的 SEO 检查。
  'SEO verification (independent, from dist/)',
  'Prepare browser for the real-browser gate',
  'Browser availability decision (never silent)',
  'Real-browser acceptance (verify-site.js)',
  'Regression verify (baseline compare)',
  'Gate conclusion'
];
/** 三个调用方：都必须恰好调用一次门禁 action */
const GATE_CALLERS = ['collect.yml', 'deploy.yml', 'verify.yml'];

/**
 * 应当被执行的断言名单（**字面量**，刻意不派生：改名也要能被看门狗抓到）。
 * 增删断言时同步改这里 —— 于是「断言集合变了」这件事在 diff 里一眼可见。
 */
const FROZEN_ASSERTION_NAMES = [
  '(0) 必需 workflow 存在：ai-maintenance.yml',
  '(0) 必需 workflow 存在：collect.yml',
  '(0) 必需 workflow 存在：deploy.yml',
  '(0) 必需 workflow 存在：probe-sources.yml',
  '(0) 必需 workflow 存在：verify.yml',
  '(0b) 磁盘上的 workflow 集合 == 必需清单（互为子集；未登记的新文件也硬红）',
  '(1) 必需 workflow 的 uses 没有 v1..v4 旧代引用（按主版本比较，含 @v4.1.1 这类点分写法）',
  '(1b) 必需 workflow 的 uses 没有浮动引用（@main / @master / 裸分支名；按 SHA 钉死是允许且推荐的）',
  '(2) ai-maintenance.yml 的 uses 集合等于冻结集合',
  '(2) collect.yml 的 uses 集合等于冻结集合',
  '(2) deploy.yml 的 uses 集合等于冻结集合',
  '(2) probe-sources.yml 的 uses 集合等于冻结集合',
  '(2) verify.yml 的 uses 集合等于冻结集合',
  '(3) deploy.yml 全部 job 的 runs-on 都是 ubuntu-24.04',
  '(3b) 全部 workflow 的 runs-on 都不是浮动标签（按取值判，不按字符串判）',
  '(3c) 全部磁盘上的 workflow 的 runs-on 取值集合唯一（按 jobs.<job>.runs-on 的 path 判）',
  "(4) 全部磁盘上的 workflow 的 node-version 取值集合唯一（只认 setup-node 步骤 with: 下的值）",
  '(4b) 每个带 setup-node 的 job 都显式给出 with.node-version',
  '(4c) 没有把 node-version 写在 env: 等无效位置（那种写法会骗过检查器）',
  '(5) deploy.yml 的 job 名与顺序严格等于 prepublish / build / deploy',
  '(6) engines 下限不低于锁文件里最严的依赖下限（从锁文件推导）',
  '(7a) deploy.yml 的 on: 仍含 workflow_run 桥接',
  '(7b) build job 的 if 表达式逐字未变',
  '(8) verify.yml 的 gate job 存在且没有 job 级 if（永不 skipped）',
  '(9) verify.yml 的 on: 没有被 paths / paths-ignore 过滤（必需检查被过滤 = PR 永久 pending）',
  '(10) gate 复合 action 存在且步骤名序列等于冻结清单',
  '(10b) gate 复合 action 的每个 run 步骤都显式给出 shell（复合 action 的硬要求）',
  '(10c) gate 复合 action 不含任何第三方 uses（门禁里不引入未冻结的外部动作）',
  '(11) collect.yml / deploy.yml / verify.yml 各恰好调用一次门禁 action',
  '(12) deploy.yml 的发布链必须先过门禁：prepublish 无 job 级 if、build 依赖它、deploy 依赖 build',
  '(13) collect.yml 的门禁步骤排在提交步骤之前',
  '(14) workflow 与复合 action 里没有「未加引号的标量含『冒号+空格』」（真实 YAML 会拒绝，本文件的缩进读取器读得过去）',
  '(15) collect.yml 的推送用专用 GitHub App 身份（github-actions 不能被加进 ruleset 绕过名单）',
  // v2.0：AI 维护链路必须"只读 + 只出 artifact"。这条断言存在的理由与 (13)/(15) 同类 ——
  // 「AI 不许自动 push」这句话如果只写在文档里，它会在某次"顺手让它自动提交"的改动里消失，
  // 而且消失时没有任何东西会红。
  '(16) ai-maintenance.yml 只手动触发、只读仓库、只出 artifact（无提交/推送/发布动作）'
];
const WATCHDOG_NAME = '(W) 断言名单与冻结清单等值（删一条或改名都会红；本看门狗保护不了自己被删）';

/* ────────────────────────────── 小工具 ────────────────────────────── */

/** 去掉行尾注释（引号内的 # 不算注释） */
function stripComment(s) {
  let out = '';
  let quote = null;
  for (const ch of s) {
    if (quote) { if (ch === quote) quote = null; out += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; continue; }
    if (ch === '#') break;
    out += ch;
  }
  return out;
}

/** 缩进式读取器：返回 [{indent, key, value, path, inSeq}]；块标量内容整体跳过 */
function parseWorkflow(text) {
  const entries = [];
  const stack = [];
  let blockIndent = -1;
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  for (const raw of lines) {
    const indent = (raw.match(/^[ \t]*/) || [''])[0].replace(/\t/g, '  ').length;
    const trimmed = raw.trim();
    if (blockIndent >= 0) {
      if (trimmed === '' || indent > blockIndent) continue;
      blockIndent = -1;
    }
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const kv = /^([A-Za-z0-9_.\-]+):(?:\s+(.*))?$/.exec(trimmed);
    if (kv) {
      const rawValue = kv[2];
      const isBlockScalar = rawValue !== undefined && /^[|>][-+]?$/.test(rawValue.trim());
      let value = rawValue === undefined || isBlockScalar ? null : stripComment(rawValue).trim();
      if (value === '') value = null;
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      entries.push({ indent, key: kv[1], value, path: [...stack.map(e => e.key), kv[1]] });
      if (rawValue === undefined || isBlockScalar) stack.push({ indent, key: kv[1] });
      if (isBlockScalar) blockIndent = indent;
      continue;
    }

    if (trimmed === '-' || trimmed.startsWith('- ')) {
      const body = stripComment(trimmed.replace(/^-\s?/, '')).trim();
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const seqKv = /^([A-Za-z0-9_.\-]+):\s*(.*)$/.exec(body);
      if (seqKv) entries.push({ indent, key: seqKv[1], value: seqKv[2].trim() || null, path: [...stack.map(e => e.key), seqKv[1]], inSeq: true });
      else entries.push({ indent, key: null, value: body, path: stack.map(e => e.key), inSeq: true });
    }
  }
  return entries;
}

const readWorkflow = f => parseWorkflow(fs.readFileSync(path.join(WF_DIR, f), 'utf8'));
const existingWorkflowFiles = () => {
  try { return fs.readdirSync(WF_DIR).filter(f => /\.ya?ml$/.test(f)).sort(); } catch { return []; }
};

/** 流式序列 / 标量 → 字符串数组 */
function asList(value) {
  if (value === null || value === undefined) return [];
  const s = String(value).trim();
  if (s.startsWith('[') && s.endsWith(']')) {
    return s.slice(1, -1).split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  return [s.replace(/^['"]|['"]$/g, '')];
}

const ver = v => String(v).trim().split(/[.\-+]/).map(n => parseInt(n, 10) || 0).concat([0, 0, 0]).slice(0, 3);
const cmpVer = (a, b) => { const A = ver(a), B = ver(b); for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return A[i] - B[i]; return 0; };

/**
 * 解析 `uses`：kind = sha | floating | version | unknown | malformed | local
 * `./…` 开头的**本地复合 action** 是仓库自己的文件（提交即版本）：既不是浮动引用，
 * 也不需要钉版本，单独一类 —— 见 (1b) 与 (2) 的例外处理。
 */
function parseUses(u) {
  const s = String(u).trim();
  if (s.startsWith('./')) return { raw: s, action: s, ref: null, kind: 'local' };
  const m = /^([\w.-]+\/[\w.-]+)@(.+)$/.exec(s);
  if (!m) return { raw: s, action: null, ref: null, kind: 'malformed' };
  const action = m[1], ref = m[2];
  if (/^[0-9a-f]{40}$/i.test(ref)) return { raw: s, action, ref, kind: 'sha' };      // SHA 钉死：允许且推荐
  if (/^(main|master|HEAD)$/i.test(ref)) return { raw: s, action, ref, kind: 'floating' };
  const v = /^v(\d+)(?:\.\d+)*$/.exec(ref);
  if (v) return { raw: s, action, ref, major: Number(v[1]), kind: 'version' };
  return { raw: s, action, ref, kind: 'unknown' };
}

const usesEntries = entries => entries.filter(e => e.key === 'uses' && e.value !== null);
const usesOf = entries => usesEntries(entries).map(e => e.value);
const jobsOf = entries => entries.filter(e => e.path.length === 2 && e.path[0] === 'jobs').map(e => e.key);
/** job 维度的 runs-on：只认 jobs.<job>.runs-on（按 path 判，不看裸键名） */
const runsOnByJob = entries => Object.fromEntries(entries
  .filter(e => e.key === 'runs-on' && e.path.length === 3 && e.path[0] === 'jobs')
  .map(e => [e.path[1], e.value]));
/** 带 setup-node 的 job（uses 落在 jobs.<job>.steps 之下） */
const jobsWithSetupNode = entries => [...new Set(usesEntries(entries)
  .filter(e => /^actions\/setup-node@/.test(String(e.value)) && e.path[0] === 'jobs' && e.path.includes('steps'))
  .map(e => e.path[1]))];
/** 某个 job 里 setup-node 步骤 `with:` 下的 node-version（只认这个位置） */
const stepNodeVersions = (entries, job) => entries
  .filter(e => e.key === 'node-version' && e.value !== null && e.path[0] === 'jobs' && e.path[1] === job &&
    e.path.includes('steps') && e.path.includes('with'))
  .map(e => String(e.value).replace(/^['"]|['"]$/g, ''));
/** 不在 setup-node 步骤 with: 之下的同名键（env: / job env: / 其它位置） */
const misplacedNodeVersions = entries => entries
  .filter(e => e.key === 'node-version' && e.value !== null &&
    !(e.path[0] === 'jobs' && e.path.includes('steps') && e.path.includes('with')))
  .map(e => `${e.path.join('.')} = ${e.value}`);

/* ────────────────────────────── 断言框架 ────────────────────────────── */

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

console.log(`CI 口径一致性检查 · root=${ROOT}`);
console.log(`磁盘上的 workflow 文件：${existingWorkflowFiles().join(' / ') || '(无)'}`);
console.log(`必需清单（写死）：${REQUIRED_WORKFLOWS.join(' / ')}\n`);

/* ────────────────────────── (0)/(0b) 必需文件与磁盘集合 ────────────────────────── */
// (0) 逐个发断言：删掉/改名任一必需 workflow 都必须红（t23/F1 —— 以前删掉 verify.yml 反而 exit 0，
// 连 (8) 那条唯一的「gate 永不 skipped」守护都会整条消失）。
const DISK_FILES = existingWorkflowFiles();          // 磁盘集合：跨文件断言一律扫它（t27/F7）
const wf = {};
for (const f of DISK_FILES) wf[f] = readWorkflow(f);
for (const f of REQUIRED_WORKFLOWS) {
  const ok = Object.prototype.hasOwnProperty.call(wf, f);
  check(`(0) 必需 workflow 存在：${f}`, ok, ok ? '存在' : `**缺失**（磁盘上没有 ${path.join(WF_DIR, f)}）`);
}
// (0b) 登记制：磁盘集合与必需清单必须互为子集。**未登记的新文件一律硬红（哪怕内容全合规）** ——
// 否则新文件会悄悄绕过「登记才纳入覆盖」的约定（t27/F7：t24 把视野收窄成写死的四条，新文件能穿过去）。
const unregistered = DISK_FILES.filter(f => !REQUIRED_WORKFLOWS.includes(f));
const disappeared = REQUIRED_WORKFLOWS.filter(f => !DISK_FILES.includes(f));
check('(0b) 磁盘上的 workflow 集合 == 必需清单（互为子集；未登记的新文件也硬红）',
  unregistered.length === 0 && disappeared.length === 0,
  unregistered.length || disappeared.length
    ? [
      unregistered.length ? `未登记：${unregistered.join('、')}` : '',
      disappeared.length ? `已消失：${disappeared.join('、')}` : '',
      '→ 新增/删除 workflow 必须同步改三处：REQUIRED_WORKFLOWS（本文件的必需清单）、(2) 的 FROZEN_USES、'
      + 'FROZEN_ASSERTION_NAMES（并把 verify.yml 里的 --expect-checks 数字一并更新）'
    ].filter(Boolean).join('；')
    : `磁盘 ${DISK_FILES.length} 个 = 必需清单 ${REQUIRED_WORKFLOWS.length} 个：${DISK_FILES.join(' / ')}`);

/* ────────────────── (1)/(1b) uses 的版本与引用形式（扫磁盘集合） ────────────────── */
const oldRefs = [];
const floatingRefs = [];
for (const f of DISK_FILES) {
  for (const e of usesEntries(wf[f] || [])) {
    const p = parseUses(e.value);
    if (p.kind === 'version' && p.major < 5) oldRefs.push(`${f}: ${p.raw}（主版本 v${p.major}）`);
    if (p.kind === 'floating') floatingRefs.push(`${f}: ${p.raw}（浮动引用）`);
    // 本地 `./…` 引用（复合 action）是仓库自己的文件，提交即版本 —— 不算浮动引用
    if (p.kind === 'unknown' || p.kind === 'malformed') floatingRefs.push(`${f}: ${p.raw}（不是 @v<N>，也不是 40 位 SHA）`);
  }
}
check('(1) 必需 workflow 的 uses 没有 v1..v4 旧代引用（按主版本比较，含 @v4.1.1 这类点分写法）',
  oldRefs.length === 0, oldRefs.length ? oldRefs.join('、') : `扫了磁盘上 ${DISK_FILES.length} 个 workflow 的全部 uses`);
check('(1b) 必需 workflow 的 uses 没有浮动引用（@main / @master / 裸分支名；按 SHA 钉死是允许且推荐的）',
  floatingRefs.length === 0, floatingRefs.length ? floatingRefs.join('、') : '未发现浮动引用（SHA 钉死的写法同样视为通过）');

/* ────────────────── (2) 每个必需 workflow 的 uses 集合 = 冻结集合 ────────────────── */
// 刻意只遍历 FROZEN_USES 的键（= REQUIRED_WORKFLOWS），**不扫磁盘集合**：
// 新文件在 FROZEN_USES 里没有条目，扫它必然判「多出」而全红——登记制下这件事由 (0b) 负责硬红。
for (const f of REQUIRED_WORKFLOWS) {
  const expected = FROZEN_USES[f] || [];
  const observed = usesEntries(wf[f] || []).map(e => parseUses(e.value));
  const problems = [];
  const pool = [...observed];
  for (const exp of expected) {
    // 本地引用（`./…`）按**逐字相等**匹配：它没有 @ref 可拆，交给 parseUses 之前的
    // `exp.split('@')` 会拿到 undefined 并在这里抛 TypeError（历史坑）。
    const idx = exp.startsWith('./')
      ? pool.findIndex(o => o.kind === 'local' && o.raw === exp)
      : pool.findIndex(o => {
        const [action, ref] = exp.split('@');
        const major = Number(/^v(\d+)(?:\.\d+)*$/.exec(ref)[1]);
        return o.action === action && ((o.kind === 'version' && o.major === major) || o.kind === 'sha');
      });
    if (idx < 0) problems.push(`缺 ${exp}（或未按 SHA 钉死）`);
    else pool.splice(idx, 1);
  }
  if (pool.length) problems.push(`多出 ${pool.map(o => o.raw).join('、')}`);
  check(`(2) ${f} 的 uses 集合等于冻结集合`, problems.length === 0,
    problems.length ? problems.join('；') : (usesOf(wf[f] || []).join('、') || '(无 uses)'));
}

/* ────────────────────────── (3) runner 口径 ────────────────────────── */
const deployRunsOn = runsOnByJob(wf['deploy.yml'] || []);
const deployJobs = jobsOf(wf['deploy.yml'] || []);
const runsOnBad = Object.entries(deployRunsOn).filter(([, v]) => v !== EXPECT_RUNS_ON).map(([j, v]) => `${j} → ${v}`);
const runsOnMissing = deployJobs.filter(j => !(j in deployRunsOn));
check('(3) deploy.yml 全部 job 的 runs-on 都是 ubuntu-24.04',
  runsOnBad.length === 0 && runsOnMissing.length === 0,
  runsOnBad.length || runsOnMissing.length
    ? [runsOnBad.join('、'), runsOnMissing.length ? `缺 runs-on：${runsOnMissing.join('、')}` : ''].filter(Boolean).join('；')
    : Object.entries(deployRunsOn).map(([j, v]) => `${j}=${v}`).join('、'));

const floatingLabels = [];
for (const [f, entries] of Object.entries(wf)) {
  for (const [job, v] of Object.entries(runsOnByJob(entries))) {
    if (v && /-latest$/.test(String(v))) floatingLabels.push(`${f}: ${job} → ${v}`);
  }
}
check('(3b) 全部 workflow 的 runs-on 都不是浮动标签（按取值判，不按字符串判）',
  floatingLabels.length === 0, floatingLabels.length ? floatingLabels.join('、') : '未发现 *-latest 取值（注释里提到它不算漂移）');

const runsOnPerFile = {};
for (const f of DISK_FILES) {
  const m = runsOnByJob(wf[f] || []);
  runsOnPerFile[f] = Object.values(m).map(String);
}
const runsOnUnion = [...new Set(Object.values(runsOnPerFile).flat())].sort();
const runsOnEmpty = Object.entries(runsOnPerFile).filter(([, v]) => v.length === 0).map(([f]) => f);
check('(3c) 全部磁盘上的 workflow 的 runs-on 取值集合唯一（按 jobs.<job>.runs-on 的 path 判）',
  runsOnEmpty.length === 0 && runsOnUnion.length === 1 && runsOnUnion[0] === EXPECT_RUNS_ON,
  runsOnEmpty.length ? `这些文件没有解析到 runs-on：${runsOnEmpty.join('、')}（新 workflow 请按登记制同步改三处）`
    : `${runsOnUnion.join('、')} — ${Object.entries(runsOnPerFile).map(([f, v]) => `${f}=${v.join('/')}`).join('、')}`);

/* ─────────────────── (4)/(4b)/(4c) node-version：只认生效位置 ─────────────────── */
const nodePerFile = {};
const nodeProblems = [];
const misplaced = [];
for (const f of DISK_FILES) {
  const entries = wf[f] || [];
  const vals = [];
  for (const job of jobsWithSetupNode(entries)) {
    const vs = stepNodeVersions(entries, job);
    if (!vs.length) nodeProblems.push(`${f}: job ${job} 有 setup-node 但没给 with.node-version`);
    vals.push(...vs);
  }
  nodePerFile[f] = vals;
  misplaced.push(...misplacedNodeVersions(entries).map(x => `${f}: ${x}`));
}
const nodeUnion = [...new Set(Object.values(nodePerFile).flat())].sort();
const nodeEmpty = Object.entries(nodePerFile).filter(([, v]) => v.length === 0).map(([f]) => f);
check("(4) 全部磁盘上的 workflow 的 node-version 取值集合唯一（只认 setup-node 步骤 with: 下的值）",
  nodeEmpty.length === 0 && nodeUnion.length === 1 && nodeUnion[0] === EXPECT_NODE_VERSION,
  nodeEmpty.length ? `这些文件没有解析到 setup-node 的 with.node-version：${nodeEmpty.join('、')}（新 workflow 请按登记制同步改三处）`
    : `${nodeUnion.join('、')} — ${Object.entries(nodePerFile).map(([f, v]) => `${f}=${v.join('/')}`).join('、')}`);
check('(4b) 每个带 setup-node 的 job 都显式给出 with.node-version',
  nodeProblems.length === 0, nodeProblems.length ? nodeProblems.join('、') : `覆盖 ${DISK_FILES.map(f => `${f}:${jobsWithSetupNode(wf[f] || []).length} 个 job`).join('、')}`);
check('(4c) 没有把 node-version 写在 env: 等无效位置（那种写法会骗过检查器）',
  misplaced.length === 0, misplaced.length ? misplaced.join('、') : '未发现无效位置的 node-version');

/* ────────────────────────── (5)(6)(7)(8)(9) ────────────────────────── */
const deployJobNames = jobsOf(wf['deploy.yml'] || []);
check('(5) deploy.yml 的 job 名与顺序严格等于 prepublish / build / deploy',
  JSON.stringify(deployJobNames) === JSON.stringify(EXPECT_JOBS), deployJobNames.join('、') || '(未解析到 job)');

let enginesOk = false, enginesDetail = '';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  const declared = String((pkg.engines && pkg.engines.node) || '');
  const floors = [], unparsed = [];
  for (const [name, meta] of Object.entries(lock.packages || {})) {
    const e = meta && meta.engines && meta.engines.node;
    if (!e) continue;
    const m = /^>=\s*(\d+(?:\.\d+){0,2})$/.exec(String(e).trim());
    if (m) floors.push({ name: name || '(root)', v: m[1] });
    else unparsed.push(`${name || '(root)'} → ${e}`);
  }
  floors.sort((a, b) => cmpVer(b.v, a.v));
  const strictest = floors[0];
  const dm = /^>=\s*(\d+(?:\.\d+){0,2})$/.exec(declared);
  if (!dm) enginesDetail = `package.json 的 engines.node 不是单一下限形式：${JSON.stringify(declared)}`;
  else if (!strictest) enginesDetail = '锁文件里没有任何可解析的 engines.node 下限';
  else {
    enginesOk = cmpVer(dm[1], strictest.v) >= 0;
    enginesDetail = `声明 ${declared} ≥ 锁文件最严 ${strictest.v}（来自 ${floors.filter(f => f.v === strictest.v).map(f => f.name.replace('node_modules/', '')).join('、')}）`;
  }
  if (unparsed.length) enginesDetail += `；⚠️ ${unparsed.length} 条依赖的 engines.node 不是单一下限形式（未参与比较）：${unparsed.join('、')}`;
} catch (e) {
  enginesDetail = `读取 package.json / package-lock.json 失败：${e.message}`;
}
// 边界（如实记录）：该断言比较的是**下限的数值大小**，不判断上限/范围表达式的语义。
check('(6) engines 下限不低于锁文件里最严的依赖下限（从锁文件推导）', enginesOk, enginesDetail);

const onEntries = (f, key) => (wf[f] || []).filter(e => e.path[0] === 'on' && e.path.length === 2 && e.key === key);
const bridge = onEntries('deploy.yml', 'workflow_run')[0];
const bridgeWorkflows = asList(((wf['deploy.yml'] || []).find(e => e.path.join('.') === 'on.workflow_run.workflows') || {}).value);
const bridgeTypes = asList(((wf['deploy.yml'] || []).find(e => e.path.join('.') === 'on.workflow_run.types') || {}).value);
check('(7a) deploy.yml 的 on: 仍含 workflow_run 桥接',
  !!bridge && bridgeWorkflows.includes(BRIDGE_WORKFLOW) && bridgeTypes.includes('completed'),
  bridge ? `workflows=${JSON.stringify(bridgeWorkflows)} types=${JSON.stringify(bridgeTypes)}` : 'on: 块里没有 workflow_run');

const buildIf = ((wf['deploy.yml'] || []).find(e => e.path.join('.') === 'jobs.build.if') || {}).value;
check('(7b) build job 的 if 表达式逐字未变', buildIf === EXPECT_BUILD_IF,
  buildIf === undefined ? '没有找到 jobs.build.if' : buildIf);

// (8) 无条件执行（t23/F1）：verify.yml 缺失或改名时，(0) 已经报红，这里也必须给出自己的 ✗
const verifyEntries = wf['verify.yml'] || [];
const gateExists = verifyEntries.some(e => e.path.length === 2 && e.path[0] === 'jobs' && e.key === 'gate');
const gateIf = (verifyEntries.find(e => e.path.join('.') === 'jobs.gate.if') || {}).value;
check('(8) verify.yml 的 gate job 存在且没有 job 级 if（永不 skipped）',
  Object.prototype.hasOwnProperty.call(wf, 'verify.yml') && gateExists && gateIf === undefined,
  !Object.prototype.hasOwnProperty.call(wf, 'verify.yml') ? '**verify.yml 缺失**（gate 检查无从谈起）'
    : !gateExists ? '没有 gate job（改名即视为漂移：必需检查名要对得上）'
      : gateIf !== undefined ? `发现 job 级 if：${gateIf}（跳过会报 Success = 没跑却算过，必需检查会被静默满足）` : '无 job 级 if');

// (9) 触发面：必需检查不得被 paths / paths-ignore 过滤（t24/F6，按 path 判，不按字符串判）
const filterHits = [];
for (const f of NO_PATH_FILTER_WORKFLOWS) {
  for (const e of (wf[f] || [])) {
    if (e.path[0] === 'on' && /^paths(-ignore)?$/.test(e.key)) {
      filterHits.push(`${f}: on.${e.path.slice(1, -1).join('.') || e.path[1]} → ${e.key}`);
    }
  }
}
check('(9) verify.yml 的 on: 没有被 paths / paths-ignore 过滤（必需检查被过滤 = PR 永久 pending）',
  filterHits.length === 0, filterHits.length ? filterHits.join('、') : 'on: 下没有任何 paths / paths-ignore');

/* ─────────── (10)(11)(12)(13)：门禁接线（2026-09-28 的发布链重构） ─────────── */

// 复合 action 也用同一套缩进读取器解析（不引入 YAML 依赖）。
const gatePath = path.join(ROOT, GATE_ACTION);
let gateEntries = [];
let gateParseError = null;
try {
  gateEntries = parseWorkflow(fs.readFileSync(gatePath, 'utf8'));
} catch (error) {
  gateParseError = error.message;
}
const gateSteps = gateEntries.filter(e => e.path.includes('steps'));
const gateStepNames = gateEntries
  .filter(e => e.key === 'name' && e.path[0] === 'runs' && e.path.includes('steps'))
  .map(e => String(e.value).replace(/^['"]|['"]$/g, ''));

// (10) 步骤序列（顺序 + 数量）逐项冻结：谁把真浏览器验收、回归比对、或译文门禁
// 从门禁里拿掉，这条立刻红 —— 这是本次重构最需要盯住的东西。
const stepDiff = [];
for (let i = 0; i < Math.max(gateStepNames.length, GATE_STEP_NAMES.length); i++) {
  const actual = gateStepNames[i];
  const expected = GATE_STEP_NAMES[i];
  if (actual !== expected) stepDiff.push(`#${i + 1} 期望「${expected || '(无)'}」实得「${actual || '(无)'}」`);
}
check('(10) gate 复合 action 存在且步骤名序列等于冻结清单',
  !gateParseError && stepDiff.length === 0,
  gateParseError ? `读取 ${GATE_ACTION} 失败：${gateParseError}`
    : stepDiff.length ? stepDiff.slice(0, 4).join('；')
      : `${GATE_ACTION} 共 ${gateStepNames.length} 步，逐项一致`);

// (10b) 复合 action 的每个 run 步骤都必须显式给出 shell —— 这是 GitHub 的硬要求，
// 少一个就是「本地看着没问题、推上去直接 parse 失败」。
// 注意：`run: |` 是块标量，缩进读取器会把它的 value 记成 null，所以判据只能是「有没有 run 这个键」。
const runSteps = gateSteps.filter(e => e.key === 'run');
const shells = gateSteps.filter(e => e.key === 'shell').length;
check('(10b) gate 复合 action 的每个 run 步骤都显式给出 shell（复合 action 的硬要求）',
  !gateParseError && runSteps.length > 0 && shells === runSteps.length,
  gateParseError ? '文件读取失败' : `run 步骤 ${runSteps.length} 个 / shell 声明 ${shells} 个`);

// (10c) 门禁里不引入任何第三方 uses：一旦引入，就得同时进 FROZEN_USES 与版本冻结，
// 而门禁本身不该依赖外部动作（它现在的步骤全是 run:）。
const thirdPartyInGate = usesEntries(gateEntries)
  .map(e => String(e.value))
  .filter(v => !v.startsWith('./'));
check('(10c) gate 复合 action 不含任何第三方 uses（门禁里不引入未冻结的外部动作）',
  !gateParseError && thirdPartyInGate.length === 0,
  gateParseError ? '文件读取失败' : (thirdPartyInGate.length ? thirdPartyInGate.join('、') : '只有 run: 步骤'));

// (11) 三个调用方各恰好一次：少了 = 那条链路没有门禁；多了 = 同一份门禁被跑两遍
// （既浪费，也说明有人把门禁复制成了两套）。
const gateCallDetail = GATE_CALLERS.map(f =>
  `${f}:${usesEntries(wf[f] || []).filter(e => parseUses(e.value).kind === 'local' &&
    parseUses(e.value).raw === GATE_ACTION_REF).length}`);
const gateCallsOk = gateCallDetail.every(item => item.endsWith(':1'));
check('(11) collect.yml / deploy.yml / verify.yml 各恰好调用一次门禁 action',
  gateCallsOk, gateCallDetail.join('、'));

// (12) 发布链必须「先过门禁再发布」。三件事一起看：
//   · prepublish **没有** job 级 if（被跳过的 job 报 Success，等于没跑却算过）；
//   · build 的 needs 含 prepublish（门禁红 ⇒ build 根本没有机会执行）；
//   · deploy 的 needs 是 build（保持原样）。
const prepublishIf = (wf['deploy.yml'] || []).find(e => e.path.join('.') === 'jobs.prepublish.if');
const needsOf = job => {
  const direct = (wf['deploy.yml'] || []).find(e => e.path.join('.') === `jobs.${job}.needs`);
  const list = (wf['deploy.yml'] || []).filter(e => e.path[0] === 'jobs' && e.path[1] === job &&
    e.path.length === 4 && e.path[2] === 'needs' && e.inSeq === false && e.key === null);
  if (direct) return asList(direct.value);
  return list.map(e => String(e.value));
};
const buildNeeds = needsOf('build');
const deployNeeds = needsOf('deploy');
const gateWiringProblems = [];
if (prepublishIf) gateWiringProblems.push(`prepublish 有 job 级 if：${prepublishIf.value}`);
if (!buildNeeds.includes('prepublish')) gateWiringProblems.push(`build.needs=${JSON.stringify(buildNeeds)} 不含 prepublish`);
if (!deployNeeds.includes('build')) gateWiringProblems.push(`deploy.needs=${JSON.stringify(deployNeeds)} 不含 build`);
if (!(wf['deploy.yml'] || []).some(e => e.path.join('.') === 'jobs.prepublish.steps')) {
  gateWiringProblems.push('prepublish 没有 steps（门禁没接上）');
}
check('(12) deploy.yml 的发布链必须先过门禁：prepublish 无 job 级 if、build 依赖它、deploy 依赖 build',
  gateWiringProblems.length === 0,
  gateWiringProblems.length ? gateWiringProblems.join('；')
    : `prepublish(无 if) → build(needs=${JSON.stringify(buildNeeds)}) → deploy(needs=${JSON.stringify(deployNeeds)})`);

// (13) 采集路径的门禁必须在**提交之前**：机器人提交一进 master 就会被 deploy 的
// workflow_run 接走，门禁放在提交之后就只是「事后告警」。
// 判据用**原文位置**而不是解析结果：提交步骤的脚本是 `run: |` 块标量，缩进读取器按设计
// 整体跳过块标量内容（那是它不引入 YAML 依赖的代价），所以「谁在前谁在后」直接比字符串位置，
// 反而更贴近事实。两处引用都恰好只有一次（前者由 (11) 保证）。
const collectRaw = fs.readFileSync(path.join(WF_DIR, 'collect.yml'), 'utf8');
const idxGateRef = collectRaw.indexOf(`uses: ${GATE_ACTION_REF}`);
const idxPush = collectRaw.indexOf('git push');
const commitStepCount = (collectRaw.match(/name: Commit and push if changed/g) || []).length;
const collectProblems = [];
if (idxGateRef < 0) collectProblems.push(`collect.yml 里没有 \`uses: ${GATE_ACTION_REF}\``);
if (idxPush < 0) collectProblems.push('collect.yml 里没有 git push（提交步骤不见了）');
if (idxGateRef >= 0 && idxPush >= 0 && idxGateRef > idxPush) {
  collectProblems.push('门禁写在 git push 之后（门禁红也拦不住入库）');
}
if (commitStepCount !== 1) collectProblems.push(`「Commit and push」步骤出现 ${commitStepCount} 次（期望恰好 1 次）`);
// 提交内容：四份东西必须一起走 —— 数据本身，以及三份**跨运行状态**
//（来源健康、待译进入日期、变更日志）。少一份就会出现「状态永远停在首次运行」、
//「译文年龄退回 firstSeen，一失效就超期」，或 v1.4 实测差点放过去的那种最坏形态：
//**采集把变更日志写进磁盘却没提交** —— 下一轮门禁拿「已更新的 deals.json」比「上一轮的日志」，
// check:history 当场变红，整条采集链被自己的日志卡死。
for (const needed of ['deals.json', 'scripts/data/source-health.json', 'scripts/data/zh-pending.json', 'scripts/data/deal-history.json']) {
  if (!collectRaw.includes(needed)) collectProblems.push(`collect.yml 的提交里没有 ${needed}`);
}
check('(13) collect.yml 的门禁步骤排在提交步骤之前',
  collectProblems.length === 0,
  collectProblems.length ? collectProblems.join('；')
    : `门禁在字节 ${idxGateRef} → git push 在字节 ${idxPush}（同一 collect job 里，步骤顺序即语义）`);

/* ─────────── (14) 真实 YAML 会拒绝、而缩进读取器读得过去的那种行 ─────────── */

/**
 * 2026-09-28 实测踩到：`- name: CI consistency (bare run: 期望项数…)` 里的
 * 「冒号 + 空格」在块上下文里是**映射分隔符**，GitHub 的真实 YAML 解析器直接拒绝整个文件
 * （本文件自带的缩进读取器读得过去 —— 它不引入 YAML 依赖的代价就是这个）。
 * 这类错误的特点是：本地所有门禁全绿，推上去 workflow 直接 parse 失败、什么都不跑。
 * 所以补一条针对性的 lint：**未加引号的标量值里不得出现「冒号 + 空格」**。
 *
 * 边界（如实记录）：只查这一种。引号包裹的值、块标量（value 为 null）都不查；
 * 也不做完整 YAML 校验（那需要引入解析器，与本文件"npm ci 之前就能跑"的定位冲突）。
 */
const yamlHazards = [];
for (const file of [...DISK_FILES, GATE_ACTION]) {
  const entries = file === GATE_ACTION ? gateEntries : (wf[file] || []);
  for (const e of entries) {
    if (e.value === null || e.value === undefined) continue;
    const raw = String(e.value);
    const quoted = /^['"].*['"]$/.test(raw.trim());
    const body = raw.trim();
    if (!quoted && /: /.test(body)) {
      yamlHazards.push(`${file}: ${e.path.join('.') || e.key} → ${body.slice(0, 60)}`);
    }
  }
}
check('(14) workflow 与复合 action 里没有「未加引号的标量含『冒号+空格』」（真实 YAML 会拒绝，本文件的缩进读取器读得过去）',
  yamlHazards.length === 0,
  yamlHazards.length ? yamlHazards.join('；') : `扫了 ${DISK_FILES.length} 个 workflow + ${GATE_ACTION} 的全部未加引号标量`);

/* ─────────── (15) 采集机器人的身份：必须是专用 GitHub App，不能是 GITHUB_TOKEN ─────────── */

/**
 * 2026-09-29 查证（不是推测）：`github-actions`（App ID 15368）是**平台原生身份** ——
 * 每次 GITHUB_TOKEN 调用的背后都是它，但它不是「安装在仓库上的 GitHub App」，
 * 因此**不能**被加进 ruleset 的绕过名单：用 API 传
 * `actor_type: "Integration", actor_id: 15368` 返回 **HTTP 422**
 * （`Actor GitHub Actions integration must be part of the ruleset source or owner organization`），
 * GitHub 文档给出的绕过候选里也没有它。
 *
 * 后果：master 一旦要求「必须走 PR + 必须过 gate」，用 GITHUB_TOKEN 推送的定时采集
 * 就会被挡在门外，而采集是无人值守的 —— 症状是**每天两次静默失败**。
 * 出路是给机器人一个可安装的 GitHub App 身份并单独加进绕过名单。
 *
 * 为什么非要有这条断言：把推送退回 GITHUB_TOKEN 的改动**在本地完全看不出来**
 * （本机没有 ruleset，`git push` 照样成功），只会在线上定时任务里烂掉。
 *
 * ⚠️ 这里必须先**剥掉注释**再查（用本文件已有的 stripComment）。
 * 牙齿探针实测踩到过：把 `[skip ci]` 从提交命令里删掉、把 `persist-credentials` 改成 true，
 * 断言**依然是绿的** —— 因为 workflow 的注释里各写过一次同样的字样，全文 grep 被注释喂饱了。
 * 凡是「文件里出现过某个字样」型断言都有这个假阴性，新写断言时要留意。
 */
const collectRawText = fs.readFileSync(path.join(WF_DIR, 'collect.yml'), 'utf8');
const collectText = collectRawText.split('\n').map(stripComment).join('\n');
const collectAuthIssues = [];
const authMintIdx = collectText.indexOf('node scripts/tools/app-token.js');
const authPushIdx = collectText.lastIndexOf('git push');
if (authMintIdx < 0) collectAuthIssues.push('collect.yml 里没有 `node scripts/tools/app-token.js`（App token 换取步骤不见了）');
if (authPushIdx < 0) collectAuthIssues.push('collect.yml 里没有 git push');
if (authMintIdx >= 0 && authPushIdx >= 0 && authMintIdx > authPushIdx) {
  collectAuthIssues.push('换取 App token 的步骤排在 git push **之后** —— 推送时根本拿不到凭据');
}
if (!/persist-credentials:\s*false/.test(collectText)) {
  collectAuthIssues.push('checkout 没有 persist-credentials: false（GITHUB_TOKEN 的凭据头会留在本地，App token 的 remote 设置不生效）');
}
for (const needed of ['secrets.COLLECT_APP_ID', 'secrets.COLLECT_APP_PRIVATE_KEY', 'steps.app.outputs.token']) {
  if (!collectText.includes(needed)) collectAuthIssues.push(`collect.yml 里没有用到 ${needed}`);
}
if (!/\[skip ci\]/.test(collectText)) {
  collectAuthIssues.push('机器人提交没有 [skip ci]：App token 推的提交**会**触发 workflow，同一个 SHA 会同时跑 deploy.yml 的 push 链与 workflow_run 链，白跑一遍发布');
}
check('(15) collect.yml 的推送用专用 GitHub App 身份（github-actions 不能被加进 ruleset 绕过名单）',
  collectAuthIssues.length === 0,
  collectAuthIssues.length ? collectAuthIssues.join('；')
    : 'App token 换取排在推送之前 · checkout 不持久化凭据 · 提交带 [skip ci] 防双链发布');

/* ─────────── (16) AI 维护链路：只手动触发、只读仓库、只出 artifact ─────────── */
//
// 「AI 只能提出候选」这条红线，如果只写在 docs/AI-MAINTENANCE-v2.0.md 里，
// 它会在某次"顺手让它自动提交候选"的改动里悄悄消失，而且消失时没有任何东西会红。
// 所以把三件事钉在这里：触发方式、权限、以及**整份文件里不许出现任何写仓库的动作**。
const aiIssues = [];
{
  const aiFile = 'ai-maintenance.yml';
  const aiPath = path.join(WF_DIR, aiFile);
  const aiRaw = fs.existsSync(aiPath) ? fs.readFileSync(aiPath, 'utf8') : '';
  const aiText = aiRaw.split('\n').map(stripComment).join('\n');

  // ① 触发方式：只允许 workflow_dispatch（没有 schedule / push / workflow_run）
  const aiEntries = wf[aiFile] || [];
  const aiTriggers = aiEntries
    .filter(e => e.path[0] === 'on' && e.path.length === 2 && e.key === null)
    .map(e => String(e.value).trim())
    .concat(aiEntries.filter(e => e.path[0] === 'on' && e.path.length === 2 && e.key).map(e => e.key));
  const triggerSet = new Set(aiTriggers.filter(Boolean));
  if (!triggerSet.has('workflow_dispatch')) aiIssues.push('on: 里没有 workflow_dispatch');
  for (const forbidden of ['schedule', 'push', 'pull_request', 'workflow_run']) {
    if (triggerSet.has(forbidden)) aiIssues.push(`on: 里出现了 ${forbidden} —— AI 维护只能手动触发`);
  }

  // ② 权限：contents 必须是 read（write 意味着它能推仓库）
  const permEntries = aiEntries.filter(e => e.path[0] === 'permissions');
  const contentsPerm = permEntries.find(e => e.path[e.path.length - 1] === 'contents');
  if (!contentsPerm) aiIssues.push('没有显式声明 permissions.contents');
  else if (String(contentsPerm.value).trim() !== 'read') aiIssues.push(`permissions.contents=${contentsPerm.value}（必须是 read）`);
  if (permEntries.some(e => /write/.test(String(e.value)))) aiIssues.push('permissions 里出现了 write');

  // ③ 整份文件里不许有任何会改动仓库的动作
  for (const forbidden of ['git add', 'git commit', 'git push', 'git remote set-url', 'persist-credentials: true']) {
    if (aiText.includes(forbidden)) aiIssues.push(`文件里出现了「${forbidden}」`);
  }
  // ④ 也不许发布任何东西（页面 / 部署动作一律不允许出现在这条链路上）
  for (const forbidden of ['deploy-pages', 'upload-pages-artifact', 'configure-pages', 'contents: write']) {
    if (aiText.includes(forbidden)) aiIssues.push(`文件里出现了发布相关动作「${forbidden}」`);
  }
  // ⑤ 它必须真的接上了 AI 自检：没有自检的 AI 链路等于裸奔
  if (!aiText.includes('scripts/tools/ai-selftest.js')) aiIssues.push('没有在跑 AI 层自检');
}
check('(16) ai-maintenance.yml 只手动触发、只读仓库、只出 artifact（无提交/推送/发布动作）',
  aiIssues.length === 0,
  aiIssues.length ? aiIssues.join('；')
    : 'workflow_dispatch 唯一入口 · contents: read · 文件里无 commit/push/deploy 动作 · 已接 AI 自检');

/* ─────────────────── (W) 看门狗：断言名单等值（不可跳过） ─────────────────── */// 刻意放在所有分支之外：删一条断言、或改任意一条断言名，都会在这里变红。
// 固有边界：看门狗保护不了**自己**被删（那时它也不存在了）—— 如实记录，不做过度设计。
const observedNames = results.map(r => r.name);
const missingNames = FROZEN_ASSERTION_NAMES.filter(n => !observedNames.includes(n));
const extraNames = observedNames.filter(n => !FROZEN_ASSERTION_NAMES.includes(n) && n !== WATCHDOG_NAME);
check(WATCHDOG_NAME, missingNames.length === 0 && extraNames.length === 0,
  missingNames.length || extraNames.length
    ? [missingNames.length ? `少 ${missingNames.length} 条：${missingNames.join('、')}` : '',
      extraNames.length ? `多 ${extraNames.length} 条：${extraNames.join('、')}` : ''].filter(Boolean).join('；')
    : `实跑 ${observedNames.length} 条 = 冻结清单 ${FROZEN_ASSERTION_NAMES.length} 条 + 本看门狗`);

const failed = results.filter(r => !r.ok);

/**
 * 期望项数的唯一出处：verify.yml 的 gate 步骤里那条
 * `run: node scripts/tools/check-ci-consistency.js --expect-checks=N`。
 * 复用本文件自带的 parseWorkflow（不引入 YAML 依赖，npm ci 之前也跑得动）：
 * 它把块标量整体跳过 ⇒ 谁把这条 run 改成 `run: |` 多行写法，这里就取不到数字，按 fail-closed 判红。
 */
function expectChecksFromVerifyYml() {
  const gateRuns = (wf['verify.yml'] || []).filter(e => e.key === 'run' && e.value !== null
    && e.path[0] === 'jobs' && e.path[1] === 'gate' && e.path.includes('steps'));
  const found = [...new Set(gateRuns
    .map(e => (/--expect-checks=(\d+)/.exec(String(e.value)) || [])[1])
    .filter(v => v !== undefined))];
  if (!found.length) {
    return {
      error: `verify.yml 的 gate 步骤里读不到 --expect-checks=<N>`
        + `（找到 ${gateRuns.length} 条可解析的 run: 行，没有一条含该参数；`
        + '若这条 run 被改成了 `run: |` 块标量写法，本读取器会整体跳过它）。'
        + '期望项数的唯一出处就是这一行 —— 应从 verify.yml 的 gate 步骤读取 --expect-checks，请恢复它。'
    };
  }
  if (found.length > 1) {
    return {
      error: `verify.yml 的 gate 步骤里有多处且不一致的 --expect-checks：${found.join('、')}`
        + ' —— 应从 verify.yml 的 gate 步骤读取**唯一**的 --expect-checks，请恢复它。'
    };
  }
  return { value: Number(found[0]) };
}

// (E) 带外项数（F8，见文件头「看门狗、带外项数与它们各自的边界」）。
// 刻意**不走 check()**：它是带外机制，不进 FROZEN_ASSERTION_NAMES、也不改变「N 项」的定义，
// 这样「删掉看门狗」与「项数被外部钉住」两个机制互相独立，一次删除带不走两个。
// 期望值来源：命令行 --expect-checks=<N>（显式传入时以它为准），否则**从 verify.yml 的 gate 调用行读**——
// 本地裸跑走的就是后者，所以本地删掉末尾看门狗同样会红，而不是只打印一行"本轮无人守护"。
// 两处都取不到 ⇒ fail-closed：判红 + 修复指引，绝不悄悄退化成"没人守护"。
const derivedExpect = expectArg ? null : expectChecksFromVerifyYml();
const EXPECT_CHECKS = expectArg ? CLI_EXPECT_CHECKS
  : (derivedExpect.value === undefined ? null : derivedExpect.value);
const EXPECT_CHECKS_SOURCE = expectArg ? `命令行 --expect-checks=${CLI_EXPECT_CHECKS}` : 'verify.yml 的 gate 调用行';
if (EXPECT_CHECKS === null) {
  failed.push({
    name: '(E) 期望项数必须能取到（fail-closed：不许悄悄退化成"无人守护"）', ok: false,
    detail: (derivedExpect && derivedExpect.error) || '未知原因'
  });
} else if (!Number.isInteger(EXPECT_CHECKS) || EXPECT_CHECKS <= 0) {
  failed.push({ name: '(E) --expect-checks 的取值必须是不小于 1 的整数', ok: false, detail: `收到 ${expectArg}` });
} else if (results.length !== EXPECT_CHECKS) {
  failed.push({
    name: '(E) 实跑项数 == 外部钉住的 --expect-checks', ok: false,
    detail: `实跑 ${results.length} 项 ≠ 钉住 ${EXPECT_CHECKS} 项（期望值来自 ${EXPECT_CHECKS_SOURCE}）`
      + '（新增/删除断言后请同步 verify.yml 的 --expect-checks 数字与 FROZEN_ASSERTION_NAMES）'
  });
} else {
  console.log(`✓ (E) 实跑项数 == --expect-checks=${EXPECT_CHECKS}（期望值来自 ${EXPECT_CHECKS_SOURCE}；`
    + '数字钉在调用方，与看门狗互相独立）');
}

console.log(`\n${failed.length ? '❌' : '✅'} CI 口径检查 ${results.length} 项，失败 ${failed.length} 项`);
if (failed.length) {
  failed.forEach(f => console.log(`   ✗ ${f.name}${f.detail ? ' — ' + f.detail : ''}`));
  process.exit(1);
}
