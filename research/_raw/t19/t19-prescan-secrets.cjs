#!/usr/bin/env node
'use strict';
/**
 * t19 · 推送前的**本地秘密扫描预检**（对着 GitHub push protection 会拦的那类模式扫）。
 *
 * 背景：本仓库是 public + `secret_scanning_push_protection=enabled`，
 * `POST /git/blobs` 会做 push protection：命中就返回 `422 Repository rule violations found / Secret detected in content`。
 * 第一次推送在第 250 个文件处被 `research/_raw/t15-url-verify/aws-q-overview.txt` 拦下（40 位高熵串）。
 * 与其一个个撞，不如先把全部待推文件扫一遍，把**高危**文件列出来（并给出可读上下文）。
 *
 * 用法：node t19-prescan-secrets.cjs
 * 产出：t19-prescan-secrets.json
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WT = process.argv[2] || 'D:/OneDrive/Desktop/Code/AI Page/.worktrees/coverage-expansion-v1';
const OUT = path.join(WT, 'research/_raw/t19', 't19-prescan-secrets.json');

const lsRaw = spawnSync('git', ['-C', WT, 'ls-files', '-s', '-z'], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
const files = lsRaw.stdout.toString('utf8').split('\0').filter(Boolean).map(l => l.split('\t').slice(1).join('\t'));

/* 只扫「文本类」文件：二进制里随机 40 字节序列太多，会把噪声拉满 */
const isText = buf => !buf.includes(0);

const PATTERNS = [
  ['aws_access_key_id', /AKIA[0-9A-Z]{16}/g],
  ['aws_temp_key_id', /\bASIA[0-9A-Z]{16}\b/g],
  ['aws_secret_access_key_context', /aws_secret_access_key["'\s:=]+([A-Za-z0-9/+=]{40})/gi],
  ['github_pat', /gh[psoru]_[A-Za-z0-9]{36,}/g],
  ['github_app_token', /(?:^|[^A-Za-z0-9])ghs_[A-Za-z0-9]{36}/g],
  ['openai_key', /sk-[A-Za-z0-9_-]{20,}/g],
  ['anthropic_key', /sk-ant-[A-Za-z0-9_-]{20,}/g],
  ['slack_token', /xox[baprs]-[A-Za-z0-9-]{10,}/g],
  ['slack_webhook', /hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/g],
  ['npm_token', /npm_[A-Za-z0-9]{36}/g],
  ['google_api_key', /AIza[0-9A-Za-z_-]{35}/g],
  ['private_key_block', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g],
  ['jwt', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['basic_auth_url', /https?:\/\/[^\s"'<>]{2,}:[^\s"'<>@]{6,}@[^\s"'<>]+/g],
];
/* GitHub 的通用高熵规则：40 位 base64 字母表、且字母/数字/大小学都有 */
const GENERIC40 = /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g;
const WINPATH = /\\\\(?:["\\]|u00)/;           // 形如 \" 或 \u00 —— 说明它在被转义过的 JSON/HTML 里
const URLORFILE = /[\/.]\.?(?:png|jpe?g|webp|gif|svg|css|js|woff2?|ico)\b/i; // 图片/静态资源文件名（sha1 摘要常见）
const CSPSHAPE = /sha256-|nonce-|sha384-|sha512-/i;                          // CSP 里的哈希/nonce

const shannon = s => {
  const f = {};
  for (const ch of s) f[ch] = (f[ch] || 0) + 1;
  let h = 0;
  for (const k in f) { const p = f[k] / s.length; h -= p * Math.log2(p); }
  return h;
};

const findings = [];
let scanned = 0, scannedBytes = 0;
for (const file of files) {
  const abs = path.join(WT, file);
  let buf; try { buf = fs.readFileSync(abs); } catch (e) { findings.push({ file, error: 'read failed: ' + e.message, hits: [] }); continue; }
  if (!isText(buf)) continue;
  scanned++; scannedBytes += buf.length;
  const text = buf.toString('utf8');
  const hits = [];
  for (const [name, re] of PATTERNS) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (m) hits.push({ rule: name, count: m.length, samples: [...new Set(m)].slice(0, 3).map(s => s.slice(0, 24) + '…') });
  }
  /* 通用高熵：只有当它**不像**已知良性形态时才算命中 */
  const gen = [];
  GENERIC40.lastIndex = 0;
  let mm;
  while ((mm = GENERIC40.exec(text))) {
    const tok = mm[0];
    const ctx = text.slice(Math.max(0, mm.index - 60), mm.index + 80);
    const ctxInline = ctx.replace(/\s+/g, ' ');
    const benign =
      WINPATH.test(ctx) || URLORFILE.test(ctx) || CSPSHAPE.test(ctx) ||
      /^[0-9a-f]{40}$/.test(tok) ||                       // 纯 hex（sha1 摘要）—— GitHub 通用规则不拦
      /^[0-9a-f]{40}$/i.test(tok);
    const entropy = shannon(tok);
    const mixed = /[a-z]/.test(tok) && /[A-Z]/.test(tok) && /[0-9]/.test(tok);
    if (!benign && mixed && entropy > 4.5) {
      gen.push({ token: tok.slice(0, 12) + '…', len: tok.length, entropy: +entropy.toFixed(2), at: mm.index, ctx: ctxInline.slice(0, 140) });
    }
  }
  if (gen.length) {
    const seen = new Map();
    for (const g of gen) if (!seen.has(g.token)) seen.set(g.token, g);
    hits.push({ rule: 'generic_high_entropy_40', count: gen.length, samples: [...seen.values()].slice(0, 4) });
  }
  if (hits.length) findings.push({ file, bytes: buf.length, hits });
}

const report = {
  generatedAt: new Date().toISOString(),
  wt: WT,
  policy: { repoVisibility: 'public', secretScanningPushProtection: 'enabled', source: 'gh api repos/... .security_and_analysis' },
  scannedFiles: scanned, scannedBytes, totalTracked: files.length,
  findingCount: findings.length,
  findings,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log('扫了 ' + scanned + ' 个文本文件（' + (scannedBytes / 1048576).toFixed(1) + ' MiB）/ 全库 ' + files.length + ' 个');
console.log('有命中的文件：' + findings.length);
for (const f of findings) console.log('  ' + f.file + ' :: ' + f.hits.map(h => h.rule + '×' + h.count).join(', '));
console.log('已写 ' + OUT);
