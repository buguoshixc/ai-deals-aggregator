/**
 * `/docs/data/` 数据文档与引用页（v1.8-seo-answer-pages；**部分反转** t4「去数据暴露」）。
 *
 * ## 为什么这一页又回来了
 *
 * t4 把「面向读者的数据文件 / JSON 暴露」整族下架，理由是站点定位是内容网站而不是数据出口。
 * 本轮用户显式要求把**数据集许可与包装**做回来 —— 但范围与当年不同：
 *
 *   · **不重新发布数据文件**（产物里仍然没有 `deals.json` / `data/index.json` 这类下载面，
 *     `lib/published-assets.js` 的逐路径登记制不变）；
 *   · 数据真值留在**公开仓库**里，这一页只说明「有哪些数据、什么许可、怎么引用、怎么核对口径」；
 *   · 这是本站在这个 host 上唯一能换来**外链与被引用**的钩子：数据可自由引用，注明来源与数据日期。
 *
 * ## 两套许可（与根目录文件一一对应）
 *
 *   · 代码 —— `LICENSE`（MIT）；
 *   · 数据 —— `LICENSE-DATA`（CC BY 4.0），覆盖哪些文件逐条写在该文件里。
 *
 * ## 纪律
 *
 *   · **数字全部现算**：schemaVersion / 记录数 / 数据日期由构建期从真实文件读出来传进来
 *     （本模块是纯函数，不读盘）；手写一个「156 条」在这里会随数据漂移。
 *   · **不写第二份 URL 字面量**：站点地址与仓库地址都由调用方传入（唯一出处分别是
 *     `lib/site.js` 与 `index.html` 的 `REPO_URL`）。
 *   · **不出现 `.snote` / `.pnote` / `.vsnote`**：那三类是页面级说明容器，各有维护口径与几何
 *     判据（notes-manifest-v1）；本页用 `.dd-*` 自己的类名，一次性把三套判据都绕开。
 *
 * ## 失效方式
 *
 * 若哪天数据文件被改名 / 搬到别处，而这里仍指着旧路径：页面上的仓库链接会 404，但构建不会红
 * （外链不在站内链接存在性判据的射程内）。所以数据集清单是**显式注册表**（`DATASETS`），
 * 构建期按它读真实文件；读不到即构建硬失败 —— 「清单里写着、文件不存在」不允许静默上线。
 */

'use strict';

const DATA_DOCS_ROUTE = 'docs/data/';
const DATA_DOCS_HEADING = '数据文档与引用';
const DATA_DOCS_DESCRIPTION = '本站数据集的许可与引用方式：优惠 / Coding 套餐 / API 计费 / 模型身份'
  + '四份数据与三份变化日志按 CC BY 4.0 发布，代码按 MIT 发布。附引用格式、字段口径与数据日期。';

/**
 * 数据集注册表（唯一出处）。`file` 是**仓库根相对路径**；构建期按它读真实文件并把
 * `schemaVersion` / `count` / `updatedAt` 传进来 —— 本模块不猜、不写死任何数字。
 */
const DATASETS = [
  {
    file: 'deals.json',
    label: '优惠数据',
    what: '当前收录的优惠：资格门槛、福利类型、地区可用性、领取要求、来源与官方引文。',
    updatedAtField: 'updatedAt',
    schemaField: 'schemaVersion',
    countField: 'count'
  },
  {
    file: 'plans.json',
    label: 'Coding 套餐数据',
    what: '长期在售的 AI Coding 套餐：价格、计费周期、可用模型、原始额度与额度类型。',
    updatedAtField: 'updatedAt',
    schemaField: 'schemaVersion',
    countField: 'count'
  },
  {
    file: 'api-plans.json',
    label: 'API 计费数据',
    what: '按量计费的官方单价与限制：模型计价条目、免费额度、限流 / 公平使用 / 地区限制。',
    updatedAtField: 'updatedAt',
    schemaField: 'schemaVersion',
    countField: 'count'
  },
  {
    file: 'models.json',
    label: '模型身份索引',
    what: '模型身份与别名归一：一个模型一条身份，供页面、历史日志与映射共同引用。',
    updatedAtField: 'updatedAt',
    schemaField: 'schemaVersion',
    countField: 'count'
  }
];

