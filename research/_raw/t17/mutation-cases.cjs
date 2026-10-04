#!/usr/bin/env node
/**
 * t17 电池的**用例库**：每一条 = 一个真实变异 + 期望被哪一层抓住 + 该跑哪几道门禁。
 *
 * 变异一律落在**来源层** `scripts/data/**`（改产物会得到假阴性 —— 这是 t20/§21 电池踩过的坑），
 * 只有专门针对"产物渲染层"的用例（静态 HTML 丢行 / No-JS / filter 默认全显）才动 `dist/**`。
 *
 * 每条用例自带 `targets`（会被变异、随后必须逐字节恢复的文件），电池在跑完后逐条校验 sha256。
 */

'use strict';

/** 门禁短名 → 真实命令（一律从仓库根跑；相对路径都相对仓库） */
const GATE = {
  validate: { id: 'validate-strict', script: 'scripts/validate.js', args: ['--strict'] },
  reproducible: { id: 'check-models-reproducible', script: 'scripts/tools/check-models-reproducible.js' },
  links: { id: 'check-model-registry-links', script: 'scripts/tools/check-model-registry-links.js' },
  modelsSelftest: { id: 'models-selftest', script: 'scripts/tools/models-selftest.js' },
  pageSelftest: { id: 'models-page-selftest', script: 'scripts/tools/models-page-selftest.js' },
  coverageSelftest: { id: 'coverage-targets-selftest', script: 'scripts/tools/coverage-targets-selftest.js' },
  coverageReport: { id: 'report-coverage', script: 'scripts/tools/coverage-report.js' },
  freshnessSelftest: { id: 'model-freshness-selftest', script: 'scripts/tools/model-freshness-selftest.js' },
  roleVoca: { id: 'model-role-vocabulary-selftest', script: 'scripts/tools/model-role-vocabulary-selftest.js' },
  plansSelftest: { id: 'plans-selftest', script: 'scripts/tools/plans-selftest.js' },
  apiPlansSelftest: { id: 'api-plans-selftest', script: 'scripts/tools/api-plans-selftest.js' },
  plansRepro: { id: 'check-plans-reproducible', script: 'scripts/tools/check-plans-reproducible.js' },
  apiPlansRepro: { id: 'check-api-plans-reproducible', script: 'scripts/tools/check-api-plans-reproducible.js' },
  ciConsistency: { id: 'check-ci-consistency', script: 'scripts/tools/check-ci-consistency.js' },
  healthSelftest: { id: 'health-selftest', script: 'scripts/tools/health-selftest.js' },
  dataDocsSelftest: { id: 'data-docs-selftest', script: 'scripts/tools/data-docs-selftest.js' },
  historyVerify: { id: 'history-verify', script: 'scripts/tools/history-verify.js' },
  checkPlanHistory: { id: 'check-plan-history', script: 'scripts/tools/check-plan-history.js' },
  checkApiPlanHistory: { id: 'check-api-plan-history', script: 'scripts/tools/check-api-plan-history.js' },
  planHistorySelftest: { id: 'plan-history-selftest', script: 'scripts/tools/plan-history-selftest.js' },
  provenanceSelftest: { id: 'provenance-selftest', script: 'scripts/tools/provenance-selftest.js' },
  build: { id: 'build-local', script: 'scripts/tools/build-local.js' }
};

/** 常用门禁组合：文件级变异后"能抓它的最小集合"（顺序固定，便于逐例对比） */
const SET = {
  /** 厂牌/关系层/来源层数据：来源层校验 + 三份派生产物 + 身份层自测 */
  data: [GATE.validate, GATE.reproducible, GATE.links, GATE.modelsSelftest, GATE.coverageReport],
  /** 产物页层：页面自测（读 dist）+ 覆盖报告 */
  page: [GATE.pageSelftest, GATE.coverageReport],
  /** 门禁编排层 */
  gate: [GATE.ciConsistency],
  /** 历史层 */
  history: [GATE.historyVerify, GATE.validate],
  /** 套餐/API 历史层 */
  historyPlans: [GATE.checkPlanHistory, GATE.checkApiPlanHistory, GATE.planHistorySelftest, GATE.validate],
  /** 自测自身（含反向牙） */
  selftest: [GATE.provenanceSelftest, GATE.healthSelftest, GATE.dataDocsSelftest]
};

