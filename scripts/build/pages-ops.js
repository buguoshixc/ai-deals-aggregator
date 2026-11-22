'use strict';
/**
 * 运维 / 变化 / 套餐 / API 计费 / 成本计算器页面渲染器，从 scripts/tools/build-local.js 拆出。
 */
const fs = require('fs');
const path = require('path');
const appAsset = require('../lib/app-asset');
const styleAsset = require('../lib/style-asset');
const health = require('../lib/health');
const feed = require('../lib/feed');
const calendar = require('../lib/calendar');
const changes = require('../lib/changes');
const site = require('../lib/site');
const seo = require('../lib/seo');
const plansPage = require('../lib/plans-page');
const apiPlansPage = require('../lib/api-plans-page');
const apiCostPage = require('../lib/api-cost-page');
const plansHubPage = require('../lib/plans-hub-page');
const priceHistory = require('../lib/price-history');
const shell = require('../lib/page-shell');
const planChanges = require('../lib/plan-changes');

const { SITE_URL, SITE_NAME, xmlEscape } = site;
const htmlEscape = xmlEscape;

function createOpsPages({
  ROOT,
  ROUTE_HREFS,
  plansCompareSource,
  apiCostSource,
  noteDeclare,
  notePage,
  noteDeclarerFor,
  decodeEntities
}) {
/* ------------------------------------------------------------------ */
/* 数据源状态页（/status/）                                             */
/* ------------------------------------------------------------------ */

/**
 * 「数据源状态」静态页。
 *
 * 给谁看：项目维护者、技术用户、以及任何想核对「这个站到底还在不在更新」的人。
 * 它回答的是采集报告回答不了的那个问题：**某个来源是不是已经坏了几天**
 * （报告表只活在当次运行的内存里，而 store.js 会把策展条目的 lastSeen 刷成今天，
 * 于是「源坏了」与「源这次没新内容」在首页上长得一模一样）。
 *
 * 实现取舍：
 *  · 不引入任何外部请求，复用 index.html 的 `<style>` / 主题前置脚本 / 页脚，
 *    与详情页同一套抽取方式（样式只有一处，不会漂移）；
 *  · **构建确定性**：页面上只写绝对时间（北京时间），相对时间（「2 小时前」）由一个
 *    内联小脚本在浏览器里换算 —— 否则同一个数据在不同时刻构建会产出不同字节，
 *    与「连续两次 build 产物一致」的规矩冲突；无 JS 时读到的仍是完整信息。
 *  · 数据缺失（还没有过一次成功采集）时生成一页说明，而不是让构建失败。
 */
function renderStatusPage(healthDoc, indexHtml, route = 'status/') {
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS, appAsset.SOURCE, styleAsset.FILE);
  const summary = health.summarize(healthDoc);
  const rows = summary.rows;

  // 标题与描述各只写一遍：它们同时出现在 <title> / <meta description> / 面包屑 / <h1> /
  // JSON-LD 里（5 处）。抄 5 份的后果不是「不一致得很难看」，而是**搜索引擎读到的那份
  // 与读者看到的那份不是同一句话**，而两边都不会报错。
  const STATUS_HEADING = '数据源状态';
  const STATUS_DESCRIPTION = '每个采集来源的最近一次结果：条数变化、最近成功时间、连续失败次数。用于核对本站的数据是不是真的还在更新。';

  // JSON-LD：#1 WebPage、#2 BreadcrumbList。
  //
  // 与分类页同一条约定：**一段一个对象**（塞成数组时 `JSON.parse(block)['@type']` 得到
  // undefined，自检既不抛错也不命中 —— 分类页第一版就是这么写的，被自检当场拦下）。
  //
  // 为什么不给这张表再发一份 `ItemList` / `Dataset`：这张表是**运维观测**，不是内容集合；
  // 同一份事实的另一份机器可读形态另有其物（`source-health.json` —— t3 起页面不再链它，
  // 但文件本身与数据侧的对账都还在）。把同一份事实声明两次，两次迟早会分家，
  // 而分家时**没有任何东西会红**（两边各自看都自洽）。宁可少声明一次。
  const jsonLdBlocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `${STATUS_HEADING} · ${SITE_NAME}`,
      description: STATUS_DESCRIPTION,
      url: `${SITE_URL}status/`,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: STATUS_HEADING, item: `${SITE_URL}status/` }
      ]
    }
  ].map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  const rowHtml = row => {
    const label = health.STATUS_LABEL[row.status] || row.status;
    const reason = row.reason ? (health.REASON_LABEL[row.reason] || row.reason) : '';
    const missing = row.lastRunMissing ? '<small>本轮未跑（沿用上次结果）</small>' : '';
    // P3 熔断：暂停来源必须**行内可见**（而不是只改个状态）——「某个源已经停了」与
    // 「今天没数据」长得一样正是本页当初要修的问题，熔断不能把它带回来。
    // 文案与判定只来自 health.pausedLabel()（与 collect Summary、coverage 报告共用一份）；
    // 时间一律绝对北京时间（本页构建确定性：不读墙上时钟，相对时间交给 data-rel 脚本）。
    // ⚠️ 这里刻意**不用** class="stt"：下面构建期自检按 `<span class="stt ...">` 数状态行，
    //    暂停标记若也带 stt 会被当成一行状态，把「页面状态序列 == 数据状态序列」判红。
    const paused = row.pausedAt ? `<small class="paused">${htmlEscape(health.pausedLabel(row))}</small>` : '';
    return `
        <tr>
          <th scope="row">${htmlEscape(row.name || row.source)}<small>${htmlEscape(row.source)} · ${
  row.kind === 'headless' ? '无头浏览器' : '静态抓取'}${row.region === 'cn' ? ' · 国内' : ' · 国外'}</small>${missing}</th>
          <td class="st"><span class="stt ${htmlEscape(row.status)}">${htmlEscape(label)}</span>${
  reason ? `<small>${htmlEscape(reason)}</small>` : ''}${paused}</td>
          <td class="num">${Number(row.lastItemCount) || 0}</td>
          <td class="num">${row.previousItemCount === null || row.previousItemCount === undefined ? '—' : Number(row.previousItemCount)}</td>
          <td class="num">${Number(row.consecutiveFailures) || 0} / ${Number(row.consecutiveZero) || 0}</td>
          <td><time datetime="${htmlEscape(row.lastSuccessAt || '')}" data-rel>${htmlEscape(health.formatCN(row.lastSuccessAt))}</time></td>
        </tr>`;
  };

  const body = rows.length
    ? rows.map(rowHtml).join('')
    : '<tr><td colspan="6">还没有采集记录：这份文件由 `node scripts/collect.js` 写入，第一次采集成功后这里会有数据。</td></tr>';

  // 本页独有的部分（页面级 CSS / 面包屑 / 页面脚本 / 订阅标签说明）逐字保留，
  // 只把**文档脚手架**交给页面壳：共享 `<style>`、主题前置脚本、共享页头、共享页脚、
  // 以及收尾的 finalizePage —— 此前这一族各写了一份，实测与其余 8 族逐字相同。
  const pageCss = `  /* 只用首页已有的设计变量，不新建一套视觉语言 */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
  .stable { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .stable caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }
  .stable th, .stable td { text-align: left; padding: 10px 12px; border-top: 1px solid var(--line); font-weight: 400; font-size: var(--fs-sm); vertical-align: top; }
  .stable thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .stable tbody th { font-weight: 600; }
  .stable small { display: block; color: var(--mut); font-weight: 400; font-size: 11.5px; margin-top: 2px; }
  .stable .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .stt { display: inline-block; padding: 2px 8px; border-radius: var(--r-pill); border: 1px solid var(--line); white-space: nowrap; }
  .stt.healthy { color: var(--ok, #137a4b); border-color: currentColor; }
  .stt.degraded { color: var(--warn, #a35a00); border-color: currentColor; }
  .stt.failed { color: var(--bad, #b3261e); border-color: currentColor; }
  .stable small.paused { color: var(--bad, #b3261e); }
  .stable-wrap { overflow-x: auto; }
  @media (max-width: 760px) { .stable th, .stable td { padding: 8px 9px; } }`;
  /* 相对时间只在浏览器里换算：页面字节因此与构建时刻无关（连续两次 build 产物一致）。
     禁用 JS 时读到的仍是完整的绝对时间。 */
  const pageScript = `    (function () {
      document.body.classList.add('js');
      var now = Date.now();
      Array.prototype.forEach.call(document.querySelectorAll('time[data-rel]'), function (el) {
        var at = Date.parse(el.getAttribute('datetime'));
        if (isNaN(at)) return;
        var minutes = Math.round((now - at) / 60000);
        var text = minutes < 1 ? '刚刚'
          : minutes < 60 ? minutes + ' 分钟前'
            : minutes < 1440 ? Math.round(minutes / 60) + ' 小时前'
              : Math.round(minutes / 1440) + ' 天前';
        el.setAttribute('title', el.textContent);
        el.textContent = text;
      });
    })();`;
  // 说明意图（notes-manifest-v1）：状态页页面级说明**恰好一条**（判读口径）。
  // ⚠️ t3：原先还有第二条「机器可读的同一份数据：source-health.json」—— 那一条**整条删除**
  // （连同它的 `noteDeclare` 分支），因为本轮的目标是站点不再面向读者暴露数据文件。
  // 删条数必须同步改下面的 floors：不同步 ⇒ 「清单声明 2 条 / DOM 1 条」当场红（幽灵声明）。
  notePage(route, { kind: 'status', floors: { 'main-snote': { min: 1 } } });
  return `${shell.docStart({
    kind: 'status',
    route,
    prefix: '../',
    parts,
    title: `${htmlEscape(STATUS_HEADING)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(STATUS_DESCRIPTION),
    canonicalUrl: `${SITE_URL}status/`,
    faviconHref: '../favicon.svg',
    extraCss: pageCss,
    jsonLdHtml: jsonLdBlocks,
    where: 'renderStatusPage'
  })}
      <nav class="crumb" aria-label="面包屑"><a href="../">首页</a> › <span>${htmlEscape(STATUS_HEADING)}</span></nav>

      <div class="stop">
        <h1>${htmlEscape(STATUS_HEADING)}</h1>
        <span class="meta">数据生成时间 ${htmlEscape(health.formatCN(healthDoc && healthDoc.generatedAt))}（北京时间）</span>
      </div>
