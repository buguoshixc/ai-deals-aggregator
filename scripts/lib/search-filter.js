/**
 * `/search/` 的**关键词过滤**，一份实现、两个宿主（与 `plans-compare.js` 同一套路）。
 *
 * ## 双宿主，而不是两个文件
 *
 * 同一套「子串、大小写、空白切词」语义必须同时活在：
 *   · 浏览器里（读者敲搜索框时）；
 *   · 自测里（`search-selftest.js` 直接 `require` 它，给语义长牙）。
 * 复制两份的结局是两边都绿、行为却不同。`build-local.js` 把本文件源码**逐字节内联**进
 * `/search/` 页面；内联的那一份与 `require` 的那一份不可能是两个版本。
 *
 * ## 渐进增强：它只藏东西，不造东西
 *
 * 目录、分组、计数、每条链接都是构建期写死的静态 HTML。这里只做三件事：
 *   ① 按 `data-keywords` 隐藏不匹配的 `<li>`；
 *   ② 空的分组整块隐藏；
 *   ③ 更新 `#searchStatus` 的「显示 N / M 条」与空态提示。
 * 一条都不改文本、不改链接、不 fetch、不写存储 —— 关掉 JS，目录仍完整可读。
 *
 * ## 纪律
 *
 * 纯函数不读盘、不联网、不看时钟；查询先小写、按空白切词，**全部词都命中**才算匹配
 * （与首页搜索的「整串子串」不同：这里多词查询要能收窄，而不是要求连续出现）。
 */
(function () {
  'use strict';

  const FILTER_VERSION = '1.0.0';

  /** 小写 + 折叠空白；不做的标准化（全角/拼音）明确不做，避免「看起来匹配」 */
  function normalize(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /** 查询词：按空白切，去空；空查询返回 []（= 不过滤） */
  function queryTokens(query) {
    const normalized = normalize(query);
    if (!normalized) return [];
    return normalized.split(' ').filter(Boolean);
  }

  /**
   * 一条记录是否命中查询。`keywords` 是构建期拼好的小写串（含中文散文字段）。
   * 空查询恒为 true（= 完整目录）。
   */
  function matchesKeywords(keywords, query) {
    const tokens = queryTokens(query);
    if (!tokens.length) return true;
    const haystack = normalize(keywords);
    return tokens.every(token => haystack.indexOf(token) !== -1);
  }

  function matchesEntry(entry, query) {
    return matchesKeywords(entry && entry.keywords, query);
  }

  /** 纯函数版：给自测与构建期使用；返回 `{visible, total, tokens}` */
  function filterEntries(entries, query) {
    const list = Array.isArray(entries) ? entries : [];
    const visible = list.filter(entry => matchesEntry(entry, query));
    return { visible, total: list.length, tokens: queryTokens(query) };
  }

  if (typeof module === 'object' && module && module.exports) {
    module.exports = { FILTER_VERSION, normalize, queryTokens, matchesKeywords, matchesEntry, filterEntries, init };
  }

  /* ------------------------------------------------------------------ */
  /* 浏览器侧：只改可见性                                                  */
  /* ------------------------------------------------------------------ */

  function init(doc) {
    const input = doc && doc.getElementById ? doc.getElementById('siteSearchInput') : null;
    if (!input) return;
    const items = Array.prototype.slice.call(doc.querySelectorAll('.sitem'));
    if (!items.length) return;
    const groups = Array.prototype.slice.call(doc.querySelectorAll('.sgroup'));
    const status = doc.getElementById('searchStatus');
    const empty = doc.getElementById('searchEmpty');
    const total = items.length;

    const setHidden = (node, hidden) => {
      if (!node) return;
      if (hidden) node.setAttribute('hidden', '');
      else node.removeAttribute('hidden');
    };

    const apply = () => {
      const tokens = queryTokens(input.value);
      let shown = 0;
      for (const item of items) {
        const hit = matchesKeywords(item.getAttribute('data-keywords') || '', input.value);
        setHidden(item, !hit);
        if (hit) shown += 1;
      }
      for (const group of groups) {
        const any = group.querySelector('.sitem:not([hidden])');
        setHidden(group, !any);
      }
      if (status) {
        status.textContent = tokens.length ? `显示 ${shown} / ${total} 条` : `共 ${total} 条`;
      }
      setHidden(empty, !(tokens.length && shown === 0));
    };

    const syncUrl = () => {
      try {
        if (typeof window === 'undefined' || !window.history || !window.history.replaceState) return;
        const url = new URL(window.location.href);
        const raw = String(input.value || '').trim();
        if (raw) url.searchParams.set('q', raw);
        else url.searchParams.delete('q');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch (e) { /* file:// 或受限环境忽略 */ }
    };

    input.addEventListener('input', () => {
      apply();
      syncUrl();
    });
    // 若 URL 带 ?q=...（如从首页搜索框跳转而来），立即按参数收窄目录；否则展示完整目录。
    let initQ = '';
    try {
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        initQ = String(new URLSearchParams(window.location.search).get('q') || '').trim();
      }
    } catch (e) { /* 忽略 */ }
    if (initQ) {
      input.value = initQ;
      apply();
    } else {
      setHidden(empty, true);
      if (status) status.textContent = `共 ${total} 条`;
    }
  }

  if (typeof document !== 'undefined' && document.getElementById) init(document);
})();
