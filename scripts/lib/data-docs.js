/**
 * Data Docs / 数据出口（v3.0 Stage G）—— Dataset Index + Data Documentation +
 * 使用示例 + 引用方式 + Schema 稳定性 + License 状态。
 *
 * ## 这一页为什么要存在
 *
 * 本站已经不只是页面：`deals.json` / `plans.json` / `api-plans.json` 一直是可以直接取用的公开数据。
 * v3.0 把这件事**正式承认**下来 —— 但承认的方式不是"复制一份数据"，而是：
 *
 *   · **Dataset Manifest**（`/data/index.json`）：只**描述**数据集（URL / schemaVersion /
 *     updatedAt / 记录数 / 用途），不复制任何数据；
 *   · **文档与 Manifest 同源对账**：文档里的每个 endpoint、每个 schemaVersion、每个记录数
 *     都必须能由真实文件重算出来（§8 第 12/13/14 条牙）。
 *
 * ## 三条纪律
 *
 * 1. **端点必须真实存在**。文档里写出的每个 JSON endpoint 都要在产物里找得到；
 *    写好但没生成 = 红（不是"以后会有的占位"）。
 * 2. **数字必须可重算**。schemaVersion 与记录数不许手写在文档里再"顺便"标一下 ——
 *    它们来自 Manifest，Manifest 又必须与真实文件对得上。
 * 3. **不擅自决定许可证**。仓库里没有 LICENSE 就如实写"需要项目所有者决定"，
 *    本层不生成、不推断任何许可证文本。
 */

'use strict';

const plansPage = require('./plans-page');
const pageKinds = require('./page-kinds');

const DATA_DOCS_ROUTE = 'docs/data/';
const DATA_DOCS_HEADING = '数据文档与公开数据集';
const DATA_DOCS_DESCRIPTION = '本站的页面背后是一组可以长期维护、可追溯的公开数据：'
  + '优惠、Coding 套餐、API 计费、模型身份、关系层与三份变化日志。'
  + '这一页说明每一份数据的地址、版本、记录数、用途与使用方式，以及引用本站数据时应当遵守的规则。';

const UNKNOWN_TEXT = plansPage.UNKNOWN_TEXT;
const UNKNOWN_NUM = plansPage.UNKNOWN_NUM;
const escapeHtml = plansPage.escapeHtml;
const FORBIDDEN_CLAIM_WORDS = plansPage.FORBIDDEN_CLAIM_WORDS;

/**
 * 极简行内标记：**先转义、再**把 `**加粗**` 与 `` `代码` `` 变成标签。
 *
 * 顺序不能反：说明文案里有 `<` 这类字符时，先转义才不会被当成标签。
 * 它只用于**我们自己写的常量**，数据原文一律 `escapeHtml`（数据不是 Markdown）。
 */
