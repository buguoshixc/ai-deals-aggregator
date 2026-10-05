#!/usr/bin/env node
/**
 * 从下载的 OpenAI 文章页 HTML 里抽官方**发布日**与标题（页面自带 JSON 负载里的 publicationDateText）。
 * 用法：node oai-extract.cjs <raw/文件名> [更多文件...]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RAW = path.join(__dirname, 'raw');

for (const file of process.argv.slice(2)) {
  const full = path.join(RAW, file);
  if (!fs.existsSync(full)) { console.log(`## ${file} MISSING`); continue; }
  const html = fs.readFileSync(full, 'utf8');
  const hits = [...html.matchAll(/"publicationDateText"\s*:\s*"([^"]+)"[^}]{0,400}?"pageType"\s*:\s*"([^"]*)"/g)];
  console.log(`## ${file} len=${html.length} publicationDateText hits=${hits.length}`);
  for (const hit of hits.slice(0, 6)) console.log(`   date="${hit[1]}" pageType="${hit[2]}"`);
  // 反序（pageType 在前）也扫一遍
  const alt = [...html.matchAll(/"pageType"\s*:\s*"([^"]*)"/g)];
  const slug = [...html.matchAll(/"pageTitle"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
  console.log(`   pageType count=${alt.length} pageTitles=${JSON.stringify(slug.slice(0, 4))}`);
  const title = /<title>([^<]*)<\/title>/.exec(html);
  console.log(`   <title>=${title ? title[1] : '(none)'}`);
}
