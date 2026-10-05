#!/usr/bin/env node
/**
 * coverage-depth-v1：为 Workstream A 的官方页原件生成**可复核清单**。
 *
 * 背景（为什么要它）：`release-evidence/raw/` 里 96 份官方页原件约 38 MB。仓库对这类
 * **原始第三方快照**已有明确纪律 —— `.gitignore` 里 v3.0 的先例写着「不入库」，只入库
 * 离线索引（`research/_raw/v3.0-sources/README.md` 与它的 index.json）。本轮沿用同一条纪律，
 * 但必须补上那份索引：否则「原始件不入库」就变成「证据不可复核」。
 *
 * 本清单给出每份原件的：文件名 / 字节数 / sha256 / 本地抓取时间（文件 mtime，UTC）/
 * 对应官方 URL（来自同目录的 `sources-round1.tsv` / `sources-round2.tsv` 的 url<TAB>保存名 映射）。
 *
 * 只读原件、只写清单本身。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = __dirname;
const RAW = path.join(DIR, 'raw');
const OUT = path.join(DIR, 'raw-manifest.json');

function urlMap() {
  const map = new Map();
  for (const name of ['sources-round1.tsv', 'sources-round2.tsv']) {
    const file = path.join(DIR, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const [url, saved] = line.split('\t');
      if (url && saved) map.set(saved.trim(), url.trim());
    }
  }
  return map;
}

/**
 * TSV 只覆盖了 round1/round2 的清单；其余原件是临时 probe 抓的。好消息是**原件自己就带着出处**：
 * HTML 的 `<link rel="canonical">` 或 `<meta property="og:url">` 就是它被发布时的规范 URL。
 * 优先用原件自述，其次才回落到 TSV —— 前者是页面自己的事实，后者是我们的清单。
 */
function selfReportedUrl(text) {
  const canonical = text.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
    || text.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  if (canonical) return canonical[1];
  const og = text.match(/<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i)
    || text.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:url["']/i);
  if (og) return og[1];
  return null;
}

function main() {
  if (!fs.existsSync(RAW)) {
    console.error('找不到 raw/ 目录');
    return 1;
  }
  const urls = urlMap();
  const files = fs.readdirSync(RAW).filter(f => !f.startsWith('.')).sort();
  const entries = files.map(name => {
    const full = path.join(RAW, name);
    const buf = fs.readFileSync(full);
    const st = fs.statSync(full);
    const text = /\.(html?|xml)$/i.test(name) ? buf.toString('utf8') : '';
    const selfUrl = text ? selfReportedUrl(text) : null;
    const tsvUrl = urls.get(name) || null;
    return {
      file: `raw/${name}`,
      bytes: buf.length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      fileMtimeUtc: st.mtime.toISOString(),
      url: selfUrl || tsvUrl || null,
      urlSource: selfUrl ? 'self-reported(canonical/og:url)' : (tsvUrl ? 'tsv-manifest' : null)
    };
  });

  const unmapped = entries.filter(e => !e.url).map(e => e.file);
  const doc = {
    _what: 'coverage-depth-v1 Workstream A 官方页原件的可复核清单',
    _why: 'raw/ 下 96 份原始第三方快照约 38 MB，按仓库既有纪律（.gitignore 的 v3.0-sources 先例）不入版本库；本清单是它的离线索引，保证「原件不入库」不等于「证据不可复核」',
    _howToRecheck: '按 url 重新抓取后与本清单的 sha256 对比（页面随时间变化属正常，此时以 research/coverage-depth-v1-release-evidence.md 里逐条记录的 quote 与 capturedAt 为准）；未入库的原件仍留在提交者本地同一路径',
    generatedAt: new Date().toISOString(),
    fileCount: entries.length,
    totalBytes: entries.reduce((n, e) => n + e.bytes, 0),
    mappedToUrl: entries.length - unmapped.length,
    unmappedFiles: unmapped,
    entries
  };
  fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  console.log(`✅ 清单已写出：${path.relative(process.cwd(), OUT)}`);
  console.log(`   原件 ${doc.fileCount} 份 / ${(doc.totalBytes / 1048576).toFixed(2)} MB · 有 URL 映射 ${doc.mappedToUrl} · 无映射 ${unmapped.length}`);
  if (unmapped.length) console.log(`   无映射：${unmapped.slice(0, 10).join(', ')}${unmapped.length > 10 ? ' …' : ''}`);
  return 0;
}

process.exit(main());
