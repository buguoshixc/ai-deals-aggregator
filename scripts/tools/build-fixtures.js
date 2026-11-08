#!/usr/bin/env node
/**
 * fixture 重建工具（v2.0 Phase D）。
 *
 * 用法：
 *   node scripts/tools/build-fixtures.js --source=layer3labs
 *   node scripts/tools/build-fixtures.js --all
 *
 * ## 它做什么
 *
 * 抓一次真实页面 → 从 DOM 里**剪出解析器真正依赖的那一小块**（表格 / 卡片列表）
 * → 用剪出来的片段跑一遍**生产解析器** → 把解析器在片段上的真实输出写成 `expected.json`。
 *
 * ## 为什么 expected 是"解析器的输出"而不是"人写的期望值"
 *
 * 两边都不是好选择，但这一边可以自证：
 *  ① 人写一份期望值 = 我按现在解析器的行为抄一遍，它证明不了任何事，还会随人手误漂移；
 *  ② 直接用整页做 fixture = 把测试建立在第三方页面今天的形状上，页面一变测试就红，
 *     而那是**别人的改动**，不是我们的回归；
 *  ③ 所以：先用小片段跑解析器得到期望值，**再断言这份期望值与整页输出在同一批条目上一致**
 *     （见 `assertSubset`）。于是 fixture 证明的是「解析器在这个片段上仍然给出同样的结果」，
 *     改解析器会立刻红 —— 这正是 AI 生成的补丁需要的那个判据。
 *
 * 片段**只保留解析所需的标签与属性**，正文文本被大幅裁掉：体积与版权两条纪律见
 * `docs/AI-MAINTENANCE-v2.0.md` 与各 fixture 的 PROVENANCE.md。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const http = require('../lib/http');
const registry = require('../collectors');
const { todayCN } = require('../lib/schema');

const ROOT = path.join(__dirname, '..', '..');
const FIXTURES_DIR = path.join(__dirname, '..', 'data', 'fixtures');
/** 片段体积上限（不是"越大越好"：这里只该留下解析器真正读的那些节点） */
const MAX_FIXTURE_BYTES = 20 * 1024;
const MAX_CARDS = 6;

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

/** 每个 fixture 的"剪裁规则"：从整页里挑出解析器依赖的那块 DOM */
/** AppSumo fixture 的保留条数：够覆盖「AI 保留 / 非 AI 筛掉 / 价格缺失筛掉」三条分支即可 */
const APP_SUMO_FIXTURE_DEALS = 8;