function findText(file, needle) {
  const text = fs.readFileSync(file, 'utf8');
  const count = text.split(needle).length - 1;
  if (count === 0) throw new Error(`变异锚点未找到：${needle.slice(0, 80)}`);
  return { text, count };
}

let fs = require('fs');

/** 在文件里做一次"锚点必须唯一"的替换（不存在或不唯一都当场抛错，避免假变异） */
function replaceOnce(file, from, to) {
  const { text, count } = findText(file, from);
  if (count !== 1) throw new Error(`变异锚点出现 ${count} 次（要求唯一）：${from.slice(0, 80)}`);
  fs.writeFileSync(file, text.replace(from, to), 'utf8');
  return { file, mode: 'replaceOnce', anchor: from.slice(0, 60) };
}

/** 在 JSON 文件顶层插入一个重复键（模拟"两条同 slug 记录，后者静默覆盖前者"） */
function duplicateTopLevelKey(file, slug) {
  const text = fs.readFileSync(file, 'utf8');
  const anchor = `\n  "${slug}": {`;
  const index = text.indexOf(anchor);
  if (index < 0) throw new Error(`找不到 slug 锚点：${slug}`);
  const end = text.indexOf('\n  },', index);
  if (end < 0) throw new Error(`找不到 slug 结束锚点：${slug}`);
  const block = text.slice(index, end + '\n  },'.length);
  fs.writeFileSync(file, text.slice(0, index) + block + text.slice(index), 'utf8');
  return { file, mode: 'duplicateTopLevelKey', slug, blockBytes: block.length };
}

/** 就地编辑 JSON（结构化变异），保留 4 空格缩进与末尾换行 */
function editJson(file, mutate) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const note = mutate(doc);
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  return { file, mode: 'editJson', note };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/* ------------------------------------------------------------------ */
/* 用例                                                                */
/* ------------------------------------------------------------------ */