${noteDeclare(route, {
    kind: 'status-reading-guide', slot: 'main-snote', classes: 'snote',
    declaredBy: 'build-local.js:renderStatusPage(判读口径)'
  }, `      <p class="snote">
        这一页列出每个采集来源<b>最近一次</b>的结果与跨运行的连续性。
        采集器报错、或连续 3 次零产出即 <b>❌ 失败</b>；请求成功但条数掉到上次一半以下、
        或零产出但还没到 3 次即 <b>⚠️ 异常</b>；其余为 <b>✅ 正常</b>。
        「连续失败 / 连续零产出」两列分别是这两个计数器的当前值。
        <b>⏸ 已暂停（熔断）</b>：连续 ${health.CIRCUIT_FAILURE_THRESHOLD} 次<b>采集器报错</b>后暂停，
        满 ${health.HALF_OPEN_AFTER_DAYS} 天<b>半开重试一次</b>；零产出不进入熔断。
      </p>`)}

      <div class="stable-wrap">
      <table class="stable">
        <caption>共 ${summary.total} 个来源 · 正常 ${summary.healthy} · 异常 ${summary.degraded} · 失败 ${summary.failed}${
  summary.paused ? ` · ⏸ 熔断暂停 ${summary.paused}` : ''}</caption>
        <thead>
          <tr>
            <th scope="col">来源</th>
            <th scope="col">状态</th>
            <th scope="col" class="num">本次条数</th>
            <th scope="col" class="num">上次条数</th>
            <th scope="col" class="num">连续失败 / 零产出</th>
            <th scope="col">最近成功</th>
          </tr>
        </thead>
        <tbody>${body}
        </tbody>
      </table>
      </div>

${shell.docEnd({ route, prefix: '../', parts, extraScript: pageScript, where: 'renderStatusPage' })}`;
}

/* ------------------------------------------------------------------ */
/* Codex 额度重置档案页（/codex-reset/，B 包）                           */
/* ------------------------------------------------------------------ */

/**
 * Codex 额度重置档案：数据文件（仓库根，与 deals.json / api-plans.json 同级）。
 *
 * 数据链路的边界：
 *   · 采集器 `scripts/collectors/codex-resets.js` 每日两次抓 `https://codex-resets.com/api/resets`，
 *     校验后写入这份文件（fail-closed：任何一步失败都不覆盖旧文件）；
 *   · 构建期**只读这份文件，不碰网络、不读墙钟** —— 页面上的「数据截至」「距上次重置」
 *     全部由文件里的 `fetchedAt` 算死，连续两次构建逐字节一致；
 *   · 因此外部源挂掉时这一页**照常构建**，只是「数据截至」停在上一份成功快照的时间上。
 * 数据完整判据在 `scripts/validate.js`（零依赖裸跑）；这里只做「形状不对就明确失败」。
 */
const CODEX_RESETS_FILE = 'codex-resets.json';
/** `/codex-reset/` 的路由（sitemap / SEO 描述符 / 页脚扫描 / 构建产物共用同一个字面量） */
const CODEX_RESETS_ROUTE = 'codex-reset/';
/** 英文原文摘录上限（字符）；超长截断必须留痕（见 codexExcerptOf） */
const CODEX_EXCERPT_LIMIT = 140;

