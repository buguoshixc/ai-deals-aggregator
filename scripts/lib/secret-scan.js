/**
 * 密钥模式扫描（v2.0）。
 *
 * 为什么单独一个模块：同一份模式表有三个使用方，**必须只有一处**——
 *   ① `scripts/ai/redact.js`：送模型之前把可疑串抹掉（纵深防御）；
 *   ② `scripts/tools/build-local.js` 的产物自检：生成产物里不许出现密钥；
 *   ③ `scripts/tools/ai-selftest.js`：牙测试第 6 条（故意塞一个 sk- 风格串，必须报）。
 * 三份各写各的模式 = 迟早有一处漏掉某个厂商的前缀，而漏掉的那次没人知道。
 *
 * 纪律：
 *  · 命中时**绝不回显完整串**，只给前 8 字符 + `…`。扫描结果本身可能被打印进 CI 日志。
 *  · 模式宁可窄一点也不要宽：`[A-Za-z0-9_-]{32,}` 这种泛匹配会把 hash、base64 图、
 *    长 class 名全部打成"疑似密钥"，报警一多就没人看了。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** 每条：{ id, re, why }。id 用于报错里点名，why 用于说明这为什么是密钥。 */
const PATTERNS = [
  { id: 'openai-env', re: /OPENAI_API_KEY\s*[:=]\s*\S+/g, why: '环境变量名带上了值' },
  { id: 'anthropic-env', re: /ANTHROPIC_API_KEY\s*[:=]\s*\S+/g, why: '环境变量名带上了值' },
  { id: 'deepseek-env', re: /DEEPSEEK_API_KEY\s*[:=]\s*\S+/g, why: '环境变量名带上了值' },
  { id: 'gemini-env', re: /GEMINI_API_KEY\s*[:=]\s*\S+/g, why: '环境变量名带上了值' },
  { id: 'collect-app-key', re: /COLLECT_APP_PRIVATE_KEY\s*[:=]\s*\S+/g, why: '采集机器人的私钥' },
  { id: 'openai-key', re: /\bsk-[A-Za-z0-9_-]{16,}/g, why: 'OpenAI 风格密钥' },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{16,}/g, why: 'Anthropic 风格密钥' },
  { id: 'google-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, why: 'Google API key' },
  { id: 'github-pat', re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g, why: 'GitHub 细粒度 PAT' },
  { id: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, why: 'GitHub token' },
  { id: 'aws-key', re: /\bAKIA[0-9A-Z]{16}\b/g, why: 'AWS access key id' },
  { id: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, why: 'Slack token' },
  { id: 'bearer', re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g, why: 'Authorization 头里的令牌' },
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, why: 'PEM 私钥' }
];

/** 命中片段只留这么多个字符，其余用 … 顶掉 */
const PREFIX_KEEP = 8;

/**
 * 把一段文本里的可疑串换成脱敏预览。
 * @param {string} text
 * @returns {{id:string, why:string, preview:string, index:number}[]}
 */
function scanText(text) {
  const found = [];
  if (typeof text !== 'string' || !text) return found;
  for (const p of PATTERNS) {
    // 每次都新建正则状态：加了 /g 的正则用 exec 循环后 lastIndex 会留存
    const re = new RegExp(p.re.source, p.re.flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      found.push({ id: p.id, why: p.why, preview: preview(m[0]), index: m.index });
      if (m.index === re.lastIndex) re.lastIndex++; // 零宽匹配兜底，避免死循环
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

function preview(match) {
  const head = match.slice(0, PREFIX_KEEP);
  return `${head}…(${match.length} 字符)`;
}

/** 命中即把整段替换成 [REDACTED:<id>]，用于「送模型之前」的净化 */
function redactText(text) {
  let out = String(text == null ? '' : text);
  for (const p of PATTERNS) {
    out = out.replace(new RegExp(p.re.source, p.re.flags), match => `[REDACTED:${p.id}](原 ${match.length} 字符)`);
  }
  return out;
}

function hasSecret(text) {
  return scanText(text).length > 0;
}

/** 递归收集目录下的文本文件（跳过 node_modules/.git），给产物自检用 */
function collectFiles(target, { maxBytes = 4 * 1024 * 1024 } = {}) {
  const files = [];
  const walk = dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        let stat;
        try {
          stat = fs.statSync(full);
        } catch (e) {
          continue;
        }
        if (stat.size > maxBytes) continue;
        files.push(full);
      }
    }
  };
  const stat = fs.existsSync(target) ? fs.statSync(target) : null;
  if (!stat) return files;
  if (stat.isDirectory()) walk(target);
  else files.push(target);
  return files;
}

/**
 * 扫一组文件。二进制文件跳过（按 NUL 字节判定），避免把图片读成乱码报警。
 * @returns {{file:string, hits:object[]}[]}
 */
function scanFiles(targets, options = {}) {
  const results = [];
  const list = [];
  for (const t of [].concat(targets)) list.push(...collectFiles(t));
  for (const file of list) {
    let buf;
    try {
      buf = fs.readFileSync(file);
    } catch (e) {
      continue;
    }
    if (buf.includes(0)) continue;
    const hits = scanText(buf.toString('utf8'));
    if (hits.length) results.push({ file, hits });
  }
  return results;
}

module.exports = {
  PATTERNS,
  PREFIX_KEEP,
  scanText,
  redactText,
  hasSecret,
  collectFiles,
  scanFiles,
  preview
};
