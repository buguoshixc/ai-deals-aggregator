/**
 * `/search/` 全站搜索页的**静态目录**与样式（唯一渲染实现）。
 *
 * ## 无 JS 也必须可读
 *
 * 构建期把 `search-index.js` 推导出的**全部条目**写进 HTML：分组、计数、每条一个真链接。
 * 浏览器侧的过滤脚本只是**渐进增强** —— 它隐藏不匹配的 `<li>`，不改变任何一条的内容。
 * 因此「零 JS」不是降级版：目录本来就是完整的，搜索框只是把眼睛移到想要的那一段。
 *
 * ## 计数与对账
 *
 * 每个分组标题旁带 `data-search-count="<kind>"`，数字来自同一份 `entries` 的分组计数；
 * 构建期自检会从盘上产物回读这些 `data-*` 与 `<li>` 数，再与索引推导对账 ——
 * 页面上写 36 条而列表里 35 条，构建就红。
 *
 * ## 纪律
 *
 * 不评分、不排序推荐、不拼外部 URL；`null` 字段不渲染占位词（宁可少一行副标题）。
 * 所有文本经 `site.xmlEscape` 转义（`&` / `<` / `>` / `"` / `'` 五字符）。
 */
'use strict';

const site = require('./site');
const searchIndex = require('./search-index');

const SEARCH_ROUTE = 'search/';
const SEARCH_TITLE = '全站搜索';
const SEARCH_DESCRIPTION = '按关键词找优惠、工具、Coding 套餐、API 计费、模型与厂商资料：目录是静态的，无 JS 也能读，输入关键词只是把列表收窄。';

const SEARCH_PAGE_CSS = `  .swrap { margin: 0 0 var(--s4); }
  .sintro { color: var(--mut); font-size: var(--fs-sm); margin: 0 0 var(--s3); }
  .sbox { display: flex; gap: var(--s3); flex-wrap: wrap; align-items: center; margin: 0 0 var(--s4); }
  .sbox label { display: flex; gap: 6px; align-items: center; color: var(--mut); font-size: var(--fs-sm); }
  .sbox input[type="search"] {
    border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--card);
    color: var(--ink); padding: 8px 10px; font: inherit; font-size: var(--fs-base); min-width: 28ch;
  }
  .sbox input[type="search"]:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
  .sstatus { margin: 0; color: var(--mut); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
  .sgroup { margin: 0 0 var(--s4); border-top: 1px solid var(--line); padding-top: var(--s3); }
  .sgroup h2 { font-size: 15px; margin: 0 0 var(--s2); display: flex; gap: var(--s2); align-items: baseline; }
  .sgcount { color: var(--mut); font-weight: 400; font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
  .slist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .sitem { background: var(--card); border: 1px solid var(--line); border-radius: var(--r); padding: 9px 12px; }
  .sitem[hidden] { display: none; }
  .sitem a { color: var(--ink); text-decoration: none; font-weight: 600; }
  .sitem a:hover { color: var(--brand); text-decoration: underline; }
  .ssub { display: block; color: var(--mut); font-size: var(--fs-sm); margin-top: 2px; word-break: break-word; }
  .sempty { color: var(--mut); margin: var(--s3) 0; }
  .sempty[hidden] { display: none; }
  @media (max-width: 760px) { .sbox input[type="search"] { min-width: 0; width: 100%; } .sbox label { flex: 1 1 100%; } }`;

function linkHrefOf(url, prefix) {
  return `${prefix}${url}`;
}

/**
 * @param {object} input
 * @param {{entries:object[], counts:object, dropped:number}} input.index
 * @param {string} input.prefix 站根相对的深度前缀（/search/ 是 '../'）
 * @param {string} [input.asOf] 数据基准日（只用于页脚注释，不参与过滤）
 * @returns {string}
 */
function renderSearchPage({ index, prefix = '../' }) {
  if (!index || !Array.isArray(index.entries)) {
    throw new Error('全站搜索：renderSearchPage 需要 buildSearchIndex() 的结果（entries 数组）');
  }
  const entries = index.entries;
  const total = entries.length;
  const groups = [];
  for (const meta of searchIndex.SEARCH_KINDS) {
    const items = entries.filter(entry => entry.kind === meta.kind);
    if (!items.length) continue;
    const rows = items.map(entry => {
      const href = site.xmlEscape(linkHrefOf(entry.url, prefix));
      const keywords = site.xmlEscape(entry.keywords);
      const subtitle = entry.subtitle
        ? `\n          <span class="ssub">${site.xmlEscape(entry.subtitle)}</span>`
        : '';
      return `        <li class="sitem" data-search-kind="${site.xmlEscape(entry.kind)}" data-keywords="${keywords}">
          <a href="${href}">${site.xmlEscape(entry.title)}</a>${subtitle}
        </li>`;
    }).join('\n');
    groups.push(`      <section class="sgroup" data-search-group="${site.xmlEscape(meta.kind)}">
        <h2>${site.xmlEscape(meta.label)} <span class="sgcount" data-search-count="${site.xmlEscape(meta.kind)}">${items.length}</span></h2>
        <ul class="slist">
${rows}
        </ul>
      </section>`);
  }

  return `      <div class="swrap">
        <h1>${site.xmlEscape(SEARCH_TITLE)}</h1>
        <p class="sintro">${site.xmlEscape(SEARCH_DESCRIPTION)}</p>
        <div class="sbox">
          <label for="siteSearchInput">在目录里找：<input type="search" id="siteSearchInput" name="q" autocomplete="off" spellcheck="false" placeholder="例如 deepseek、学生、免费 API"></label>
          <p class="sstatus" id="searchStatus" aria-live="polite">共 ${total} 条</p>
        </div>
        <p class="sempty" id="searchEmpty" hidden>没有匹配的条目 —— 换一个关键词试试；清空搜索框会回到完整目录。</p>
${groups.join('\n')}
      </div>`;
}

function searchPageJsonLd() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: SEARCH_TITLE,
      description: SEARCH_DESCRIPTION,
      url: `${site.SITE_URL}${SEARCH_ROUTE}`,
      isPartOf: { '@type': 'WebSite', name: site.SITE_NAME, url: site.SITE_URL }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: site.SITE_URL },
        { '@type': 'ListItem', position: 2, name: SEARCH_TITLE, item: `${site.SITE_URL}${SEARCH_ROUTE}` }
      ]
    }
  ];
}

module.exports = {
  SEARCH_ROUTE,
  SEARCH_TITLE,
  SEARCH_DESCRIPTION,
  SEARCH_PAGE_CSS,
  renderSearchPage,
  searchPageJsonLd
};
