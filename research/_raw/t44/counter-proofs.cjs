#!/usr/bin/env node
/**
 * t44 反证夹具（T44 验收 ②③）：把「写死期望 → 关系式判据」的每一处改动都真的**顶红一次**。
 *
 * ## 为什么要有这个文件
 *
 * 本轮（coverage-expansion-v1）反复吃的是同一种亏：**判据把期望钉在历史快照上**，
 * 数据一长就假红，报出来的话还像在说内容缺陷。t44 把 4 条（+ 本轮顺手收口的 2 条同类）改成
 * 关系式判据。但「改宽了」与「改对了」从 diff 上看不出区别 —— 唯一的证据是**反证**：
 *
 *   · **违反关系 ⇒ 必红**（牙还在，不是把判据删掉）；
 *   · **同一份数据上，旧判据红而新判据绿**（这轮要修的就是这种假红）；
 *   · **对照绿**（没改动的那棵树上是全绿的，红只由本次变异引起）。
 *
 * ## 怎么跑
 *
 *   node research/_raw/t44/counter-proofs.cjs          # 人类可读
 *   node research/_raw/t44/counter-proofs.cjs --json   # 机器可读（写进 t44-counter-proofs.json）
 *
 * ## 纪律
 *
 * 1. **所有变异只发生在临时沙箱里**：把 `git ls-files` 的树复制到 TEMP，在那里改、在那里跑。
 *    运行前后逐文件复核**共享工作区的 sha256 没有变**（含四个被改的判据文件与 lib 里的被变异文件）。
 * 2. **每个被改的源文件在沙箱里逐字符可还原**：`find` 串必须**恰好出现 1 次**，否则这条反证
 *    本身就不可信（找不到/找到多处 ⇒ 立即失败，不静默跳过）。
 * 3. 沙箱里 `node_modules` 用 junction 指回原树（自测要 cheerio / playwright-core），`dist/` 直接复制
 *    （产物是未跟踪目录，`git ls-files` 带不过来，而 data-docs-selftest 要读它）。
 * 4. 不联网、不读墙上时钟、不用随机数。
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..', '..');          // worktree 根
const NODE = process.execPath;
const JSON_OUT = path.join(HERE, 't44-counter-proofs.json');

/* ------------------------------------------------------------------ */
/* 沙箱                                                                */
/* ------------------------------------------------------------------ */

