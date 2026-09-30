/**
 * 能力 4（Phase D）：采集器补丁**候选**（只出 diff）。
 *
 * ## 为什么"出 diff"而不是"改文件"
 *
 * 改采集器 = 改生产数据的来源。这条链路上已经有三重门禁（采集前 validate、
 * gate 的完整链路、提交前的浏览器验收），但它们的共同前提是**改动是人有意识做出的**。
 * 所以本模块的边界画在这里：
 *
 *   · 只产出 unified diff 文本，**不写工作树**；
 *   · diff 的路径必须落在 `scripts/collectors/**`，越界一律拒收；
 *   · 出 diff 之后**在临时副本里真的应用一次并跑 fixture**，把"能不能用"变成数字；
 *   · 本仓库里**不存在**任何自动应用工具 —— 人看过之后自己 `git apply`。
 *
 * ## 为什么自证（应用 + 跑 fixture）很重要
 *
 * 没有自证，模型给的 diff 只是一段看起来合理的文本：改错一个选择器、少一个括号、
 * 把 `$.each` 写成 `$.map`，从文字上都看不出来。自证之后至少能回答两件事：
 *  ① 这段 diff 真的能应用到当前源码上吗（上下文行对得上吗）；
 *  ② 应用之后，fixture 还能解析出原来那些条目吗（回归了吗）。
 * 它**不能**回答"这样改是否真的修好了线上那个源"—— 那要人看真实页面。
 *
 * 执行位置：`.ai-cache/patch-scratch/<hash>/`，其中 `lib/`、`data/` 以 junction
 * 指回仓库，于是被改过的采集器能照常 require 到依赖，而真实源码一个字节都没动。
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const schemas = require('./schemas');
const cache = require('./cache');
const candidates = require('./candidates');
const registry = require('../collectors');
const { todayCN } = require('../lib/schema');

const TASK = 'patch_collector';
const PROMPT_VERSION = schemas.PROMPT_VERSIONS[TASK];
const ROOT = path.join(__dirname, '..', '..');
const FIXTURES_DIR = path.join(__dirname, '..', 'data', 'fixtures');
const MAX_SOURCE_CHARS = 6000;
const ALLOWED_PATH = /^scripts\/collectors\/[A-Za-z0-9._-]+\.js$/;

const SYSTEM = [
  '你在为一个网页采集器写补丁。你会拿到：关于它为什么坏掉的诊断、它的源码、以及一个最小 DOM 片段 fixture。',
  '',
  '铁律：',
  '1. 只输出 unified diff（`--- a/<文件>` / `+++ b/<文件>` / `@@` 块），不要输出完整文件、不要输出解释性前后缀。',
  '2. 只能改 `scripts/collectors/` 下的文件。',
  '3. 改动要**最小**：能改一个选择器就不要重写函数；不要顺手改风格、不要加依赖、不要动其它文件。',
  '4. 不要动 `fixture` 与 `expected.json` —— 它们是判据，不是可以改的东西。',
  '5. 如果不确定怎么改，就输出一个空的 diff（`files: []`）并在 rationale 里说明你缺少什么信息。' +
    '给一段猜的补丁比不给更坏：人还得先判断它是错的。',
  '6. 只输出一个 JSON 对象。'
].join('\n');

/* ------------------------------------------------------------------ */
/* unified diff 的最小应用器（只支持本场景：单文件、带上下文的 hunk）      */
/* ------------------------------------------------------------------ */

/** 解析 diff 的 hunk 头：`@@ -a,b +c,d @@` */
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * 把 unified diff 应用到一段文本上。
 * 只做"能否干净应用"的判断：上下文行必须逐字相等，否则拒绝。
 * @returns {{ok:boolean, text:string, files:string[], error:string|null, hunks:number}}
 */