function loadCodexResets() {
  const file = path.join(ROOT, CODEX_RESETS_FILE);
  if (!fs.existsSync(file)) {
    throw new Error(`缺少 ${CODEX_RESETS_FILE}：它由 scripts/collectors/codex-resets.js 采集写入；`
      + '构建不会现抓外部源（确定性），首次部署前请先跑 npm run collect:codex');
  }
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${CODEX_RESETS_FILE} 不是合法 JSON：${error.message}`);
  }
  const problems = [];
  if (!doc || doc.schemaVersion !== 1) problems.push('schemaVersion 不是 1');
  if (!doc || !doc.stats || typeof doc.stats !== 'object') problems.push('缺少 stats');
  if (!doc || !Array.isArray(doc.events) || !doc.events.length) problems.push('events 缺失或为空');
  if (!doc || !doc.fetchedAt || Number.isNaN(Date.parse(doc.fetchedAt))) problems.push('fetchedAt 不可解析');
  if (doc && doc.stats) {
    if (!doc.stats.lastResetAt || Number.isNaN(Date.parse(doc.stats.lastResetAt))) problems.push('stats.lastResetAt 不可解析');
    if (!Number.isFinite(Number(doc.stats.avgIntervalDays))) problems.push('stats.avgIntervalDays 不是数字');
    if (Number(doc.stats.total) !== (Array.isArray(doc.events) ? doc.events.length : -1)) problems.push('stats.total 与 events 条数不一致');
  }
  if (problems.length) throw new Error(`${CODEX_RESETS_FILE} 形状不符：${problems.join('；')}`);
  return doc;
}

/**
 * 北京时间「YYYY-MM-DD HH:mm」。
 * ⚠️ 构建确定性：只换算数据文件里落盘的 ISO，**不读墙钟**（与 /status/ 的 data-rel 脚本同一条纪律：
 * 页面上只写绝对时间，相对时间要换算也在构建期内从数据时间算死）。
 */
function beijingMinuteOf(iso) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '未知';
  const shifted = new Date(time + 8 * 3600 * 1000);
  const pad = value => String(value).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} `
    + `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** 距上次重置（天，一位小数）：按**数据文件里的 fetchedAt** 现算，构建期内算死。 */
function daysBetween(fetchedAt, fromIso) {
  const a = Date.parse(fetchedAt);
  const b = Date.parse(fromIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = (a - b) / 86400000;
  if (!Number.isFinite(days) || days < 0) return null;
  return Math.round(days * 10) / 10;
}

/**
 * 英文原文摘录：≤140 字符；超长截断留痕。
 *
 * ⚠️ 页面诚实性守卫：这一页上不许出现 ASCII 百分号（verify-site 的「预测 / 概率 / %」判红）。
 * 原始事件里有少量正文带百分号，摘录在**第一个 `%` 之前按词边界**截断 —— 原文一个字符都不改，
 * 只是截得更早，而截断本身有留痕（「原文共 N 字符，此处截断」），读者仍可点原推读全文。
 */
function codexExcerptOf(text) {
  const plain = String(text || '').replace(/\s+/g, ' ').trim();
  let cut = Math.min(plain.length, CODEX_EXCERPT_LIMIT);
  let truncated = plain.length > CODEX_EXCERPT_LIMIT;
  const percentAt = plain.indexOf('%');
  if (percentAt !== -1 && percentAt < cut) {
    cut = percentAt;
    const spaceAt = plain.lastIndexOf(' ', cut - 1);
    if (spaceAt >= 40) cut = spaceAt;
    truncated = true;
  }
  return { body: plain.slice(0, cut).trim(), truncated, total: plain.length };
}

/** 类型 / 收录来源的展示标签（英文枚举原文另以小字给出，不替读者翻译成结论）。 */
const CODEX_TYPE_LABEL = { regular: '全局重置', banked: '可储存重置' };
const CODEX_SOURCE_LABEL = { webhook: '实时收录', observed: '事后观测收录', backfill: '历史回填' };

/**
 * 渲染 `/codex-reset/`（Codex 额度重置档案）。
 *
 * 三块内容，顺序固定：
 *   ① 口径块（数据来源 / 数据截至 / 不预测下一次重置 / 同一事件可能被收录多次）；
 *   ② 三个数字（累计记录条数 / 平均间隔 / 距上次重置）；
 *   ③ 时间线（全部事件倒序；每条 = 北京时间 + 类型标签 + 收录来源 + 英文原文摘录 + 原推链接）。
 *
 * **纯静态**：不注入任何页面脚本（没有需要交互的东西），无 JS 也完整可读；
 * `scripts/lib/page-shell.js` 统一负责 <head>、共享样式、页头页脚与分析注入。
 */
function renderCodexResetsPage(codex, indexHtml) {
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS, appAsset.SOURCE, styleAsset.FILE);
  const route = CODEX_RESETS_ROUTE;
  const prefix = '../';
  const events = Array.isArray(codex.events) ? codex.events : [];
  const total = events.length;
  const fetchedCN = beijingMinuteOf(codex.fetchedAt);
  const lastCN = beijingMinuteOf(codex.stats.lastResetAt);
  const sinceDays = daysBetween(codex.fetchedAt, codex.stats.lastResetAt);
  const sinceText = sinceDays === null ? '—' : sinceDays.toFixed(1);
  const avgDays = Number(codex.stats.avgIntervalDays);
  const avgText = Number.isFinite(avgDays) ? (Math.round(avgDays * 10) / 10).toFixed(1) : '—';
  const pageUrl = `${SITE_URL}${route}`;
  const heading = 'Codex 额度重置档案';
  // description 也进「预测 / 概率 / %」的扫描面（它出现在原始 HTML 的 <head>）—— 措辞里刻意不含这三个词。
  const description = `Codex 额度重置事件档案：累计 ${total} 条记录，时间线逐条给出原推链接；`
    + `数据截至 ${fetchedCN}（北京时间）。本页只记录已发生的事件。`;

  const jsonLdBlocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `${heading} · ${SITE_NAME}`,
      description,
      url: pageUrl,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: heading, item: pageUrl }
      ]
    }
  ].map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  const rows = events.map(event => {
    const typeLabel = CODEX_TYPE_LABEL[event.resetType] || event.resetType;
    const sourceLabel = CODEX_SOURCE_LABEL[event.source] || event.source;
    const excerpt = codexExcerptOf(event.text);
    const cutoff = excerpt.truncated
      ? ` <span class="cx-cut">…（原文共 ${excerpt.total} 字符，此处截断）</span>`
      : '';
    return `
        <tr data-codex-event="${htmlEscape(event.tweetId)}" data-reset-type="${htmlEscape(event.resetType)}" data-source="${htmlEscape(event.source)}">
          <td class="cx-when"><time datetime="${htmlEscape(event.announcedAt)}">${htmlEscape(beijingMinuteOf(event.announcedAt))}</time></td>
          <td><span class="cx-type cx-type-${htmlEscape(event.resetType)}">${htmlEscape(typeLabel)}</span></td>
          <td class="cx-src"><span>${htmlEscape(sourceLabel)}</span><small>${htmlEscape(event.source)}</small></td>
          <td><p class="cx-text">${htmlEscape(excerpt.body)}${cutoff}</p></td>
          <td><a class="cx-orig" href="${htmlEscape(event.tweetUrl)}" target="_blank" rel="noopener noreferrer">原推 →</a></td>
        </tr>`;
  }).join('');

  const pageCss = `  /* B 包：/codex-reset/ 档案页。只用首页已有的设计变量，不新建视觉语言。 */
  .cx-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(11em, 1fr)); gap: var(--s2); margin: 0 0 var(--s3); }
  .cx-stat { border: 1px solid var(--line); border-radius: var(--r); background: var(--card); padding: var(--s3); }
  .cx-stat b { display: block; font-size: 24px; color: var(--ink); font-variant-numeric: tabular-nums; }
  .cx-stat span { display: block; color: var(--mut); font-size: var(--fs-sm); margin-top: 2px; }
  .cx-stats-note { margin: calc(-1 * var(--s1)) 0 var(--s3); color: var(--mut); font-size: var(--fs-sm); }
  .cx-table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .cx-table caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }
  .cx-table th, .cx-table td { text-align: left; padding: 10px 12px; border-top: 1px solid var(--line); font-weight: 400; font-size: var(--fs-sm); vertical-align: top; }
  .cx-table thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .cx-when { white-space: nowrap; color: var(--ink2); font-variant-numeric: tabular-nums; }
  .cx-type { display: inline-block; padding: 2px 8px; border-radius: var(--r-pill); border: 1px solid currentColor; white-space: nowrap; }
  .cx-type-regular { color: var(--brand); }
  .cx-type-banked { color: var(--warn, #a35a00); }
  .cx-src { white-space: nowrap; color: var(--ink2); }
  .cx-src small { display: block; color: var(--mut); font-size: 11.5px; }
  .cx-text { margin: 0; color: var(--ink2); line-height: 1.7; overflow-wrap: anywhere; }
  .cx-cut { color: var(--mut); font-size: 11.5px; }
  .cx-orig { color: var(--brand); text-decoration: none; white-space: nowrap; }
  .cx-orig:hover { text-decoration: underline; text-underline-offset: 2px; }
  .cx-scope { margin: var(--s3) 0 0; color: var(--mut); font-size: var(--fs-sm); line-height: 1.8; }
  .cx-rel { margin: var(--s2) 0 0; color: var(--ink2); font-size: var(--fs-sm); }
  .cx-rel a { color: var(--brand); }
  .cx-scope a, .cx-rel a { text-decoration: none; }
  .cx-scope a:hover, .cx-rel a:hover { text-decoration: underline; text-underline-offset: 2px; }
  .cx-table-wrap { overflow-x: auto; }
  @media (max-width: 760px) { .cx-table th, .cx-table td { padding: 8px 9px; } }`;

  // 说明意图（notes-manifest-v1）：这一页**恰好一条**页面级说明（口径块），走 noteDeclare
  // 登记（先登记、后输出）。长度控制在桌面档 ≤2 行：它落在首个数据区（.cx-table）之前，
  // 属于 §22c 的「首屏说明」，上限 2 行；更长的口径放在时间线之后的 .cx-scope 里。
  notePage(route, { kind: 'codex-reset', floors: { 'main-snote': { min: 1 } } });
  const scopeNote = noteDeclare(route, {
    kind: 'codex-reset-scope', slot: 'main-snote', classes: 'snote',
    declaredBy: 'build-local.js:renderCodexResetsPage(口径块)'
  }, `      <p class="snote">
        数据来源：X 上 <a href="https://x.com/thsottiaux" target="_blank" rel="noopener noreferrer">@thsottiaux</a>
        的推文（<a href="https://codex-resets.com" target="_blank" rel="noopener noreferrer">codex-resets.com</a> 收录；每条记录的原推链接都逐条给出）。
        <b>数据截至 ${htmlEscape(fetchedCN)}（北京时间）</b>。本页不预测下一次重置；同一事件可能被收录多次，如实逐条列出、不做合并去重。
      </p>`);

  return `${shell.docStart({
    kind: 'codex-reset',
    route,
    prefix,
    parts,
    title: `${htmlEscape(heading)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(description),
    canonicalUrl: pageUrl,
    hreflang: [
      { hreflang: 'zh-CN', href: htmlEscape(pageUrl) },
      { hreflang: 'x-default', href: htmlEscape(pageUrl) }
    ],
    faviconHref: `${prefix}favicon.svg`,
    extraCss: pageCss,
    jsonLdHtml: jsonLdBlocks,
    where: 'renderCodexResetsPage'
  })}
      <nav class="crumb" aria-label="面包屑"><a href="../">首页</a> › <span>${htmlEscape(heading)}</span></nav>

      <div class="stop">
        <h1>${htmlEscape(heading)}</h1>
        <span class="meta">数据截至 ${htmlEscape(fetchedCN)}（北京时间）</span>
      </div>
${scopeNote}

      <div class="cx-stats">
        <div class="cx-stat"><b>${total}</b><span>累计记录条数</span></div>
        <div class="cx-stat"><b>${htmlEscape(avgText)}</b><span>平均间隔（天）</span></div>
        <div class="cx-stat"><b>${htmlEscape(sinceText)}</b><span>距上次重置（天）</span></div>
      </div>
      <p class="cx-stats-note">距上次重置 = 数据截至时间 − 最近一次记录的发布时间（${htmlEscape(lastCN)}，北京时间）；三个数字都只由已记录的事件算出。</p>

      <div class="cx-table-wrap">
      <table class="stable cx-table" data-codex-total="${total}">
        <caption>共 ${total} 条重置记录（按发布时间倒序 · 同一事件可能被收录多次，未合并）</caption>
        <thead>
          <tr>
            <th scope="col">发布时间（北京时间）</th>
            <th scope="col">类型</th>
            <th scope="col">收录来源</th>
            <th scope="col">英文原文摘录（≤${CODEX_EXCERPT_LIMIT} 字符）</th>
            <th scope="col">原推</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
      </div>

      <p class="cx-scope">
        口径：采集每日两次（北京时间约 08:00 / 20:00），本页最长滞后约 12 小时 —— 它是档案，不是实时监控，请按页面上的「数据截至」判断新鲜度。
        收录方 codex-resets.com 只是收集者；每条记录的第一手证据是原推链接（发布账号与发布时间都由 X 的原推给出）。
        英文原文按原样摘录、不做翻译（只清理空白与超长截断），以免把发布者的话改写成本站的结论。
        平均间隔按全部已记录事件的相邻间隔计算；本页不提供任何前瞻性判断。
      </p>
      <p class="cx-rel">相关：<a href="../plans/coding/">AI Coding 套餐价格对比</a>（月付价格与额度口径在那一页；本页只记额度重置事件）。</p>

${shell.docEnd({ route, prefix, parts, where: 'renderCodexResetsPage' })}`;
}

/* ------------------------------------------------------------------ */
/* 变化雷达页（/changes/，v1.5）                                        */
/* ------------------------------------------------------------------ */

/**
 * 「优惠变化雷达」静态页：把首页那一行条带展开成五个分栏的完整视图。
 *
 * 与 `/status/`、目录页同一套做法（同一个 `<style>`、同一份页脚、同样的五条约定），
 * 但有两点是这一页特有的：
 *
 *   ① **正文由 RENDER-CORE 渲染**（`renderCore.changesPageHtml`），与首页条带共用模板；
 *      页面壳子（head / 面包屑 / 页脚）留在这里，因为那部分与站点其它页面必须逐字一致。
 *   ② 它是**数据的视图，不是数据的家**：真值是 `scripts/data/deal-history.json`，
 *      这里一个字节都不生成。日志不可用时这一页照常存在（路由不能凭空消失），
 *      但正文必须说「没有拿到历史日志」，而不是「没有变化」。
 */
/**
 * 给 `/changes/` 正文里的**代表行**补上 SEO 门禁数行用的 `data-item` 标记。
 *
 * ## 为什么是「代表行」而不是每一行
 *
 * 同一记录可以合法地出现在多个分栏里（一条优惠可以既有「最近 7 天变化」又有「已结束」
 * 与「重新出现」）。ItemList 是**记录级**视图：一个记录只能有一个 URL —— 发两条相同 URL
 * 既是重复计数，也会让「声明数 == 元素数 == 页面行数」这条对账永远差几条。
 * 所以两边共用 `changes.itemListRecords()` 给出的同一份集合（每个 id 一条，取最强事件），
 * 行标记只落在该记录**代表那一行**上；其余行照常显示（弱事件不因为不进 ItemList 而消失）。
 *
 * ## 为什么按「文档顺序 + 出现次数」定位
 *
 * RENDER-CORE（`index.html`）只给每行写 `data-kind` 与 `data-deal-id`，不写 `data-item`：
 * 那是**构建期**的决定（哪一行代表这条记录），不是模板的决定。顺序判据在
 * `changes.renderOrderOf()`，这里逐行回读核对（行数不等 / 代表行找不到都算失败），
 * 因此「判据与渲染分家」会在构建期就红，而不是变成读者页面上对不上的结构化数据。
 *
 * @param {string} body        `renderCore.changesPageHtml()` 的输出
 * @param {object[]} records   `changes.itemListRecords()` 的输出
 * @param {number} expectedRows 判据层的渲染顺序长度
 */
function markChangesRows(body, records, expectedRows) {
  const problems = [];
  const wanted = new Map();
  for (const record of records) wanted.set(`${record.id}\u0000${record.occurrence}`, record);
  const seen = new Map();
  let rows = 0;
  let marked = 0;
  const html = String(body || '').replace(
    /<li class="chgi" data-kind="([^"]*)" data-deal-id="([^"]*)">/g,
    (match, kindAttr, idAttr) => {
      rows++;
      const id = decodeEntities(idAttr);
      const occurrence = seen.get(id) || 0;
      seen.set(id, occurrence + 1);
      if (!wanted.has(`${id}\u0000${occurrence}`)) return match;
      marked++;
      return `<li class="chgi" data-item="${idAttr}" data-kind="${kindAttr}" data-deal-id="${idAttr}">`;
    }
  );
  if (rows !== expectedRows) {
    problems.push(`页面上的变化行 ${rows} 行 ≠ 判据层的渲染顺序 ${expectedRows} 项（分栏被裁剪或模板改了顺序？）`);
  }
  if (marked !== records.length) {
    problems.push(`ItemList 有 ${records.length} 条，页面上只标出了 ${marked} 条代表行`);
  }
  return { html, rows, marked, problems };
}

function renderChangesPage(radar, indexHtml, renderCore, context = {}) {
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS, appAsset.SOURCE, styleAsset.FILE);

  const W = changes.CHANGES_WORDING;
  const PAGE_HEADING = W.CHANGES_LABELS.pageTitle;
  const PAGE_DESCRIPTION = '优惠的变化按时间看：今日新增、最近 7 天变化、即将结束、已结束、重新出现。' +
    '全部来自本站采集与合并过程留下的变更记录，不猜测、不做语义改写。';
  const pageUrl = `${SITE_URL}changes/`;

  // JSON-LD：#1 CollectionPage、#2 BreadcrumbList、#3 ItemList。
  // 一段一个对象（塞成数组时自检读到的 @type 是 undefined，既不抛错也不命中）。
  //
  // ItemList 只收**真有详情页**的条目：给「已离开数据集」的条目发一个不存在的 URL，
  // 就是在结构化数据里造死链 —— 那比少声明几条更糟。
  //
  // v1.5 修复（P1-4 / F-r1-history-ai-001）：`numberOfItems` 与 `itemListElement`
  // 必须是**同一次**集合、且**按记录去重**（一个记录同时出现在多个分栏时只算一条，
  // 取最强事件——判据在 `changes.itemListRecords()`，与页面行标记共用）。
  // 修复前的写法是「声明数 = 五栏 totals 合计（含状态量与不可链接条目）vs 元素 = 按栏遍历的
  // 未去重列表」：只要有 1 条变化，两边就不可能相等，`itemlist-arity` 必红。
  const itemListRecords = changes.itemListRecords(radar);
  const jsonLdBlocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${PAGE_HEADING} · ${SITE_NAME}`,
      description: PAGE_DESCRIPTION,
      url: pageUrl,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: PAGE_HEADING, item: pageUrl }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: PAGE_HEADING,
      numberOfItems: itemListRecords.length,
      itemListElement: itemListRecords.map((record, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}${record.href}`,
        name: record.name
      }))
    }
  ].map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  // 页面行标记：与上面的 ItemList 读**同一份**集合的同一个 `occurrence`。
  // 没有这一步，`page-kinds.js` 对 `changes` 声明的 `checkRows/checkMembers` 就是
  // 「声明它必须对账、却没有任何标记可对」—— 上一轮审计里 9 条 `itemlist-members`
  // 与 2 条 `itemlist-arity` 正是这么来的。
  // 说明意图（notes-manifest-residual-v1）：正文里的 `.snote` 现在由 RENDER-CORE 的
  // `changesPageHtml(radar, prefix, note)` 在**构造点**逐条登记（第三个参数是登记入口）。
  const marked = markChangesRows(renderCore.changesPageHtml(radar, '../', noteDeclarerFor('changes/')), itemListRecords, changes.renderOrderOf(radar).length);
  if (marked.problems.length) {
    throw new Error(`/changes/ 的行标记与雷达不一致（判据与渲染分家了）：\n  - ${marked.problems.slice(0, 5).join('\n  - ')}`);
  }
  const dealsBody = marked.html
    .split('\n').map(line => `        ${line}`).join('\n');
  // v2.3：套餐变化。**不新做一页**：这一页本来就是「最近发生了什么变化」的落点，
  // 顶部加一行锚点导航把两块分开，block 由 `plans-page.js` 渲染（与套餐页共用同一句话）。
  const planBlock = context.planChanges
    ? plansPage.planChangesPageBlockHtml(context.planChanges, {
      prefix: '../',
      providerTable: context.providerTable || null,
      // 与 `/plans/coding/` 的那一块传**同一份上下文**：币种 / 额度单位 / 平台显示名
      // 都从套餐记录里取，同一件事在两页上才是同一句话（见 context.plansById 的注释）。
      plansById: context.plansById || null,
      note: noteDeclarerFor('changes/')
    })
      .split('\n').map(line => `      ${line}`).join('\n')
    : '';
  // v3.0 Stage H：API 价格变化。**同样不新做一页** —— 这一页的任务就是回答
  // 「最近发生了什么变化」，而 API 计费的价格/模型/免费额度/限速变化是第三条独立的变化流
  // （另 一份数据、另 一份日志、另 一个起算日）。块由 `api-plans-page.js` 渲染，
  // 与 `/plans/api/` 共用同一句话（判据来自 `api-plan-history`，没有第二套变化检测）。
  const apiPlanBlock = context.apiPlanChanges
    ? apiPlansPage.apiPlanChangesPageBlockHtml(context.apiPlanChanges, {
      prefix: '../', providerTable: context.providerTable || null, note: noteDeclarerFor('changes/')
    })
      .split('\n').map(line => `      ${line}`).join('\n')
    : '';
  const jumpNav = `      <nav class="chgjump" aria-label="变化分区">
        <a href="#deals">优惠变化</a>
        <span aria-hidden="true">·</span>
        <a href="#plans">套餐变化</a>
        <span aria-hidden="true">·</span>
        <a href="#api-plans">API 价格变化</a>
      </nav>
`;
  const body = `${jumpNav}      <section class="chgdeals" id="deals" aria-label="优惠变化">
${dealsBody}
      </section>

${planBlock}
${apiPlanBlock}`;

  // 面包屑属于**这一页的正文**（页壳只管文档脚手架），与正文拼在一起传给页壳。
  // v3.4 F2：这一页的**可见**日历入口（不进 <head>：那 2 条 alternate 只登记订阅流）。
  // 放在面包屑之后、第一个分栏之前 —— 读到「即将结束」那一段时不必再滚到页脚。
  // 正文里的链接用**本页深度**的相对路径，文件名从唯一表现取（不写第二份字面量）；
  // 不走 `__CALENDAR_HREF__`：那个占位符只由页壳解析页脚模板，正文里的它不会被替换。
  const calendarLine = noteDeclare('changes/', {
    kind: 'calendar-entry', slot: 'main-snote', classes: 'snote chgcal',
    declaredBy: 'build-local.js:renderChangesPage(calendar-entry)'
  }, `      <p class="snote chgcal">按截止日期看同一批条目：`
    + `<a href="../${calendar.CALENDAR_FILES[0][0]}" type="text/calendar" title="订阅到期日历（.ics）：把即将到期的截止日期加进你自己的日历">到期日历（.ics）</a>`
    + `（收录 30 天内到期、且当前仍有效的记录）。</p>\n`);
  const bodyHtml = `      <nav class="crumb" aria-label="面包屑"><a href="../">首页</a> › <span>${htmlEscape(PAGE_HEADING)}</span></nav>
${calendarLine}${body}`;
  return shell.renderWidePageShell({
    kind: 'changes',
    route: 'changes/',
    prefix: '../',
    parts,
    title: `${htmlEscape(PAGE_HEADING)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(PAGE_DESCRIPTION),
    canonicalUrl: pageUrl,
    faviconHref: '../favicon.svg',
    // v3.2：这一页的**订阅声明**（两条，绝对 URL）。契约第 2.3 条的固定形态：文件名与 MIME 都从
    // `FEED_FILES` 现取（本文件里 0 个文件名 / MIME 字面量），href 一律 `SITE_URL` 开头。
    // 页壳（`docStart`）把它插在 hreflang 之后、OG 之前；**不传**该参数的页面族产物逐字节不变。
    // v3.4 F2：日历入口**不进 <head> 的订阅声明面**。那 2 条 alternate 是「订阅流」的登记面，
    // L4 的 subscriptionDeclarationProblem() 要求带 type 的 alternate 恰好等于 FEED_FILES 的条数；
    // 日历不是订阅流（它是同一批条目的另一种组织方式），所以入口只放在可见正文与共享页脚：
    // due 视图的 stats 行 + index.html 页脚 + /changes/ 正文顶部那一行。
    feedTagsHtml: feed.FEED_FILES
      .map(([file, type]) => `<link rel="alternate" type="${type}" href="${SITE_URL}${file}">`)
      .join('\n'),
    extraCss: `  /* 只用首页已有的设计变量，不新建一套视觉语言。
     列表式（不是宽表）：手机上自然换行、不产生横向滚动 —— 与目录页的表格相反，
     这里每行都有一段可能很长的原文（原值 → 新值），表格会把手机变成横向滚动条。 */
  .chgmeta { display: flex; align-items: baseline; gap: var(--s3); flex-wrap: wrap; color: var(--mut); font-size: var(--fs-sm); margin: 0 0 var(--s3); }
  .snote.chgwarn { color: var(--warn, #a35a00); }
  .chgsec { margin: 0 0 var(--s4); border-top: 1px solid var(--line); padding-top: var(--s3); }
  .chgsec h2 { font-size: 15px; margin: 0 0 var(--s2); }
  .chglist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .chgi { background: var(--card); border: 1px solid var(--line); border-radius: var(--r); padding: 10px 12px; }
  .chgh { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--s2); font-size: var(--fs-sm); }
  .chgh time { color: var(--mut); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .chgt { color: var(--deal-ink); background: var(--dealsoft); border-radius: var(--r-sm); padding: 0 var(--s1); font-weight: 600; }
  .chgf { color: var(--mut); }
  .chgn { color: var(--ink); font-weight: 600; text-decoration: none; overflow-wrap: anywhere; }
  a.chgn:hover { color: var(--brand); text-decoration: underline; text-underline-offset: 2px; }
  a.chgn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
  .chgv { display: grid; gap: 2px; margin-top: 4px; font-size: var(--fs-sm); overflow-wrap: anywhere; }
  .chgv .chgold { color: var(--mut); }
  .chgv .chgnew { color: var(--ink); }
  .chgv .chgnote { color: var(--mut); font-size: 11.5px; }
  .chgempty, .chgmore { color: var(--mut); font-size: var(--fs-sm); margin: 0; }
  .chgother { margin: var(--s4) 0 0; border-top: 1px solid var(--line); padding-top: var(--s3); }
  .chgother > summary { cursor: pointer; font-size: 14px; font-weight: 600; color: var(--ink2); }
  .chgother > summary:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
  .chgother[open] > summary { margin-bottom: var(--s3); }
  /* v2.3：套餐变化块（与 /plans/coding/ 的最近变化块共用同一套行样式）。 */
  .chgjump { display: flex; gap: var(--s2); align-items: baseline; margin: 0 0 var(--s3); font-size: var(--fs-sm); }
  .chgjump a { color: var(--brand); text-decoration: none; border-bottom: 1px dotted var(--line); }
  .chgsub { margin: var(--s3) 0 0; }
  .chgsub h3 { font-size: 13.5px; margin: 0 0 var(--s1); color: var(--ink2); }
  .pchglist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .pchglist li { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; font-size: var(--fs-sm); }
  .pchgwhen { color: var(--mut); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pchgwho { color: var(--ink); text-decoration: none; }
  a.pchgwho { border-bottom: 1px dotted var(--line); }
  .pchgtype { color: var(--deal-ink); background: var(--dealsoft); border-radius: var(--r-sm); padding: 0 var(--s1); }
  .pchgwhat { color: var(--ink); }
  .pchgorigin { color: var(--mut); }
  .pchnone { color: var(--mut); font-size: var(--fs-sm); margin: 0; }
  .chgsec.pchanges { margin-top: var(--s4); }
  /* v3.0 Stage H：API 价格变化块（与套餐那一块同一条间隔纪律）。 */
  .chgsec.apichanges { margin-top: var(--s4); }
  @media (max-width: 760px) {
    .chgi { padding: 9px 10px; }
    .chgh { gap: 2px var(--s2); }
  }`,
    jsonLdHtml: jsonLdBlocks,
    bodyHtml,
    where: 'renderChangesPage'
  });
}

/* ------------------------------------------------------------------ */
/* 套餐对比页（/plans/coding/，v2.1 第二段）                             */
/* ------------------------------------------------------------------ */

/**
 * 套餐对比页。
 *
 * ## 为什么它是「独立路由」而不是落地页家族的一员
 *
 * `landing.js` 的 `planLandingPages()` 产出的每一页都是**按数据分组的家族**
 * （一个厂商一页、一个分类一页，`itemsOf()` 用 `match.by` 决定谁属于哪一页）。
 * 套餐对比页只有**一条**路由 `/plans/coding/`，它不分页也不需要门槛 ——
 * 硬把它塞进那张家族表，会为了「统一」而引入一条永远只有一个成员的注册表。
 * 所以它走的是 `/status/` `/changes/` `/feeds/` 那一条既有路径：**独立静态页**。
 * 代价是三张清单（sitemap 计数、`pageRoutes`、页脚深度扫描）都要显式加上它 ——
 * 而这正是「新增一条路由是一个决定，不是一次手滑」的落点。
 * ⚠️ v3.2：原先还有第四张「订阅声明扫描」，它**已经不是清单**了：那个块的扫描面是产物里
 * **全部 .html**，新加一族默认就落在「0 条带 type 的声明」那一侧，不必登记；要声明订阅源
 * 则必须先成为那两个登记路由（首页 / `/changes/`）之一，而那是一次显式的契约改动。
 *
 * ## 页面正文不在这里
 *
 * 正文、列模型、诚实性断言都在 `lib/plans-page.js`（纯函数，能被离线自测直接调用）。
/**
 * 套餐对比页 `/plans/coding/` 的**静态表格原语**（宽表 11 列 ⇒ 外层必须有横滚容器）。
 *
 * 与 `STATIC_PAGE_CSS` 是**变体关系而不是同一份**：`.ptable td` 的 `min-width` 是 92px
 * （资料页那五个族是 72px），另有 `.ptag` 与 `.ptable .num small` 两条这里独有。
 * 按本轮审计的纪律「分歧的声明不合并」——先原样保留；要合并必须先证明两条规则真的同值，
 * 否则外观会静默改变，而外观回归**只有真浏览器几何断言抓得到**。
 *
 * ⚠️ 迁移时漏掉这一段一次，症状是 `/plans/coding/` 在 360/390px 出现 290px 页面级横向溢出
 * （`.ptable-wrap` 的 `overflow-x: auto` 没了，634px 的宽表直接撑破 328px 的容器）——
 * 由 `verify-site.js` §22c 的全站几何门禁抓住，构建期自检与静态检查都是绿的。
 * 教训：页壳只接管**文档脚手架**，页面级 CSS 必须显式保留。
 */
const PLANS_TABLE_CSS = `  /* 只用首页已有的设计变量，不新建一套视觉语言。
     这是一张**宽表**（11 列），所以外层必须有横滚容器：
     /status/ 那一页的教训是「桌面端一切正常、手机上整页横滚，而所有静态检查都是绿的」。 */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
  /* ⚠️ 这一页底部的口径文案**不收窄**（v2.2 上线后的修复）。
     早先按"长文段 82ch 更好读"写了个上限，但 ch 量的是 "0" 的宽度（12px 字体下约 6px），
     于是 82ch ≈ 490px —— 正文容器有 1400px，整段只占左边 1/3，句子还被切在词中间
     （「…本页照原样列 / 出，不互相换算」），正文右侧留下一条巨大的空白。
     口径说明是**必须读完才能理解这一页**的内容，宽度就该跟随正文容器；
     想要收窄的是"可选的长文"，不是它。 */
  .ph2 { font-size: 15px; margin: var(--s4) 0 var(--s2); }
  .plist { margin: 0; padding-left: 1.15em; color: var(--mut); font-size: var(--fs-sm); line-height: 1.8; max-width: none; }
  .plist b { color: var(--ink2); }
  .ptable-wrap { overflow-x: auto; }
  .ptable { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .ptable caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }
  .ptable th, .ptable td { text-align: left; padding: 9px 11px; border-top: 1px solid var(--line); font-weight: 400; font-size: var(--fs-sm); vertical-align: top; }
  .ptable thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .ptable tbody th { font-weight: 600; white-space: nowrap; }
  .ptable td { min-width: 92px; }
  .ptable small { display: block; color: var(--mut); font-weight: 400; font-size: 11.5px; margin-top: 2px; line-height: 1.5; }
  .ptable .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ptable .num small { text-align: right; }
  .ptable a { color: var(--brand); }
  .ptag { margin-left: 4px; color: var(--mut); border: 1px solid var(--line); border-radius: var(--r-pill); padding: 0 6px; font-size: 10.5px; }
  .pnone { color: var(--mut); }
  @media (max-width: 760px) { .ptable th, .ptable td { padding: 8px 9px; } }`;

/**
 * 渲染 `/plans/coding/`（Coding Plan 套餐对比页）。
 *
 * ## 为什么它是「独立路由」而不是落地页家族的一员
 *
 * `landing.js` 的 `planLandingPages()` 产出的每一页都是**按数据分组的家族**
 * （一个厂商一页、一个分类一页，`itemsOf()` 用 `match.by` 决定谁属于哪一页）。
 * 套餐对比页只有**一条**路由 `/plans/coding/`，它不分页也不需要门槛 ——
 * 硬把它塞进那张家族表，会为了「统一」而引入一条永远只有一个成员的注册表。
 * 所以它走的是 `/status/` `/changes/` `/feeds/` 那一条既有路径：**独立静态页**。
 * 代价是三张清单（sitemap 计数、`pageRoutes`、页脚深度扫描）都要显式加上它 ——
 * 而这正是「新增一条路由是一个决定，不是一次手滑」的落点。
 * ⚠️ v3.2：原先还有第四张「订阅声明扫描」，它**已经不是清单**了：那个块的扫描面是产物里
 * **全部 .html**，新加一族默认就落在「0 条带 type 的声明」那一侧，不必登记；要声明订阅源
 * 则必须先成为那两个登记路由（首页 / `/changes/`）之一，而那是一次显式的契约改动。
 *
 * ## 页面正文不在这里
 *
 * 正文、列模型、诚实性断言都在 `lib/plans-page.js`（纯函数，能被离线自测直接调用）。
 * 这一层只套壳：`<head>`、主题脚本、页头、页脚、JSON-LD（文档脚手架见 `lib/page-shell.js`）。
 */
function renderPlansPage(planStore, indexHtml, context = {}) {
  const prefix = '../../'; // /plans/coding/ 是两层路由
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS, appAsset.SOURCE, styleAsset.FILE);

  // 【史述·已下架】v2.3 / v3.0：这一页当年**有专属订阅源**（套餐变化），要求在 `<head>` 里
  // 与根 Feed 并列声明它（而不是替换：读者既可以订全站优惠，也可以只订套餐变化）。
  // 订阅层整体下架后页面不再声明任何订阅源，`feedsForPage` 与那份声明一起删除 ——
  // 这一段现在不做任何订阅相关注入。

  const pageUrl = `${SITE_URL}${plansPage.PLANS_ROUTE}`;
  const plans = planStore.plans || [];
  const providerTable = context.providerTable || null;

  // JSON-LD：一段一个对象（塞成数组时自检读到的 @type 是 undefined，既不抛错也不命中）。
  const jsonLdBlocks = plansPage.plansJsonLd(plans, { siteUrl: SITE_URL, providerTable })
    .map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  const body = plansPage.plansPageBody(plans, {
    note: noteDeclarerFor(plansPage.PLANS_ROUTE),
    providerTable,
    planChanges: context.planChanges || null,
    planHistoryStore: context.planHistoryStore || null,
    // v2.4：优惠 ↔ 套餐视图（判据在 lib/deal-plan-links.js，这里只把算好的结果传下去）
    dealLinks: context.dealLinks || null,
    // 价格历史的横轴终点：与首页 / 模型页 / API 计费页共用 deals 数据日期（lastmod）。
    asOf: context.asOf || null,
    prefix
  }) + `
      <p class="pcodex-link">相关：<a href="../../${CODEX_RESETS_ROUTE}">Codex 额度重置档案</a>
        —— 第三方收录的 Codex 额度重置事件与时间线（本页只比较套餐价格与额度口径，不记录重置事件）。</p>`;
  // 说明：上面这段是 B 包要求的「/plans/coding/ ↔ /codex-reset/ 互链」，只追加一段站内导航文字：
  // 不加控件、不动表格、不改任何既有判据；文案里也没有「预测 / 概率 / %」这三个诚实性守卫词。

  const css = `
  /* v2.2：筛选 / 搜索 / 排序 / 行内展开。
     控件块**在构建期由 scripts/lib/plans-compare.js 的 panelHtml(payload) 渲染进静态 HTML**
     （同一文件被逐字节内联在页面底部；面板 HTML 只有这一处出处，init() 写入的是同一份字节）。
     为什么改成构建期：静态里留空壳时 init() 要等到 t≈1.5s 才把容器填成 186–284px 高的控件块
     （高度随断点变），整张一万多像素高的表被整体推下去 ⇒ 一次性 CLS 0.10–0.19
     （实测 390/761/940/1280 四档：0.10469/0.19255/0.14321/0.10001 → 0.00074/0.00979/0.00963/0.01487）。
     代价（本轮显式接受的取舍）：无 JS 时这些控件看得见但点了没反应；由 verify-site.js 的
     NOJS 显式登记豁免码 + metrics 记账，不是漏判。已实测否掉的替代方案：惰性骨架（零表单元素）
     在 390px 会把控件块从 288px 撑到 430px（+142px），升级那一刻反而多出 123–142px 位移。 */
  .pnoscript { margin: 0 0 var(--s2); }
  .pctl { display: flex; flex-direction: column; gap: var(--s1); margin: 0 0 var(--s2); }
  .pctl:empty { display: none; }
  .pcrow { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
  .pclb { color: var(--mut); font-size: var(--fs-sm); }
  .pchips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .pclab { display: inline-flex; align-items: center; gap: 6px; color: var(--mut); font-size: var(--fs-sm); }
  .psearch {
    display: inline-flex; align-items: center; gap: 6px; padding: 0 8px;
    border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--card);
  }
  .psearch input { border: 0; outline: 0; background: 0; padding: 6px 0; font: inherit; font-size: 12px; color: var(--ink); min-width: 10ch; }
  .pctail .pstatus { color: var(--mut); font-size: var(--fs-sm); margin-right: auto; }
  .pdetbtn {
    margin-left: 6px; font: inherit; font-size: 11.5px; color: var(--brand); background: none;
    border: 1px solid var(--line); border-radius: var(--r-pill); padding: 0 8px; cursor: pointer;
  }
  .pdetbtn:hover { border-color: var(--brand); }
  /* hidden 必须真的不显示：作者级声明会盖掉 UA 样式表里的 [hidden]{display:none} */
  .ptable tr[hidden] { display: none; }
  .pdetail td { background: var(--bg); }
  /* 保留窄阅读列（登记：scripts/data/narrow-reading-columns.json）——
     72ch 是阅读行宽，但它长在 ~1386px 宽的表格单元格里 ⇒ 必须按 DESIGN-RULES S4 居中，
     否则就是「另一页的内容贴在左边」的观感。居中与否由 verify-site.js §19 的几何断言判。 */
  .pdetailbody { max-width: 72ch; margin-inline: auto; }
  .pdetailbody dl { display: grid; grid-template-columns: 5.5em minmax(0, 1fr); gap: 2px 8px; margin: 0 0 var(--s2); }
  .pdetailbody dt { color: var(--mut); }
  .pdetailbody dd { margin: 0; }
  .pdetailbody h3 { font-size: 13px; margin: var(--s2) 0 var(--s1); }
  .pev { margin: 0; padding-left: 1.1em; }
  .pev li { margin-bottom: var(--s2); }
  .pevfield { color: var(--mut); }
  .pev q { display: block; margin: 2px 0; }
  .pev small { color: var(--mut); }
  /* v2.3：最近变化块与详情里的时间线。只用首页已有的设计变量，不新建视觉语言。
     块本身是纯静态内容（无控件），因此无 JS 时同样可读 —— 这是这一页「无 JS 可读」的延续。 */
  .pchanges { margin: 0 0 var(--s3); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s3); background: var(--card); }
  .pchanges .ph2 { margin: 0 0 var(--s2); }
  .pchglist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .pchglist li { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; font-size: var(--fs-sm); }
  .pchgwhen { color: var(--mut); font-variant-numeric: tabular-nums; }
  .pchgwho { color: var(--ink); text-decoration: none; }
  a.pchgwho { border-bottom: 1px dotted var(--line); }
  .pchgtype { color: var(--brand); }
  .pchgwhat { color: var(--ink); }
  .pchgorigin { color: var(--mut); }
  .pchnone, .pchnote { color: var(--mut); font-size: var(--fs-sm); margin: var(--s1) 0 0; }
  .pchgtl { margin-top: 2px; }
  /* B 包：与 /codex-reset/ 的互链（一行站内导航，不引入控件与视觉语言） */
  .pcodex-link { margin: var(--s3) 0 0; color: var(--mut); font-size: var(--fs-sm); line-height: 1.8; }
  .pcodex-link a { color: var(--brand); text-decoration: none; }
  .pcodex-link a:hover { text-decoration: underline; text-underline-offset: 2px; }
  /* v2.4：各套餐当前优惠（Deal ↔ Plan）。纯静态内容（无控件），无 JS 时同样可读。
     当前优惠与历史优惠刻意长得不一样：把「已结束」排成和「现在有」同样的样子，
     等于用排版替读者做了一个不成立的判断。 */
  .pplandeals { margin: var(--s3) 0; border: 1px solid var(--line); border-radius: var(--r); padding: var(--s3); background: var(--card); }
  .pplandeals .ph2 { margin: 0 0 var(--s2); }
  .pdlist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .pdrow { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; font-size: var(--fs-sm); }
  .pdrow + .pdrow { border-top: 1px solid var(--line2); padding-top: 6px; }
  .pdwho { color: var(--ink); text-decoration: none; border-bottom: 1px dotted var(--line); }
  .pdwho:hover { color: var(--brand); }
  .pdcur { color: var(--ink); }
  .pdsave { color: var(--ok); font-weight: 600; }
  .pdnone { color: var(--mut); }
  .pdhist { color: var(--mut); }
  .pdgo { color: var(--brand); text-decoration: none; }
  .pdgo:hover { text-decoration: underline; text-underline-offset: 2px; }
  .pdgo-hist { color: var(--mut); }
  .pdsum { color: var(--mut); font-size: var(--fs-sm); margin: var(--s2) 0 0; }
  /* 窄屏：横滚 + 前两列固定（只有一张表、一套数据模板）。
     第一列给**确定宽度**，第二列的 left 才有确定的落点；两列用不透明底色，否则会透出滑过的单元格。
     ⚠️ .ptable 自带 overflow: hidden（桌面端圆角裁剪用的），它会成为**最近的可滚动祖先**，
     于是粘性单元格相对它定位、而滚动的却是外层容器 —— 实测滚动 300px 后首列 left = -283px（等于没粘住）。
     窄屏必须让表格不裁剪，把圆角交给外层。 */
  @media (max-width: 760px) {
    .ptable-wrap { border-radius: var(--r); }
    .ptable { overflow: visible; }
    /* 窄屏把每一组 chip 收成**一行横滑**（与首页筛选条 .facetsin 同一条既有做法）：
       8 个平台 + 3 个额度类型 + 2 个地区折行后会把控件区撑到 440px，表格因此掉到首屏之外。
       不做"横滑容器里藏入口"那套：这一组的每一项仍是一次横滑就能看到。 */
    .pchips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
    .pchips::-webkit-scrollbar { display: none; }
    .pctl .f { padding: 3px 9px; }
    .ptable thead th:first-child, .ptable tbody th:first-child {
      position: sticky; left: 0; width: 6.5em; white-space: normal; background: var(--card); z-index: 2;
    }
    .ptable thead th:nth-child(2), .ptable tbody td:nth-child(2) {
      position: sticky; left: 6.5em; background: var(--card); z-index: 2;
      box-shadow: 1px 0 0 var(--line); max-width: 10em; white-space: normal; overflow-wrap: anywhere;
    }
    /* 详情行**刻意不粘**：它的单元格 colspan=11（比滚动视口宽得多），粘性元素无法同时满足
       两个方向的约束，浏览器因此整体不位移（实测滚动 300px 后 left = -283px，等于没粘）。
       与其留一条看起来在粘、实际没粘的规则，不如把这件事写在这里。 */
  }
`;
  const compareScript = `<script>
/* scripts/lib/plans-compare.js —— 逐字节内联（离线自测 require 的也是同一份） */
${plansCompareSource()}
</script>`;

  return shell.renderWidePageShell({
    kind: 'plans',
    route: plansPage.PLANS_ROUTE,
    prefix: prefix,
    parts,
    // v1.8-seo-answer-pages：<title> 用查询句式（含「价格 / 2026」+ 厂商名），
    // H1 / 面包屑 / JSON-LD 仍用短名 PLANS_HEADING。两者职责不同，不互相顶替。
    title: `${htmlEscape(plansPage.PLANS_PAGE_TITLE)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(plansPage.PLANS_DESCRIPTION),
    canonicalUrl: pageUrl,
    faviconHref: `${prefix}favicon.svg`,
    // 顺序与迁移前一致：本页静态表格原语在前，`css`（筛选/搜索/展开，由 plans-compare.js 驱动）在后。
    extraCss: `${PLANS_TABLE_CSS}\n${css}\n${priceHistory.PRICE_HISTORY_CSS}`,
    extraTailHtml: compareScript,
    jsonLdHtml: jsonLdBlocks,
    bodyHtml: body,
    where: 'renderPlansPage'
  });
}

/* ------------------------------------------------------------------ */
/* API / Token 计费对比页（/plans/api/，v2.5）                          */
/* ------------------------------------------------------------------ */

/**
 * API 计费对比页。
 *
 * 与套餐页同一套「独立静态路由」的做法（理由见 `renderPlansPage` 的注释），
 * 但**没有交互脚本**：这一版是一张预渲染的静态表 —— 题面 §七 明确"第一版只提供…
 * 不要一开始实现复杂 workload calculator"，而筛选/排序控件是"替读者挑子集"的能力，
 * 在没有稳定的比较口径之前不该先做。
 *
 * 代价同样落在四张清单上（sitemap 计数、`pageRoutes`、页脚深度扫描、SEO 页面类型表）。
 */
function renderApiPlansPage(apiStore, indexHtml, context = {}) {
  const prefix = '../../'; // /plans/api/ 同样是两层路由
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS, appAsset.SOURCE, styleAsset.FILE);

  const pageUrl = `${SITE_URL}${apiPlansPage.API_PLANS_ROUTE}`;
  const plans = apiStore.plans || [];
  const providerTable = context.providerTable || null;

  // 【史述·已下架】v3.0 Stage H4：这一页当年**有自己的订阅源**（API 价格变化），要求在 `<head>` 里
  // 声明它（与根 Feed 并列，而不是替换）；取法与 `/plans/coding/` 一致，都从注册表推导，
  // 不在模板里写死 spec id。订阅层下架后这里与 `/plans/coding/` 一样不再声明任何订阅源。

  const jsonLdBlocks = apiPlansPage.apiPlansJsonLd(plans, { siteUrl: SITE_URL, providerTable })
    .map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');

  const body = apiPlansPage.apiPlansPageBody(plans, {
    // 说明登记（notes-manifest-residual-v1）：这一页的每条 `.snote` 都在模块的构造点登记，
    // 入口在这里注入（与 lib/vendor-page.js 的 ctx.note 同形）。
    note: context.note || null,
    providerTable,
    historyStore: context.apiPlanHistoryStore || null,
    dealLinks: context.dealLinks || null,
    // v1.8-seo-answer-pages：门槛速查表的实名认证列由 deals join（api-plans 没有该字段），
    // 以及表下的数据修正 issue 入口。两个字段不传时该表仍成立（实名列显示「数据未收录」）。
    deals: context.deals || [],
    reportUrl: context.reportUrl || '',
    asOf: context.asOf || null,
    prefix
  });

  return shell.renderWidePageShell({
    kind: 'plans',
    route: apiPlansPage.API_PLANS_ROUTE,
    prefix: prefix,
    parts,
    // v1.8-seo-answer-pages：<title> 用查询句式（含「价格 / 2026」+ 厂商名），H1 / 面包屑仍用短名。
    title: `${htmlEscape(apiPlansPage.API_PLANS_PAGE_TITLE)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(apiPlansPage.API_PLANS_DESCRIPTION),
    canonicalUrl: pageUrl,
    faviconHref: `${prefix}favicon.svg`,
    logoCssHref: `${prefix}logos.css`,
    extraCss: `  /* 只用首页已有的设计变量，不新建一套视觉语言。 */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
  /* v5 识别层：h1 旁的事实数字（只有 /plans/api/ 有；其它页面族的 .stop 不加数字）。
     三个数是本页数据的现算值（计费记录 / 平台 / 模型计价条目），不是硬编码。 */
  .stopstats { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s1) var(--s4); }
  .stopstat { display: flex; align-items: baseline; gap: var(--s1); }
  .stopstat .stat { color: var(--ink); }
  .stopstat-lb { font-size: var(--fs-xs); color: var(--mut); }
  @media (max-width: 760px) { .stopstats { gap: var(--s2) var(--s3); } }
  .ph2 { font-size: 15px; margin: var(--s4) 0 var(--s2); }
  .plist { margin: 0; padding-left: 1.15em; color: var(--mut); font-size: var(--fs-sm); line-height: 1.8; max-width: none; }
  .plist b { color: var(--ink2); }
  .ptable-wrap { overflow-x: auto; }
  .ptable { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .ptable caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }
  .ptable th, .ptable td { text-align: left; padding: 9px 11px; border-top: 1px solid var(--line); font-weight: 400; font-size: var(--fs-sm); vertical-align: top; }
  .ptable thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .ptable tbody th { font-weight: 600; white-space: nowrap; }
  .ptable td { min-width: 84px; }
  .ptable small { display: block; color: var(--mut); font-weight: 400; font-size: 11.5px; margin-top: 2px; line-height: 1.5; }
  .ptable .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ptable a { color: var(--brand); }
  .pvname { margin-left: 2px; }
  /* v1.8-seo-answer-pages：/plans/api/ 的门槛速查表（答案页 2 的「先回答能不能用」层）。
     刻意**不复用 .ptable**：.ptable 的 tbody tr 被产物验收按「价格行」逐行读取
     （108 行 / 11 列），把汇总表混进去会改变那一层的读数。 */
  .ttable-wrap { overflow-x: auto; }
  .ttable { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; min-width: 720px; }
  .ttable caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }
  .ttable th, .ttable td { text-align: left; padding: 9px 11px; border-top: 1px solid var(--line); font-weight: 400; font-size: var(--fs-sm); vertical-align: top; }
  .ttable thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .ttable tbody th { font-weight: 600; white-space: nowrap; }
  .ttable small { display: block; color: var(--mut); font-weight: 400; font-size: 11.5px; margin-top: 2px; }
  .answernote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s2); max-width: none; }
  .ansfoot { color: var(--mut); font-size: var(--fs-sm); margin: var(--s2) 0 0; }
  .ansfoot a { color: var(--brand); }
  /* 平台列里的 logo 用**首页那一套** class="lg"（图形来自 logos.css）：
     只把尺寸与那套"叠放"用的负外边距收掉，其余（圆角 / 描边 / 白底）保持品牌图形的既有观感。
     ⚠️ 这段文字在 JS 模板字符串里，所以**不许出现反引号**：[点号] + [lg] 那种写法会把模板提前截断，
     症状是构建报 "… .lg is not a function" —— 离原因很远，实测踩过两次。 */
  .ptable .lg { width: 16px; height: 16px; margin: 0 5px 0 0; border: 0; box-shadow: none; border-radius: 3px; vertical-align: -3px; }
  .punit { white-space: nowrap; }
  .pnone { color: var(--mut); }
  .pfree { min-width: 148px; }
  .pdate { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .pftlist { margin: 0; padding-left: 1.15em; color: var(--ink2); font-size: var(--fs-sm); line-height: 1.75; }
  .pftlist li { margin-bottom: var(--s2); }
  .pftdesc { color: var(--mut); }
  .pevd { margin: 0 0 var(--s2); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s2) var(--s3); background: var(--card); }
  .pevd summary { cursor: pointer; font-size: var(--fs-sm); color: var(--ink2); }
  .pev { margin: var(--s2) 0 0; padding-left: 1.1em; }
  .pev li { margin-bottom: var(--s2); }
  .pevfield { color: var(--mut); }
  .pev q { display: block; margin: 2px 0; }
  .pev small { color: var(--mut); }
  .pchglist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .pchglist li { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; font-size: var(--fs-sm); }
  .pchgwhen { color: var(--mut); font-variant-numeric: tabular-nums; }
  .pchgwho { color: var(--ink); }
  .pchgtype { color: var(--brand); }
  .pchgwhat { color: var(--ink2); }
  .pchgorigin { color: var(--mut); }
  /* 窄屏：容器内横滚 + 前两列固定（只有一张表、一套数据模板）。
     与套餐页同一条教训：.ptable 自带的 overflow:hidden 会成为最近的可滚动祖先，
     所以窄屏必须让它不裁剪、把圆角交给外层。 */
  @media (max-width: 760px) {
    .ptable-wrap { border-radius: var(--r); }
    .ptable { overflow: visible; }
    .ptable thead th:first-child, .ptable tbody td:first-child {
      position: sticky; left: 0; width: 6.5em; white-space: normal; background: var(--card); z-index: 2;
    }
    .ptable thead th:nth-child(2), .ptable tbody th:nth-child(2) {
      position: sticky; left: 6.5em; background: var(--card); z-index: 2;
      box-shadow: 1px 0 0 var(--line); max-width: 10em; white-space: normal; overflow-wrap: anywhere;
    }
    .ptable th, .ptable td { padding: 8px 9px; }
  }