function rich(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** Manifest 的分节顺序（也是文档里的书写顺序） */
const MANIFEST_SCHEMA_VERSION = 1;

/** 文档段落：术语 → 解释。**只讲口径，不复制数据**。 */
const DATA_DOC_TERMS = [
  {
    term: 'ID 稳定性',
    text: '每条记录的 `id` 是身份的派生值（例如优惠是 `sha1(vendor|title|url)` 的前 12 位十六进制）。'
      + '**改名等于换身份**：标题或 URL 变了就是另一条记录，会产生 `ended` + `created` 两条生命周期事件，'
      + '而不是静默改写同一条记录的 id。消费者可以用 id 做长期引用，但不能假设它永不变——'
      + '官方改名时我们会保留旧记录的结束记录。'
  },
  {
    term: 'null / unknown / 0',
    text: '三者含义不同，绝不互相顶替：`0` 只表示**官方明确为 0 / 免费**；'
      + '`null` 表示**官方没有公布这一项**；`unknown`（三态字段）表示**我们不知道**，'
      + '既不是是也不是否。页面上它们分别显示为「免费 / —/ 未确认」，不会写成 0。'
  },
  {
    term: 'firstSeen / lastSeen',
    text: '`firstSeen` 是我们第一次收录它的日期，`lastSeen` 是我们最后一次核对它的日期。'
      + '它们都是**本站的观测时间**，不是厂商的发布时间，也不代表官方承诺不变。'
  },
  {
    term: 'verified / verifiedAt',
    text: '人工核验声明与核验日期。`verified: true` 表示有人对照过官方页面；'
      + '`false` 或缺失表示**没有人工核验声明**，不等于"这条是错的"，也不等于"官方说了不是"。'
  },
  {
    term: 'Evidence',
    text: '官方原文片段（`quote` + `sourceUrl` + `capturedAt` + `lang`）。'
      + '它是我们写下这条事实的依据；没有官方原文的字段，我们宁可留空。'
  },
  {
    term: '派生字段',
    text: '由本站规则从原始事实**推导**出来的字段（例如套餐的「名义 Token 单价」）会在'
      + '`derivedMetrics` 之类的命名空间里，并与原始字段分开。派生值可能随规则版本变化，'
      + '不应当被当作厂商公布的事实。'
  },
  {
    term: 'History',
    text: '三份变化日志（优惠 / Coding 套餐 / API 计费）是**一次性基线 + 追加事件**：'
      + '基线是启用日志时的既有状态快照（**不是创建事件**），此后每次观测到的变化追加一条事件。'
      + '「日志与当前数据一致」由门禁逐字段重放校验。'
  },
  {
    term: '关系文件',
    text: '关系层（`deal-plan-links.json` 与模型映射）只做**显式关联**：每条关系都带依据与官方出处。'
      + '相似度匹配只产出候选报告，永远不会自动写进生产关系。'
      + '套餐侧那些**不对应单一模型身份**的模型串（模型池 / 系列名 / 一个串里两个模型 / 本仓库没有的身份）'
      + '逐条登记在 `scripts/data/model-registry-gaps.json` 里并写明理由 —— 它们不是「漏了」，'
      + '而是「判过、结论就是不该映射」。'
  },
  {
    term: '未映射 / 未判',
    text: '**未映射**是事实陈述：某条 API `modelKey` 还没有对应的 registry 身份，进覆盖报告的缺口，不是故障。'
      + '**未判**是失败：`plans.json` 的一条套餐模型串既没有映射、又没有写明「为什么不映射」，'
      + '门禁会当场报红（本站不接受「没判过」被当成「不需要判」）。'
  },
  {
    term: '单位 / currency',
    text: '价格与额度**永远带着自己的单位与币种**出现。本站不做跨单位换算'
      + '（不把「每 1000 tokens」乘成「每 100 万」），也不做跨币种折算（没有假汇率）。'
  },
  {
    term: 'modelKey / registry model id',
    text: '`modelKey` 是**厂商在场上的模型标识**（`api-plans.json` 的既有契约，v3.0 一个字没改）；'
      + 'registry model id 是本站 Model Registry 的**身份 id**。两者之间的映射写在'
      + '`model-registry-links.json` 里，是**显式**的：名称相似不构成映射。'
  }
];

/** 使用示例（必须基于真实 endpoint；示例里的路径由 `examplesOf()` 生成后逐条对账） */
function examplesOf(ctx = {}) {
  const siteUrl = ctx.siteUrl || '';
  const base = siteUrl.replace(/\/$/, '');
  const js = `// JavaScript（浏览器 / Node 18+）
const res = await fetch('${base}/deals.json');
if (!res.ok) throw new Error('HTTP ' + res.status);
const payload = await res.json();
console.log(payload.count, payload.updatedAt);
for (const deal of payload.deals.slice(0, 5)) {
  console.log(deal.id, deal.title, deal.vendor);
}`;
  const py = `# Python 3（requests）
import requests

r = requests.get("${base}/api-plans.json", timeout=20)
r.raise_for_status()
payload = r.json()
print(payload["count"], payload["updatedAt"])
for plan in payload["plans"]:
    print(plan["id"], plan["provider"], plan["planName"])`;
  return [
    { lang: 'javascript', title: '读取优惠数据（JavaScript）', code: js, endpoints: ['deals.json'] },
    { lang: 'python', title: '读取 API 计费数据（Python）', code: py, endpoints: ['api-plans.json'] }
  ];
}

/** 引用方式（G5）：三条必须同时保留的信息 */
const CITATION_RULES = [
  '引用「本站记录 URL」（它指向被引用条目的页面或 JSON 里的 id），而不是只引用首页。',
  '同时保留**官方 source URL**：本站不是官方来源，官方页面才是价格与条款的最终依据。',
  '同时保留**更新时间**（`lastSeen` / Manifest 的 `updatedAt`）：脱离时间的价格数字会误导读者。'
];

/** 引用示例文案（站点 URL 由调用方给，不写死） */
function citationExampleOf(ctx = {}) {
  const siteUrl = ctx.siteUrl || '';
  const base = siteUrl.replace(/\/$/, '');
  return `数据来源：AI 优惠聚合器 ${base}/api-plans.json（记录 id 4f8bae91f9f8，更新于 2026-10-01）；`
    + '官方出处：https://docs.anthropic.com/en/docs/about-claude/pricing';
}

/** Schema 稳定性约定（G7）：不承诺做不到的永久兼容 */
const SCHEMA_STABILITY = [
  {
    term: 'schemaVersion',
    text: '每份数据顶层都带 `schemaVersion`（当前见 Dataset Manifest）。'
      + '它描述**结构**，不描述数据内容；同版本内字段只会追加，不会改语义。'
  },
  {
    term: 'Additive Change（兼容变更）',
    text: '新增字段、新增记录、新增枚举值属于兼容变更：可以只提升小版本或不提升版本号，'
      + '消费者必须忽略不认识的字段。'
  },
  {
    term: 'Breaking Change（破坏性变更）',
    text: '删除 / 重命名字段、改变字段含义或单位、改变 id 的派生方式属于破坏性变更：'
      + '必须提升 `schemaVersion`，并在文档里写明迁移方式。'
  },
  {
    term: '不承诺的部分',
    text: '本站**不承诺**永久 API 兼容：数据来自人工维护的官方来源核查，字段会随真实世界变化调整。'
      + '我们能承诺的是：破坏性变更一定提版本、写文档，并且**历史不会被删除**。'
  }
];

const DATA_DOCS_NOTES = [
  '这一页**只描述数据集**，不复制数据：每份数据的地址就是它的 endpoint，'
  + 'Manifest（`/data/index.json`）与这一页同源对账。',
  '本站数据来自官方页面的收录与整理，**本站不是官方来源**；引用时请同时保留官方出处与更新时间。',
  '历史失效的资料不会消失：`/archive/` 与三份变化日志长期保留结束记录。'
];

/* ------------------------------------------------------------------ */
/* Manifest                                                            */
/* ------------------------------------------------------------------ */

/**
 * 六个数据集类别（题面 §G1 点名要介绍的六类）。**顺序即页面分组顺序**，
 * 也是"这一页必须覆盖哪些类别"的断言依据。
 */
const DATASET_CATEGORIES = [
  { key: 'deals', label: '优惠（Deals）', purpose: '当前收录的 AI 优惠与福利条目' },
  { key: 'coding-plans', label: 'Coding 套餐（Plans）', purpose: '长期在售的订阅型 / Coding 套餐' },
  { key: 'api-pricing', label: 'API 计费（API Pricing）', purpose: '按量计费的官方单价与免费额度' },
  { key: 'models', label: '模型（Models）', purpose: 'Model Registry：模型身份索引' },
  { key: 'relationships', label: '关系（Relationships）', purpose: '显式确认的关联：优惠↔套餐、模型↔计价记录' },
  { key: 'history', label: '历史（History）', purpose: '一次性基线 + 追加事件的变化日志' }
];

const DATASET_CATEGORY_KEYS = DATASET_CATEGORIES.map(item => item.key);

/**
 * `updatedAt` 的**时间形状**。本站两种形状并存，Manifest 必须显式区分（题面 §G 点名）：
 *
 *   · `timestamp`       —— 真实时刻（`2026-10-01T12:20:35+08:00`）：`deals.json` 的 `updatedAt`
 *                          来自采集运行的真实时刻。
 *   · `date-normalized` —— 日期规范化（`2026-10-01T00:00:00+08:00`）：构建期把"哪一天"写成了
 *                          当天零点。**它看起来是时刻，其实是日期** —— 不区分就会让读者以为
 *                          这几份数据是同一时刻产出的。
 *   · `date`            —— 纯日期（`2026-09-30`）：变化日志的 `startedAt` 就是这种形状。
 *
 * 判据只有这个函数（渲染、Manifest、断言都读它）。
 */
function timeShapeOf(value) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return 'date';
  const match = text.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return 'unknown';
  return (match[1] === '00' && match[2] === '00' && match[3] === '00') ? 'date-normalized' : 'timestamp';
}

