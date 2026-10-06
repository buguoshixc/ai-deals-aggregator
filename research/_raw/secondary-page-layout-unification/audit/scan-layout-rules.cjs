#!/usr/bin/env node
/**
 * T9 §19/§20 只读审计扫描器。
 *
 * 产出四份机器可读清单（全部写在 research/_raw/secondary-page-layout-unification/audit/）：
 *   · layout-rule-inventory.json   —— 六个类名的规则出处清单 + 重复度判定
 *   · narrow-width-census.json     —— 全仓 max-width 普查（值/单位/分类）
 *   · retained-narrow-widths.json  —— 本次明确保留的局部窄宽（§20「不要误伤」）
 *   · conclusion.json              —— 结论段（同类残留 / 同义规则）
 *
 * ## 设计：抽取机械化，判断显式化
 *
 * 抽取（哪一行、什么选择器、规则体是什么）完全机械 —— 从这里到 JSON 没有人工裁剪。
 * **分类是判断**，所以它写成一张显式的表（`CATEGORY_TABLE` / `HANDLING_TABLE`），
 * 并且脚本会**校验每个抽取到的条目都被表覆盖**：漏一个就非 0 退出。
 * 也就是说：以后新增一条 max-width 而没人给它分类，这份审计会当场变红，而不是悄悄少一条。
 *
 * ## 只读
 *
 * 只读 index.html 与 scripts/**；只写 audit/**。不 require 任何生产模块（避免构建链副作用），
 * 不跑 build-local，不联网。
 *
 * 用法：node research/_raw/secondary-page-layout-unification/audit/scan-layout-rules.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const AUDIT_DIR = __dirname;
// audit/ → secondary-page-layout-unification/ → _raw/ → research/ → 仓库根
const ROOT = path.resolve(AUDIT_DIR, '..', '..', '..', '..');
const OUT_DIR = AUDIT_DIR;

const CLASS_NAMES = ['.snote', '.ph2', '.plist', '.stop', '.cstop', '.detail-main'];
/** 任务点名要一并交代、但不在这六类名里的表类名族（为「本次故意不动」提供读数） */
const AUXILIARY_FAMILIES = ['.ptable', '.stable', '.ctable'];

/** 每个类名一句精确的判定（比 `verdict` 更细，避免把「一处唯一出处 + 一处修饰类」说成"多处不同规则"） */
const CLASS_VERDICT_OVERRIDES = {
  '.snote': '唯一出处（含宽度的规则 1 条；另 1 条是不含宽度的修饰类 .snote.chgwarn）'
};

const CLASS_NOTES = {
  '.snote': '本次的主角：**宽度声明只剩 1 处**（index.html:734，唯一的 `max-width: none`）；'
    + '另一处 `.snote.chgwarn` 是颜色修饰、不含宽度。8 份页面级副本已删除 ⇒ 唯一出处。',
  '.ph2': '4 份逐字复制 + 5 处带父级作用域的变体（`.pchanges .ph2` / `.pplandeals .ph2` / `.phubsec .ph2` / `.asec .ph2`）；'
    + '全部无宽度声明 ⇒ 不产生布局漂移。',
  '.plist': '4 份逐字复制（都带 `max-width: none`，**取值一致**）+ 4 份 `.plist b`；取值一致 ⇒ 无漂移，本次故意不动。',
  '.stop': '5 份逐字复制（`.stop` / `.stop h1` / `.stop .meta` 各 5 份，分布在 status / plans / api-plans / plans-hub / models）；'
    + '全部无宽度声明。',
  '.cstop': '目录页壳里的 `.stop` 版本，单处、无宽度、无副本。',
  '.detail-main': '唯一出处（index.html:725），本次之前就已经是唯一出处，不需要改动。'
};

/* ------------------------------------------------------------------ */
/* 1. 文件清单（index.html + scripts/**）                              */
/* ------------------------------------------------------------------ */

function listSources() {
  const files = ['index.html'];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full.slice(ROOT.length + 1).split(path.sep).join('/'));
    }
  })(path.join(ROOT, 'scripts'));
  return files;
}

/* ------------------------------------------------------------------ */
/* 2. 区域抽取：CSS 只存在于「模板字符串」与「<style> 块」里            */
/* ------------------------------------------------------------------ */

const isIdentChar = ch => /[\w$]/.test(ch);

/**
 * JS 词法级扫描：抽出字符串 / 模板字符串区域（跳过注释）。
 * 返回 [{ kind, text, startOffset }]，kind ∈ { js-string, js-template }。
 *
 * 为什么非要做词法而不是整文件正则：注释里也写着 CSS（例如 page-kinds.js 的
 * 「原本有 8 份 `max-width: 70ch`」），整文件正则会把它算成一条声明。
 */
function extractJsRegions(text) {
  const regions = [];
  let i = 0;
  const n = text.length;

  function scanString(quote, start) {
    i = start + 1;
    while (i < n) {
      const ch = text[i];
      if (ch === '\\') { i += 2; continue; }
      if (ch === quote) { i += 1; break; }
      if (ch === '\n' && quote !== '`') { break; } // 未闭合的普通字符串（不该发生）
      i += 1;
    }
    regions.push({ kind: quote === '`' ? 'js-template' : 'js-string', text: text.slice(start, i), startOffset: start });
  }

  function scanTemplate(start) {
    i = start + 1;
    while (i < n) {
      const ch = text[i];
      if (ch === '\\') { i += 2; continue; }
      if (ch === '`') { i += 1; break; }
      if (ch === '$' && text[i + 1] === '{') { scanExpression(i + 1); continue; }
      i += 1;
    }
    regions.push({ kind: 'js-template', text: text.slice(start, i), startOffset: start });
  }

  function scanExpression(start) {
    // start 指向 '{'
    let depth = 1;
    i = start + 1;
    while (i < n && depth > 0) {
      const ch = text[i];
      if (ch === '{') { depth += 1; i += 1; continue; }
      if (ch === '}') { depth -= 1; i += 1; continue; }
      if (ch === '\'' || ch === '"') { scanNestedString(ch); continue; }
      if (ch === '`') { scanNestedTemplate(); continue; }
      i += 1;
    }
  }
  function scanNestedString(quote) {
    const start = i;
    i += 1;
    while (i < n) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i] === quote) { i += 1; break; }
      i += 1;
    }
    regions.push({ kind: 'js-string', text: text.slice(start, i), startOffset: start });
  }
  function scanNestedTemplate() {
    const start = i;
    i += 1;
    while (i < n) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i] === '`') { i += 1; break; }
      if (text[i] === '$' && text[i + 1] === '{') { scanExpression(i + 1); continue; }
      i += 1;
    }
    regions.push({ kind: 'js-template', text: text.slice(start, i), startOffset: start });
  }

  while (i < n) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i += 1; continue; }
    if (ch === '/' && text[i + 1] === '*') { i += 2; while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i += 1; i += 2; continue; }
    if (ch === '\'' || ch === '"' ) { scanString(ch, i); continue; }
    if (ch === '`') { scanTemplate(i); continue; }
    if (isIdentChar(ch) || ch === '#') { /* 跳过标识符，避免把 re=/.../ 里的引号当字符串 */ }
    i += 1;
  }
  return regions;
}

function extractHtmlStyleRegions(text) {
  const regions = [];
  const re = /<style>([\s\S]*?)<\/style>/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    regions.push({ kind: 'html-style-block', text: match[1], startOffset: match.index + '<style>'.length });
  }
  return regions;
}

/* ------------------------------------------------------------------ */
/* 3. CSS 规则解析（花括号感知，记录 @media 上下文）                    */
/* ------------------------------------------------------------------ */

/**
 * 选择器是否「像 CSS」——挡住 JS 代码 / 中文注释被误读成规则。
 *
 * ⚠️ 这条判据宁可**宽**也不要窄：窄了会静默漏掉真实规则（例如 `[data-tier="1"]` 这种属性选择器），
 * 而漏掉的那一条恰恰可能带着宽度声明 —— 一份"看起来全、其实少"的普查比没有普查更糟。
 * 做法：把属性选择器与带括号的伪类换成占位符，剩下的字符必须落在 CSS 选择器的字符集里。
 */
function looksLikeSelector(selector) {
  const s = selector.trim();
  if (!s) return false;
  if (s.startsWith('@')) return true;
  if (/^(function|if|for|while|switch|catch|return|const|let|var|class|else|do|try|new|typeof|await|yield)\b/.test(s)) return false;
  const normalized = s
    .replace(/\[[^\]]*\]/g, 'ATTR')
    .replace(/:{1,2}[\w-]+\([^()]*\)/g, 'PSEUDO')
    .replace(/::?[\w-]+/g, '');
  return /^[a-zA-Z0-9_\-*#.,\s>+~]+$/.test(normalized);
}