${priceHistory.PRICE_HISTORY_CSS}
${apiPlansPage.API_PLANS_FILTER_CSS}`,
    extraTailHtml: `<script>\n${apiPlansPage.API_PLANS_FILTER_SCRIPT}\n</script>`,
    jsonLdHtml: jsonLdBlocks,
    bodyHtml: body,
    where: 'renderApiPlansPage'
  });
}

/* ------------------------------------------------------------------ */
/* API 成本计算器（/tools/api-cost/，v3.1）                              */
/* ------------------------------------------------------------------ */

/**
 * API 成本计算器页。
 *
 * 与 /plans/api/ 同一套「独立静态路由」的做法，但**有交互脚本**：
 * 用户填表单选模型、输入 token 数，页面按官方单价实时算成本。
 * 交互逻辑逐字节内联（与 plans-compare.js 同一套路）。
 *
 * ## 这一页 v3.1 上线时漏了「页面级 CSS」，这里是补上的那一份
 *
 * 漏掉的症状（不是审美问题，是排版事实）：`<select>/<input>/<fieldset>` 全是 UA 默认样式；
 * 示例表没有 `.ptable` 的 `width: 100%`，表宽自适应内容 ⇒ `<caption>` 被挤成两行
 * （「…· 币」/「种：CNY…」）；`.stop` 不存在 ⇒ h1 与 meta 各占一行。
 * 构建期自检与静态检查**全都是绿的** —— 它们判内容，不判「这一页到底有没有自己的样式」，
 * 所以 `verify-site.js` §20b 现在多了一条「页面级 CSS 生效」的断言（见那里的注释）。
 *
 * ## 布局约定（页内 CSS 的两条硬边界）
 *
 *   · 六条 `.snote` 口径说明保持 `#api-cost` 的**直接子节点、满宽** —— §22c 的
 *     note-narrow / note-ink-narrow / note-axis 判的就是这件事，别把它们挪进带内边距的卡片；
 *   · `table.ptable`（静态示例）是 §22c 认的「主数据区」锚点，它的宽度决定那六条说明的
 *     判定基线（`column = min(主数据区宽, 列宽)`）⇒ 它必须满宽，且必须留在说明**之前**。
 */
