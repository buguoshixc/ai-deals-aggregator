/**
 * 站点归属验证（GSC / 百度搜索资源平台）—— **token 与注入块的唯一实现**（v1.8-seo-answer-pages）。
 *
 * ## 为什么要有这一层
 *
 * 两个平台的「HTML 标签验证」都要求在站点 head 里放一个 **token 由平台后台生成** 的 meta：
 *
 *   · Google Search Console：`<meta name="google-site-verification" content="…">`（URL 前缀属性）；
 *   · 百度搜索资源平台：`<meta name="baidu-site-verification" content="…">`（HTML 标签方式）。
 *
 * token 不能由我们发明（假 token = 验证失败，还会把「已提交」误当成「已收」），所以：
 *
 *   ① token 只存在 `scripts/data/site-verification.json` 这一张表里（含来源说明与获取日期）；
 *   ② `index.html` 的 `<head>` 只保留**注入点**（`<!-- SEO:VERIFICATION:START/END -->`），
 *      构建期按本表生成 meta —— 未配置时整块输出为空，不留占位符、不输出假 token；
 *   ③ 构建期自检对首页回读：配置了就必须恰好出现一次、没配置就必须一次都不出现。
 *
 * ## 纪律
 *
 *   · **纯函数 + 只读配置表**：本模块不写盘、不联网、不看时钟（可被离线自测直接调用）；
 *   · **失败要响**：配置文件缺失 / JSON 坏 / token 含引号或尖括号 ⇒ 直接抛错，
 *     而不是「静默跳过验证」（静默跳过的症状是线上一直验不过，而构建全绿）；
 *   · **不写第二份 token 字面量**：除本表外，全仓任何文件都不许出现 token 原文
 *     （`check-reproducible` 与人工复核都按「只有一张表」的口径看）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CONFIG_FILE = path.join(ROOT, 'scripts', 'data', 'site-verification.json');

/** `index.html` head 里的注入点（**整块**替换，包含标记本身）。 */
const MARKER_START = '<!-- SEO:VERIFICATION:START -->';
const MARKER_END = '<!-- SEO:VERIFICATION:END -->';

/** 两个平台的顺序即输出顺序（GSC 在前） */
const PROVIDERS = ['google', 'baidu'];

/** token 允许的字符集：平台生成的都是 ASCII 字母数字 / 连字符 / 下划线 / 点。 */
const TOKEN_RE = /^[A-Za-z0-9._-]+$/;

function readConfig(file = CONFIG_FILE) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`站点验证配置读取失败（${path.relative(ROOT, file)}）：${error.message}`);
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('站点验证配置必须是对象：{ google: {...}, baidu: {...} }');
  }
  for (const key of PROVIDERS) {
    const entry = doc[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`站点验证配置缺 ${key} 段（不允许缺少平台段 —— 缺了就等于悄悄放弃该渠道）`);
    }
    if (typeof entry.metaName !== 'string' || !/^[a-z0-9-]+$/.test(entry.metaName)) {
      throw new Error(`站点验证配置 ${key}.metaName 非法：${JSON.stringify(entry.metaName)}`);
    }
    if (entry.token !== null && (typeof entry.token !== 'string' || !TOKEN_RE.test(entry.token))) {
      throw new Error(`站点验证配置 ${key}.token 非法：只接受 null 或平台生成的 ASCII token（字母数字 . _ -）`);
    }
    if (entry.token === '') {
      throw new Error(`站点验证配置 ${key}.token 是空字符串 —— 「未配置」请写 null（空串与 null 混用会让状态不可读）`);
    }
  }
  return doc;
}

/** 已配置（拿到 token）的平台键 */
function configuredProviders(doc) {
  return PROVIDERS.filter(key => typeof doc[key].token === 'string' && doc[key].token);
}

/**
 * 生成 head 里的整块 HTML（包含 START/END 标记）。
 * 没配置任何平台时返回**只保留标记、不含 meta** 的块 —— 标记留在产物里是刻意的：
 * 它让「这个站有验证注入点」这件事在产物里仍然可见，也让下一次注入有落点。
 */
function renderBlock(doc) {
  const lines = [];
  for (const key of PROVIDERS) {
    const entry = doc[key];
    if (!entry.token) continue;
    lines.push(`<meta name="${entry.metaName}" content="${entry.token}">`);
  }
  return [MARKER_START, ...lines, MARKER_END].join('\n');
}

/**
 * 把 head 里的注入点替换成按配置生成的块。
 *
 * 注入点必须**恰好出现一次**：找不到 = index.html 被改坏了（注入静默失效），
 * 出现多次 = 同一段 HTML 有两个真值来源。两种都硬失败。
 */
function inject(html, doc) {
  const startCount = String(html).split(MARKER_START).length - 1;
  const endCount = String(html).split(MARKER_END).length - 1;
  if (startCount !== 1 || endCount !== 1) {
    throw new Error(`index.html 的验证注入点必须恰好各出现 1 次（实得 START ${startCount} / END ${endCount}）`
      + ' —— 注入点被改坏时「验证 meta 没生成」会静默上线，所以这里 fail-closed');
  }
  const start = html.indexOf(MARKER_START);
  const end = html.indexOf(MARKER_END) + MARKER_END.length;
  if (end < start) throw new Error('index.html 的验证注入点顺序反了（END 在 START 之前）');
  return `${html.slice(0, start)}${renderBlock(doc)}${html.slice(end)}`;
}

/** 给构建日志的一行摘要（不打印 token 本身） */
function summary(doc) {
  const configured = configuredProviders(doc);
  if (!configured.length) {
    return '0/2 已配置（token 均为 null —— 按站点主操作清单填入 scripts/data/site-verification.json 即可）';
  }
  return configured.map(key => {
    const entry = doc[key];
    const token = entry.token;
    const masked = `${token.slice(0, 4)}…${token.slice(-4)}`;
    return `${key}（${entry.metaName}，token ${masked}）`;
  }).join(' · ');
}

module.exports = {
  CONFIG_FILE,
  MARKER_START,
  MARKER_END,
  PROVIDERS,
  readConfig,
  configuredProviders,
  renderBlock,
  inject,
  summary
};