const CASES = [
  {
    id: 'M00',
    group: '对照',
    title: '对照组：不修改任何文件，全部门禁必须绿',
    expected: '全绿（否则"红"不可解释）',
    expectGreen: true,
    targets: ['scripts/data/models.json'],
    apply: () => ({ note: '(对照，无变异)' }),
    gates: [...SET.data, ...SET.page, ...SET.selftest, GATE.coverageSelftest, GATE.plansSelftest, GATE.apiPlansSelftest]
  },

  /* ---------------- A 组：registry / 身份层 ---------------- */
  {
    id: 'M01',
    group: 'A registry',
    title: '重复顶层 slug：models.json 里再写一遍 glm-5.3（后者静默覆盖前者）',
    expected: '身份层「重复顶层键」牙 + 派生/校验层',
    targets: ['scripts/data/models.json'],
    apply: ({ sandboxPath }) => duplicateTopLevelKey(sandboxPath('scripts/data/models.json'), 'glm-5.3'),
    gates: SET.data
  },
  {
    id: 'M02',
    group: 'A registry',
    title: '手写派生字段：来源层给一条记录塞 catalogStatus',
    expected: 'schema「派生字段不得手写」',
    targets: ['scripts/data/models.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/models.json'), doc => {
      doc['deepseek-v4-pro'].catalogStatus = 'current';
      return 'deepseek-v4-pro.catalogStatus = current';
    }),
    gates: SET.data
  },
  {
    id: 'M03',
    group: 'A registry',
    title: '非法 modelRole：把一条改成词表外的 role',
    expected: '角色枚举校验 + 词汇表对账',
    targets: ['scripts/data/models.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/models.json'), doc => {
      doc['glm-4.6v'].modelRole = 'vision-language-ultra';
      return "glm-4.6v.modelRole = 'vision-language-ultra'";
    }),
    gates: [...SET.data, GATE.roleVoca]
  },
  {
    id: 'M04',
    group: 'A registry',
    title: 'alias 撞 slug：把某条 alias 改成另一个模型的身份',
    expected: '别名唯一性牙',
    targets: ['scripts/data/models.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/models.json'), doc => {
      doc['deepseek-flash'].aliases = [...doc['deepseek-flash'].aliases, 'glm-5.3'];
      return "deepseek-flash.aliases += 'glm-5.3'";
    }),
    gates: SET.data
  },
  {
    id: 'M05',
    group: 'A registry',
    title: 'releasedAt 改第三方域证据：日期不变、引文 URL 换成聚合站',
    expected: '官方域/引文来源门禁',
    targets: ['scripts/data/models.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/models.json'), doc => {
      const row = doc['deepseek-v3.2'];
      row.releaseEvidence = (row.releaseEvidence || []).map(item => ({ ...item, sourceUrl: 'https://aitools.fyi/deepseek' }));
      row.releasedAt = '2025-12-01';
      return 'deepseek-v3.2.releaseEvidence[].sourceUrl → aitools.fyi';
    }),
    gates: SET.data
  },
  {
    id: 'M06',
    group: 'A registry',
    title: '去掉一条 identity 的 API 映射（关系层少一条记录）',
    expected: '身份唯一性/完整性牙 + 覆盖报告',
    targets: ['scripts/data/model-registry-links.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/model-registry-links.json'), doc => {
      const before = doc.links.length;
      const index = doc.links.findIndex(link => link.apiPlanId && link.registrySlug === 'glm-5.3');
      if (index < 0) throw new Error('找不到 glm-5.3 的 API 映射');
      doc.links.splice(index, 1);
      return `links ${before} → ${doc.links.length}（删 glm-5.3 的一条 API 映射）`;
    }),
    gates: SET.data
  },
  {
    id: 'M07',
    group: 'A registry',
    title: '一条 pricing identity 映射到两个 registry 模型（通配覆盖第二条）',
    expected: '「同一条价格记录不许映射到两个模型」牙',
    targets: ['scripts/data/model-registry-links.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/model-registry-links.json'), doc => {
      const source = doc.links.find(link => link.apiPlanId && link.registrySlug === 'glm-5.3');
      if (!source) throw new Error('找不到 glm-5.3 的 API 映射');
      doc.links.push({ ...source, registrySlug: 'glm-5.3-flash', variant: null, basis: 'explicit-mapping', evidence: [], note: 't17 变异：同一 identity 指到第二个 slug' });
      return `复制 ${source.apiPlanId}/${source.modelKey} → glm-5.3-flash（variant=null）`;
    }),
    gates: SET.data
  },
  {
    id: 'M08',
    group: 'A registry',
    title: '删掉一条 API 侧处置声明（计价条目既无映射也无处置）',
    expected: '「未判计价条目」牙（t23/t25 的口径）',
    targets: ['scripts/data/model-registry-gaps.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/model-registry-gaps.json'), doc => {
      const before = doc.declarations.length;
      const index = doc.declarations.findIndex(item => item.apiPlanId);
      if (index < 0) throw new Error('找不到 API 侧处置声明');
      const [removed] = doc.declarations.splice(index, 1);
      return `declarations ${before} → ${doc.declarations.length}（删 ${removed.apiPlanId}/${removed.modelKey}）`;
    }),
    gates: SET.data
  },
  {
    id: 'M09',
    group: 'A registry',
    title: 'API 侧处置改成"能对上的身份"（拿不对应单一模型身份绕过映射）',
    expected: '「能对上的串必须去写映射」牙',
    targets: ['scripts/data/model-registry-gaps.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/model-registry-gaps.json'), doc => {
      const row = doc.declarations.find(item => item.apiPlanId);
      if (!row) throw new Error('找不到 API 侧处置声明');
      row.modelKey = 'glm-5.3';
      return `第一条 API 处置的 modelKey → glm-5.3`;
    }),
    gates: SET.data
  },
  {
    id: 'M10',
    group: 'A registry',
    title: '身份层加一个不在档位表里的角色（词汇表对账应红）',
    expected: '角色词汇表契约守卫',
    targets: ['scripts/lib/model-registry.js'],
    apply: ({ sandboxPath }) => replaceOnce(
      sandboxPath('scripts/lib/model-registry.js'),
      "'general', 'fast', 'reasoning', 'coding', 'vision',",
      "'general', 'fast', 'reasoning', 'coding', 'vision', 'vision-language-ultra',"
    ),
    gates: [GATE.roleVoca, GATE.freshnessSelftest]
  },

  /* ---------------- B 组：套餐 / API 计价 ---------------- */
  {
    id: 'M11',
    group: 'B plans',
    title: '手写派生字段：来源层给套餐塞 derivedMetrics',
    expected: '「派生字段不得手写」牙',
    targets: ['scripts/data/curated_plans.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/curated_plans.json'), doc => {
      const list = Array.isArray(doc) ? doc : (doc.plans || doc.records);
      if (!Array.isArray(list) || !list.length) throw new Error('curated_plans 里找不到记录数组');
      list[0].derivedMetrics = { nominalUnitPrice: 1 };
      return `${list[0].id || list[0].planId || '(首条)'}.derivedMetrics = {…}`;
    }),
    gates: [GATE.validate, GATE.plansSelftest, GATE.plansRepro, GATE.coverageReport]
  },
  {
    id: 'M12',
    group: 'B plans',
    title: 'billing 单位错位：per_1M 证据配 per_1K 定价单位',
    expected: '价格单位同类牙',
    targets: ['scripts/data/curated_api_plans.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/curated_api_plans.json'), doc => {
      const list = Array.isArray(doc) ? doc : (doc.plans || doc.records);
      const row = list.find(item => (item.pricing && item.pricing.unit) || item.unit);
      if (!row) throw new Error('找不到带 pricing.unit 的记录');
      if (row.pricing) row.pricing.unit = 'per_1K_tokens'; else row.unit = 'per_1K_tokens';
      return `${row.id || '(首条)'} pricing.unit → per_1K_tokens`;
    }),
    gates: [GATE.validate, GATE.apiPlansSelftest, GATE.apiPlansRepro, GATE.coverageReport]
  },
  {
    id: 'M13',
    group: 'B plans',
    title: '第三方证据标成官方：聚合站 URL 写成官方定价页引文',
    expected: '官方域/出处牙',
    targets: ['scripts/data/curated_api_plans.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/curated_api_plans.json'), doc => {
      const list = Array.isArray(doc) ? doc : (doc.plans || doc.records);
      const row = list.find(item => Array.isArray(item.evidence) && item.evidence.length);
      if (!row) throw new Error('找不到带 evidence 的记录');
      row.evidence[0].sourceUrl = 'https://futurepedia.io/tool/openai';
      return `${row.id || '(首条)'} evidence[0].sourceUrl → futurepedia.io`;
    }),
    gates: [GATE.validate, GATE.apiPlansSelftest, GATE.apiPlansRepro, GATE.coverageReport]
  },

  /* ---------------- C 组：覆盖目标层 ---------------- */
  {
    id: 'M14',
    group: 'C targets',
    title: '覆盖目标少一行（provider 表有、targets 没有）',
    expected: '目标层完整性/双向对账牙',
    targets: ['scripts/data/coverage-targets.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/coverage-targets.json'), doc => {
      const before = doc.targets.length;
      doc.targets = doc.targets.filter(item => item.provider !== 'jetbrains');
      return `targets ${before} → ${doc.targets.length}（删 jetbrains）`;
    }),
    gates: [GATE.coverageSelftest, GATE.coverageReport, GATE.validate]
  },
  {
    id: 'M15',
    group: 'C targets',
    title: '覆盖目标挂到一个不存在的 provider',
    expected: '目标层「provider 必须存在」牙',
    targets: ['scripts/data/coverage-targets.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/coverage-targets.json'), doc => {
      doc.targets[0].provider = 'not-a-provider';
      return `targets[0].provider → not-a-provider`;
    }),
    gates: [GATE.coverageSelftest, GATE.coverageReport]
  },
  {
    id: 'M16',
    group: 'C targets',
    title: '覆盖目标字段缺失（删掉 intent）',
    expected: '目标层必填字段牙',
    targets: ['scripts/data/coverage-targets.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/coverage-targets.json'), doc => {
      const row = doc.targets[0];
      const removed = row.intent;
      delete row.intent;
      return `targets[0].intent 删除（原值 ${String(removed).slice(0, 40)}…）`;
    }),
    gates: [GATE.coverageSelftest, GATE.coverageReport]
  },

  /* ---------------- D 组：门禁编排 / 健康层 ---------------- */
  {
    id: 'M17',
    group: 'D gate',
    title: '生产门禁静默降级：把 gate 的 allow_degraded_run 传参改成恒真表达式',
    expected: '「必需路径不得静默降级」牙（(11) 按触发事件求值）',
    targets: ['.github/workflows/verify.yml'],
    apply: ({ sandboxPath }) => replaceOnce(
      sandboxPath('.github/workflows/verify.yml'),
      "allow_degraded_run: ${{ inputs.allow_degraded_run && 'true' || 'false' }}",
      "allow_degraded_run: ${{ inputs.allow_degraded_run || 'true' }}"
    ),
    gates: [GATE.ciConsistency]
  },
  {
    id: 'M18',
    group: 'D gate',
    title: '健康层：无头来源不可用却仍标 healthy（改判定分支）',
    expected: '健康组合矩阵牙',
    targets: ['scripts/lib/health.js'],
    apply: ({ sandboxPath }) => replaceOnce(
      sandboxPath('scripts/lib/health.js'),
      "headlessReady === false",
      "headlessReady === 'never-matches'"
    ),
    gates: [GATE.healthSelftest, GATE.validate]
  },

  /* ---------------- E 组：产物渲染层 ---------------- */
  {
    id: 'M19',
    group: 'E page',
    title: '静态 HTML 丢行：/models/ 索引删掉一整行（No-JS 下少一个模型）',
    expected: '页面静态表与 registry 的行集合对账',
    targets: ['dist/models/index.html'],
    apply: ({ sandboxPath }) => {
      const file = sandboxPath('dist/models/index.html');
      const text = fs.readFileSync(file, 'utf8');
      const match = /\n\s*<tr[^>]*data-model="[^"]+"[\s\S]*?<\/tr>/.exec(text);
      if (!match) throw new Error('找不到 data-model 行');
      const slug = /data-model="([^"]+)"/.exec(match[0])[1];
      fs.writeFileSync(file, text.slice(0, match.index) + text.slice(match.index + match[0].length), 'utf8');
      return { file, mode: 'drop-html-row', slug };
    },
    gates: SET.page
  },
  {
    id: 'M20',
    group: 'E page',
    title: 'No-JS 丢行：删掉「显示旧型号」筛选脚本块（No-JS 语义被破坏）',
    expected: '页面脚本存在性/No-JS 断言',
    targets: ['dist/models/index.html'],
    apply: ({ sandboxPath }) => {
      const file = sandboxPath('dist/models/index.html');
      const text = fs.readFileSync(file, 'utf8');
      const match = /<script[^>]*>[\s\S]*?models-show-legacy[\s\S]*?<\/script>/.exec(text);
      if (!match) throw new Error('找不到含 models-show-legacy 的脚本块');
      fs.writeFileSync(file, text.slice(0, match.index) + text.slice(match.index + match[0].length), 'utf8');
      return { file, mode: 'drop-script-block', bytes: match[0].length };
    },
    gates: SET.page
  },
  {
    id: 'M21',
    group: 'E page',
    title: 'filter 默认全显：把 showHidden 的默认判定改成恒真',
    expected: '默认隐藏集合牙（页面/独立 join）',
    targets: ['dist/models/index.html'],
    apply: ({ sandboxPath }) => replaceOnce(
      sandboxPath('dist/models/index.html'),
      'var showHidden = Boolean(toggle && toggle.checked) || catalogPicked;',
      'var showHidden = true;'
    ),
    gates: SET.page
  },
  {
    id: 'M22',
    group: 'E page',
    title: '逐格单位错位：详情页把价格单位改成「每 1000 tokens」（数值不动）',
    expected: '逐格单位/数值对账（本轮新增牙；全绿即 NOT_CAUGHT 发现）',
    targets: ['dist/models/glm-4.5v/index.html'],
    apply: ({ sandboxPath }) => {
      const mutated = [];
      for (const slug of ['glm-4.5v', 'glm-4.6v', 'deepseek-v4-pro', 'kimi-k3']) {
        const file = sandboxPath(`dist/models/${slug}/index.html`);
        if (!fs.existsSync(file)) continue;
        const text = fs.readFileSync(file, 'utf8');
        if (!text.includes('每 100 万 tokens')) continue;
        fs.writeFileSync(file, text.split('每 100 万 tokens').join('每 1000 tokens'), 'utf8');
        mutated.push(slug);
      }
      if (!mutated.length) throw new Error('详情页里找不到「每 100 万 tokens」单位串');
      return { mode: 'rewrite-price-unit', slugs: mutated };
    },
    targets: ['dist/models/glm-4.5v/index.html', 'dist/models/glm-4.6v/index.html', 'dist/models/deepseek-v4-pro/index.html', 'dist/models/kimi-k3/index.html'],
    gates: SET.page
  },

  /* ---------------- F 组：历史层 ---------------- */
  {
    id: 'M23',
    group: 'F history',
    title: '改写已落盘的历史（套餐历史加一条伪造 created 事件）',
    expected: '历史不可改写牙（套餐/API 历史校验）',
    targets: ['scripts/data/plan-history.json'],
    apply: ({ sandboxPath }) => editJson(sandboxPath('scripts/data/plan-history.json'), doc => {
      const before = doc.events.length;
      doc.events.push({ planId: 't17-forged', at: '2026-10-04', type: 'created', field: null, from: null, to: null, fields: { 'billing.regularPrice': 1, 'billing.currency': 'CNY' } });
      return `events ${before} → ${doc.events.length}（伪造一条 created）`;
    }),
    gates: SET.historyPlans
  },

  /* ---------------- G 组：自测自身的反向牙 ---------------- */
  {
    id: 'M24',
    group: 'G selftest',
    title: '把 provenance 自测的牙拔掉（失败不再入 failures 队列 ⇒ 自测恒绿）',
    expected: '**留档的已知盲区**：provenance-selftest 的牙是合成夹具牙，拔掉后无第三方门禁能抓（见 probe-provenance-teeth.cjs 的 T1：连"把真实引文改成编造文本"它也 114/114 绿）',
    expectNotCaught: true,
    targets: ['scripts/tools/provenance-selftest.js'],
    apply: ({ sandboxPath }) => replaceOnce(
      sandboxPath('scripts/tools/provenance-selftest.js'),
      "  if (ok) { pass++; return; }\n  failures.push(`${name}${detail ? ' — ' + detail : ''}`);",
      "  if (ok) { pass++; return; }\n  // t17 变异：把失败吞掉 —— 牙被拔掉后该自测应恒绿"
    ),
    gates: [GATE.provenanceSelftest]
  },
  {
    id: 'M25',
    group: 'C targets',
    title: '把「延期不算漏了」的真实判定改掉（deriveDimension 里给 DEFERRED 加一条 MISSING 短路）',
    expected: 'DEFERRED 永不算 MISSING（覆盖目标层的关键牙 —— 它守的是真实分支，不是常量表）',
    targets: ['scripts/lib/coverage-targets.js'],
    apply: ({ sandboxPath }) => replaceOnce(
      sandboxPath('scripts/lib/coverage-targets.js'),
      "    return cell(STATES.DEFERRED, ruling.decision ===",
      "    if (row.count === 0) return cell(STATES.MISSING, 't17 变异：延期被算成漏了');\n    return cell(STATES.DEFERRED, ruling.decision ==="
    ),
    gates: [GATE.coverageSelftest, GATE.coverageReport]
  },
  {
    id: 'M26',
    group: 'C targets',
    title: '改掉没人读的 PRECEDENCE 常量（文档化顺序 vs 真实分支）',
    expected: '**留档的已知盲区**：PRECEDENCE 只被定义与导出、没有任何生产者读取它 ⇒ 改它不动任何行为，没有门禁该红（真实判定在 deriveDimension 的 if 链里）',
    expectNotCaught: true,
    targets: ['scripts/lib/coverage-targets.js'],
    apply: ({ sandboxPath }) => replaceOnce(
      sandboxPath('scripts/lib/coverage-targets.js'),
      "const PRECEDENCE = ['NOT_APPLICABLE', 'DEFERRED', 'UNVERIFIABLE', 'BLOCKED_SOURCE', 'PARTIAL', 'COVERED', 'MISSING'];",
      "const PRECEDENCE = ['MISSING', 'NOT_APPLICABLE', 'DEFERRED', 'UNVERIFIABLE', 'BLOCKED_SOURCE', 'PARTIAL', 'COVERED'];"
    ),
    gates: [GATE.coverageSelftest, GATE.coverageReport]
  }
];

module.exports = { CASES, GATE, SET };
