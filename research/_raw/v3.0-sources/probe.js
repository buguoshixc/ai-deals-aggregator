#!/usr/bin/env node
/**
 * A3（v3.0 Stage C）联网取证探针 —— **研究用脚本，不参与生产链路**。
 *
 * 目的：对每一家候选官方来源做两件事，并把结果落成可核对的原始证据：
 *   1. 静态抓取（lib/http.js，走 robots.txt）：判断"不渲染能不能拿到正文"；
 *   2. 无头渲染（lib/browser.js，只抓公开页、不带登录态）：判断"渲染后正文里到底有没有价格"。
 *
 * 输出（都在本目录下）：
 *   text/<slug>.txt       渲染后的 innerText（用户可见正文）
 *   domtext/<slug>.txt    整个 DOM 的文本（含未激活 tab 面板；价格表常藏在这里）
 *   html/<slug>.html      渲染后的 HTML（只作证据，供事后复核选择器）
 *   index.json            逐条元数据：静态/渲染字节数、表格数、价格命中、登录墙、验证码、JS 依赖
 *
 * 用法：
 *   node research/_raw/v3.0-sources/probe.js                # 全部来源
 *   node research/_raw/v3.0-sources/probe.js --only=kimi-code,aliyun-bailian
 *
 * 硬边界：只抓公开页；不注入 cookie、不加载 profile、不传凭据；遵守 robots.txt。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const http = require('../../../scripts/lib/http');
const { renderAll, detectChannel } = require('../../../scripts/lib/browser');

const OUT_DIR = __dirname;
const DIRS = {
  text: path.join(OUT_DIR, 'text'),
  domtext: path.join(OUT_DIR, 'domtext'),
  html: path.join(OUT_DIR, 'html')
};

/**
 * 候选来源清单。stage 字段标明它属于题面 Stage C 的哪一段：
 *   C1 = Coding Plan / Developer Plan / Token Plan / Coding Subscription
 *   C2 = API Pricing（重点：历史未采信的 6 家 + 其他高价值 provider）
 */