function renderApiCostPage(apiStore, indexHtml, context) {
  const prefix = '../../';
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS, appAsset.SOURCE, styleAsset.FILE);

  const pageUrl = `${SITE_URL}${apiCostPage.API_COST_ROUTE}`;
  const plans = apiStore.plans || [];

  const body = apiCostPage.apiCostPageBody({ plans: plans, updatedAt: apiStore.updatedAt }, {
    note: context.note || null,
    prefix: prefix
  });

  const costScript = `<script>
/* scripts/lib/api-cost.js —— 逐字节内联（离线自测 require 的也是同一份） */
${apiCostSource().replace(/\n$/, '')}
</script>`;

  const breadcrumbLd = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "${htmlEscape(SITE_NAME)}", "item": "${SITE_URL}"},
    {"@type": "ListItem", "position": 2, "name": "${htmlEscape(apiCostPage.API_COST_HEADING)}", "item": "${pageUrl}"}
  ]
}
</script>`;

  // 只用首页已有的设计变量，不新建一套视觉语言（每条声明都能在 index.html 的 :root 里找到出处）。
  // ⚠️ 这段是 JS 模板字符串：里面**不许出现反引号**（一个反引号会把整页样式静默截断）。
  // ⚠️ 注释里也不要写折叠标签的字面量：构建期的「作者正文无 Markdown 记号」按那个字面量取扫描窗口。
  const costCss = `  /* 标题行：h1 与版本文案同一行（旧版这两件各占一行，因为没有 .stop 可用） */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
  .ph2 { font-size: 15px; margin: var(--s4) 0 var(--s2); }

  /* 计算器面板：控件区与结果区同属一张卡，两者之间只用发丝线分隔 */
  .cost-panel { border: 1px solid var(--line); border-radius: var(--r); background: var(--card); padding: var(--s3) var(--s4); margin: 0 0 var(--s4); }
  .cost-form { margin: 0; }
  .cost-fs { margin: 0; border: 0; padding: 0; min-width: 0; }
  .cost-legend { padding: 0; margin: 0 0 var(--s3); color: var(--mut); font-size: var(--fs-sm); font-weight: 600; }
  /* 三列栅格：同一个 .cost-grid 里的控件因此**左边缘对齐、宽度相同** ——
     旧版是 inline-flex 的标签串，控件宽度随「标签有几个字」和 UA 默认尺寸各自为政。 */
  .cost-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s3); }
  .cost-grid + .cost-grid { margin-top: var(--s3); }
  .cost-field { display: grid; gap: var(--s1); min-width: 0; }
  .cost-lab { color: var(--mut); font-size: var(--fs-sm); }
  /* 控件取 --bg：面板本身已经是 --card，「凹进去」的一格才看得出是输入框（暗色下同样成立） */
  .cost-ctl {
    width: 100%; min-width: 0; font: inherit; font-size: var(--fs-md); color: var(--ink);
    background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-sm);
    padding: var(--s2) var(--s3);
  }
  .cost-ctl:hover { border-color: var(--mut-deco); }
  .cost-ctl:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 2px rgba(59, 91, 253, .15); }
  .cost-num { font-variant-numeric: tabular-nums; }
  .cost-adv { margin-top: var(--s3); border-top: 1px solid var(--line2); padding-top: var(--s2); }
  .cost-adv > summary { cursor: pointer; font-size: var(--fs-sm); color: var(--ink2); }
  .cost-adv[open] > summary { margin-bottom: var(--s2); }

  /* 结果区：没内容时不占位（无 JS 时这里是空的，不给读者看一条空的横线） */
  .cost-results { margin-top: var(--s3); border-top: 1px solid var(--line); padding-top: var(--s3); }
  .cost-results:empty { display: none; }
  .cost-sum { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin: 0 0 var(--s2); }
  .cost-sum-lab { color: var(--mut); font-size: var(--fs-sm); }
  .cost-sum-val { color: var(--ink); font-size: var(--fs-lg); font-weight: 600; font-variant-numeric: tabular-nums; }
  .cost-sum-note { color: var(--mut); font-size: var(--fs-sm); }
  .cost-msg { margin: 0; color: var(--mut); font-size: var(--fs-sm); }
  .cost-error { color: var(--warn); }

  /* 两张表（静态示例 / 本次计算）共用同一份列模型与同一套单元格声明。
     数字右对齐 + tabular-nums 是「两行数字能按位对齐」的唯一办法；
     与 /plans/api/ 的 .ptable 同一观感，两处刻意的差异：
       · 内边距走 --s2/--s3（E3：间距取 4 的倍数；兄弟页的 9px 11px 是历史取值）；
       · 不设 td 的 min-width（这张表只有 4 列，窄屏让列内折行即可，不必被列下限顶出容器）。 */
  .ptable-wrap { overflow-x: auto; }
  .ptable { width: 100%; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
  .cost-tbl { width: 100%; border-collapse: collapse; }
  .cost-tbl caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: var(--s3) var(--s3) 0; }
  .cost-tbl th, .cost-tbl td {
    text-align: left; padding: var(--s2) var(--s3); border-top: 1px solid var(--line2);
    font-weight: 400; font-size: var(--fs-sm); vertical-align: top;
  }
  .cost-tbl thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .cost-tbl tbody th { font-weight: 600; white-space: nowrap; }
  /* 数值列只占内容宽，余量全给第一列：一行里那三个数因此挨在一起看得完，
     而不是被平摊到 1400px 的两端（宽度仍满宽，不违反「与主数据区同轴」）。 */
  .cost-tbl thead th:first-child, .cost-tbl tbody th { width: 100%; }
  .cost-tbl .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }

  .cost-example { margin: 0 0 var(--s4); }
  /* 结果区里的那张表已经在面板内，题注不再缩进一格：它要与上面的「合计」同一条左边缘 */
  .cost-breakdown caption { padding-left: 0; padding-right: 0; }
  .cost-fix { margin: var(--s1) 0 0; color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; }
  .cost-total-row { display: flex; align-items: baseline; gap: var(--s2); margin: var(--s2) 0 0; }
  .cost-total-lab { color: var(--mut); font-size: var(--fs-sm); }
  .cost-total-val { color: var(--ink); font-size: var(--fs-lg); font-weight: 600; font-variant-numeric: tabular-nums; }
  .cost-source { margin: var(--s1) 0 0; color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; }
  .pnoscript { margin: 0 0 var(--s2); }
  .cost-presets { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); margin-top: var(--s3); }
  .cost-presets:empty { display: none; }
  .cost-presets-lab { color: var(--mut); font-size: var(--fs-xs); }
  .cost-preset-btn, .cost-cmp-btn, .cost-cmp-drop {
    font: inherit; font-size: var(--fs-xs); color: var(--ink2); background: var(--bg);
    border: 1px solid var(--line); border-radius: var(--r-sm); padding: 5px 10px; cursor: pointer;
  }
  .cost-preset-btn:hover, .cost-cmp-btn:hover { border-color: var(--brand); color: var(--brand); }
  .cost-cmp-btn:disabled { opacity: .55; cursor: default; }
  .cost-cmp { margin-top: var(--s3); }
  .cost-cmp:empty { display: none; }
  .cost-cmp-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); }
  .cost-cmp-status { color: var(--ok); font-size: var(--fs-xs); }
  .cost-cmp-wrap { margin-top: var(--s3); }
  .cost-cmp-tbl { width: 100%; border-collapse: collapse; }
  .cost-cmp-tbl caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: var(--s2) var(--s3); }
  .cost-cmp-tbl th, .cost-cmp-tbl td { padding: var(--s2) var(--s3); border-top: 1px solid var(--line2); font-size: var(--fs-sm); text-align: left; vertical-align: top; }
  .cost-cmp-tbl thead th { border-top: 0; color: var(--mut); font-weight: 600; white-space: nowrap; }
  .cost-cmp-tbl tbody th { font-weight: 600; }
  .cost-cmp-tbl tbody th small { display: block; color: var(--mut); font-weight: 400; font-size: 11.5px; margin-top: 2px; }
  .cost-cmp-tbl tbody th small a { color: var(--brand); text-decoration: none; }
  .cost-cmp-tbl tbody th small a:hover { text-decoration: underline; }
  .cost-cmp-tbl .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .cost-cmp-drop:hover { border-color: var(--deal); color: var(--deal-ink); }

  /* 窄屏：栅格塌成一列（三格并排会各自只剩 ~100px），长维度名允许折行而不是把页面顶宽 */
  @media (max-width: 760px) {
    .cost-panel { padding: var(--s3); }
    .cost-grid { grid-template-columns: minmax(0, 1fr); }
    .cost-tbl caption { padding: var(--s3) var(--s2) 0; }
    .cost-tbl th, .cost-tbl td { padding: var(--s2); }
    .cost-tbl tbody th { white-space: normal; overflow-wrap: anywhere; }
  }`;

  return shell.renderWidePageShell({
    kind: 'tool',
    route: apiCostPage.API_COST_ROUTE,
    prefix: prefix,
    parts: parts,
    title: `${htmlEscape(apiCostPage.API_COST_HEADING)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(apiCostPage.API_COST_DESCRIPTION),
    canonicalUrl: pageUrl,
    faviconHref: `${prefix}favicon.svg`,
    logoCssHref: `${prefix}logos.css`,
    extraCss: costCss,
    extraTailHtml: costScript,
    jsonLdHtml: breadcrumbLd,
    bodyHtml: body,
    where: 'renderApiCostPage'
  });
}