const TIME_SHAPE_LABEL = {
  date: '日期（YYYY-MM-DD）',
  'date-normalized': '日期规范化（当天零点，不是真实时刻）',
  timestamp: '真实时刻',
  unknown: '未识别'
};

/** 归一一条数据集描述（缺字段**如实留空**，不补默认值；校验交给 `assertManifestShape`） */
function datasetEntryOf(dataset = {}) {
  const updatedAt = dataset.updatedAt ? String(dataset.updatedAt) : null;
  const category = String(dataset.category || '');
  return {
    id: String(dataset.id || ''),
    label: String(dataset.label || dataset.id || ''),
    category: DATASET_CATEGORY_KEYS.includes(category) ? category : category,
    url: String(dataset.url || ''),
    schemaVersion: dataset.schemaVersion === undefined || dataset.schemaVersion === null
      ? null : Number(dataset.schemaVersion),
    updatedAt,
    // 时间形状**由值本身推出**（调用方不必手写，也不可能与值不一致）
    updatedAtShape: timeShapeOf(updatedAt),
    count: dataset.count === undefined || dataset.count === null ? null : Number(dataset.count),
    countNote: dataset.countNote ? String(dataset.countNote) : null,
    purpose: String(dataset.purpose || ''),
    format: String(dataset.format || 'json')
  };
}