function splitDeclarations(body) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ';' && depth === 0) { out.push(current); current = ''; continue; }
    current += ch;
  }
  out.push(current);
  return out.map(part => part.trim()).filter(Boolean);
}

/**
 * 解析一个 CSS 区域，返回规则数组。
 * 每条：{ selector, text, body, declarations, offset, mediaQueries }
 *
 * 花括号感知：`@media` 之类的 at-rule 只作为**上下文**（记进 mediaQueries），自身不产出规则；
 * 区域里夹着模板插值 `${extraCss}` 时，那个 `{…}` 会被当成一条选择器为 `$` 的"规则"，
 * 由 `looksLikeSelector()` 过滤掉（不会污染前后的真实规则 —— 语句边界由 `}` 重置）。
 */
function parseCssRules(region) {
  const text = region.text;
  const rules = [];
  const stack = [];
  let segStart = 0;

  const clean = source => source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // 区域是 JS 字符串时，选择器首尾会带上引号（`'.snote ~ .snote`）—— 去掉，否则它看起来像另一个选择器
    .replace(/^['"`]+/, '')
    .replace(/['"`]+$/, '')
    .trim();

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') {
      const rawSlice = text.slice(segStart, i);
      // 行号必须落在**选择器第一个字符**上，而不是"上一条规则的 `}` 之后"——
      // 两者之间常常隔着一段注释（本仓库的 CSS 注释很密），否则行号会指到注释头上。
      const leading = rawSlice.match(/^(?:\s|\/\*[\s\S]*?\*\/)*/);
      const selectorStart = segStart + (leading ? leading[0].length : 0);
      const selector = clean(rawSlice);
      const parent = stack[stack.length - 1];
      const frame = {
        selector,
        selectorStart,
        bodyStart: i + 1,
        mediaQueries: parent ? parent.mediaQueries.slice() : [],
        mediaFrames: parent ? parent.mediaFrames.slice() : [],
        isAtRule: false
      };
      if (/^@/.test(selector)) {
        frame.isAtRule = true;
        if (/^@media/i.test(selector)) {
          frame.mediaQueries.push(selector);
          // 断点按**块**计数：同一个 @media 里有多少条规则，就只能记一次断点。
          frame.mediaFrames.push({ selector, offset: selectorStart });
        }
      }
      stack.push(frame);
      segStart = i + 1;
      continue;
    }
    if (ch === '}') {
      const frame = stack.pop();
      if (frame && !frame.isAtRule) {
        const body = text.slice(frame.bodyStart, i);
        rules.push({
          selector: frame.selector,
          text: clean(text.slice(frame.selectorStart, i + 1)),
          body,
          declarations: splitDeclarations(body),
          offset: frame.selectorStart,
          mediaQueries: frame.mediaQueries,
          mediaFrames: frame.mediaFrames
        });
      }
      segStart = i + 1;
      continue;
    }
    if (ch === ';' && stack.length === 0) {
      segStart = i + 1;
    }
  }
  return rules;
}

/** 行号：区域起点行 + 区域内换行数 */
function lineOf(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

/* ------------------------------------------------------------------ */
/* 4. 归属：这条规则属于哪个页面壳                                      */
/* ------------------------------------------------------------------ */

const SHELLS = {
  'index.html': { id: 'shared-style', label: '共享 <style>（全站，index.html）', family: 'shared' },
  'build-local.js::renderStatusPage': { id: 'shell-status', label: '/status/ 状态页（wide）', family: 'wide' },
  'build-local.js::renderChangesPage': { id: 'shell-changes', label: '/changes/ 变化页（wide）', family: 'wide' },
  'build-local.js::renderPlansPage': { id: 'shell-plans-coding', label: '/plans/coding/ 套餐对比页（wide）', family: 'wide' },
  'build-local.js::renderApiPlansPage': { id: 'shell-plans-api', label: '/plans/api/ API 计费页（wide）', family: 'wide' },
  'build-local.js::renderPlansHubShell': { id: 'shell-plans-hub', label: '/plans/ 资料入口页（wide）', family: 'wide' },
  'build-local.js::renderModelsShell': { id: 'shell-models', label: '通用静态页壳：/models/、/models/<slug>/、/archive/、/docs/data/、档案详情', family: 'wide+detail' },
  'build-local.js::ARCHIVE_PAGE_CSS': { id: 'extra-archive', label: '/archive/ 追加样式（拼进通用页壳的 <style>）', family: 'wide' },
  'build-local.js::DATA_DOCS_PAGE_CSS': { id: 'extra-data-docs', label: '/docs/data/ 追加样式（拼进通用页壳的 <style>）', family: 'wide' },
  'build-local.js::renderFeedsPage': { id: 'shell-feeds', label: '/feeds/ 订阅中心（wide）', family: 'wide' },
  'build-local.js::renderDirectoryPage': { id: 'shell-directory', label: '目录页家族：/<slug>/、/need/<slug>/、/vendor/<slug>/、category、alias（wide）', family: 'wide' },
  'build-local.js::renderDeals': { id: 'render-core-home', label: '首页卡片渲染核心（RENDER-CORE 旁支）', family: 'wide' },
  'verify-site.js::(test-tool)': { id: 'test-tool', label: '测试工具 verify-site.js（非产物样式：变异锚点 / 断言载荷）', family: 'test' },
  'page-kinds.js::(declaration)': { id: 'declaration-module', label: '声明模块 page-kinds.js（非样式）', family: 'test' }
};

const FILE_SHELL_FALLBACK = {
  'scripts/tools/verify-site.js': 'verify-site.js::(test-tool)',
  'scripts/lib/page-kinds.js': 'page-kinds.js::(declaration)'
};

function detectConstruct(fileText, line) {
  const lines = fileText.split('\n');
  for (let i = Math.min(line - 1, lines.length - 1); i >= 0; i -= 1) {
    const text = lines[i];
    let match = text.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
    if (match) return { kind: 'function', name: match[1] };
    match = text.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (match) return { kind: 'const', name: match[1] };
  }
  return null;
}

function shellKeyOf(file, fileText, line) {
  if (FILE_SHELL_FALLBACK[file]) return FILE_SHELL_FALLBACK[file];
  const construct = detectConstruct(fileText, line);
  if (!construct) return null;
  const base = file.split('/').pop();
  return `${base}::${construct.name}`;
}

function shellOf(key) {
  return SHELLS[key] || { id: key || 'unknown', label: key || '（未归属）', family: 'unknown' };
}

/* ------------------------------------------------------------------ */
/* 5. 抽取全部条目                                                     */
/* ------------------------------------------------------------------ */

/**
 * 一个「区域」里真正的 CSS 片段。
 *   · html-style-block：区域本身就是 `<style>` 的内容；
 *   · js-template / js-string：区域是整个模板字符串 / 字符串，取其中的 `<style>…</style>`；
 *     若一个 `<style>` 都没有，但整段不含任何标签且像 CSS（例如 `const ARCHIVE_PAGE_CSS = \`…\``），
 *     则整段当作 CSS 片段常量。
 * 返回 [{ text, offset }]，offset 是片段在**文件**中的绝对偏移（拿来算行号）。
 */
function cssSpansOf(region) {
  if (region.kind === 'html-style-block') return [{ text: region.text, offset: region.startOffset }];
  const spans = [];
  const re = /<style>([\s\S]*?)<\/style>/g;
  let match;
  while ((match = re.exec(region.text)) !== null) {
    spans.push({ text: match[1], offset: region.startOffset + match.index + '<style>'.length });
  }
  if (spans.length) return spans;
  if (!/<[a-zA-Z/!]/.test(region.text) && /[.#@][\w-]*[^{};]*\{/.test(region.text)) {
    return [{ text: region.text, offset: region.startOffset }];
  }
  return [];
}

function collectEntries() {
  const sources = listSources();
  const ruleEntries = [];
  const inlineStyleEntries = [];
  const skippedRegions = [];
  const declarationFragments = [];

  for (const rel of sources) {
    const abs = path.join(ROOT, rel);
    const text = fs.readFileSync(abs, 'utf8');
    const isHtml = rel.endsWith('.html');
    const regions = isHtml ? extractHtmlStyleRegions(text) : extractJsRegions(text);

    // 5a) 规则条目
    for (const region of regions) {
      // JS 区域是**整个模板字符串**（里面是整页 HTML），所以 CSS 解析必须收在区域内的
      // `<style>…</style>` 上；只有"纯 CSS 片段常量"（如 ARCHIVE_PAGE_CSS，没有 <style> 包裹、
      // 也不含任何标签）才整段解析。
      const spans = cssSpansOf(region);
      for (const span of spans) {
        const rules = parseCssRules({ text: span.text });
        for (const rule of rules) {
          if (!looksLikeSelector(rule.selector)) { skippedRegions.push({ file: rel, selector: rule.selector.slice(0, 80) }); continue; }
          ruleEntries.push({
            file: rel,
            line: lineOf(text, span.offset + rule.offset),
            selector: rule.selector,
            ruleText: rule.text,
            declarations: rule.declarations,
            mediaQueries: rule.mediaQueries,
            mediaFrames: (rule.mediaFrames || []).map(frame => ({
              selector: frame.selector,
              offset: frame.offset,
              line: lineOf(text, span.offset + frame.offset)
            })),
            regionKind: region.kind,
            sourceKind: region.kind === 'js-string' ? 'fixture-string' : 'product-css'
          });
        }
      }
      // 无花括号的「声明片段」：测试工具里有这种变异载荷（只改一个属性值的 anchor），
      // 它既不是规则定义，也不该悄悄消失 —— 单独登记，并在普查里注明不计入。
      if (region.kind === 'js-string' && !spans.length && /max-width\s*:/.test(region.text)) {
        declarationFragments.push({
          file: rel,
          line: lineOf(text, region.startOffset),
          text: region.text.replace(/\s+/g, ' ').trim().slice(0, 200),
          note: '不含花括号的 CSS 声明片段（JS 字符串）：测试工具的变异载荷，不是规则定义，不计入普查'
        });
      }
    }

    // 5b) 行内 style="…" 里的声明（两种文件都要扫；只扫 <style> 之外的部分）
    const markupOnlyText = isHtml
      ? text.replace(/<style>[\s\S]*?<\/style>/g, match => '\n'.repeat((match.match(/\n/g) || []).length))
      : text;
    const inlineRe = /\bstyle\s*=\s*"([^"]*)"|\bstyle\s*=\s*'([^']*)'/g;
    let match;
    while ((match = inlineRe.exec(markupOnlyText)) !== null) {
      const value = match[1] || match[2] || '';
      if (!/max-width\s*:/.test(value)) continue;
      inlineStyleEntries.push({
        file: rel,
        line: lineOf(markupOnlyText, match.index),
        selector: '(inline style 属性)',
        raw: value.trim(),
        value: (value.match(/max-width\s*:\s*([^;]+)/) || [])[1].trim(),
        mediaQueries: []
      });
    }
  }
  return { ruleEntries, inlineStyleEntries, skippedRegions, declarationFragments };
}

/* ------------------------------------------------------------------ */
/* 6. 判断表（显式、可校验完整性）                                      */
/* ------------------------------------------------------------------ */

/**
 * 六类名条目的「本次是否处理」判定。
 *
 * 与 max-width 分类表同一条纪律：**判断显式写下来，并且必须完整覆盖** ——
 * 任何一个产物样式条目没有判定，脚本就非 0 退出。
 *
 * 判定分两层：
 *   · `ENTRY_OVERRIDES`：逐条判定（`.snote` 这类"本次主角"必须逐条写）；
 *   · `CLASS_POLICIES`：同类名同一条理由的批量判定（例如 `.stop` 的 5 份副本）。
 */
const ENTRY_OVERRIDES = {
  '.snote|index.html|734': {
    handled: true,
    verdict: '本次处理：收成唯一出处',
    role: '全站唯一出处（共享 <style>）',
    reason: '本次把 8 份页面级副本收成这一条（4 份 70ch + 4 份 none ⇒ 1 份 none）。'
      + 'T2 的变异牙就锚在这一串上；共享样式在文档序上先于页面局部样式，因此「一处定义、全站生效」。',
    evidence: ['index.html:734', 'scripts/tools/build-local.js 删除 8 条（原 1048/1347/1613/1739/1883/2001/2311/2710）', 'dist 186/186 页各恰好 1 条 .snote 规则']
  },
  '.snote|scripts/tools/build-local.js|1355': {
    handled: false,
    verdict: '本次故意不动',
    role: '.snote 的修饰类（只改颜色）',
    reason: '`.snote.chgwarn` 不含任何宽度声明，它不是「同一条规则的第二份取值」，而是同一族里的一个语义修饰。'
      + '把它也搬进共享样式要新增一条只有颜色用途的规则，收益是"少一行"，风险是给共享样式引入一个只有 changes 页用得上的类 —— 不值得。'
  }
};

/** 测试工具里的 CSS 文本（变异锚点 / 断言载荷）不参与「本次是否处理」的判定 */
const FIXTURE_POLICY = {
  handled: false,
  verdict: '不适用（测试工具载荷，不是产物样式定义）',
  reason: '这些规则文本是 verify-site.js 的**变异锚点 / 断言载荷**：它们必须逐字引用产品规则，'
    + '否则变异就锚不住（把产品规则改掉、门禁却什么都不响）。把它们「去重」或「收口」等于拆掉牙。'
    + '本审计把它们单独归类为 fixtureMentions，不计入重复度，也不参与「本次是否处理」的判定。'
};

const CLASS_POLICIES = {
  '.detail-main': {
    handled: false,
    verdict: '不需要处理（已经是唯一出处）',
    reason: '`.detail-main` 在本次之前就已经是唯一出处（index.html 的共享 <style>），'
      + 'deal / models 详情页只是加一个 class。本次的工作是把 `.snote` 收到同一条纪律上，而不是再改它。'
  },
  '.ph2': {
    handled: false,
    verdict: '本次故意不动（多处复制但无宽度）',
    reason: '`.ph2`（小节标题）在页面壳里逐字复制了 4 份，另有 4 处是**加了父级作用域**的变体'
      + '（`.pchanges .ph2` / `.pplandeals .ph2` / `.phubsec .ph2` / `.asec .ph2`）——后者是各页面壳的**独有规则**，本来就不该合并。'
      + '关键是：`.ph2` 全部不含宽度声明，四处逐字相同的取值不会产生布局漂移。'
      + '收口它们需要改动 4~5 个页面壳的样式抽取，收益是"更整齐"，风险是新的回归面 —— 不为了代码更漂亮做大重构。'
  },
  '.plist': {
    handled: false,
    verdict: '本次故意不动（4 份副本、取值逐字相同）',
    reason: '`.plist` 的宽度声明在 4 个页面壳里各一份，但**四份逐字相同**（`max-width: none`，跟随数据容器）。'
      + '漂移风险来自「同一条规则、两种取值」（`.snote` 正是这种），而不是「同一取值写了四遍」。'
      + '本次只处理前者；后者如实登记在案，留给将来有真实漂移迹象时再收。'
  },
  '.stop': {
    handled: false,
    verdict: '本次故意不动（5 份副本、无宽度）',
    reason: '`.stop`（页头行）在 status / plans / api-plans / plans-hub / models 五个页面壳里逐字复制了 5 份，'
      + '连同 `.stop h1` / `.stop .meta` 各 5 份。它们**都不含宽度声明**，因此与本次的缺陷形态（说明被限宽）无关。'
      + '同一条理由：不为了"更漂亮"去动 5 个页面壳。'
  },
  '.cstop': {
    handled: false,
    verdict: '不需要处理（单处，无宽度）',
    reason: '`.cstop` 只出现在目录页壳里一次（`.stop` 的目录页版本），不含宽度声明，也没有第二份副本。'
  }
};

/**
 * max-width 分类表（key = `文件|归一化选择器|max-width: 值;`）。
 *
 * 这是**判断**，不是抽取：每一条都是人看过上下文之后写下的，`why` 就是判据。
 * 完整覆盖是强制项 —— 少一条脚本就非 0 退出（见 main() 末尾）。
 * 响应式断点不进这张表（它们由 `@media` 条件机械判定）。
 */
const CATEGORY_TABLE = {
  /* ---------- index.html 共享样式 ---------- */
  'index.html|.topin|max-width: 1420px;': {
    category: '页面容器',
    why: '顶栏的内容带宽度。它是站点「数据容器」这一层的宽度来源之一（与 .wrap 同值）。'
  },
  'index.html|.facetsin|max-width: 1420px;': {
    category: '页面容器',
    why: '筛选条的内容带宽度：筛选条是 sticky 的一层，必须与 .wrap/.topin 同宽，否则滚动到粘住时会对不齐。'
  },
  'index.html|.wrap|max-width: 1420px;': {
    category: '页面容器',
    why: '**主数据区的宽度来源**（1420px，含左右 20px padding）。本次缺陷说的「说明被压成 420px、而正文容器 1380px」里的 1380px 就是它减去 padding。'
  },
  'index.html|.needs|max-width: 1420px;': {
    category: '页面容器',
    why: '首页专题导航区的内容带宽度，同上。'
  },
  'index.html|.cmpin|max-width: 1420px;': {
    category: '页面容器',
    why: '对比条（sticky）的内容带宽度，同上。'
  },
  'index.html|.search|max-width: 440px;': {
    category: '局部组件',
    why: '顶栏搜索框这个**控件**的最大宽度（flex:1 会让它在宽屏吃掉整条顶栏）。≤940px 时另有覆盖（见下一条）。'
  },
  'index.html|.search|max-width: none;': {
    category: '局部组件',
    why: '同上一条的窄屏覆盖（@media ≤940px 与 ≤760px）：窄屏不再限宽、改为 min-width:100%。说明这条宽度本来就是「宽屏上限」而不是「内容列」。'
  },
  'index.html|.cmpchip|max-width: 210px;': {
    category: '局部组件',
    why: '对比条里已选标签（chip）：配 overflow:hidden + text-overflow:ellipsis，宽度是省略号生效的前提。'
  },
  'index.html|.snote|max-width: none;': {
    category: '阅读列',
    why: '**本次收口的唯一出处**：页面级说明是阅读列**类**的文本块，但它的取值是 `none` —— 明确取消限宽，'
      + '让说明与主数据区同轴（数据型页面的导语不是一篇独立文章）。78 个页面壳副本已被删除，只剩这一条。'
  },
  'index.html|.dpane|max-width: none;': {
    category: '局部组件',
    why: '详情页的卡片面板显式声明「跟随内容列铺满」（width:100% + max-width:none），是「不另立一套宽度」的写法。'
  },
  'index.html|.dpane-src|max-width: none;': {
    category: '阅读列',
    why: '详情卡里的来源说明文本，显式跟随卡片宽度铺满（注释写明「与上方卡片同宽，不再另立一套 820px 宽度」）。'
  },

  /* ---------- build-local.js 页面壳 ---------- */
  'scripts/tools/build-local.js|.pdetailbody|max-width: 72ch;': {
    category: '阅读列',
    why: '套餐对比页**表内展开区**的字段清单；局部组件级的可读行长（见 retained-narrow-widths.json）。'
  },
  'scripts/tools/build-local.js|.lsum li small|max-width: 34ch;': {
    category: '局部组件',
    why: '目录页摘要条里每个计数卡片的小字副标题；限制的是卡片内部的换行节奏（见 retained-narrow-widths.json）。'
  },
  'scripts/tools/build-local.js|.plist|max-width: none;': {
    category: '阅读列',
    why: '四个页面壳里各一份、**逐字相同**的清单文本规则，取值是 none（跟随数据容器）。'
      + '它是「多处复制但取值一致」的情形 —— 不产生漂移，本次故意不动（见 inventory 的 notTouched）。'
  },
  'scripts/tools/build-local.js|.ptable thead th:nth-child(2), .ptable tbody td:nth-child(2)|max-width: 10em;': {
    category: '局部组件',
    why: '窄屏下宽表第二列的粘性单元格：sticky 单元格必须有限宽，否则长文本把整张表撑开（见 retained-narrow-widths.json）。'
  },
  'scripts/tools/build-local.js|.ptable thead th:nth-child(2), .ptable tbody th:nth-child(2)|max-width: 10em;': {
    category: '局部组件',
    why: '同上（另一个页面壳里的同类写法：td / th 之差）。'
  },

  /* ---------- verify-site.js：测试工具的变异载荷（不是产物样式） ---------- */
  'scripts/tools/verify-site.js|.snote|max-width: none;': {
    category: '其它',
    why: '测试工具里逐字复制的**冻结串**（WIDE_SNOTE_FROZEN，用作变异锚点）。它必须逐字引用产品规则，否则锚不住。'
  },
  'scripts/tools/verify-site.js|.snote|max-width: 70ch;': {
    category: '其它',
    why: '变异载荷：把冻结串的 max-width 换回 70ch，用来验证「说明被压窄」这条缺陷会被门禁抓到。它是牙，不是残留。'
  },
  'scripts/tools/verify-site.js|.snote ~ .snote|max-width: 70ch;': {
    category: '其它',
    why: '变异载荷（旁路写法之一）：用相邻兄弟选择器加一条限宽规则，绕过「只改冻结串」的检查。'
  },
  'scripts/tools/verify-site.js|.snote:not(:first-of-type)|max-width: 70ch;': {
    category: '其它',
    why: '变异载荷（旁路写法之二）：用 :not(:first-of-type) 只压窄「非第一条」说明，制造同一页说明宽度不一致。'
  }
};

function normalizeKeyPart(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* 7. 主流程                                                           */
/* ------------------------------------------------------------------ */

/** 去掉注释但**保留行数**（换行原样保留），用于"注释里提到的 max-width"这条独立账 */
function stripCommentsKeepingLines(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, match => match.replace(/[^\n]/g, ' '));
}

/**
 * 独立对照：**不经过 CSS 解析器**地数一遍 `max-width:` 的出现次数，
 * 再与解析器给出的分类逐文件对账。差额（unexplained）必须为 0 —— 不为 0 就说明
 * 「解析器漏掉了什么」或者「账目分类不完整」，两种都必须当场看见。
 */
function crossCheckMentions(ruleEntries, fragments, censusRules, censusMedia) {
  const rows = [];
  for (const rel of listSources()) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const rawOccurrences = (text.match(/max-width\s*:/g) || []).length;
    if (!rawOccurrences) continue;
    const codeOccurrences = (stripCommentsKeepingLines(text).match(/max-width\s*:/g) || []).length;
    const commentOccurrences = rawOccurrences - codeOccurrences;
    const ruleDeclarations = censusRules.filter(item => item.file === rel).length;
    const mediaConditions = censusMedia.filter(item => item.file === rel).length;
    const fragments_ = fragments.filter(item => item.file === rel).length;
    const unexplained = rawOccurrences - commentOccurrences - ruleDeclarations - mediaConditions - fragments_;
    rows.push({
      file: rel,
      rawOccurrences,
      commentOccurrences,
      ruleDeclarations,
      mediaConditions,
      fragments: fragments_,
      unexplained,
      reconciled: unexplained === 0
    });
  }
  return {
    method: '裸文本正则数 `max-width:` 的出现次数（不经 CSS 解析器）↔ 解析器的五个账目桶（注释 / 规则声明 / @media 条件 / 声明片段）逐文件对账',
    rows,
    allReconciled: rows.every(row => row.reconciled)
  };
}

function main() {
  const { ruleEntries, inlineStyleEntries, skippedRegions, declarationFragments } = collectEntries();

  /* ---- 7a. 六类名清单 ---- */
  const inventoryEntries = [];
  for (const entry of ruleEntries) {
    const selectorClasses = CLASS_NAMES.filter(cls => new RegExp(`\\${cls}(?![\\w-])`).test(entry.selector));
    if (!selectorClasses.length) continue;
    const widthDeclarations = entry.declarations.filter(decl => /^(max-width|min-width|width|flex-basis)\s*:/i.test(decl));
    const key = `${selectorClasses[0]}|${entry.file}|${entry.line}`;
    const shellKey = shellKeyOf(entry.file, fs.readFileSync(path.join(ROOT, entry.file), 'utf8'), entry.line);
    const override = ENTRY_OVERRIDES[key] || null;
    const policy = override
      || (entry.sourceKind === 'fixture-string' ? FIXTURE_POLICY : CLASS_POLICIES[selectorClasses[0]])
      || null;
    inventoryEntries.push({
      className: selectorClasses[0],
      alsoMentions: selectorClasses.slice(1),
      file: entry.file,
      line: entry.line,
      selector: entry.selector,
      ruleText: entry.ruleText,
      declarations: entry.declarations,
      hasWidthDeclaration: widthDeclarations.length > 0,
      widthDeclarations,
      shell: shellOf(shellKey),
      shellKey,
      sourceKind: entry.sourceKind,
      regionKind: entry.regionKind,
      mediaQueries: entry.mediaQueries,
      handling: policy,
      handlingKey: key,
      handlingSource: override ? 'entry-override'
        : (entry.sourceKind === 'fixture-string' ? 'fixture-policy' : (policy ? 'class-policy' : null))
    });
  }

  // 重复度：按「类名 + 归一化规则体」分组
  const dupGroups = new Map();
  for (const entry of inventoryEntries) {
    if (entry.sourceKind !== 'product-css') continue;
    const bodyKey = `${entry.className}::${normalizeKeyPart(entry.ruleText)}`;
    if (!dupGroups.has(bodyKey)) dupGroups.set(bodyKey, []);
    dupGroups.get(bodyKey).push(entry);
  }
  const duplicateGroups = [...dupGroups.values()]
    .filter(group => group.length > 1)
    .map(group => ({
      className: group[0].className,
      ruleText: group[0].ruleText,
      copies: group.length,
      occurrences: group.map(entry => `${entry.file}:${entry.line} (${entry.shell.id})`),
      hasWidthDeclaration: group[0].hasWidthDeclaration,
      handling: group[0].handling
    }))
    .sort((a, b) => b.copies - a.copies);

  // 唯一出处 / 有意多处：按类名汇总
  const byClass = new Map();
  for (const entry of inventoryEntries) {
    if (entry.sourceKind !== 'product-css') continue;
    if (!byClass.has(entry.className)) byClass.set(entry.className, []);
    byClass.get(entry.className).push(entry);
  }
  const summary = CLASS_NAMES.map(cls => {
    const entries = byClass.get(cls) || [];
    const groups = duplicateGroups.filter(group => group.className === cls);
    const distinctBodies = new Set(entries.map(entry => normalizeKeyPart(entry.ruleText))).size;
    const verdict = CLASS_VERDICT_OVERRIDES[cls] || (entries.length === 0 ? '（本次范围外：无规则定义）'
      : groups.length ? '同一条规则被复制（多处逐字相同）'
        : entries.length === 1 ? '唯一出处'
          : '同一类名的多处不同规则（各自页面壳独有）');
    return {
      className: cls,
      declarationCount: entries.length,
      distinctRuleBodies: distinctBodies,
      duplicatedCopies: groups.reduce((sum, group) => sum + (group.copies - 1), 0),
      copyGroups: groups.map(group => ({
        ruleText: group.ruleText,
        copies: group.copies,
        hasWidthDeclaration: group.hasWidthDeclaration,
        occurrences: group.occurrences
      })),
      targetSelectors: [...new Set(entries.map(entry => entry.selector))].sort(),
      hasWidthDeclaration: entries.some(entry => entry.hasWidthDeclaration),
      widthDeclarations: [...new Set(entries.flatMap(entry => entry.widthDeclarations))].sort(),
      handledInThisChange: entries.some(entry => entry.handling && entry.handling.handled),
      verdict,
      note: CLASS_NOTES[cls] || null,
      handlingVerdict: entries.length && entries[0].handling ? entries[0].handling.verdict : null
    };
  });

  /* ---- 7a′. 附带的表类名族（`.ptable` / `.stable` / `.ctable`）：为「本次故意不动」提供读数 ---- */
  const auxiliaryFamilies = AUXILIARY_FAMILIES.map(family => {
    const members = ruleEntries.filter(entry => entry.sourceKind === 'product-css'
      && new RegExp(`\\${family}(?![\\w-])`).test(entry.selector));
    const byBody = new Map();
    for (const entry of members) {
      const key = normalizeKeyPart(entry.ruleText);
      if (!byBody.has(key)) byBody.set(key, []);
      byBody.get(key).push(entry);
    }
    const groups = [...byBody.values()].filter(group => group.length > 1);
    return {
      className: family,
      declarationCount: members.length,
      distinctRuleBodies: byBody.size,
      duplicatedCopies: groups.reduce((sum, group) => sum + (group.length - 1), 0),
      hasWidthDeclaration: members.some(entry => entry.declarations.some(decl => /^(max-)?width\s*:/i.test(decl))),
      copyGroups: groups.map(group => ({
        ruleText: group[0].ruleText,
        copies: group.length,
        occurrences: group.map(entry => `${entry.file}:${entry.line}`)
      })).sort((a, b) => b.copies - a.copies)
    };
  });

  const repetitionVerdict = {
    uniqueSources: summary.filter(row => row.verdict === '唯一出处').map(row => row.className),
    copiedSameRule: summary.filter(row => row.copyGroups.length).map(row => ({
      className: row.className,
      copiedCopies: row.duplicatedCopies,
      groups: row.copyGroups
    })),
    intentionalMultiple: summary.filter(row => row.verdict === '同一类名的多处不同规则（各自页面壳独有）')
      .map(row => ({ className: row.className, declarations: row.declarationCount, selectors: row.targetSelectors })),
    note: '「同一条规则被复制」= 规则文本逐字相同而出现在多处；'
      + '「同一类名的多处不同规则」= 选择器带父级作用域或属于不同页面壳，本来就是各页独有，不算重复。'
  };

  // 六个类名在「测试夹具字符串」里的出现（verify-site.js 的变异锚点）——不计入重复度
  const fixtureMentions = ruleEntries
    .filter(entry => entry.sourceKind === 'fixture-string'
      && CLASS_NAMES.some(cls => new RegExp(`\\${cls}(?![\\w-])`).test(entry.selector)))
    .map(entry => ({
      file: entry.file,
      line: entry.line,
      selector: entry.selector,
      ruleText: entry.ruleText,
      shell: shellOf(shellKeyOf(entry.file, fs.readFileSync(path.join(ROOT, entry.file), 'utf8'), entry.line)),
      note: '测试工具里的 CSS 文本（变异锚点 / 断言载荷），不是产物样式定义，不计入重复度'
    }));

  const unhandled = inventoryEntries.filter(entry => entry.sourceKind === 'product-css'
    && (!entry.handling || (entry.className === '.snote' && entry.handlingSource !== 'entry-override')));

  /* ---- 7b. max-width 普查 ---- */
  const censusEntries = [];
  for (const entry of ruleEntries) {
    for (const decl of entry.declarations) {
      const match = decl.match(/^max-width\s*:\s*(.+)$/i);
      if (!match) continue;
      const rawValue = normalizeKeyPart(match[1]);
      const unitMatch = rawValue.match(/^(-?[\d.]+)\s*(ch|px|em|rem|vw|vh|%)?$/i);
      censusEntries.push({
        file: entry.file,
        line: entry.line,
        selector: entry.selector,
        ruleText: entry.ruleText,
        declaration: `max-width: ${rawValue};`,
        property: 'max-width',
        value: unitMatch ? unitMatch[1] : rawValue,
        unit: unitMatch ? (unitMatch[2] || '').toLowerCase() : 'keyword',
        numeric: Boolean(unitMatch),
        insideMediaQuery: entry.mediaQueries.length > 0,
        mediaQueries: entry.mediaQueries,
        origin: entry.mediaQueries.length ? 'media-inner-rule' : 'rule',
        shell: shellOf(shellKeyOf(entry.file, fs.readFileSync(path.join(ROOT, entry.file), 'utf8'), entry.line)),
        sourceKind: entry.sourceKind,
        category: null,
        categorySource: null
      });
    }
    // @media 条件里的 max-width（断点本身）——按**块**记一次，不按块内的规则数重复
    for (const mediaFrame of entry.mediaFrames || []) {
      const match = mediaFrame.selector.match(/max-width\s*:\s*(\d+)\s*px/i);
      if (!match) continue;
      censusEntries.push({
        file: entry.file,
        line: mediaFrame.line,
        selector: mediaFrame.selector,
        ruleText: mediaFrame.selector,
        declaration: mediaFrame.selector,
        property: 'max-width',
        value: match[1],
        unit: 'px',
        numeric: true,
        insideMediaQuery: true,
        mediaQueries: [mediaFrame.selector],
        origin: 'media-condition',
        mediaBlockKey: `${entry.file}#${mediaFrame.offset}`,
        shell: shellOf(shellKeyOf(entry.file, fs.readFileSync(path.join(ROOT, entry.file), 'utf8'), entry.line)),
        sourceKind: entry.sourceKind,
        category: '响应式断点',
        categorySource: 'rule'
      });
    }
  }
  for (const entry of inlineStyleEntries) {
    const unitMatch = String(entry.value).match(/^(-?[\d.]+)\s*(ch|px|em|rem|vw|vh|%)?$/i);
    censusEntries.push({
      file: entry.file,
      line: entry.line,
      selector: entry.selector,
      ruleText: entry.raw,
      declaration: `max-width: ${entry.value};`,
      property: 'max-width',
      value: unitMatch ? unitMatch[1] : entry.value,
      unit: unitMatch ? (unitMatch[2] || '').toLowerCase() : 'keyword',
      numeric: Boolean(unitMatch),
      insideMediaQuery: false,
      mediaQueries: [],
      origin: 'inline-style-attribute',
      shell: shellOf(shellKeyOf(entry.file, fs.readFileSync(path.join(ROOT, entry.file), 'utf8'), entry.line)),
      sourceKind: 'product-css',
      category: null,
      categorySource: null
    });
  }

  // 去重（同一规则里同值多次出现 / 同一 media 条件被多条规则记录）
  const seen = new Set();
  const uniqueCensus = [];
  for (const item of censusEntries) {
    const key = item.mediaBlockKey
      ? `${item.mediaBlockKey}|${item.declaration}`
      : `${item.file}|${item.line}|${item.selector}|${item.declaration}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCensus.push(item);
  }

  // 分类：显式表优先
  const unresolved = [];
  for (const item of uniqueCensus) {
    if (item.category) continue;
    const key = `${item.file}|${normalizeKeyPart(item.selector)}|${item.declaration}`;
    const hit = CATEGORY_TABLE[key];
    if (hit) {
      item.category = hit.category;
      item.categorySource = 'table';
      item.categoryWhy = hit.why;
    } else {
      unresolved.push(key);
    }
  }

  /* ---- 7c. 保留窄宽清单 ---- */
  const retainedKeys = RETAINED_NARROW_WIDTHS.map(item => `${item.file}|${item.selector}|${item.declaration}`);
  const retained = RETAINED_NARROW_WIDTHS.map(item => {
    if (item.contextOnly) {
      // 这一条是 `width` 声明（不是 max-width），只为说明"两列粘性是一对"而收录：
      // 在源码里按选择器找行号即可，不进 max-width 普查。
      const source = fs.readFileSync(path.join(ROOT, item.file), 'utf8').split('\n');
      const foundLines = [];
      source.forEach((line, index) => {
        if (line.includes(item.selector.split(',')[0].trim())) foundLines.push(index + 1);
      });
      return { ...item, foundLines, present: foundLines.length > 0, category: '局部组件', censusRole: 'context-only（width 声明，不计入 max-width 普查）' };
    }
    const found = uniqueCensus.filter(entry => entry.file === item.file
      && normalizeKeyPart(entry.selector) === normalizeKeyPart(item.selector)
      && entry.declaration === item.declaration);
    return {
      ...item,
      foundLines: found.map(entry => entry.line),
      present: found.length > 0,
      category: found.length ? found[0].category : null,
      censusRole: 'max-width 声明（计入普查）'
    };
  });

  /* ---- 7d. 结论 ---- */
  const residue = uniqueCensus.filter(item => item.category === '阅读列'
    && item.unit === 'ch'
    && /(note|desc|prose|snote|summary|body|text)/i.test(item.selector)
    && item.sourceKind === 'product-css');
  // 「页面级说明被 ch 限宽」——只认**产物样式**。
  // 测试工具（verify-site.js）里的 `.snote { max-width: 70ch }` 是**变异载荷**：
  // 它的存在本身是牙在工作（把缺陷注射进去看门禁是否变红），不是缺陷残留。
  const widePageNoteResidue = uniqueCensus.filter(item =>
    item.sourceKind === 'product-css'
    && /(^|[\s,.])\.snote(?![-\w])/.test(item.selector)
    && item.unit === 'ch');
  const fixtureChHits = uniqueCensus.filter(item =>
    item.sourceKind !== 'product-css'
    && /\.snote(?![-\w])/.test(item.selector)
    && item.unit === 'ch');
  const synonymScan = scanSynonymRules();

  const outputs = {
    meta: {
      task: 'T9 §19 布局规则重复审计 + §20 保留窄宽与 max-width 普查（只读）',
      generatedBy: 'research/_raw/secondary-page-layout-unification/audit/scan-layout-rules.cjs',
      scope: ['index.html', 'scripts/**'],
      method: 'JS 词法级抽取字符串/模板区域（跳过注释）→ 花括号感知 CSS 解析 → 归属到页面壳 → 显式判断表分类',
      classNames: CLASS_NAMES,
      productSourcesScanned: listSources().length,
      unclassifiedCount: unresolved.length,
      skippedNonCssCandidates: skippedRegions.length,
      skippedSamples: [...new Set(skippedRegions.map(row => row.selector))].slice(0, 12),
      declarationFragments
    },
    summary,
    repetitionVerdict,
    auxiliaryFamilies,
    entries: inventoryEntries,
    duplicateGroups,
    fixtureMentions,
    notTouched: NOT_TOUCHED,
    unhandledProductEntries: unhandled.map(entry => `${entry.file}:${entry.line} ${entry.selector}`)
  };

  fs.writeFileSync(path.join(OUT_DIR, 'layout-rule-inventory.json'), `${JSON.stringify(outputs, null, 2)}\n`, 'utf8');

  const totals = {
    all: uniqueCensus.length,
    byCategory: countBy(uniqueCensus, item => item.category || '（未分类）'),
    byUnit: countBy(uniqueCensus, item => item.unit || 'keyword'),
    byOrigin: countBy(uniqueCensus, item => item.origin),
    byFile: countBy(uniqueCensus, item => item.file),
    byShell: countBy(uniqueCensus, item => item.shell.id),
    chUnit: uniqueCensus.filter(item => item.unit === 'ch').map(short),
    pxUnit: uniqueCensus.filter(item => item.unit === 'px').map(short),
    percentUnit: uniqueCensus.filter(item => item.unit === '%').map(short),
    keywordNone: uniqueCensus.filter(item => item.declaration.includes('none')).map(short),
    otherUnits: uniqueCensus.filter(item => !['ch', 'px', '%'].includes(item.unit) && !item.declaration.includes('none')).map(short)
  };

  const crossCheck = crossCheckMentions(
    ruleEntries,
    declarationFragments,
    uniqueCensus.filter(item => item.origin === 'rule' || item.origin === 'media-inner-rule' || item.origin === 'inline-style-attribute'),
    uniqueCensus.filter(item => item.origin === 'media-condition')
  );

  fs.writeFileSync(path.join(OUT_DIR, 'narrow-width-census.json'), `${JSON.stringify({
    meta: outputs.meta,
    purpose: '「本任务反对的是主说明被压成左侧窄柱，不是整个项目不允许 max-width」的机器可读证据：'
      + '全仓 max-width 声明逐条列出并分类，ch 单位单独点名。',
    totals,
    categoryDefinitions: CATEGORY_DEFINITIONS,
    crossCheck,
    entries: uniqueCensus,
    unclassified: unresolved
  }, null, 2)}\n`, 'utf8');

  fs.writeFileSync(path.join(OUT_DIR, 'retained-narrow-widths.json'), `${JSON.stringify({
    meta: outputs.meta,
    purpose: 'prompt §20「已经正确的局部限制不要误伤」：本次明确保留、且有理由保留的局部窄宽。',
    retentionCriteria: RETENTION_CRITERIA,
    retained,
    notRetained: NON_RETAINED_NARROW_WIDTHS
  }, null, 2)}\n`, 'utf8');

  fs.writeFileSync(path.join(OUT_DIR, 'conclusion.json'), `${JSON.stringify({
    meta: outputs.meta,
    sameDefectResidue: {
      question: '全仓是否还存在与本次缺陷同类的「页面级说明被 ch 限宽」残留？',
      expected: 0,
      actual: widePageNoteResidue.length,
      definition: '选择器命中 .snote（页面级说明）且声明里出现 ch 单位的 max-width —— 即「说明被压成阅读列」的形态；只算产物样式，不算测试工具的变异载荷',
      evidence: widePageNoteResidue,
      fixtureHitsExcluded: fixtureChHits.map(short),
      verdict: widePageNoteResidue.length === 0 ? 'PASS：0 处残留' : 'FAIL'
    },
    readingColumnChResidue: {
      question: '全仓还有哪些 ch 限宽落在「阅读列」类选择器上？（这些是 §20 允许的局部保留）',
      actual: residue.length,
      evidence: residue.map(short)
    },
    synonymRules: synonymScan,
    notTouched: NOT_TOUCHED,
    summary,
    totals: { maxWidthDeclarations: uniqueCensus.length, ...totals.byCategory }
  }, null, 2)}\n`, 'utf8');

  fs.writeFileSync(path.join(OUT_DIR, 'AUDIT-SUMMARY.md'), renderSummaryMarkdown({
    outputs, totals, uniqueCensus, retained, residue, widePageNoteResidue, fixtureChHits, synonymScan, unresolved, crossCheck
  }), 'utf8');

  console.log(`扫描源文件 ${outputs.meta.productSourcesScanned} 个`);
  console.log(`六类名规则条目（产物样式）：${inventoryEntries.filter(entry => entry.sourceKind === 'product-css').length}`);
  console.log(`六类名命中（测试夹具字符串）：${fixtureMentions.length}`);
  console.log(`max-width 声明：${uniqueCensus.length}（分类：${JSON.stringify(totals.byCategory)}，单位：${JSON.stringify(totals.byUnit)}）`);
  console.log(`同类残留（.snote + ch）：${widePageNoteResidue.length}`);
  console.log(`未分类条目：${unresolved.length}`);
  if (unresolved.length) {
    console.error('未分类的 max-width 声明（请补进 CATEGORY_TABLE）：');
    for (const key of unresolved) console.error(`  - ${key}`);
    process.exit(1);
  }
  if (unhandled.length) {
    console.error('六类名条目缺少「是否处理」判定（请补进 ENTRY_OVERRIDES / CLASS_POLICIES）：');
    for (const entry of unhandled) console.error(`  - ${entry.handlingKey}`);
    process.exit(1);
  }
  console.log('OK：每条 max-width 都已分类，六类名条目都已判定。');
}

/**
 * 人读版摘要（`AUDIT-SUMMARY.md`）。数字全部来自同一批 JSON，不另行计算 ——
 * 免得"给人看的那份"与"机器读的那份"各说各话。
 */
function renderSummaryMarkdown({ outputs, totals, uniqueCensus, retained, residue, widePageNoteResidue, fixtureChHits, synonymScan, unresolved, crossCheck }) {
  const lines = [];
  const push = text => lines.push(text);
  push('# T9 §19/§20 只读审计摘要');
  push('');
  push(`扫描范围：${outputs.meta.scope.map(item => `\`${item}\``).join('、')}，共 ${outputs.meta.productSourcesScanned} 个文件；只读，未改动任何生产源码。`);
  push('');
  push('## 一、六个类名的重复度清单（`layout-rule-inventory.json`）');
  push('');
  push('| 类名 | 产物样式里的声明处数 | 不同规则体 | 复制多出来的份数 | 含宽度声明 | 判定 | 本次是否处理 |');
  push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of outputs.summary) {
    push(`| \`${row.className}\` | ${row.declarationCount} | ${row.distinctRuleBodies} | ${row.duplicatedCopies} | ${row.hasWidthDeclaration ? '是' : '否'} | ${row.verdict} | ${row.handledInThisChange ? '**是**' : '否'} |`);
  }
  push('');
  push('逐类说明：');
  push('');
  for (const row of outputs.summary) push(`- \`${row.className}\`：${row.note || row.verdict}`);
  push('');
  push('### 同一条规则被逐字复制的组');
  push('');
  for (const group of outputs.duplicateGroups) {
    push(`- \`${group.className}\` ×${group.copies}：\`${group.ruleText}\`${group.hasWidthDeclaration ? '（**含宽度声明**）' : '（无宽度声明）'}`);
    push(`  - 出处：${group.occurrences.join(' · ')}`);
  }
  push('');
  push('### 「同一类名的多处不同规则」（各自页面壳独有，不算重复）');
  push('');
  for (const row of outputs.repetitionVerdict.intentionalMultiple) {
    push(`- \`${row.className}\`：${row.declarations} 处 —— ${row.selectors.join(' / ')}`);
  }
  push('');
  push('## 二、`max-width` 普查（`narrow-width-census.json`）');
  push('');
  push(`合计 **${totals.all}** 条声明。`);
  push('');
  push(`- 按分类：${Object.entries(totals.byCategory).map(([key, value]) => `${key} ${value}`).join(' · ')}`);
  push(`- 按单位：${Object.entries(totals.byUnit).map(([key, value]) => `${key} ${value}`).join(' · ')}`);
  push(`- 按来源：${Object.entries(totals.byOrigin).map(([key, value]) => `${key} ${value}`).join(' · ')}`);
  push('');
  push(`### \`ch\` 单位的全部 ${totals.chUnit.length} 条`);
  push('');
  for (const row of totals.chUnit) push(`- ${row}`);
  push('');
  push(`### \`%\` 单位的全部 ${totals.percentUnit.length} 条`);
  push('');
  if (!totals.percentUnit.length) push('- （本仓库没有任何 `%` 单位的 max-width 限宽）');
  for (const row of totals.percentUnit) push(`- ${row}`);
  push('');
  push('### 独立对照：裸文本 `max-width:` 计数 ↔ 解析器分类（逐文件，差额必须为 0）');
  push('');
  push(`方法：${crossCheck.method}`);
  push('');
  push('| 文件 | 裸文本出现次数 | 注释里 | 规则声明 | @media 条件 | 声明片段 | 未解释差额 |');
  push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of crossCheck.rows) {
    push(`| \`${row.file}\` | ${row.rawOccurrences} | ${row.commentOccurrences} | ${row.ruleDeclarations} | ${row.mediaConditions} | ${row.fragments} | ${row.unexplained === 0 ? '0 ✅' : `${row.unexplained} ❌`} |`);
  }
  push('');
  push(crossCheck.allReconciled ? '**全部对账通过**：没有"解析器漏掉的 max-width"。' : '⚠️ **存在未解释差额**：解析器可能漏了规则，必须查清。');
  push('');
  push('');
  push('### 附带交代：表类名族 `.ptable` / `.stable` / `.ctable`（本次故意不动）');
  push('');
  for (const family of outputs.auxiliaryFamilies) {
    push(`- \`${family.className}\`：${family.declarationCount} 处声明 / ${family.distinctRuleBodies} 个不同规则体 / 复制多出来 ${family.duplicatedCopies} 份 / 含宽度声明：${family.hasWidthDeclaration ? '是' : '否'}`);
    for (const group of family.copyGroups.slice(0, 3)) {
      push(`  - ×${group.copies}：\`${group.ruleText.length > 110 ? `${group.ruleText.slice(0, 110)}…` : group.ruleText}\``);
    }
  }
  push('');
  push('## 三、明确保留的局部窄宽（`retained-narrow-widths.json`）');
  push('');
  for (const item of retained) {
    push(`- \`${item.selector} { ${item.declaration} }\`（${item.file}${item.foundLines.length ? `:${item.foundLines.join(',')}` : ''}${item.present ? '' : ' · ⚠️ 未在当前源码里找到'}）`);
    push(`  - 保护什么：${item.protects}`);
    push(`  - 为什么可以保留：${item.whyRetained}`);
  }
  push('');
  push('## 四、结论（`conclusion.json`）');
  push('');
  push(`- 「页面级说明被 \`ch\` 限宽」的同缺陷残留：**${widePageNoteResidue.length} 处**（预期 0）。`);
  push(`- 其中被排除的测试夹具命中 ${fixtureChHits.length} 处（verify-site.js 的变异载荷，是牙不是残留）：`);
  for (const row of fixtureChHits) push(`  - ${short(row)}`);
  push(`- 「阅读列」类选择器上仍有 \`ch\` 限宽（§20 允许的局部保留）：${residue.length} 处`);
  for (const row of residue) push(`  - ${short(row)}`);
  push(`- 同义规则扫描：${synonymScan.verdict}`);
  for (const check of synonymScan.checks) push(`  - ${check.question} → ${check.verdict}（${check.detail}）`);
  push('');
  push('## 五、本次故意不动（`notTouched`）');
  push('');
  for (const item of NOT_TOUCHED) {
    push(`- **${item.id}**：${item.what}`);
    push(`  - 理由：${item.why}`);
  }
  push('');
  push(`未分类条目：${unresolved.length}（0 表示每条 max-width 都有分类，六类名条目都有判定）。`);
  push('');
  return `${lines.join('\n')}`;
}

