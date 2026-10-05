#!/usr/bin/env node
/**
 * 只读取证（t4 / Workstream C-1）：futurepedia 的**无头路径稳定性读数**。
 *
 * 为什么要有它：「headless-migrate」这条裁决必须附**连续多次采集的稳定性读数**
 * （题面 §29 第 3 问 / 契约硬约束 2）。本探针用生产无头链路（lib/browser.js 的 withPage/render）
 * 连跑 N 轮，每轮记录：时间戳 / 秒级耗时 / HTML 字节 / 生产解析器 parseFuturepediaList() 的条目数
 * 与标题 / 摘要标记（验证码、登录、Cloudflare 挑战、SPA 空壳）/ 控制台错误 / 失败请求。
 *
 * 局限（必须与读数一起写进报告）：
 *   · 出口网络是本机（zone trace 显示 loc=CN / colo=SEA），**不是** GitHub Actions 的出口；
 *     所以「本机无头稳定」不能推出「CI 无头也稳定」，反之亦然。
 *   · 本探针不写任何生产文件。
 *
 * 用法：node probe-futurepedia-headless.cjs [--rounds=3] [--url=https://www.futurepedia.io/]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const browser = require(path.join(ROOT, 'scripts', 'lib', 'browser'));
const domDigest = require(path.join(ROOT, 'scripts', 'lib', 'dom-digest'));
const registry = require(path.join(ROOT, 'scripts', 'collectors'));

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const ROUNDS = Number(opt('rounds', '3'));
const URL_TARGET = opt('url', 'https://www.futurepedia.io/');

async function main() {
  const collector = registry.all({ headless: true }).find(c => c.id === 'futurepedia');
  const probes = domDigest.probesFor('futurepedia');
  const artifact = {
    probe: 'probe-futurepedia-headless.cjs',
    target: URL_TARGET,
    rounds: ROUNDS,
    ranAtUtc: new Date().toISOString(),
    channel: null,
    launchStatusBefore: browser.getLaunchStatus(),
    results: [],
    notes: [
      '无头路径走的也是生产 lib/browser.js（与 cn_zhipu_pricing / cn_volc_ark 同一条链路）。',
      '本机出口 ≠ CI 出口：读数只在「本机是否稳定」这一层成立。'
    ]
  };

  for (let i = 1; i <= ROUNDS; i++) {
    const startedAt = new Date();
    const started = Date.now();
    let result;
    try {
      const rendered = await browser.withPage(async page => {
        const r = await browser.render(page, URL_TARGET, {
          waitForText: ['/tool/', 'Futurepedia'],
          timeout: 30000,
          settleWait: 600,
          diagnostics: true
        });
        return r;
      });
      const parsed = typeof collector.parse === 'function' ? collector.parse(rendered.html) : [];
      const digest = domDigest.digest(rendered.html, { probes, url: rendered.url });
      result = {
        round: i,
        startedAtUtc: startedAt.toISOString(),
        ms: Date.now() - started,
        ok: true,
        finalUrl: rendered.url,
        title: rendered.title,
        htmlBytes: rendered.html.length,
        domTextLength: rendered.domText.length,
        visibleTextLength: rendered.text.length,
        notes: rendered.notes,
        matchedNeedle: rendered.matchedNeedle,
        consoleErrors: rendered.consoleErrors.slice(0, 10),
        failedRequests: rendered.failedRequests.slice(0, 10),
        parseItems: parsed.length,
        parseTitles: parsed.map(p => p.title),
        parsePageUrls: parsed.map(p => p.pageUrl),
        digest: {
          markers: digest.markers,
          shape: digest.shape,
          counts: digest.counts,
          textLength: digest.textLength,
          selectorHits: digest.selectorHits,
          htmlSha256: digest.htmlSha256
        }
      };
    } catch (error) {
      result = {
        round: i,
        startedAtUtc: startedAt.toISOString(),
        ms: Date.now() - started,
        ok: false,
        error: String(error.message || error).split('\n')[0].slice(0, 300),
        code: error.code || null
      };
    }
    console.log(`  轮 ${i}: ok=${result.ok} ms=${result.ms} items=${result.parseItems === undefined ? '-' : result.parseItems} ${result.error || ''}`);
    artifact.results.push(result);
    if (i < ROUNDS) await new Promise(resolve => setTimeout(resolve, 1500));
  }

  artifact.launchStatusAfter = browser.getLaunchStatus();
  artifact.channel = artifact.launchStatusAfter.channel;
  const okRounds = artifact.results.filter(r => r.ok).length;
  const counts = artifact.results.map(r => (r.parseItems === undefined ? null : r.parseItems));
  artifact.summary = {
    rounds: ROUNDS,
    okRounds,
    errorRounds: ROUNDS - okRounds,
    itemCounts: counts,
    stableItemCount: new Set(counts).size === 1,
    medianMs: (() => {
      const list = artifact.results.map(r => r.ms).sort((a, b) => a - b);
      return list.length % 2 ? list[(list.length - 1) / 2] : Math.round((list[list.length / 2 - 1] + list[list.length / 2]) / 2);
    })(),
    maxMs: Math.max(...artifact.results.map(r => r.ms)),
    identicalTitles: new Set(artifact.results.filter(r => r.ok).map(r => (r.parseTitles || []).join('|'))).size === 1
  };

  const outFile = path.join(__dirname, 'headless-futurepedia-stability.json');
  fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(`[headless-stability] ${JSON.stringify(artifact.summary)}`);
  console.log(`[headless-stability] channel=${artifact.channel} 写出: ${outFile}`);
}

main().catch(error => {
  console.error(`[headless-stability] 失败: ${error.stack || error.message}`);
  process.exit(1);
});
