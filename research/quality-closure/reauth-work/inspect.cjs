'use strict';
/** T23 再审计：A 例的完整判红原文 + /feeds/ 页面地址计数口径 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const A = 'D:\\qc-t23\\cases\\A-m19-shape';
if (fs.existsSync(A)) {
  const r = spawnSync('node scripts/tools/models-page-selftest.js --dir=dist', { cwd: A, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  console.log(`=== A：models-page-selftest --dir=dist → exit ${r.status} ===`);
  const lines = `${r.stdout || ''}${r.stderr || ''}`.split('\n').filter(l => /✗|❌|格「|逐格|对账/.test(l));
  lines.slice(0, 14).forEach(l => console.log('   ' + l.trim()));
}

const FEEDS = 'D:\\qc-t23\\gold\\dist\\feeds\\index.html';
const html = fs.readFileSync(FEEDS, 'utf8');
console.log('\n=== /feeds/ 页面统计（多种口径） ===');
const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
const feedHrefs = hrefs.filter(h => /feed\.(xml|json)$/.test(h) || /\/feed\//.test(h));
const feedText = [...html.matchAll(/(?:https?:\/\/[^\s"'<>]+|\/[A-Za-z0-9._/-]+)(?:feed\.(?:xml|json)|\/feed\/)/g)].map(m => m[0]);
console.log('href 总数', hrefs.length, '· 其中 feed 相关 href', feedHrefs.length, '· 唯一', new Set(feedHrefs).size);
console.log('文本匹配 feed 串', feedText.length, '· 唯一', new Set(feedText).size);
console.log('rel="alternate"', (html.match(/rel="alternate"/g) || []).length);
console.log('rel="alternate" href 唯一', new Set([...html.matchAll(/rel="alternate"[^>]*href="([^"]+)"/g)].map(m => m[1])).size);
// 抽样看 48 个地址长什么样
const sample = [...new Set(feedHrefs)].slice(0, 8);
console.log('feed href 抽样：\n   ' + sample.join('\n   '));
// 页面里出现的 code/listing 结构
const codeBlocks = [...html.matchAll(/<code[^>]*>([^<]*)<\/code>/g)].map(m => m[1].trim());
console.log('code 块数', codeBlocks.length, '· 前 5：', JSON.stringify(codeBlocks.slice(0, 5)));