const trackedFiles = () => {
  const result = spawnSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ls-files 失败：${result.stderr}`);
  return result.stdout.split('\0').filter(Boolean);
};

/** 复制一棵可运行的工作树（`dist/` 不复制：沙箱里自己构建，免得被共享工作区上一次构建的半成品污染）*/
function makeTree(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `t44-${label}-`));
  for (const rel of trackedFiles()) {
    const from = path.join(ROOT, rel);
    const to = path.join(dir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  const modules = path.join(ROOT, 'node_modules');
  if (fs.existsSync(modules)) fs.symlinkSync(modules, path.join(dir, 'node_modules'), 'junction');
  return dir;
}

function gitFixtureCommit(dir) {
  const run = args => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  run(['init', '-q']);
  run(['add', '-A']);
  const commit = run(['-c', 'user.email=t44@local', '-c', 'user.name=t44', 'commit', '-q', '-m', 't44 fixture base']);
  if (commit.status !== 0) throw new Error(`fixture commit 失败：${commit.stderr || commit.stdout}`);
  return dir;
}

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function runIn(dir, args) {
  const result = spawnSync(NODE, args, { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return {
    code: result.status === null ? -1 : result.status,
    out: `${result.stdout || ''}${result.stderr || ''}`,
    diag: `status=${result.status} signal=${result.signal} error=${result.error ? result.error.code || result.error.message : 'none'}`
      + ` stdout=${(result.stdout || '').length} stderr=${(result.stderr || '').length}`
  };
}

/* ------------------------------------------------------------------ */
/* 变异                                                                */
/* ------------------------------------------------------------------ */

/** 就地打补丁：每个 `find` 必须**恰好**出现 1 次（否则这条反证不可信，直接抛）。 */
function patch(dir, rel, pairs) {
  const file = path.join(dir, rel);
  let text = fs.readFileSync(file, 'utf8');
  for (const { find, replace, why } of pairs) {
    const hits = text.split(find).length - 1;
    if (hits !== 1) throw new Error(`${rel}：反证锚点出现 ${hits} 次（要求恰好 1 次）—— ${why || find.slice(0, 60)}`);
    text = text.replace(find, replace);
  }
  fs.writeFileSync(file, text, 'utf8');
}

/* ------------------------------------------------------------------ */
/* 反证清单                                                            */
/* ------------------------------------------------------------------ */

const FEEDS_SELFTEST = 'scripts/tools/feeds-selftest.js';
const DATA_DOCS_SELFTEST = 'scripts/tools/data-docs-selftest.js';
const API_PLANS_SELFTEST = 'scripts/tools/api-plans-selftest.js';
const NONEMPTY_E2E = 'scripts/tools/history-nonempty-e2e.js';
const FEEDS_LIB = 'scripts/lib/feeds.js';
const CHANGES_LIB = 'scripts/lib/changes.js';
const PLAN_CHANGES_LIB = 'scripts/lib/plan-changes.js';
const DATA_DOCS_LIB = 'scripts/lib/data-docs.js';

/** 反证：每条都能读懂「证的是什么」。 */
const CASES = [
  /* ---- ① feeds-selftest：注册表 ↔ 产物 同源对账 ------------------- */
  {
    id: 'C1a',
    claim: 'feeds-selftest:839 注册表恢复原状 —— 「夹具忘了把 stub 弹出去」必须红，且点名注册表与多出来的 spec',
    file: FEEDS_SELFTEST,
    pairs: [{ find: '    } finally {\n      feeds.PLAN_CHANGE_FEEDS.pop();\n    }',
      replace: '    } finally {\n      /* 反证：故意不把临时 stub 弹出去 */\n    }',
      why: '去掉 finally 里的 pop' }],
    cmd: [FEEDS_SELFTEST],
    expect: { code: 1, must: ['✗ 注册表恢复原状', 'feeds.PLAN_CHANGE_FEEDS', '多出', 'stub-changes'], mustNot: [] }
  },
  {
    id: 'C1b',
    claim: 'feeds-selftest:839 —— **同一批 spec 只是换了顺序**也要红（旧判据 `length === 2 && 没有 stub` 在这一步会放行）',
    file: FEEDS_SELFTEST,
    pairs: [{ find: '      feeds.PLAN_CHANGE_FEEDS.pop();',
      replace: '      feeds.PLAN_CHANGE_FEEDS.pop();\n      feeds.PLAN_CHANGE_FEEDS.push(feeds.PLAN_CHANGE_FEEDS.shift());',
      why: '夹具把注册表转了一位（集合不变、顺序变了）' }],
    cmd: [FEEDS_SELFTEST],
    expect: { code: 1, must: ['✗ 注册表恢复原状', '位置被换'], mustNot: [] }
  },
  {
    id: 'C2a',
    claim: 'feeds-selftest:875 —— 注册表合法增删一个首页订阅：**旧判据（=== 8）假红、新判据全绿**',
    file: FEEDS_LIB,
    injectInto: FEEDS_SELFTEST,
    pairs: [{ find: "const HOMEPAGE_FEED_IDS = ['all', 'changes', 'student', 'developer'];",
      replace: "const HOMEPAGE_FEED_IDS = ['all', 'changes', 'student'];",
      why: '首页订阅从 4 个合法地减到 3 个' }],
    inject: [{ find: '  const expectedHomepageHrefs = homepageFeeds.flatMap',
      replace: "  check('【反证·旧判据】首页订阅发现恰好 8 条（4 个选择 × 2 种格式）',\n"
        + "    (tags.match(/rel=\"alternate\"/g) || []).length === 8);\n"
        + '  const expectedHomepageHrefs = homepageFeeds.flatMap',
      why: '把旧判据原样放回来当对照组' }],
    cmd: [FEEDS_SELFTEST],
    expect: {
      code: 1,
      must: ['✗ 【反证·旧判据】首页订阅发现恰好 8 条',
        '✓ 首页订阅发现：注册表 HOMEPAGE_FEED_IDS 与产物里 spec.homepage=true 的 Feed 是同一批',
        '✓ 首页订阅发现：tag 里的地址集合 == 由那批 Feed 的 spec.path + spec.jsonPath 派生的集合'],
      mustNot: []
    }
  },
  {
    id: 'C2b',
    claim: 'feeds-selftest:875 —— 产物少渲染一种格式（JSON 那条 tag 掉线）必须红，并点名缺哪个地址',
    file: FEEDS_LIB,
    pairs: [{ find: '    `<link rel="alternate" type="application/feed+json" title="${xmlEscape(feed.spec.title)}" href="${prefix}${feed.spec.jsonPath}">`',
      replace: '    /* 反证：JSON 格式的 tag 掉线 */', why: 'feedLinkTags 少渲染一条' }],
    cmd: [FEEDS_SELFTEST],
    expect: { code: 1, must: ['✗ 首页订阅发现：tag 里的地址集合', '少:', '.json'], mustNot: [] }
  },

  /* ---- ② data-docs-selftest：manifest ↔ 类别表 双向相等 ----------- */
  {
    id: 'C3a',
    claim: 'data-docs-selftest:186 —— 类别表里多一个**没有数据集**的类别必须红，并点名是哪一个',
    file: DATA_DOCS_LIB,
    pairs: [{ find: "  { key: 'history', label: '历史（History）', purpose: '一次性基线 + 追加事件的变化日志' }\n];",
      replace: "  { key: 'history', label: '历史（History）', purpose: '一次性基线 + 追加事件的变化日志' },\n"
        + "  { key: 'ghost-category', label: '幽灵（Ghost）', purpose: '反证用：没有任何数据集' }\n];",
      why: '表里多声明一个空类别' }],
    cmd: [DATA_DOCS_SELFTEST],
    expect: { code: 1, must: ['✗ 类别表与 Manifest 的类别', '表里有、Manifest 没有: ghost-category'], mustNot: [] }
  },
  {
    id: 'C3b',
    claim: 'data-docs-selftest:186 —— 合法地新增「一个类别 + 一份数据集」：**旧判据（length === 6）假红、新判据全绿**',
    file: DATA_DOCS_LIB,
    pairs: [
      { find: "  { key: 'history', label: '历史（History）', purpose: '一次性基线 + 追加事件的变化日志' }\n];",
        replace: "  { key: 'history', label: '历史（History）', purpose: '一次性基线 + 追加事件的变化日志' },\n"
          + "  { key: 'ghost-category', label: '幽灵（Ghost）', purpose: '反证用：新类别' }\n];",
        why: '新增第 7 个类别' },
      { find: "    purpose: 'API 计费记录的一次性基线 + 追加事件（价格 / 模型增删 / 免费额度 / 下线恢复）'\n  }\n];",
        replace: "    purpose: 'API 计费记录的一次性基线 + 追加事件（价格 / 模型增删 / 免费额度 / 下线恢复）'\n  },\n"
          + "  {\n"
          + "    id: 't44-ghost-dataset', label: '反证数据集', category: 'ghost-category', url: 't44-ghost-endpoint.json',\n"
          + "    emit: 'generated', source: 't44-ghost-endpoint.json', purpose: 't44 反证：合法新增一份公开数据集'\n"
          + "  }\n];",
        why: '新增一份用该类别的新数据集' }
    ],
    injectInto: DATA_DOCS_SELFTEST,
    inject: [{ find: 'const registryCategoryDrift =',
      replace: "check('【反证·旧判据】六个类别齐全（含 DATASET_CATEGORIES.length === 6）',\n"
        + '  docs.DATASET_CATEGORIES.every(category => manifest.datasets.some(dataset => dataset.category === category.key))\n'
        + '  && docs.DATASET_CATEGORIES.length === 6);\n'
        + 'const registryCategoryDrift =',
      why: '把旧判据原样放回来当对照组' }],
    extraFiles: [['t44-ghost-endpoint.json', '{"schemaVersion":1,"count":0,"datasets":[]}']],
    cmd: [DATA_DOCS_SELFTEST],
    expect: {
      code: 1,
      must: ['✗ 【反证·旧判据】六个类别齐全',
        '✓ 类别表与 Manifest 的类别**双向相等**',
        '✓ 注册表 PUBLIC_DATASETS 声明的 category 全部落在类别表里'],
      mustNot: []
    }
  },

  /* ---- ③ api-plans-selftest：计数 ↔ 事件字段 自洽 ----------------- */
  {
    id: 'C4a',
    claim: 'api-plans-selftest:1038 —— 记录里多一次元信息变化（officialUrl + sourceUrl 同时改）：**旧判据（meta === 1）假红、新判据全绿**',
    file: API_PLANS_SELFTEST,
    pairs: [{ find: "  after.officialUrl = 'https://open.bigmodel.cn/pricing/v2';",
      replace: "  after.officialUrl = 'https://open.bigmodel.cn/pricing/v2';\n"
        + "  after.sourceUrl = 'https://open.bigmodel.cn/pricing/v3';   // 反证：第二次元信息变化",
      why: '夹具里多一条元信息变化' }],
    inject: [{ find: '  const apiMetaFieldTypes = planChanges.API_PLAN_META_FIELD_TYPES;',
      replace: "  check('【反证·旧判据】radar.totals.meta === 1 && radar.other.metadata.length === 1',\n"
        + "    radar.totals.meta === 1 && radar.other.metadata.length === 1, JSON.stringify(radar.totals));\n"
        + '  const apiMetaFieldTypes = planChanges.API_PLAN_META_FIELD_TYPES;',
      why: '把旧判据原样放回来当对照组' }],
    cmd: [API_PLANS_SELFTEST],
    expect: {
      code: 1,
      must: ['✗ 【反证·旧判据】radar.totals.meta === 1',
        '✓ API 分栏：实质变化进「最近 7 天变化」，记录级元信息进 other.metadata',
        '✓ API 分栏：other.metadata 每条条目的 field 与日志里元信息事件的 field 逐一对应'],
      mustNot: []
    }
  },
  {
    id: 'C4b',
    claim: 'api-plans-selftest:1038 —— 元信息事件被放进「最近 7 天变化」栏（计数与日志不再自洽）必须红，并点名两侧来源',
    file: PLAN_CHANGES_LIB,
    pairs: [{ find: '    if (source.metaFieldTypes.includes(event.type)) {',
      replace: '    if (false && source.metaFieldTypes.includes(event.type)) {   // 反证：元信息不再进 metadata',
      why: '把元信息事件塞进 changed 栏' }],
    cmd: [API_PLANS_SELFTEST],
    expect: { code: 1, must: ['✗ API 分栏：实质变化进「最近 7 天变化」', '实际 radar.totals=', '期望（由这份日志的 type 现算', '放错栏的条目'], mustNot: [] }
  },

  /* ---- ④ history-nonempty-e2e：样本不足 ⇒ 显式跳过（不是崩栈） ---- */
  {
    id: 'C5a',
    claim: 'history-nonempty-e2e:201 —— `dealSeedShortage` 由数据现算：0/1/2 条 ⇒ 给出「本轮样本不足」的原因对象（点名 deals.json 与两侧数字），3 条 ⇒ null',
    file: NONEMPTY_E2E,
    unit: (dir) => {
      const m = require(path.join(dir, NONEMPTY_E2E));
      const seed = n => ({ id: `id${n}`, type: 'deal', title: `t${n}` });
      const shortage0 = m.dealSeedShortage(null);
      const shortage2 = m.dealSeedShortage([seed(1), seed(2)]);
      const shortageAnchored = m.dealSeedShortage([seed(1), seed(2), seed(3)], ['id1']);
      const ok = m.dealSeedShortage([seed(1), seed(2), seed(3)]);
      const problems = [];
      const wants = [
        [shortage0 && shortage0.actual === 0 && shortage0.required === m.DEAL_FIXTURE_SEEDS, '空输入 ⇒ actual 0'],
        [shortage0 && shortage0.object.includes('deals.json') && shortage0.object.includes('type === "deal"'), '原因对象点名 deals.json 与判据'],
        [shortage0 && shortage0.reason.includes('本轮样本不足，跳过并说明原因'), '原因文字含规定措辞'],
        [shortage2 && shortage2.actual === 2 && shortage2.reason.includes('只有 2 条'), '2 条 ⇒ actual 2（两侧数字都在）'],
        [shortageAnchored && shortageAnchored.actual === 2, '被既有事件锚定的那条不计入可造事件的样本'],
        [ok === null, '3 条 ⇒ null（对照组：样本够时不跳过）']
      ];
      for (const [pass, label] of wants) if (!pass) problems.push(label);
      return { code: problems.length ? 1 : 0, out: problems.join(' | ') || 'ok' };
    },
    expect: { code: 0, must: [], mustNot: [], unitReport: 'ok' }
  },
  {
    id: 'C5b',
    claim: 'history-nonempty-e2e:201 —— 把「需要的条数」抬到数据达不到（等价于真跑采集后跌破阈值）：**不抛错**，打印「本轮样本不足，跳过并说明原因」并 exit 0',
    file: NONEMPTY_E2E,
    pairs: [{ find: 'const DEAL_FIXTURE_SEEDS = 3;', replace: 'const DEAL_FIXTURE_SEEDS = 100000;',
      why: '把阈值抬到数据达不到（模拟「本轮样本不足」）' }],
    cmd: [NONEMPTY_E2E, '--root=@FIXTURE', '--no-sync', '--prepare-only'],
    expect: {
      code: 0,
      must: ['本轮样本不足，跳过并说明原因', 'deals.json 里可用来造事件的 type=deal 记录只有 80 条', '跳过对象：deals.json 的 deals[]'],
      mustNot: ['夹具执行失败'],
      fixtureHistoryUnchanged: true
    }
  },
  {
    id: 'C6a',
    claim: 'history-nonempty-e2e —— 把既有事件**抹掉重造**（t44 之前的写法）在今天的冻结日志上就是红的：点名 `记录没有历史锚点`',
    file: NONEMPTY_E2E,
    pairs: [{ find: '  out.events = chronological(kept.concat(events));', replace: '  out.events = chronological(events);',
      why: '恢复「清空重造」的旧写法' }],
    cmd: [NONEMPTY_E2E, '--root=@FIXTURE', '--no-sync', '--prepare-only'],
    expect: { code: 1, must: ['夹具执行失败', '记录没有历史锚点', '4a4f4777ffbc'], mustNot: ['本轮样本不足'] }
  },
  {
    id: 'C7a',
    claim: 'history-nonempty-e2e（pristine）—— 把「逐字节对账」换回「deal 0 / plan 14 / api 6」这组字面量：同一份冻结日志上新判据绿、旧判据红',
    file: NONEMPTY_E2E,
    inject: [{ find: '    const restoreDrift = HISTORY_FILES.filter',
      replace: "    check('【反证·旧判据】生产态的历史已还原成冻结提交那一份（deal 0 / plan 14 / api 6）',\n"
        + '      counts.deal === 0 && counts.plan === 14 && counts.api === 6, JSON.stringify(counts));\n'
        + '    const restoreDrift = HISTORY_FILES.filter',
      why: '把旧判据原样放回来当对照组' }],
    cmd: [NONEMPTY_E2E, '--state=pristine', '--root=@FIXTURE', '--no-sync', '--prepare-only'],
    expect: {
      code: 0,
      must: ['✗ 【反证·旧判据】生产态的历史已还原成冻结提交那一份',
        '✓ 生产态：夹具里的三份历史与冻结提交那一份**逐字节相同**'],
      mustNot: []
    }
  },
  {
    id: 'C7b',
    claim: 'history-nonempty-e2e（生产态/稀疏态）—— 「措辞 ⇔ 计数」：构造「计数 0 但正文没写空态话」的页面 ⇒ 必红；反方向（非 0 却写了）也红；写对了 ⇒ 绿',
    file: NONEMPTY_E2E,
    unit: (dir) => {
      const m = require(path.join(dir, NONEMPTY_E2E));
      const violation = m.changesSectionsOf('<h2>今日新增（1）</h2><p>…</p><h2>已结束（0）</h2><p>没有任何东西了</p>');
      const inverted = m.changesSectionsOf('<h2>已结束（2）</h2><p>没有观测到不再收录的条目。</p>');
      const control = m.changesSectionsOf('<h2>今日新增（1）</h2><p>…</p><h2>已结束（0）</h2><p>自起算日起，没有观测到不再收录的条目。</p>');
      const problems = [];
      const rows = [
        [violation.wordingDrift('已结束') !== null, '计数 0 且正文没写空态话 ⇒ 必须给出差异'],
        [/已结束：分栏计数=0/.test(String(violation.wordingDrift('已结束'))), '差异里点名分栏与两侧读数'],
        [inverted.wordingDrift('已结束') !== null, '反方向：计数非 0 却写了空态话 ⇒ 也必须红'],
        [control.wordingDrift('已结束') === null, '对照：计数 0 且写了空态话 ⇒ 无差异'],
        [control.wordingDrift('今日新增') === null, '对照：非空分栏没写空态话 ⇒ 无差异']
      ];
      for (const [pass, label] of rows) if (!pass) problems.push(label);
      return { code: problems.length ? 1 : 0, out: problems.join(' | ') || 'ok' };
    },
    expect: { code: 0, must: [], mustNot: [] }
  },
  {
    id: 'C7c',
    claim: 'history-nonempty-e2e（生产态/稀疏态）—— 「五个分栏都在场」：构造少了「即将结束」那一栏的页面 ⇒ 该栏读数 -1（必红）；五栏齐 ⇒ 全 ≥ 0（对照绿）',
    file: NONEMPTY_E2E,
    unit: (dir) => {
      const m = require(path.join(dir, NONEMPTY_E2E));
      const titles = ['今日新增', '最近 7 天变化', '即将结束', '已结束', '重新出现'];
      const build = list => m.changesSectionsOf(list.map(([title, count]) => `<h2>${title}（${count}）</h2><p>…</p>`).join(''));
      const full = build(titles.map(title => [title, 0]));
      const missing = build(titles.filter(title => title !== '即将结束').map(title => [title, 0]));
      const problems = [];
      const rows = [
        [titles.every(title => full.countOf(title) >= 0), '对照：五栏齐 ⇒ 每栏读数都 ≥ 0'],
        [missing.countOf('即将结束') === -1, '少一栏 ⇒ 该栏读数为 -1（判据会红）'],
        [titles.filter(title => missing.countOf(title) < 0).join(',') === '即将结束', '差异清单点名缺的就是那一栏']
      ];
      for (const [pass, label] of rows) if (!pass) problems.push(label);
      return { code: problems.length ? 1 : 0, out: problems.join(' | ') || 'ok' };
    },
    expect: { code: 0, must: [], mustNot: [] }
  }
];

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function main() {
  const jsonMode = process.argv.includes('--json');
  const onlyArg = process.argv.find(a => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean) : [];
  const log = (...args) => { if (!jsonMode) console.log(...args); };

  log('=== t44 反证夹具（每条改动 ⇒ 顶红一次 + 对照绿）===');
  log(`  源工作区: ${ROOT}`);

  // 共享工作区的基线 sha256：跑完必须一模一样（反证只准落在 TEMP 里）
  const guardFiles = [FEEDS_SELFTEST, DATA_DOCS_SELFTEST, API_PLANS_SELFTEST, NONEMPTY_E2E,
    FEEDS_LIB, DATA_DOCS_LIB, CHANGES_LIB, PLAN_CHANGES_LIB];
  const guardBefore = new Map(guardFiles.map(rel => [rel, sha256(path.join(ROOT, rel))]));

  const sandbox = makeTree('sandbox');
  const fixture = gitFixtureCommit(makeTree('fixture'));
  log(`  沙箱: ${sandbox}`);
  log(`  夹具工作区: ${fixture}（git 已初始化：脚本里的 git show HEAD: 要用）`);

  // 沙箱里自己构建一份 dist/（data-docs-selftest 要读它）。
  // 为什么不用共享工作区的 dist/：那份目录随时可能被别人的构建改到一半（并发跑门禁时就是这样），
  // 复制它会拿到半成品，而反证要的是「同一份输入下判据的反应」。
  {
    const build = runIn(sandbox, ['scripts/tools/build-local.js']);
    if (build.code !== 0) throw new Error(`沙箱里构建 dist 失败（exit ${build.code}）：\n${build.out.slice(-2000)}`);
    log('  沙箱内构建: build-local exit 0');
  }

  const results = [];
  const record = row => { results.push(row); };

  // ---- 对照绿：四个自测在**未变异**的沙箱里各自 exit 0 ----
  log('\n--- 对照绿（未变异的沙箱）---');
  for (const file of [FEEDS_SELFTEST, DATA_DOCS_SELFTEST, API_PLANS_SELFTEST]) {
    const r = runIn(sandbox, [file]);
    const status = r.code === 0 ? 'passed' : 'failed';
    log(`  ${r.code === 0 ? '✓' : '✗'} ${file} → exit ${r.code}`);
    record({ id: `control:${file}`, claim: '对照绿：未变异的沙箱里该自测 exit 0', kind: 'control',
      command: `node ${file}`, code: r.code, status, evidence: (r.out.match(/===.*===/g) || []).slice(-1)[0] || '' });
  }
  {
    const r = runIn(sandbox, [NONEMPTY_E2E, '--root=' + fixture, '--no-sync', '--prepare-only']);
    const skipped = r.out.includes('本轮样本不足');
    const status = r.code === 0 && !skipped ? 'passed' : 'failed';
    log(`  ${status === 'passed' ? '✓' : '✗'} ${NONEMPTY_E2E} --prepare-only → exit ${r.code}${skipped ? '（意外跳过）' : ''}`);
    record({ id: 'control:history-nonempty-e2e --prepare-only', claim: '对照绿：样本充足时不跳过（合成 deal 夹具真的造出来了）',
      kind: 'control', command: `node ${NONEMPTY_E2E} --root=<fixture> --no-sync --prepare-only`, code: r.code, status,
      evidence: (r.out.match(/deal-history: .*/) || [''])[0] });
  }

  // ---- 逐条反证 ----
  log('\n--- 反证（逐条变异 ⇒ 期望红/绿 + 关键文字）---');
  for (const item of CASES) {
    if (only.length && !only.includes(item.id)) continue;
    let status = 'passed';
    let r = null;
    const evidence = [];
    try {
      // 每个用例都从**干净**的沙箱文件出发：先还原该用例会碰到的文件
      const touched = new Set([item.file, item.injectInto].filter(Boolean));
      for (const rel of touched) fs.copyFileSync(path.join(ROOT, rel), path.join(sandbox, rel));
      if (item.extraFiles) {
        for (const [rel, content] of item.extraFiles) fs.writeFileSync(path.join(sandbox, rel), content, 'utf8');
      }
      if (item.pairs) patch(sandbox, item.file, item.pairs);
      if (item.inject) patch(sandbox, item.injectInto || item.file, item.inject);

      if (item.applyToFixture) {
        // 变异的如果是**链路里跑的代码**（lib/…），那必须把它也放进夹具工作区：
        // `--no-sync` 下夹具用的是它自己那份代码，只改沙箱等于什么都没改。
        fs.copyFileSync(path.join(sandbox, item.file), path.join(fixture, item.file));
      }

      if (item.unit) {
        r = item.unit(sandbox);
      } else {
        r = runIn(sandbox, item.cmd.map(a => a.replace('@FIXTURE', fixture)).filter(a => a !== '--full'));
      }
      // 跑完立刻把夹具工作区还原成未变异的那一份（下一个用例不该继承这个变异）
      if (item.applyToFixture) fs.copyFileSync(path.join(ROOT, item.file), path.join(fixture, item.file));

      if (r.code !== item.expect.code) { status = 'failed'; evidence.push(`exit ${r.code} ≠ 期望 ${item.expect.code}`); }
      for (const needle of item.expect.must || []) {
        if (!r.out.includes(needle)) { status = 'failed'; evidence.push(`缺关键文字：「${needle}」`); }
      }
      for (const needle of item.expect.mustNot || []) {
        if (r.out.includes(needle)) { status = 'failed'; evidence.push(`出现不该出现的文字：「${needle}」`); }
      }
      if (item.expect.fixtureHistoryUnchanged) {
        const rel = 'scripts/data/deal-history.json';
        const same = sha256(path.join(fixture, rel)) === sha256(path.join(sandbox, rel));
        if (!same) { status = 'failed'; evidence.push('样本不足时夹具工作区的 deal-history.json 被改写了'); }
      }
      evidence.push(...(item.expect.must || []).filter(needle => r.out.includes(needle)).map(needle => `命中「${needle}」`));
      evidence.push(`exit ${r.code}`);
    } catch (error) {
      status = 'failed';
      evidence.push(`反证夹具自身出错：${error.message}`);
    }
    if (status !== 'passed' && r && r.out) {
      // 失败时把被测命令的最后几行原样贴出来（否则「exit 2」这种结果没法复盘）
      evidence.push(`输出尾部：${r.out.split('\n').filter(Boolean).slice(-6).join(' ⏎ ').slice(0, 600)}`);
      if (process.argv.includes('--debug')) {
        fs.writeFileSync(path.join(HERE, `debug-${item.id}.log`), r.out, 'utf8');
      }
    } else if (status !== 'passed') {
      evidence.push(`被测命令没有产出任何输出（可能是它没被真正启动）：${r ? r.diag : '(r 为空)'}`);
    }
    log(`  ${status === 'passed' ? '✓' : '✗'} ${item.id} ${item.claim}`);
    if (status !== 'passed') for (const row of evidence) log(`      · ${row}`);
    record({ id: item.id, claim: item.claim, kind: 'counter-proof', file: item.file,
      mutation: (item.pairs || []).map(p => p.why).concat((item.inject || []).map(p => `inject: ${p.why}`)).join(' + ') || 'unit',
      command: item.unit ? '（进程内调用纯函数）' : `node ${item.cmd.map(a => (a === '@FIXTURE' ? '<fixture>' : a)).join(' ')}`,
      code: item.unit ? 0 : undefined, status, evidence: evidence.join(' · ') });
  }

  // ---- 共享工作区没有被碰过 ----
  const drift = guardFiles.filter(rel => sha256(path.join(ROOT, rel)) !== guardBefore.get(rel));
  log(`\n--- 共享工作区未被改动：${drift.length === 0 ? '✓ 8/8 文件 sha256 一致' : `✗ ${drift.join(', ')}`} ---`);

  const failed = results.filter(row => row.status !== 'passed');
  const summary = {
    generatedFrom: ROOT,
    sandbox,
    cases: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    guardDrift: drift,
    results
  };
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  log(`\n=== 反证：${summary.passed}/${summary.cases} 通过${failed.length ? `（${failed.map(f => f.id).join(', ')} 失败）` : ''} ===`);
  log(`  机器可读：${path.relative(ROOT, JSON_OUT)}`);

  // 清理沙箱（无论成败）
  try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (error) { /* 删不掉不影响结论 */ }
  try { fs.rmSync(fixture, { recursive: true, force: true }); } catch (error) { /* 同上 */ }

  if (failed.length || drift.length) process.exit(1);
  return summary;
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(`\n❌ 反证夹具执行失败：${error && error.stack ? error.stack : error}`);
    process.exit(1);
  }
}

module.exports = { CASES };