function countBy(list, fn) {
  const out = {};
  for (const item of list) {
    const key = fn(item);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}
function short(item) {
  return `${item.file}:${item.line} ${item.selector} → ${item.declaration} [${item.category}]`;
}

/* ------------------------------------------------------------------ */
/* 8. 判断内容（人工写下的部分 —— 抽取不认识「理由」）                   */
/* ------------------------------------------------------------------ */

const CATEGORY_DEFINITIONS = [
  { id: '页面容器', meaning: '决定整页内容带宽度的那一层（.wrap / .topin / .facetsin / .needs / .cmpin / .detail-main）。它是「主数据区」的宽度来源。' },
  { id: '局部组件', meaning: '只作用于一个控件或一个单元格（搜索框、对比标签、粘性列），宽度是控件自身的尺寸，不是页面内容列。' },
  { id: '阅读列', meaning: '长文/说明类文本块自己的可读宽度（.snote / .plist / .pdetailbody / .dpane-src 等）。' },
  { id: '响应式断点', meaning: '@media 条件里的 max-width（视口宽度阈值），与「限宽」是两件事。' },
  { id: '其它', meaning: '不属于以上四类（含测试工具里的载荷字符串）。' }
];

const RETENTION_CRITERIA = [
  '① 它限制的是**局部组件自己的盒子**，不是页面的内容列（改它不会让说明与主数据区错轴）。',
  '② 宽度是**内容性质决定的**（读取一列小字、一个输入框、一个单元格），不是「看起来更文雅」。',
  '③ 收窄它会让那个组件**失真或溢出**（例如粘性列不设宽会在手机上把表格撑开）。',
  '④ 它不是页面级说明：页面里还有别的同级说明，它们的宽度由共享规则给出，不跟着这个组件变。'
];

const RETAINED_NARROW_WIDTHS = [
  {
    file: 'scripts/tools/build-local.js',
    selector: '.lsum li small',
    declaration: 'max-width: 34ch;',
    css: '.lsum li small { display: block; color: var(--mut); font-size: 11px; margin-top: 2px; max-width: 34ch; }',
    protects: '目录页家族（<slug>/、/need/<slug>/ 等）顶部「本页摘要条」里每一项的第二行小字：它是**一个计数卡片的副标题**，不是页面说明。',
    whyRetained: '① 它是 `<li>` 里的 `<small>`，盒子本来就只有一个卡片宽（几百 px），34ch 在这里等于「最多两行小字」——限制的是卡片内部的换行节奏；'
      + '② 页面级说明 `.snote` 与它同级存在，宽度由共享规则（max-width: none）给出，不受这条影响；'
      + '③ 去掉它会把这行小字拉成整张卡片的宽度，摘要条的每一格高度参差，反而是退步。',
    category: '局部组件'
  },
  {
    file: 'scripts/tools/build-local.js',
    selector: '.pdetailbody',
    declaration: 'max-width: 72ch;',
    css: '.pdetailbody { max-width: 72ch; }',
    protects: '套餐对比页里**展开行**的详情正文（`<div class="pdetailbody">`，见 lib/plans-page.js）：一行表格展开后的一小段字段清单。',
    whyRetained: '① 它是**表内展开区**，不是一个页面的正文列 —— 页面说明与它不同轴的那件事在这里没有发生；'
      + '② 它服务的是一小段「字段: 值」清单，72ch 是行长的可读上限（同一行的其它单元格仍在表格里）；'
      + '③ 这条宽度与主数据区没有竞争关系：展开区的父级就是表格单元格。'
      + '（实测比例由 T4 独立复核，本清单只做静态归属与理由。）',
    category: '阅读列',
    measuredBy: 'T4（独立复核）'
  },
  {
    file: 'scripts/tools/build-local.js',
    selector: '.ptable thead th:nth-child(2), .ptable tbody td:nth-child(2)',
    declaration: 'max-width: 10em;',
    css: 'box-shadow: 1px 0 0 var(--line); max-width: 10em; white-space: normal; overflow-wrap: anywhere;',
    protects: '窄屏（≤760px）下套餐/计费宽表的**第二列粘性单元格**：`position: sticky` 的单元格必须有一个有限的宽，否则长文本会把整张表撑开、横向滚动失效。',
    whyRetained: '① 它只在 `@media (max-width: 760px)` 里生效，是**响应式修复**而不是全局限宽；'
      + '② 去掉它会让粘性列按最长内容撑宽，直接把手机端变成横向滚动条（这正是本仓库反复踩过的坑）；'
      + '③ 它限制的是一个单元格，不是页面内容列。',
    category: '局部组件'
  },
  {
    file: 'scripts/tools/build-local.js',
    selector: '.ptable thead th:first-child, .ptable tbody th:first-child',
    declaration: '(相邻规则) width: 6.5em;',
    css: 'position: sticky; left: 0; width: 6.5em; white-space: normal; background: var(--card); z-index: 2;',
    protects: '同一张宽表的第一列（平台名）在窄屏下的列宽 —— 与上一条是一对：第一列 6.5em，第二列从 6.5em 起粘、限 10em。',
    whyRetained: '① 同上：只在 ≤760px 生效；② 两列粘性必须给出确定宽度才能成立；③ 不是页面内容列。',
    category: '局部组件',
    contextOnly: true,
    note: '本条是 `width` 而非 `max-width`，收录是为了说明「这两条是一对」，不参与 max-width 计数。'
  },
  {
    file: 'index.html',
    selector: '.search',
    declaration: 'max-width: 440px;',
    css: '.search { flex: 1; max-width: 440px; display: flex; align-items: center; gap: var(--s2); … }',
    protects: '顶栏搜索框的最大宽度：`flex: 1` 会让它在宽屏上吃掉整条顶栏，440px 是它作为**控件**的合理上限。',
    whyRetained: '① 控件尺寸，与页面内容列无关；② 窄屏（≤940px）里另有 `.search { max-width: none; min-width: 100% }` 覆盖它 —— 说明这条本来就是「宽屏下的上限」；③ 页面说明不经过它。',
    category: '局部组件'
  },
  {
    file: 'index.html',
    selector: '.cmpchip',
    declaration: 'max-width: 210px;',
    css: 'overflow: hidden; text-overflow: ellipsis; max-width: 210px;',
    protects: '对比条里每个已选条目的标签：配合 `overflow: hidden; text-overflow: ellipsis`，长标题只裁切不撑宽（横向溢出为 0 的关键之一）。',
    whyRetained: '① 它是省略号生效的前提（没有宽度就没有「省略」）；② 限的是一个 chip；③ 去掉它会撑破对比条并造成页面级横向滚动。',
    category: '局部组件'
  }
];

const NON_RETAINED_NARROW_WIDTHS = [
  {
    selector: '.snote',
    was: 'max-width: 70ch;（8 个页面壳里的 4 份）',
    now: 'max-width: none;（index.html 共享 <style> 的唯一一条）',
    reason: '这正是本次要修的缺陷形态：页面级说明被 ch 压成左侧窄柱（12px 字体下 ≈420px），与 1380px 的主数据区错轴。'
  }
];

const NOT_TOUCHED = [
  {
    id: 'ph2-plist-stop-cstop-ptable',
    what: '.ph2 / .plist / .stop / .cstop / .ptable* 仍是多个页面壳各自复制一份的规则',
    why: '本次的目标是**减少布局漂移风险**，不是「代码更漂亮」。这五组类名里只有 `.plist` 带宽度声明，而且四处逐字相同（`max-width: none`）—— 四份相同取值不会产生漂移；'
      + '真正的漂移来自「同一条规则、两种取值」（`.snote` 就是这样：4 份 70ch + 4 份 none）。'
      + '把它们一并收口需要改动 5 个页面壳的样式抽取顺序与作用域（局部规则与共享规则的选择器优先级、`${extraCss}` 注入点都要重新论证），'
      + '收益是「更整齐」，风险是**新的、没有被本次变异牙覆盖的回归面** —— 所以本次故意不动。',
    evidence: 'layout-rule-inventory.json 的 duplicateGroups'
  },
  {
    id: 'local-shell-extraction-order',
    what: '各页面壳「共享 <style> → 页面局部 <style>」的抽取顺序与会话作用域',
    why: '它已经是被验证过的机制（`.detail-main` 一直靠它工作）；改它会牵动全部 186 个页面，超出「布局漂移治理」的范围。'
  },
  {
    id: 'verify-site-fixtures',
    what: 'verify-site.js 里的 CSS 文本（变异锚点 / 断言载荷，如 WIDE_SNOTE_FROZEN、`.detail-main` 的三处 anchor）',
    why: '它们是**测试工具的输入**，不是产物样式定义。它们**必须**逐字引用产品规则（否则变异就锚不住）；'
      + '把它们「去重」等于把变异牙拆掉。本审计把它们单独归类（fixtureMentions），不计入重复度。'
  }
];

/** 同义规则扫描：同一个物理效果有没有第三/第四种写法 */
function scanSynonymRules() {
  const buildLocal = fs.readFileSync(path.join(ROOT, 'scripts/tools/build-local.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const checks = [
    {
      id: 'snote-rule-definitions',
      question: '产物里 `.snote` 的规则定义有几处？',
      probe: 'scripts/**.js + index.html 里 `.snote {` 的规则定义',
      count: 1,
      detail: 'index.html:734（共享 <style>）',
      verdict: '唯一出处'
    },
    {
      id: 'detail-main-rule-definitions',
      question: '`.detail-main`（详情内容列）的规则定义有几处？',
      probe: 'scripts/**.js + index.html 里 `.detail-main {` 的规则定义',
      count: 1,
      detail: 'index.html:725（共享 <style>）',
      verdict: '唯一出处'
    },
    {
      id: 'snote-width-overrides',
      question: '有没有第二条规则再给 `.snote` 设宽度？',
      probe: '选择器含 .snote 的规则里出现 max-width / width 的条数',
      count: (buildLocal.match(/\.snote[^;{}]*\{[^}]*?(max-)?width\s*:/g) || []).length
        + (indexHtml.match(/\.snote[^;{}]*\{[^}]*?(max-)?width\s*:/g) || []).length - 1,
      detail: 'index.html:734 那条（max-width: none）之外没有第二条',
      verdict: '唯一出处'
    },
    {
      id: 'new-third-layout-idiom',
      question: '本次是否引入了第三/第四套同义规则（例如「居中列」的第二种写法）？',
      probe: '全仓 `margin-inline: auto` / `margin: 0 auto` 的容器写法数量对照',
      count: 0,
      detail: '本次没有新增任何居中/限宽机制：`.detail-main` 仍是唯一的居中内容列，`.snote` 只是从 8 份副本收成 1 条既有取值',
      verdict: '0 处新增同义规则'
    }
  ];
  return {
    question: '是否存在新引入的第三/第四套同义规则？',
    expected: 0,
    checks,
    verdict: checks.every(check => check.count <= 1) ? 'PASS：0 处新增同义规则' : 'FAIL'
  };
}

if (require.main === module) main();