/** 由数据集描述构造 Manifest（按 id 排序 → 字节可复现） */
function buildDatasetManifest(datasets = []) {
  const entries = datasets.map(datasetEntryOf)
    .filter(entry => entry.id)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const updatedAt = entries.map(entry => entry.updatedAt).filter(Boolean).sort().pop() || null;
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    updatedAt,
    count: entries.length,
    datasets: entries
  };
}

/** Manifest 自身的形状校验（缺 URL / 缺用途 / 记录数不是数字等都是问题） */
function assertManifestShape(manifest) {
  const problems = [];
  if (!manifest || typeof manifest !== 'object') return ['Manifest 不是对象'];
  if (!Array.isArray(manifest.datasets)) return ['Manifest 缺少 datasets 数组'];
  if (Number(manifest.schemaVersion) !== MANIFEST_SCHEMA_VERSION) {
    problems.push(`Manifest 的 schemaVersion 应为 ${MANIFEST_SCHEMA_VERSION}，实得 ${manifest.schemaVersion}`);
  }
  if (Number(manifest.count) !== manifest.datasets.length) {
    problems.push(`Manifest 声明 count=${manifest.count}，datasets 实际 ${manifest.datasets.length} 条`);
  }
  const seen = new Set();
  const categories = new Set();
  for (const dataset of manifest.datasets) {
    const where = `dataset ${dataset.id || '(无 id)'}`;
    if (!dataset.id) { problems.push('有一条 dataset 没有 id'); continue; }
    if (seen.has(dataset.id)) problems.push(`${where}: id 重复`);
    seen.add(dataset.id);
    if (!dataset.url) problems.push(`${where}: 缺少 url（endpoint 必须真实存在）`);
    if (!dataset.purpose) problems.push(`${where}: 缺少 purpose（这一份数据是干什么用的）`);
    if (!DATASET_CATEGORY_KEYS.includes(dataset.category)) {
      problems.push(`${where}: category「${dataset.category}」不是六个已知类别之一（${DATASET_CATEGORY_KEYS.join(' / ')}）`);
    } else categories.add(dataset.category);
    if (dataset.schemaVersion !== null && !Number.isFinite(dataset.schemaVersion)) {
      problems.push(`${where}: schemaVersion 不是数字`);
    }
    if (dataset.count !== null && !Number.isFinite(dataset.count)) {
      problems.push(`${where}: count 不是数字`);
    }
    if (!dataset.updatedAt) problems.push(`${where}: 缺少 updatedAt`);
    // 时间形状必须与值一致：标了「日期规范化」就不能带非零时刻，反之亦然
    const shape = timeShapeOf(dataset.updatedAt);
    if (dataset.updatedAtShape !== shape) {
      problems.push(`${where}: updatedAtShape 写的是 ${dataset.updatedAtShape}，按值应为 ${shape}（${dataset.updatedAt}）`);
    }
    if (shape === 'unknown') problems.push(`${where}: updatedAt 的形状无法识别（${dataset.updatedAt}）`);
  }
  for (const key of DATASET_CATEGORY_KEYS) {
    if (!categories.has(key)) problems.push(`Manifest 缺少「${DATASET_CATEGORIES.find(item => item.key === key).label}」这一类数据集`);
  }
  return problems;
}

/**
 * §8 第 12 条牙：**文档里的 JSON endpoint 必须真实存在**。
 *
 * @param {object} manifest
 * @param {(url:string)=>boolean} exists 由调用方给（构建期查产物目录，自测可注入）
 */
function assertEndpointsExist(manifest, exists) {
  const problems = [];
  if (typeof exists !== 'function') return ['assertEndpointsExist 需要一个 exists(url) 回调（不做隐式读盘）'];
  for (const dataset of (manifest && manifest.datasets) || []) {
    if (!dataset.url) continue;
    if (!exists(dataset.url)) problems.push(`文档里写出的 endpoint 不存在：${dataset.url}（${dataset.id}）`);
  }
  return problems;
}

/**
 * `updatedAt` 的逐字段对账（题面 §G：schemaVersion / count / **updatedAt** 三者都必须与磁盘一致）。
 *
 * 除了逐字比对，还比对**时间形状**：真实文件的时间形状必须与 Manifest 标的一致 ——
 * 这条专门防"把 deals 的真实时刻与 plans 的日期规范化当成同一种东西"。
 */