const SOURCES = [
  // ---------------- C1 Coding Plan ----------------
  { slug: 'volcengine-codingplan', provider: '火山方舟', stage: 'C1', url: 'https://ai.volcengine.com/activity/codingplan' },
  { slug: 'volcengine-ark-subscribe', provider: '火山方舟', stage: 'C1', url: 'https://www.volcengine.com/product/ark' },
  { slug: 'qoder-pricing', provider: 'Qoder CN', stage: 'C1', url: 'https://qoder.com/pricing' },
  { slug: 'qoder-docs-pricing-md', provider: 'Qoder CN', stage: 'C1', url: 'https://docs.qoder.com/account/pricing.md' },
  { slug: 'codebuddy-ai-pricing', provider: '腾讯 CodeBuddy', stage: 'C1', url: 'https://www.codebuddy.ai/docs/zh/ide/Account/pricing' },
  { slug: 'codebuddy-cn-pricing', provider: '腾讯 CodeBuddy', stage: 'C1', url: 'https://www.codebuddy.cn/docs/ide/Account/pricing' },
  { slug: 'github-copilot-plans', provider: 'GitHub', stage: 'C1', url: 'https://github.com/features/copilot/plans' },
  { slug: 'cursor-pricing', provider: 'Cursor', stage: 'C1', url: 'https://cursor.com/pricing' },
  { slug: 'trae-cn-pricing', provider: 'Trae', stage: 'C1', url: 'https://www.trae.cn/pricing' },
  { slug: 'zhipu-coding-plan', provider: '智谱AI', stage: 'C1', url: 'https://docs.bigmodel.cn/cn/coding-plan/overview' },
  { slug: 'zhipu-pricing', provider: '智谱AI', stage: 'C1', url: 'https://bigmodel.cn/pricing' },
  { slug: 'minimax-token-plan', provider: 'MiniMax（稀宇科技）', stage: 'C1', url: 'https://platform.minimax.cn/docs/guides/pricing-token-plan' },
  { slug: 'minimax-token-plan-team', provider: 'MiniMax（稀宇科技）', stage: 'C1', url: 'https://platform.minimax.cn/docs/guides/pricing-token-plan-team' },
  { slug: 'kimi-code', provider: '月之暗面', stage: 'C1', url: 'https://www.kimi.ai/code' },
  { slug: 'kimi-membership-pricing', provider: '月之暗面', stage: 'C1', url: 'https://www.kimi.ai/membership/pricing' },
  { slug: 'kimi-code-docs', provider: '月之暗面', stage: 'C1', url: 'https://www.kimi.com/code/docs/en/' },
  { slug: 'windsurf-pricing', provider: 'Windsurf', stage: 'C1', url: 'https://windsurf.com/pricing' },
  { slug: 'baidu-comate-pricing', provider: '百度智能云', stage: 'C1', url: 'https://comate.baidu.com/zh/pricing' },
  { slug: 'iflytek-iflycode', provider: '科大讯飞 讯飞开放平台', stage: 'C1', url: 'https://www.xfyun.cn/solutions/iflycode' },
  { slug: 'anthropic-pricing', provider: 'Anthropic', stage: 'C1', url: 'https://www.anthropic.com/pricing' },
  { slug: 'openai-chatgpt-pricing', provider: 'OpenAI', stage: 'C1', url: 'https://openai.com/chatgpt/pricing/' },
  { slug: 'google-code-assist', provider: 'Google', stage: 'C1', url: 'https://codeassist.google/' },

  // ---------------- C2 API Pricing ----------------
  { slug: 'aliyun-bailian-pricing', provider: '阿里云百炼', stage: 'C2', url: 'https://help.aliyun.com/zh/model-studio/model-pricing' },
  { slug: 'aliyun-bailian-free-quota', provider: '阿里云百炼', stage: 'C2', url: 'https://help.aliyun.com/zh/model-studio/new-free-quota' },
  { slug: 'volcengine-ark-pricing', provider: '火山方舟', stage: 'C2', url: 'https://ark.volcengine.com/region:cn-beijing/docs/ark/model-pricing?lang=zh' },
  { slug: 'volcengine-docs-pricing', provider: '火山方舟', stage: 'C2', url: 'https://www.volcengine.com/docs/82379/1099320' },
  { slug: 'kimi-api-pricing', provider: '月之暗面', stage: 'C2', url: 'https://platform.kimi.com/docs/pricing/chat' },
  { slug: 'kimi-api-batch', provider: '月之暗面', stage: 'C2', url: 'https://platform.kimi.com/docs/pricing/batch' },
  { slug: 'minimax-paygo', provider: 'MiniMax（稀宇科技）', stage: 'C2', url: 'https://platform.minimax.cn/docs/guides/pricing-paygo' },
  { slug: 'siliconflow-pricing', provider: '硅基流动', stage: 'C2', url: 'https://siliconflow.cn/pricing' },
  { slug: 'siliconflow-docs', provider: '硅基流动', stage: 'C2', url: 'https://api-docs.siliconflow.cn' },
  { slug: 'mistral-pricing', provider: 'Mistral', stage: 'C2', url: 'https://mistral.ai/pricing' },
  { slug: 'mistral-docs-models', provider: 'Mistral', stage: 'C2', url: 'https://docs.mistral.ai/getting-started/models/models_overview/' },
  { slug: 'stepfun-pricing', provider: '阶跃星辰 StepFun', stage: 'C2', url: 'https://platform.stepfun.com/docs/pricing/details' },
  { slug: 'baichuan-pricing', provider: '百川智能 Baichuan', stage: 'C2', url: 'https://platform.baichuan-ai.com/price' },
  { slug: 'tencent-hunyuan-pricing', provider: '腾讯云 混元大模型', stage: 'C2', url: 'https://cloud.tencent.com/document/product/1729/97731' },
  { slug: 'qianfan-pricing', provider: '百度智能云', stage: 'C2', url: 'https://cloud.baidu.com/doc/qianfan/s/Imi2rpirg' },
  { slug: 'openai-api-pricing', provider: 'OpenAI', stage: 'C2', url: 'https://openai.com/api/pricing/' },
  { slug: 'gemini-api-pricing', provider: 'Google', stage: 'C2', url: 'https://ai.google.dev/gemini-api/docs/pricing' },
  { slug: 'sensenova-pricing', provider: '商汤科技 SenseTime', stage: 'C2', url: 'https://platform.sensenova.cn/doc?path=/docs/API/price.md' }
];

const PRICE_PATTERNS = [
  /每百万\s*(Token|token|tokens)/,
  /元\s*\/\s*百万/,
  /¥\s*[\d.]/,
  /\$\s*[\d.]+/,
  /per\s+1M/i,
  /\/\s*M\s*tokens/i,
  /输入价格/,
  /输出价格/,
  /input\s+price/i,
  /output\s+price/i
];

const LOGIN_PATTERNS = [/登录后查看/, /请先登录/, /sign\s*in\s*to\s+(view|see)/i, /log\s*in\s+to\s+(view|see)/i, /登录以查看/];
const CAPTCHA_PATTERNS = [/captcha/i, /验证码/, /人机验证/, /cloudflare/i, /访问受限/];