/* ------------------------------------------------------------------ */
/* /plans/ 统一资料入口（v3.0 Stage B）                                 */
/* ------------------------------------------------------------------ */

/**
 * `/plans/` 资料入口页的套壳。
 *
 * 与 `renderPlansPage` / `renderApiPlansPage` 同一套「独立静态路由」的做法：
 * `<head>`、主题脚本、页头、页脚、JSON-LD 在这里套，**正文在 `lib/plans-hub-page.js`**。
 *
 * 三处刻意的设计：
 *   · `prefix = '../'`（一层路由）—— 由路由深度推导，不写死；
 *   · 这一页是**枢纽**：ItemList 指向两个子页（`data-child`），成员对账由页面自己的
 *     `assertItemListHonesty()` 做（`seo.js` 的成员判据按 `deal/<id>/` 判，对枢纽页不适用）；
 *   · 这一页**没有交互脚本**、也没有大表 —— 它只给计数、口径、变化与关联优惠。
 */
function renderPlansHubShell(indexHtml, context = {}) {
  const prefix = '../'; // /plans/ 是一层路由
  const parts = shell.loadShellParts(indexHtml, ROUTE_HREFS, appAsset.SOURCE, styleAsset.FILE);

  const pageUrl = `${SITE_URL}${plansHubPage.PLANS_HUB_ROUTE}`;
  const jsonLdBlocks = plansHubPage.plansHubJsonLd({ siteUrl: SITE_URL })
    .map(data => `<script type="application/ld+json">
${JSON.stringify(data, null, 2).split('\n').map(line => `  ${line}`).join('\n')}
</script>`).join('\n');
  const body = plansHubPage.renderPlansHubPage({ ...context, prefix, siteUrl: SITE_URL });

  return shell.renderWidePageShell({
    kind: 'plans-hub',
    route: plansHubPage.PLANS_HUB_ROUTE,
    prefix: prefix,
    parts,
    title: `${htmlEscape(plansHubPage.PLANS_HUB_HEADING)} · ${htmlEscape(SITE_NAME)}`,
    description: htmlEscape(plansHubPage.PLANS_HUB_DESCRIPTION),
    canonicalUrl: pageUrl,
    faviconHref: `${prefix}favicon.svg`,
    extraCss: `  /* 只用首页与两个对比页已有的设计变量，不新建一套视觉语言。 */
  .stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }
  .stop h1 { font-size: 19px; margin: 0; }
  .stop .meta { color: var(--mut); font-size: var(--fs-sm); }
  .ph2 { font-size: 15px; margin: var(--s4) 0 var(--s2); }
  .plist { margin: 0; padding-left: 1.15em; color: var(--mut); font-size: var(--fs-sm); line-height: 1.8; max-width: none; }
  .plist b { color: var(--ink2); }
  /* 两个资料块：Coding 套餐与 API 计费并列，各自给计数与入口。 */
  .phubsec { margin: 0 0 var(--s3); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s3); background: var(--card); }
  .phubsec .ph2 { margin-top: 0; }
  .phubstats { list-style: none; margin: 0 0 var(--s2); padding: 0; display: flex; gap: var(--s3); flex-wrap: wrap; }
  .phubstats li { display: flex; align-items: baseline; gap: 6px; font-size: var(--fs-sm); color: var(--mut); }
  .phubl { color: var(--mut); }
  .phubv { color: var(--ink); font-size: 15px; font-variant-numeric: tabular-nums; }
  .phubgo { color: var(--brand); text-decoration: none; }
  .phubgo:hover { text-decoration: underline; text-underline-offset: 2px; }
  /* 当前相关优惠：与套餐页的「当前优惠」同一套观感（结构上只列 current）。 */
  .phubdeals { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .phubdeal { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; font-size: var(--fs-sm); }
  .phubwho { color: var(--ink); }
  .phubkind { color: var(--mut); }
  .phubtitle { color: var(--ink2); }
  .phubpromo { color: var(--mut); }
  .phubsave { color: var(--ok); font-weight: 600; }
  .phubelig { color: var(--mut); }
  .phubdeadline { color: var(--mut); }
  .phubnone { color: var(--mut); font-size: var(--fs-sm); }
  /* 变化块复用套餐页 / API 页的那几个 class（同一套观感、同一份句子）。 */
  .pchanges { margin: 0 0 var(--s3); border: 1px solid var(--line); border-radius: var(--r); padding: var(--s3); background: var(--card); }
  .pchanges .ph2 { margin: 0 0 var(--s2); }
  .pchglist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .pchglist li { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; font-size: var(--fs-sm); }
  .pchgwhen { color: var(--mut); font-variant-numeric: tabular-nums; }
  .pchgwho { color: var(--ink); text-decoration: none; }
  a.pchgwho { border-bottom: 1px dotted var(--line); }
  .pchgtype { color: var(--brand); }
  .pchgwhat { color: var(--ink); }
  .pchgorigin { color: var(--mut); }
  .pchnone, .pchnote { color: var(--mut); font-size: var(--fs-sm); margin: var(--s1) 0 0; }`,
    jsonLdHtml: jsonLdBlocks,
    bodyHtml: body,
    where: 'renderPlansHubShell'
  });
}

  return {
    CODEX_RESETS_FILE,
    CODEX_RESETS_ROUTE,
    CODEX_EXCERPT_LIMIT,
    PLANS_TABLE_CSS,
    beijingMinuteOf,
    loadCodexResets,
    renderStatusPage,
    renderCodexResetsPage,
    markChangesRows,
    renderChangesPage,
    renderPlansPage,
    renderApiPlansPage,
    renderApiCostPage,
    renderPlansHubShell
  };
}

module.exports = { createOpsPages };