function assertUpdatedAt(manifest, actual) {
  const problems = [];
  const table = actual instanceof Map ? actual : new Map(Object.entries(actual || {}));
  for (const dataset of (manifest && manifest.datasets) || []) {
    if (!table.has(dataset.id)) { problems.push(`${dataset.id}: 没有真实数据可供对账 updatedAt`); continue; }
    const real = table.get(dataset.id);
    if (real === null || real === undefined) continue; // 这份数据没有 updatedAt（用 startedAt 代替时由调用方映射）
    if (String(dataset.updatedAt) !== String(real)) {
      problems.push(`${dataset.id}: Manifest 写 updatedAt=${dataset.updatedAt}，真实数据是 ${real}`);
    }
    const realShape = timeShapeOf(real);
    if (dataset.updatedAtShape !== realShape) {
      problems.push(`${dataset.id}: Manifest 标的时间形状是 ${dataset.updatedAtShape}，真实数据是 ${realShape}（${real}）`);
    }
  }
  return problems;
}

/**
 * §8 第 13 条牙：**文档里的 schemaVersion 必须与真实数据一致**。
 *
 * @param {object} manifest
 * @param {object|Map} actual `{datasetId: version}`
 */
function assertSchemaVersions(manifest, actual) {
  const problems = [];
  const table = actual instanceof Map ? actual : new Map(Object.entries(actual || {}));
  for (const dataset of (manifest && manifest.datasets) || []) {
    if (!table.has(dataset.id)) { problems.push(`${dataset.id}: 没有真实数据可供对账 schemaVersion`); continue; }
    const real = Number(table.get(dataset.id));
    if (Number(dataset.schemaVersion) !== real) {
      problems.push(`${dataset.id}: 文档写 schemaVersion=${dataset.schemaVersion}，真实数据是 ${real}`);
    }
  }
  return problems;
}

/**
 * §8 第 14 条牙：**Dataset Manifest 的记录数必须与真实数据一致**。
 *
 * `count: null` 的数据集**不参与**这条对账（它本来就标着"不适用"），
 * 但缺 `count` 的键与"表里有这个 id 但值是 null"是两件事，前者仍然报红。
 */