const TRIMS = {
  'layer3labs.deals': {
    url: 'https://www.layer3labs.io/ai-discounts',
    what: '第一张「Provider | Current deal | Best for | How to get it」表（含表头与全部数据行）',
    trim($) {
      const tables = $('table').toArray();
      const hit = tables.find(table => {
        const head = $(table).find('tr').first().text();
        return /provider/i.test(head) && /deal|discount/i.test(head);
      });
      return hit ? $.html(hit) : null;
    }
  },
  'cn_qianfan.deals': {
    url: 'https://cloud.baidu.com/doc/qianfan/s/Imi2rpirg',
    what: '第一张含「赠送 / Tokens / 服务名称 / 有效期」表头的免费额度表',
    trim($) {
      const tables = $('table').toArray();
      const hit = tables.find(table => {
        const head = $(table).find('tr').first().text();
        return /赠送|Tokens/i.test(head) && /服务名称|有效期/i.test(head);
      });
      return hit ? $.html(hit) : null;
    }
  },
  'futuretools.list': {
    url: 'https://www.futuretools.io/',
    what: `前 ${MAX_CARDS} 个 \`a[href^="/tools/"]\` 卡片（保留其 p.text-sm / p.text-xs 子节点）`,
    trim($) {
      const nodes = $('a[href^="/tools/"]').slice(0, MAX_CARDS).toArray();
      return nodes.length ? nodes.map(node => $.html(node)).join('\n') : null;
    }
  },
  'futurepedia.list': {
    url: 'https://www.futurepedia.io/',
    what: `前 ${MAX_CARDS} 个 \`a[href*="/tool/"]\` 卡片（保留其可见文本）`,
    trim($) {
      const nodes = $('a[href*="/tool/"]').slice(0, MAX_CARDS).toArray();
      return nodes.length ? nodes.map(node => $.html(node)).join('\n') : null;
    }
  },
  // OpenRouter：来源本身就是 JSON API。fixture 保留「最小真实 JSON 片段」——
  // 3 个免费模型（含 :free 与非 :free 两种）+ 3 个付费模型，覆盖免费判据的两侧。
  'openrouter.models': {
    url: 'https://openrouter.ai/api/v1/models',
    what: '前 3 个免费模型 + 前 3 个付费模型的 JSON 片段（只保留解析器读的字段）',
    kind: 'json',
    trim(raw) {
      let payload;
      try {
        payload = JSON.parse(String(raw || ''));
      } catch (error) {
        return null;
      }
      const list = payload && Array.isArray(payload.data) ? payload.data : null;
      if (!list) return null;
      const isFree = item => item && item.pricing && item.pricing.prompt === '0';
      const picked = [...list.filter(isFree).slice(0, 3), ...list.filter(item => !isFree(item)).slice(0, 3)];
      if (!picked.length) return null;
      return JSON.stringify({ data: picked.map(projectOpenRouterModel) });
    }
  },
  // AppSumo：数据在 <script id="__NEXT_DATA__"> 的 JSON 里，不是 DOM 表格。
  // 所以剪裁不是「挑节点」，而是「把 JSON 投影成解析器真正读的字段」——
  // raw: true 表示跳过 minimize()（那一步会删掉 <script>，正好把唯一的数据源删没）。
  'appsumo.deals': {
    url: 'https://appsumo.com/collections/new/',
    what: `前 ${APP_SUMO_FIXTURE_DEALS} 条 deal 的 __NEXT_DATA__ 片段（只保留解析器读的字段；AI/非 AI、有价/无价混合）`,
    kind: 'raw-html',
    trim($) {
      const script = $('script#__NEXT_DATA__[type="application/json"]').first();
      if (!script.length) return null;
      let payload;
      try {
        payload = JSON.parse(script.text());
      } catch (error) {
        return null;
      }
      const deals = payload && payload.props && payload.props.pageProps &&
        payload.props.pageProps.deals && payload.props.pageProps.deals.deals;
      if (!Array.isArray(deals) || !deals.length) return null;
      const projected = deals.slice(0, APP_SUMO_FIXTURE_DEALS).map(projectAppSumoDeal);
      const nextData = { props: { pageProps: { deals: { deals: projected } } } };
      return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
    }
  }
};

/**
 * AppSumo fixture 的字段投影：**只留生产解析器读的字段**。
 * 保留 full deal 对象会把 AppSumo 的一堆图片/评论/营销字段带进仓库（体积与版权都不该）。
 */
function projectAppSumoDeal(raw) {
  const deal = raw && typeof raw === 'object' ? raw : {};
  const attributes = deal.attributes && typeof deal.attributes === 'object' ? deal.attributes : {};
  const dates = deal.dates && typeof deal.dates === 'object' ? deal.dates : {};
  return {
    public_name: deal.public_name,
    get_absolute_url: deal.get_absolute_url,
    slug: deal.slug,
    product_tags: deal.product_tags,
    card_description: deal.card_description,
    price: deal.price,
    original_price: deal.original_price,
    has_started: deal.has_started,
    has_ended: deal.has_ended,
    browse_deal_status: deal.browse_deal_status,
    unique_plan_types: deal.unique_plan_types,
    attributes: {
      category: attributes.category,
      subcategory: attributes.subcategory,
      group: attributes.group
    },
    dates: { start_date: dates.start_date, end_date: dates.end_date }
  };
}

/**
 * OpenRouter fixture 的字段投影：只留生产解析器读的字段。
 * `pricing` 只留 prompt/completion 两个数（其余是营销字段），`per_request_limits` 原样保留
 * （它在真实样本里是 null，fixture 里保留这个事实本身）。
 */
function projectOpenRouterModel(raw) {
  const model = raw && typeof raw === 'object' ? raw : {};
  const pricing = model.pricing && typeof model.pricing === 'object' ? model.pricing : {};
  return {
    id: model.id,
    name: model.name,
    created: model.created,
    expiration_date: model.expiration_date,
    context_length: model.context_length,
    description: model.description,
    pricing: { prompt: pricing.prompt, completion: pricing.completion },
    per_request_limits: model.per_request_limits
  };
}