function applyUnifiedDiff(originalText, diffText) {
  const lines = String(diffText || '').split(/\r?\n/);
  const files = [];
  let current = null;
  const hunks = [];

  for (const line of lines) {
    if (line.startsWith('--- ')) continue;
    if (line.startsWith('+++ ')) {
      const name = line.slice(4).trim().replace(/^b\//, '');
      files.push(name);
      current = { name, hunks: [] };
      hunks.push(current);
      continue;
    }
    const m = HUNK_RE.exec(line);
    if (m && current) {
      current.hunks.push({ start: Number(m[1]), length: m[2] === undefined ? 1 : Number(m[2]), lines: [] });
      continue;
    }
    if (current && current.hunks.length) {
      current.hunks[current.hunks.length - 1].lines.push(line);
    }
  }

  const named = hunks.filter(file => file.hunks.length);
  if (!named.length) return { ok: false, text: originalText, files, error: 'diff 里没有可应用的 hunk', hunks: 0 };
  if (named.length > 1) return { ok: false, text: originalText, files, error: `一次只接受单文件补丁，diff 里出现了 ${named.length} 个文件`, hunks: 0 };

  const file = named[0];
  const source = String(originalText).split(/\r?\n/);
  const out = [];
  let cursor = 0;
  let applied = 0;

  for (const hunk of file.hunks) {
    const target = Math.max(hunk.start - 1, 0);
    if (target < cursor) return { ok: false, text: originalText, files, error: `hunk 起点 ${hunk.start} 重叠`, hunks: applied };
    while (cursor < target) out.push(source[cursor++]);
    for (const raw of hunk.lines) {
      if (raw === '') continue; // diff 尾部的空行
      const marker = raw[0];
      const body = raw.slice(1);
      if (marker === ' ') {
        if (source[cursor] !== body) {
          return { ok: false, text: originalText, files, error: `第 ${cursor + 1} 行上下文对不上（期望「${body.slice(0, 40)}」，实际「${String(source[cursor] || '').slice(0, 40)}」）`, hunks: applied };
        }
        out.push(source[cursor++]);
      } else if (marker === '-') {
        if (source[cursor] !== body) {
          return { ok: false, text: originalText, files, error: `第 ${cursor + 1} 行待删内容对不上（期望「${body.slice(0, 40)}」）`, hunks: applied };
        }
        cursor++;
      } else if (marker === '+') {
        out.push(body);
      } else if (raw.startsWith('\\')) {
        /* "\ No newline at end of file"：忽略 */
      } else {
        return { ok: false, text: originalText, files, error: `无法识别的 diff 行「${raw.slice(0, 40)}」`, hunks: applied };
      }
    }
    applied++;
  }
  while (cursor < source.length) out.push(source[cursor++]);

  return { ok: true, text: out.join('\n'), files, error: null, hunks: applied };
}

/* ------------------------------------------------------------------ */
/* 单元                                                                */
/* ------------------------------------------------------------------ */

function collectorEntry(sourceId) {
  return registry.all().find(entry => entry.id === sourceId) || null;
}

/** 找最近一次诊断候选里关于这个来源的那一条 */
function latestDiagnosis(sourceId) {
  const file = candidates.latestCandidatesFile('diagnose');
  if (!file) return null;
  try {
    const payload = candidates.readCandidates(file);
    const found = (payload.candidates || []).find(item => item.dealId === null && item.key === sourceId)
      || (payload.candidates || []).find(item => item.candidate && item.candidate.causes && item.sourceId === sourceId);
    return found ? { file, candidate: found } : null;
  } catch (error) {
    return null;
  }
}

function fixtureOf(entry) {
  if (!entry || !entry.fixture) return null;
  const dir = path.join(FIXTURES_DIR, entry.fixture);
  const page = path.join(dir, 'page.min.html');
  const expected = path.join(dir, 'expected.json');
  if (!fs.existsSync(page) || !fs.existsSync(expected)) return null;
  return {
    dir,
    html: fs.readFileSync(page, 'utf8'),
    expected: JSON.parse(fs.readFileSync(expected, 'utf8'))
  };
}

function collectorFileOf(sourceId) {
  const dir = path.join(__dirname, '..', 'collectors');
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.js') || name === 'index.js') continue;
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    if (new RegExp(`id:\\s*'${sourceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(text)) {
      return { rel: `scripts/collectors/${name}`, abs: path.join(dir, name), source: text };
    }
  }
  return null;
}

async function units({ options = {} } = {}) {
  const only = options.only ? [].concat(options.only) : (options.source ? [options.source] : []);
  const ids = options.source ? [options.source] : only;
  const out = [];
  if (!ids.length) {
    // 没点名就用「最近一次诊断里出现过的来源」
    const file = candidates.latestCandidatesFile('diagnose');
    if (file) {
      const payload = candidates.readCandidates(file);
      for (const item of payload.candidates || []) if (item.key) ids.push(item.key);
    }
  }

  for (const sourceId of [...new Set(ids)]) {
    const entry = collectorEntry(sourceId);
    if (!entry) {
      out.push({ key: sourceId, dealId: null, field: null, sourceId, skipped: `没有注册的采集器 ${sourceId}` });
      continue;
    }
    const file = collectorFileOf(sourceId);
    if (!file) {
      out.push({ key: sourceId, dealId: null, field: null, sourceId, skipped: `找不到 ${sourceId} 的采集器文件` });
      continue;
    }
    const fixture = fixtureOf(entry);
    if (!fixture) {
      out.push({ key: sourceId, dealId: null, field: null, sourceId, skipped: `${sourceId} 还没有 fixture（先跑 node scripts/tools/build-fixtures.js --source=${sourceId}）` });
      continue;
    }
    const diagnosis = latestDiagnosis(sourceId);
    out.push({
      key: sourceId,
      dealId: null,
      field: null,
      sourceId,
      sourceUrl: fixture.expected.sourceUrl || null,
      file,
      fixture,
      diagnosis,
      meta: { trigger: diagnosis ? '诊断候选' : '无诊断（按 fixture 直接生成）', fixture: entry.fixture },
      content: buildContent({ sourceId, entry, file, fixture, diagnosis }).slice(0, options.maxInputChars || schemas.TASK_LIMITS[TASK])
    });
  }
  return out;
}

function buildContent({ sourceId, entry, file, fixture, diagnosis }) {
  const sample = (fixture.expected.items || []).slice(0, 3);
  return [
    `【来源】${sourceId}（${entry.name}）`,
    `【页面】${fixture.expected.sourceUrl}`,
    '',
    '【诊断候选】（可能是错的，请自行判断）',
    diagnosis ? JSON.stringify(diagnosis.candidate.candidate, null, 2).slice(0, 1500) : '（没有诊断候选）',
    '',
    '【当前采集器源码】',
    `文件：${file.rel}`,
    '```js',
    file.source.slice(0, MAX_SOURCE_CHARS),
    '```',
    '',
    '【最小 DOM 片段 fixture】',
    `判据：应用补丁后，这段片段必须仍然解析出期望的 ${(fixture.expected.items || []).length} 条。`,
    `期望条目的前 ${sample.length} 条：`,
    '```json',
    JSON.stringify(sample, null, 1).slice(0, 1200),
    '```',
    '',
    '【输出格式】',
    '{"unifiedDiff":"--- a/scripts/collectors/x.js\\n+++ b/scripts/collectors/x.js\\n@@ …","files":["scripts/collectors/x.js"],"rationale":"…","riskNotes":"可选"}'
  ].join('\n');
}

function interpret(result) {
  return {
    candidate: {
      unifiedDiff: result.unifiedDiff,
      files: result.files,
      rationale: result.rationale,
      riskNotes: result.riskNotes || null
    },
    evidence: [],
    confidence: {},
    notes: null
  };
}

/* ------------------------------------------------------------------ */
/* 自证：应用 + 跑 fixture                                             */
/* ------------------------------------------------------------------ */

function runFixtureParse(entry, html) {
  try {
    const items = entry.parse(html);
    return { ok: true, count: (items || []).length };
  } catch (error) {
    return { ok: false, count: 0, error: String(error.message || error).slice(0, 200) };
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 在临时副本里应用补丁并跑 fixture。
 * @returns {{applied:boolean, error:string|null, before:object, after:object|null, regression:boolean|null}}
 */
function selfVerify(unit, result) {
  const file = unit.file;
  const fixture = unit.fixture;
  const entry = collectorEntry(unit.sourceId);
  const before = runFixtureParse(entry, fixture.html);

  if (!result.unifiedDiff || !String(result.unifiedDiff).trim() || !(result.files || []).length) {
    return { applied: false, error: null, before, after: null, regression: null, note: '模型没有给出补丁（可能是它自己判断信息不足）' };
  }

  const files = [].concat(result.files);
  const outside = files.filter(name => !ALLOWED_PATH.test(String(name)));
  if (outside.length) {
    return { applied: false, error: `补丁越界：${outside.join(', ')}（只允许改 scripts/collectors/**）`, before, after: null, regression: null };
  }

  const applied = applyUnifiedDiff(file.source, result.unifiedDiff);
  if (!applied.ok) {
    return { applied: false, error: applied.error, before, after: null, regression: null, hunks: applied.hunks };
  }

  // 落到临时副本：collectors/<file>.js + lib/、data/ 的 junction 指回仓库。
  // 刻意**不用 cache.cacheDir()** 作为根：这个目录必须在仓库内部，
  // 否则补丁后的文件 require('cheerio') 会一路向上找不到 node_modules
  // （AI_CACHE_DIR 可能被指到仓库外，评测与自检就是这么用的）。
  const hash = cache.sha256(`${unit.sourceId}\0${result.unifiedDiff}`).slice(0, 12);
  const scratch = path.join(ROOT, '.ai-cache', 'patch-scratch', hash);
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.mkdirSync(path.join(scratch, 'collectors'), { recursive: true });
  fs.writeFileSync(path.join(scratch, 'collectors', path.basename(file.rel)), applied.text, 'utf8');
  for (const dir of ['lib', 'data']) {
    try {
      fs.symlinkSync(path.join(ROOT, 'scripts', dir), path.join(scratch, dir), 'junction');
    } catch (error) {
      return { applied: true, error: `建立临时依赖链接失败：${error.message}`, before, after: null, regression: null };
    }
  }

  let patched;
  try {
    const target = path.join(scratch, 'collectors', path.basename(file.rel));
    delete require.cache[require.resolve(target)];
    patched = require(target);
  } catch (error) {
    return { applied: true, error: `补丁后的文件无法加载：${String(error.message || error).slice(0, 200)}`, before, after: null, regression: null };
  }

  const patchedEntry = Array.isArray(patched) ? patched.find(item => item.id === unit.sourceId) : null;
  if (!patchedEntry || typeof patchedEntry.parse !== 'function') {
    return { applied: true, error: '补丁后的文件里找不到该采集器的 parse()', before, after: null, regression: null };
  }

  const after = runFixtureParse(patchedEntry, fixture.html);
  const regression = !after.ok || after.count !== (fixture.expected.items || []).length;
  return { applied: true, error: after.error || null, before, after, regression };
}

/** 任务特有规则：补丁必须能应用、必须只碰 collectors、应用后 fixture 不许回归 */
function extraRules(unit, result) {
  const verify = selfVerify(unit, result);
  const errors = [];
  if (verify.error && !verify.applied) errors.push(`补丁无法应用：${verify.error}`);
  if (verify.error && verify.applied) errors.push(`补丁自证失败：${verify.error}`);
  if (verify.regression) {
    errors.push(`补丁造成 fixture 回归：期望 ${(unit.fixture.expected.items || []).length} 条，实际 ${verify.after ? verify.after.count : 0} 条`);
  }
  return {
    errors,
    flags: verify.regression === false ? [] : [{ code: 'unverified_patch', field: null, detail: '补丁未通过 fixture 自证' }],
    deterministic: {
      patchApplies: verify.applied ? 'pass' : 'fail',
      fixtureRegression: verify.regression === null ? 'n/a' : (verify.regression ? 'fail' : 'pass'),
      fixtureBefore: verify.before ? verify.before.count : null,
      fixtureAfter: verify.after ? verify.after.count : null
    },
    verify
  };
}

module.exports = {
  TASK,
  PROMPT_VERSION,
  SYSTEM,
  units,
  interpret,
  extraRules,
  applyUnifiedDiff,
  selfVerify,
  latestDiagnosis,
  collectorFileOf,
  fixtureOf,
  ALLOWED_PATH,
  MAX_SOURCE_CHARS
};