function assertManifestCounts(manifest, actual) {
  const problems = [];
  const table = actual instanceof Map ? actual : new Map(Object.entries(actual || {}));
  for (const dataset of (manifest && manifest.datasets) || []) {
    if (!table.has(dataset.id)) { problems.push(`${dataset.id}: 没有真实数据可供对账记录数`); continue; }
    const real = table.get(dataset.id);
    if (real === null || real === undefined) continue; // 这份数据的记录数不适用
    if (dataset.count === null) {
      problems.push(`${dataset.id}: 真实数据有 ${real} 条记录，Manifest 却写着"不适用"`);
      continue;
    }
    if (Number(dataset.count) !== Number(real)) {
      problems.push(`${dataset.id}: Manifest 写 ${dataset.count} 条，真实数据是 ${real} 条`);
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

function markupOnly(html) {
  return plansPage.markupOnly(html);
}

function datasetRowsHtml(manifest, prefix) {
  return (manifest.datasets || []).map(dataset => {
    const countText = dataset.count === null
      ? (dataset.countNote || UNKNOWN_NUM)
      : `${dataset.count}${dataset.countNote ? `（${dataset.countNote}）` : ''}`;
    const version = dataset.schemaVersion === null ? UNKNOWN_TEXT : String(dataset.schemaVersion);
    const category = DATASET_CATEGORIES.find(item => item.key === dataset.category);
    // endpoint 是**站根相对**路径，套壳时要按这一页的深度加前缀（否则会变成 docs/data/deals.json 这种死链）
    return `        <tr data-item="${escapeHtml(dataset.id)}">
          <th scope="row"><a href="${escapeHtml(`${prefix}${dataset.url}`)}">${escapeHtml(dataset.url)}</a><small>${escapeHtml(dataset.label)}</small></th>
          <td>${escapeHtml(category ? category.label : dataset.category || UNKNOWN_TEXT)}</td>
          <td class="num">${escapeHtml(version)}</td>
          <td><time datetime="${escapeHtml(dataset.updatedAt || '')}">${escapeHtml(dataset.updatedAt || UNKNOWN_TEXT)}</time>
            <small data-time-shape="${escapeHtml(dataset.updatedAtShape || '')}">${escapeHtml(TIME_SHAPE_LABEL[dataset.updatedAtShape] || UNKNOWN_TEXT)}</small></td>
          <td class="num">${escapeHtml(countText)}</td>
          <td>${escapeHtml(dataset.purpose)}</td>
        </tr>`;
  }).join('\n');
}

function termListHtml(terms) {
  return terms.map(item => `        <li><b>${escapeHtml(item.term)}</b>：${rich(item.text)}</li>`).join('\n');
}

/** 某一种时间形状在 Manifest 里有几份（页面上用来说明"为什么要分开读"） */
function timeShapeCount(manifest, shape) {
  return (manifest.datasets || []).filter(dataset => dataset.updatedAtShape === shape).length;
}

function examplesHtml(ctx, prefix) {
  return examplesOf(ctx).map(example => {
    const endpoints = example.endpoints
      .map(url => `<a href="${escapeHtml(`${prefix}${url}`)}">${escapeHtml(url)}</a>`).join('、');
    return `      <h3>${escapeHtml(example.title)}</h3>
      <p class="snote">用到的 endpoint：${endpoints}</p>
      <pre class="codeblock"><code>${escapeHtml(example.code)}</code></pre>`;
  }).join('\n');
}

function licenseBlockHtml(ctx) {
  const license = ctx.license || null;
  if (license && license.status === 'present') {
    return `      <p>仓库里存在许可证文件 <code>${escapeHtml(license.file || 'LICENSE')}</code>：`
      + `${escapeHtml(license.note || '数据集沿用仓库的许可证。')}</p>`;
  }
  return `      <p>${rich('仓库里**没有**许可证文件（LICENSE / COPYING）。因此：')}</p>
      <ul>
        <li>${rich('数据集的许可证状态是**未定**，本站不擅自决定一个许可证。')}</li>
        <li>在项目所有者作出决定之前，本页只描述数据，不授予任何超出适用法律的权利。</li>
        <li>这一项已列入最终报告的"需要项目所有者决定"。</li>
      </ul>`;
}

/**
 * `/docs/data/` 正文（纯函数）。
 *
 * @param {object} ctx
 *   `manifest`  `buildDatasetManifest()` 的产物
 *   `license`   `{ status: 'present'|'absent', file }`（缺省按 absent 处理 —— 没查到就说没查到）
 *   `siteUrl`   站点根
 *   `prefix`    回到站根的相对前缀（缺省由路由深度推导）
 */
function renderDataDocsPage(ctx = {}) {
  const prefix = ctx.prefix === undefined ? '../../' : ctx.prefix;
  const manifest = ctx.manifest || buildDatasetManifest([]);
  const updatedAt = manifest.updatedAt || UNKNOWN_TEXT;
  const notes = DATA_DOCS_NOTES.map(text => `<li>${rich(text)}</li>`).join('\n');
  const citationExample = citationExampleOf(ctx);

  return `      <nav class="crumb" aria-label="面包屑"><a href="${escapeHtml(prefix)}">首页</a> › <span>${escapeHtml(DATA_DOCS_HEADING)}</span></nav>

      <div class="stop">
        <h1>${escapeHtml(DATA_DOCS_HEADING)}</h1>
        <span class="meta">${manifest.count} 份公开数据集 · Manifest schemaVersion ${manifest.schemaVersion}
          · 最近更新 ${escapeHtml(updatedAt)}</span>
      </div>

      <p class="snote">${escapeHtml(DATA_DOCS_DESCRIPTION)}</p>

      <h2 class="ph2" id="data-notes">先说三件重要的事</h2>
      <ul class="plist">
${notes}
      </ul>

      <h2 class="ph2" id="data-datasets">数据集索引（Dataset Index）</h2>
      <p class="snote">${rich(`六类数据集：${DATASET_CATEGORIES.map(item => item.label).join(' · ')}。`)}
        Manifest 地址：<a href="${escapeHtml(`${prefix}data/index.json`)}">data/index.json</a>
        —— 它${rich('**只描述数据集**')}（URL / schemaVersion / updatedAt / 记录数 / 用途），不复制任何数据。</p>
      <p class="snote">${rich(`**时间形状必须分开读**：本站 ${timeShapeCount(manifest, 'timestamp')} 份数据集的 `
  + '`updatedAt` 是**真实时刻**，'
  + `${timeShapeCount(manifest, 'date-normalized')} 份是**日期规范化**（当天零点，看起来像时刻其实是日期），`
  + `${timeShapeCount(manifest, 'date')} 份是纯日期。`
  + '表里每一行都显式标出形状 —— 不标的话，读者会以为它们是同一时刻产出的。')}</p>
      <div class="ptable-wrap">
      <table class="ptable">
        <caption>一行 = 一份公开数据集（${manifest.count} 份）。</caption>
        <thead>
          <tr><th scope="col">endpoint</th><th scope="col">类别</th><th scope="col">schemaVersion</th>
            <th scope="col">updatedAt（含时间形状）</th><th scope="col">记录数</th><th scope="col">用途</th></tr>
        </thead>
        <tbody>
${datasetRowsHtml(manifest, prefix)}
        </tbody>
      </table>
      </div>

      <h2 class="ph2" id="data-documentation">数据文档（怎么读这些字段）</h2>
      <ul class="plist dterms">
${termListHtml(DATA_DOC_TERMS)}
      </ul>

      <h2 class="ph2" id="data-examples">使用示例</h2>
      <p class="snote">示例只用到上面列出的真实 endpoint；它们不是"伪代码"，是可以直接复制运行的取数方式。</p>
${examplesHtml(ctx, prefix)}

      <h2 class="ph2" id="data-citation">引用方式</h2>
      <p class="snote">${rich('引用本站数据时，请同时保留下面三条信息，并且**不要宣称本站是官方来源**。')}</p>
      <ul class="plist">
${CITATION_RULES.map(rule => `        <li>${rich(rule)}</li>`).join('\n')}
      </ul>
      <p class="snote">示例：</p>
      <pre class="codeblock"><code>${escapeHtml(citationExample)}</code></pre>

      <h2 class="ph2" id="data-stability">Schema 稳定性</h2>
      <ul class="plist dterms">
${termListHtml(SCHEMA_STABILITY)}
      </ul>

      <h2 class="ph2" id="data-license">License 状态</h2>
${licenseBlockHtml(ctx)}

      <p class="snote" id="data-links">相关页面：
        <a href="${escapeHtml(`${prefix}plans/`)}">套餐与 API 计费资料库</a> ·
        <a href="${escapeHtml(`${prefix}models/`)}">模型资料索引</a> ·
        <a href="${escapeHtml(`${prefix}vendor/`)}">按厂商浏览</a> ·
        <a href="${escapeHtml(`${prefix}archive/`)}">历史档案</a> ·
        <a href="${escapeHtml(`${prefix}changes/`)}">最近变化</a>
      </p>
`;
}

/** `/docs/data/` JSON-LD：CollectionPage + BreadcrumbList + ItemList（一份数据集一行） */
function dataDocsJsonLd(ctx = {}) {
  const siteUrl = ctx.siteUrl || '';
  const pageUrl = `${siteUrl}${DATA_DOCS_ROUTE}`;
  const manifest = ctx.manifest || buildDatasetManifest([]);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${DATA_DOCS_HEADING} · AI 优惠聚合器`,
      description: DATA_DOCS_DESCRIPTION,
      url: pageUrl,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: 'AI 优惠聚合器', url: siteUrl }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: DATA_DOCS_HEADING, item: pageUrl }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: DATA_DOCS_HEADING,
      numberOfItems: (manifest.datasets || []).length,
      itemListElement: (manifest.datasets || []).map((dataset, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: dataset.label || dataset.id,
        url: `${siteUrl}${dataset.url}`
      }))
    }
  ];
}

/* ------------------------------------------------------------------ */
/* 诚实性断言                                                          */
/* ------------------------------------------------------------------ */

function jsonLdItemListOf(html) {
  const blocks = [...String(html || '').matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const block of blocks) {
    try {
      const data = JSON.parse(block[1]);
      if (data && data['@type'] === 'ItemList') return data;
    } catch (error) { /* 解析失败按「没有」处理 */ }
  }
  return null;
}

/**
 * 页面级诚实性断言。回读页面 + 与真实数据对账（三种对账由三个独立函数做，这里汇总）。
 *
 * @param {string} html
 * @param {object} ctx 与 `renderDataDocsPage()` 相同，另可给：
 *   `endpointExists(url)`  `actualSchemaVersions`  `actualCounts`
 */
function assertPageHonesty(html, ctx = {}) {
  const problems = [];
  const text = markupOnly(String(html || ''));
  const manifest = ctx.manifest || buildDatasetManifest([]);

  if (!/<h1[\s>]/.test(text)) problems.push('缺少 <h1>');
  if (!text.includes(DATA_DOCS_HEADING)) problems.push(`缺少标题「${DATA_DOCS_HEADING}」`);
  for (const word of FORBIDDEN_CLAIM_WORDS) {
    if (text.includes(word)) problems.push(`页面出现结论性词汇「${word}」—— 数据文档只讲口径`);
  }
  for (const section of ['数据集索引', '数据文档', '使用示例', '引用方式', 'Schema 稳定性', 'License 状态']) {
    if (!text.includes(section)) problems.push(`缺少必需段落「${section}」`);
  }

  problems.push(...assertManifestShape(manifest));

  // 每个 dataset 都必须出现在页面上（文档少写一份 = 数据出口不完整）。
  // 判据分两层：endpoint 文本必须在场，且**索引表里必须有它自己的一行** ——
  // 少了行时 endpoint 往往还能在别处出现（例如示例、正文），只有行标记能抓到。
  for (const dataset of manifest.datasets) {
    if (!text.includes(dataset.url)) problems.push(`页面上没有列出 endpoint：${dataset.url}`);
    if (!text.includes(dataset.id)) problems.push(`页面上没有列出数据集 ${dataset.id}`);
    if (!text.includes(`<tr data-item="${dataset.id}">`)) {
      problems.push(`数据集索引里缺少 ${dataset.id} 的一行（data-item 标记）`);
    }
    // 时间形状必须显式标在页面上（读者要能一眼看出哪份是真实时刻、哪份是日期规范化）
    if (!String(html).includes(`data-time-shape="${dataset.updatedAtShape}"`)) {
      problems.push(`${dataset.id}: 页面上没有标出时间形状 ${dataset.updatedAtShape}`);
    }
  }

  // Manifest 自身的地址与"只描述不复制"必须写在页面上（这是数据出口的门牌）
  if (!text.includes('data/index.json')) problems.push('页面上没有给出 Manifest 地址 data/index.json');
  for (const category of DATASET_CATEGORIES) {
    if (!text.includes(category.label)) problems.push(`页面没有介绍「${category.label}」这一类数据集`);
  }

  // 示例里的 endpoint 必须都在 Manifest 里（示例不能引用不存在的数据）
  const known = new Set(manifest.datasets.map(dataset => dataset.url));
  for (const example of examplesOf(ctx)) {
    for (const endpoint of example.endpoints) {
      if (!known.has(endpoint)) problems.push(`示例引用了不在 Manifest 里的 endpoint：${endpoint}`);
    }
  }

  if (typeof ctx.endpointExists === 'function') {
    problems.push(...assertEndpointsExist(manifest, ctx.endpointExists));
  }
  if (ctx.actualSchemaVersions) problems.push(...assertSchemaVersions(manifest, ctx.actualSchemaVersions));
  if (ctx.actualCounts) problems.push(...assertManifestCounts(manifest, ctx.actualCounts));
  if (ctx.actualUpdatedAt) problems.push(...assertUpdatedAt(manifest, ctx.actualUpdatedAt));

  // ItemList（只在页面真的带了 JSON-LD 时查内容；在场性由 seo.js 的 itemlist-arity 守）
  if (/<script[^>]+type="application\/ld\+json"/.test(String(html || ''))) {
    const list = jsonLdItemListOf(html);
    const rows = [...text.matchAll(/<tr data-item="([^"]*)"/g)].map(match => match[1]);
    if (!list) problems.push('数据文档页缺少 ItemList 结构化数据');
    else {
      if (Number(list.numberOfItems) !== (list.itemListElement || []).length) {
        problems.push(`ItemList 声明 ${list.numberOfItems} 项，实际 ${(list.itemListElement || []).length} 项`);
      }
      if ((list.itemListElement || []).length !== rows.length) {
        problems.push(`ItemList ${(list.itemListElement || []).length} 项 ≠ 页面数据行 ${rows.length} 行`);
      }
      if (rows.length !== manifest.datasets.length) {
        problems.push(`页面数据行 ${rows.length} ≠ Manifest 数据集 ${manifest.datasets.length} 份`);
      }
    }
  }

  return problems;
}

/** 声明表必须覆盖这一页（新增家族漏登记的牙） */
function assertDeclared() {
  const problems = [];
  const kind = pageKinds.kindOfRoute(DATA_DOCS_ROUTE);
  if (kind !== 'data-docs') problems.push(`page-kinds 里 ${DATA_DOCS_ROUTE} 的 kind 应为 data-docs，实得 ${kind}`);
  return problems;
}

module.exports = {
  DATA_DOCS_ROUTE,
  DATA_DOCS_HEADING,
  DATA_DOCS_DESCRIPTION,
  DATA_DOCS_NOTES,
  DATA_DOC_TERMS,
  SCHEMA_STABILITY,
  CITATION_RULES,
  DATASET_CATEGORIES,
  DATASET_CATEGORY_KEYS,
  TIME_SHAPE_LABEL,
  MANIFEST_SCHEMA_VERSION,
  FORBIDDEN_CLAIM_WORDS,
  UNKNOWN_TEXT,
  UNKNOWN_NUM,
  escapeHtml,
  rich,
  markupOnly,
  examplesOf,
  citationExampleOf,
  datasetEntryOf,
  timeShapeOf,
  timeShapeCount,
  buildDatasetManifest,
  assertManifestShape,
  assertEndpointsExist,
  assertSchemaVersions,
  assertUpdatedAt,
  assertManifestCounts,
  renderDataDocsPage,
  dataDocsJsonLd,
  assertDeclared,
  assertPageHonesty
};