function countPriceHits(text) {
  let hits = 0;
  for (const re of PRICE_PATTERNS) {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    const found = text.match(global);
    if (found) hits += found.length;
  }
  return hits;
}

function matchesAny(patterns, text) {
  return patterns.some(re => re.test(text));
}

function slugOf(url) {
  return url.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_').slice(0, 80);
}

async function staticProbe(url) {
  try {
    const allowed = await http.isAllowedByRobots(url);
    if (!allowed) return { ok: false, reason: 'robots.txt 不允许抓取', status: null, bytes: 0, textLength: 0, tableCount: 0 };
    const html = await http.getText(url);
    const $ = cheerio.load(html);
    $('script,style,noscript,svg').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    return {
      ok: true,
      reason: null,
      status: 200,
      bytes: html.length,
      textLength: text.length,
      tableCount: $('table').length,
      priceHits: countPriceHits(text),
      text: text.slice(0, 4000)
    };
  } catch (error) {
    return { ok: false, reason: http.describeError ? http.describeError(error) : String(error.message), status: null, bytes: 0, textLength: 0, tableCount: 0, priceHits: 0 };
  }
}

async function main() {
  for (const dir of Object.values(DIRS)) fs.mkdirSync(dir, { recursive: true });

  const onlyArg = process.argv.find(a => a.startsWith('--only='));
  const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').filter(Boolean)) : null;
  const targets = SOURCES.filter(source => !only || only.has(source.slug));

  const channel = await detectChannel();
  console.log(`浏览器内核: ${channel || '(不可用)'}`);
  console.log(`来源数: ${targets.length}`);

  const results = [];
  for (const source of targets) {
    const row = {
      slug: source.slug,
      provider: source.provider,
      stage: source.stage,
      url: source.url,
      checkedAt: new Date().toISOString()
    };

    console.log(`\n=== ${source.slug} (${source.stage}) ${source.url}`);
    const stat = await staticProbe(source.url);
    row.static = {
      ok: stat.ok,
      reason: stat.reason,
      status: stat.status,
      bytes: stat.bytes,
      textLength: stat.textLength,
      tableCount: stat.tableCount,
      priceHits: stat.priceHits
    };
    console.log(`  静态：ok=${stat.ok} bytes=${stat.bytes} text=${stat.textLength} tables=${stat.tableCount} priceHits=${stat.priceHits}${stat.reason ? ' reason=' + stat.reason : ''}`);

    if (channel) {
      let rendered = null;
      try {
        const list = await renderAll([source.url], { diagnostics: true, settleWait: 900 });
        rendered = list[0];
      } catch (error) {
        rendered = { url: source.url, error: String(error.message).split('\n')[0] };
      }

      if (rendered.error) {
        row.render = { ok: false, reason: rendered.error };
        console.log(`  渲染：失败 ${rendered.error}`);
      } else {
        fs.writeFileSync(path.join(DIRS.text, `${source.slug}.txt`), rendered.text || '');
        fs.writeFileSync(path.join(DIRS.domtext, `${source.slug}.txt`), rendered.domText || '');
        fs.writeFileSync(path.join(DIRS.html, `${source.slug}.html`), rendered.html || '');
        const domText = rendered.domText || '';
        row.render = {
          ok: true,
          finalUrl: rendered.url,
          title: rendered.title,
          htmlBytes: (rendered.html || '').length,
          textLength: (rendered.text || '').length,
          domTextLength: domText.length,
          tableCount: (rendered.html.match(/<table/g) || []).length,
          priceHits: countPriceHits(domText),
          loginWall: matchesAny(LOGIN_PATTERNS, domText),
          captcha: matchesAny(CAPTCHA_PATTERNS, domText),
          notes: rendered.notes || [],
          consoleErrors: (rendered.consoleErrors || []).slice(0, 3),
          failedRequests: (rendered.failedRequests || []).slice(0, 3),
          jsOnly: stat.ok && stat.textLength < 1200 && domText.length > 3000,
          sample: domText.slice(0, 600)
        };
        console.log(`  渲染：title=${rendered.title || '(空)'} domText=${domText.length} text=${(rendered.text || '').length} tables=${row.render.tableCount} priceHits=${row.render.priceHits} login=${row.render.loginWall} jsOnly=${row.render.jsOnly}`);
      }
    }
    results.push(row);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), browser: channel, sources: results }, null, 2)}\n`);
  console.log(`\n写出 ${path.join(OUT_DIR, 'index.json')}`);
}

main().catch(error => {
  console.error('probe 失败:', error);
  process.exit(1);
});