/**
 * 变化日志注册表。它们没有 `updatedAt` —— 时间是「起算日 + 追加事件」的形状，
 * 所以单独一栏说明（不混进上面的表：两类数据的时间口径不同，混在一起会误导引用者）。
 */
const HISTORY_LOGS = [
  { file: 'scripts/data/deal-history.json', label: '优惠变化日志' },
  { file: 'scripts/data/plan-history.json', label: 'Coding 套餐变化日志' },
  { file: 'scripts/data/api-plan-history.json', label: 'API 计费变化日志' }
];

function escapeHtml(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(value) {
  const text = String(value || '');
  return text ? text.slice(0, 10) : '未标注';
}

/** 仓库里的文件链接（`repoUrl` 由调用方从 `index.html` 的 REPO_URL 传入，本模块不写死）。 */
function repoHref(repoUrl, file) {
  return `${String(repoUrl).replace(/\/+$/, '')}/blob/master/${file}`;
}

/**
 * @param {object} ctx
 *   `{ datasets, historyLogs, asOf, siteUrl, repoUrl, reportUrl, license, codeLicense }`
 *   `datasets` 每项在注册表字段之外带 `schemaVersion` / `count` / `updatedAt`（构建期读真实文件得到）。
 * @returns {{ body: string, jsonLd: object[] }}
 */
function renderDataDocsPage(ctx = {}) {
  const datasets = Array.isArray(ctx.datasets) ? ctx.datasets : [];
  const historyLogs = Array.isArray(ctx.historyLogs) ? ctx.historyLogs : [];
  const siteUrl = String(ctx.siteUrl || '');
  const repoUrl = String(ctx.repoUrl || '');
  const asOf = formatDate(ctx.asOf);
  const pageUrl = `${siteUrl}${DATA_DOCS_ROUTE}`;
  const cite = `AI 优惠聚合器（数据日期 ${asOf}），${pageUrl}`;

  const rows = datasets.map(entry => `        <tr>
          <th scope="row"><a href="${escapeHtml(repoHref(repoUrl, entry.file))}">${escapeHtml(entry.file)}</a><small>${escapeHtml(entry.label)}</small></th>
          <td>${escapeHtml(entry.what)}</td>
          <td>v${escapeHtml(entry.schemaVersion)}</td>
          <td>${escapeHtml(String(entry.count))}</td>
          <td>${escapeHtml(formatDate(entry.updatedAt))}</td>
          <td>CC BY 4.0</td>
        </tr>`).join('\n');
  const historyRows = historyLogs.map(entry => `        <tr>
          <th scope="row"><a href="${escapeHtml(repoHref(repoUrl, entry.file))}">${escapeHtml(entry.file)}</a><small>${escapeHtml(entry.label)}</small></th>
          <td>${escapeHtml(formatDate(entry.startedAt))} 起</td>
          <td>${escapeHtml(String(entry.count))} 条</td>
          <td>一次性基线 + 追加事件；时间口径是「观测日」，不是厂商发布日。</td>
        </tr>`).join('\n');

  const body = `      <nav class="crumb" aria-label="面包屑"><a href="../../">首页</a> › <span>${escapeHtml(DATA_DOCS_HEADING)}</span></nav>

      <div class="stop">
        <h1>${escapeHtml(DATA_DOCS_HEADING)}</h1>
        <span class="meta">数据日期 ${escapeHtml(asOf)} · ${datasets.length} 份数据集 + ${historyLogs.length} 份变化日志</span>
      </div>

      <p class="dd-intro">本站的页面背后是一组可追溯的数据。数据按 <b>CC BY 4.0</b> 发布、代码按 <b>MIT</b> 发布，<b>可以自由引用与再分发</b>；引用时请注明来源「AI 优惠聚合器」与<b>数据日期</b>。数据真值在公开仓库里维护，本站不提供镜像下载，避免出现「线上副本与仓库副本两份真值」。</p>

      <h2 class="dd-h2" id="license">许可：代码与数据分开授权</h2>
      <ul class="dd-list">
        <li><b>数据</b>：CC BY 4.0 —— 适用文件逐条写在仓库根的 <code>LICENSE-DATA</code> 里。可以复制、聚合、商用，只要署名并注明数据日期与改动。</li>
        <li><b>代码</b>：MIT —— 见仓库根的 <code>LICENSE</code>。构建脚本、页面模板、样式与交互逻辑属于代码。</li>
        <li><b>不属于数据许可</b>：厂商名称 / 商标 / logo 归各厂商；官方页文案的版权归各厂商，数据里只做最小必要摘录并保留 <code>sourceUrl</code> 与采集日期。</li>
      </ul>

      <h2 class="dd-h2" id="datasets">数据集清单（数字由构建期从真实文件现算）</h2>
      <div class="dd-table-wrap">
      <table class="dd-table">
        <caption>按仓库根路径列出；每份文件的 schemaVersion / 记录数 / 数据日期都从文件本身读出。</caption>
        <thead>
          <tr><th scope="col">文件</th><th scope="col">内容</th><th scope="col">schema</th><th scope="col">记录数</th><th scope="col">数据日期</th><th scope="col">许可</th></tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
      </div>

      <h2 class="dd-h2" id="history">变化日志</h2>
      <div class="dd-table-wrap">
      <table class="dd-table">
        <caption>三份日志都是「一次性基线 + 追加事件」，与上面的数据文件分开引用（时间口径不同）。</caption>
        <thead>
          <tr><th scope="col">文件</th><th scope="col">起始</th><th scope="col">事件数</th><th scope="col">口径</th></tr>
        </thead>
        <tbody>
${historyRows}
        </tbody>
      </table>
      </div>

      <h2 class="dd-h2" id="cite">怎么引用</h2>
      <p class="dd-p">推荐引用格式（可直接改成你用的语言）：</p>
      <p class="dd-cite"><code>${escapeHtml(cite)}</code></p>
      <ul class="dd-list">
        <li>数据日期取你引用的那份文件的 <code>updatedAt</code>（变化日志用起算日 + 事件日期），不是本文的发布时间。</li>
        <li>做过筛选 / 聚合 / 字段换算的，请注明「基于原始数据整理」并说明改动，便于他人复核。</li>
        <li>引用某一条事实时，优先同时给出该条目的 <code>sourceUrl</code>（厂商官方页）与本站数据日期。</li>
      </ul>

      <h2 class="dd-h2" id="semantics">字段口径（引用前先读）</h2>
      <ul class="dd-list">
        <li><code>null</code> / <code>unknown</code> / <code>0</code> 三者含义不同：<code>0</code> 只表示官方明确为 0 / 免费；<code>null</code> 表示官方没有公布；<code>unknown</code> 表示我们查过但不知道 —— <b>缺证据不等于否定</b>。</li>
        <li>资格门槛（实名 / 学生 / 教育邮箱 / 新用户 / 信用卡）是三态字段；免费额度带 <code>stability</code>，区分「长期提供」「新用户赠送」「限时赠送」。</li>
        <li>API 计价的单位永远是文件里写出来的口径（例如「每 100 万 tokens」），<b>不跨单位换算</b>；「不可商用」这一维度本站数据目前没有结构化收录（页面显示「数据未收录」，不代表允许商用）。</li>
        <li>数据按「现状」提供，不附带担保；价格与资格政策会变，**以厂商官方页面为准**。</li>
      </ul>

      <p class="dd-foot">发现数据与官方页不一致？<a href="${escapeHtml(ctx.reportUrl || '')}">提一个数据修正 issue</a>（预填标题，不需要表单服务）。</p>
`;
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: DATA_DOCS_HEADING, item: pageUrl }
      ]
    },
    ...datasets.map(entry => ({
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: `AI 优惠聚合器 · ${entry.label}`,
      description: entry.what,
      url: `${siteUrl}${DATA_DOCS_ROUTE}`,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      creator: { '@type': 'Organization', name: 'AI 优惠聚合器', url: siteUrl },
      dateModified: formatDate(entry.updatedAt),
      isAccessibleForFree: true,
      distribution: {
        '@type': 'DataDownload',
        contentUrl: repoHref(repoUrl, entry.file),
        encodingFormat: 'application/json'
      }
    }))
  ];
  return { body, jsonLd };
}

module.exports = {
  DATA_DOCS_ROUTE,
  DATA_DOCS_HEADING,
  DATA_DOCS_DESCRIPTION,
  DATASETS,
  HISTORY_LOGS,
  renderDataDocsPage
};