function wrap(fragment, title) {
  return [
    '<!doctype html>',
    '<!-- 最小 DOM 片段 fixture：只保留解析器依赖的节点与属性，正文已被裁剪。',
    `     出处与重建方法见同目录 PROVENANCE.md。 -->`,
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${title}</title>`,
    '</head><body>',
    fragment,
    '</body></html>',
    ''
  ].join('\n');
}

/** 解析器只读 class 与 href（以及 meta 的 name/content），其余属性全是体积 */
const KEEP_ATTRS = new Set(['class', 'href', 'name', 'content', 'src', 'type', 'property']);
const DROP_TAGS = ['script', 'style', 'svg', 'noscript', 'template', 'iframe', 'link', 'img', 'path', 'use', 'defs', 'symbol'];

/**
 * 最小化片段：去掉解析器不读的标签与属性，压掉空白。
 * 这一步是**体积与版权**的关口：现代前端一页里 90% 的字节是内联样式与脚本，
 * 而解析器一个都不需要。
 */
function minimize(fragment) {
  const $ = cheerio.load(`<body>${fragment}</body>`);
  for (const tag of DROP_TAGS) $(tag).remove();
  $('*').each((_, el) => {
    if (!el.attribs) return;
    for (const name of Object.keys(el.attribs)) {
      if (!KEEP_ATTRS.has(name.toLowerCase())) delete el.attribs[name];
    }
  });
  return $('body').html() || '';
}

function findBySource(sourceId) {
  return registry.all().find(entry => entry.id === sourceId) || null;
}

/** 片段上的解析结果必须是整页结果里同一批条目的子集（去掉重复后的逐条相等） */
function assertSubset(fullItems, trimmedItems) {
  const key = item => JSON.stringify(item);
  const fullKeys = new Set(fullItems.map(key));
  const missing = trimmedItems.filter(item => !fullKeys.has(key(item)));
  return missing;
}

async function buildOne(fixtureName, { write = true } = {}) {
  const rule = TRIMS[fixtureName];
  if (!rule) throw new Error(`不知道 fixture ${fixtureName} 的剪裁规则`);
  const sourceId = fixtureName.split('.')[0];
  const entry = findBySource(sourceId);
  if (!entry || typeof entry.parse !== 'function') {
    throw new Error(`采集器 ${sourceId} 没有导出纯解析函数 parse()`);
  }

  const html = await http.getText(rule.url, { timeout: 30000 });
  const fullItems = entry.parse(html);

  // 三种输入形态（v2.2 起）：
  //  · html（默认）      —— 从 DOM 里剪节点，再自动最小化；
  //  · raw-html          —— 剪出来的东西本身必须原样保留（AppSumo 的数据在 <script> JSON 里，
  //                          minimize() 会删 script，所以不能走默认路径）；
  //  · json / xml        —— 来源本身就是 API/feed（OpenRouter、RSS），剪裁函数直接处理原文，
  //                          fixture 文件名相应为 page.min.json / page.min.xml。
  let fixtureText;
  let fixtureFile = 'page.min.html';
  if (rule.kind === 'json' || rule.kind === 'xml') {
    const trimmed = rule.trim(html);
    if (!trimmed) throw new Error(`${fixtureName}：原文里找不到规则描述的那块数据（接口可能已改版）`);
    fixtureText = trimmed;
    fixtureFile = rule.kind === 'json' ? 'page.min.json' : 'page.min.xml';
  } else {
    const $ = cheerio.load(html);
    const fragment = rule.trim($);
    if (!fragment) throw new Error(`${fixtureName}：整页里找不到规则描述的那块 DOM（页面可能已改版）`);
    fixtureText = rule.kind === 'raw-html' ? wrap(fragment, fixtureName) : wrap(minimize(fragment), fixtureName);
  }

  const trimmedItems = entry.parse(fixtureText);
  if (!trimmedItems.length) {
    throw new Error(`${fixtureName}：片段上解析出 0 条 —— 剪裁把解析器需要的东西剪掉了`);
  }
  const missing = assertSubset(fullItems, trimmedItems);
  if (missing.length) {
    throw new Error(`${fixtureName}：片段解析出的 ${missing.length} 条与整页结果不一致（剪裁改变了语义）`);
  }
  const bytes = Buffer.byteLength(fixtureText);
  if (bytes > MAX_FIXTURE_BYTES) {
    throw new Error(`${fixtureName}：片段 ${bytes} 字节 > 上限 ${MAX_FIXTURE_BYTES}`);
  }

  const dir = path.join(FIXTURES_DIR, fixtureName);
  const expected = {
    schemaVersion: 1,
    source: sourceId,
    sourceName: entry.name,
    fixture: fixtureName,
    sourceUrl: rule.url,
    capturedAt: todayCN(),
    trimmed: rule.what,
    note: 'expected 是**生产解析器在这个最小片段上的真实输出**；重建后请人工 review diff。',
    count: trimmedItems.length,
    items: trimmedItems
  };

  if (write) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fixtureFile), fixtureText, 'utf8');
    fs.writeFileSync(path.join(dir, 'expected.json'), `${JSON.stringify(expected, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(dir, 'PROVENANCE.md'),
      provenanceOf(fixtureName, rule, entry, bytes, trimmedItems.length, fullItems.length, fixtureFile), 'utf8');
  }

  return { fixtureName, bytes, trimmedItems: trimmedItems.length, fullItems: fullItems.length, dir };
}

function provenanceOf(fixtureName, rule, entry, bytes, trimmedCount, fullCount, fixtureFile = 'page.min.html') {
  return `# fixture 出处：${fixtureName}

| 项 | 值 |
|---|---|
| 来源页面 | ${rule.url} |
| 采集器 | \`${entry.id}\`（${entry.name}） |
| 抓取日期 | ${todayCN()} |
| 保留的内容 | ${rule.what} |
| 片段文件 | \`${fixtureFile}\` |
| 片段体积 | ${bytes} 字节（上限 ${MAX_FIXTURE_BYTES}） |
| 片段解析条数 | ${trimmedCount} |
| 同规则整页解析条数 | ${fullCount} |

## 为什么要这个文件

盘古之白一样的道理：一份测试数据如果说不清"从哪来、裁掉了什么、为什么这么裁"，
半年后就没人敢改它了。这里只保留**解析器真正读的那些节点**，
页面正文（介绍文案、导航、页脚）全部裁掉 —— 既有体积的原因，也有版权的原因：
第三方页面的正文不该成批进入我们的仓库，而我们需要的只是"结构还在不在"。

## 版权

片段来自公开页面，仅保留为验证解析器所必需的**结构与最小文本**（表格单元格、卡片标题）。
如权利人提出异议，删除对应目录即可 —— \`scripts/tools/fixture-test.js\` 会跳过缺失的 fixture，
解析器本身不依赖它运行。

## 怎么重建

\`\`\`bash
node scripts/tools/build-fixtures.js --source=${entry.id}
node scripts/tools/fixture-test.js
\`\`\`

重建会随官方页面变化而变化，所以**重建后要看 diff 再提交**：
只在"页面真的变了"时才该有变化；如果没动页面而 diff 变了，那是解析器行为变了。
`;
}

async function main() {
  const all = flag('all');
  const source = option('source');
  const names = all ? Object.keys(TRIMS) : Object.keys(TRIMS).filter(name => name.split('.')[0] === source);

  if (!all && !source) {
    console.error(`用法：node scripts/tools/build-fixtures.js --source=<${[...new Set(Object.keys(TRIMS).map(n => n.split('.')[0]))].join('|')}> 或 --all`);
    process.exit(1);
  }
  if (!names.length) {
    console.error(`没有名为 ${source} 的 fixture 规则（可用：${Object.keys(TRIMS).join(' / ')}）`);
    process.exit(1);
  }

  let failed = 0;
  for (const name of names) {
    try {
      const result = await buildOne(name, { write: !flag('dry-run') });
      console.log(`✅ ${name}：片段 ${result.bytes} 字节 / ${result.trimmedItems} 条（整页 ${result.fullItems} 条）→ ${path.relative(ROOT, result.dir)}`);
    } catch (error) {
      failed++;
      console.error(`✗ ${name}：${error.message}`);
    }
  }
  console.log(`\n${names.length - failed}/${names.length} 个 fixture 已重建`);
  process.exit(failed ? 1 : 0);
}

main().catch(error => {
  console.error(`fixture 重建失败：${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
