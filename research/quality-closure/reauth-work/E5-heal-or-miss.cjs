'use strict';
/** E5：手改 dist 第 8 列后跑 build-local，到底是「重建覆盖（自愈）」还是「重检漏掉」？ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const DIR = 'D:\\qc-t23\\extra\\R5-api-page';
const GOLD = 'D:\\qc-t23\\gold';
const page = path.join(DIR, 'dist/plans/api/index.html');
const goldPage = path.join(GOLD, 'dist/plans/api/index.html');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const goldSha = sha(goldPage);
const before = sha(page);
const html = fs.readFileSync(page, 'utf8');
const cell = html.match(/<td class="pfree">[^<]*<\/td>/)[0];
fs.writeFileSync(page, html.replace(cell, '<td class="pfree">credits 100 credits 长期有效，属于稳定长期免费能力</td>'));
const mutatedSha = sha(page);
const r = spawnSync('node scripts/tools/build-local.js', { cwd: DIR, shell: true, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
const afterBuild = sha(page);
console.log(JSON.stringify({
  goldSha: goldSha.slice(0, 12), before: before.slice(0, 12), mutated: mutatedSha.slice(0, 12), afterBuild: afterBuild.slice(0, 12),
  buildExit: r.status,
  verdict: afterBuild === goldSha ? 'SELF-HEALED（重建覆盖，产物回到数据真值）' : (afterBuild === mutatedSha ? 'NOT-HEALED（手改被保留，重检也没报）' : 'OTHER（产物变了但不是 gold）')
}, null, 2));
