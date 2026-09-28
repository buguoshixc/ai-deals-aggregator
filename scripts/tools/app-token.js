#!/usr/bin/env node
'use strict';

/**
 * 用**专用 GitHub App** 的身份换取一次性 installation access token（零依赖）。
 *
 * ── 为什么需要它（2026-09-29 查证，不是推测）──────────────────────────────
 * master 设成「必须走 PR + 必须过 gate」之后，定时采集的推送会被挡在门外，
 * 而采集是无人值守的 —— 必须有办法**只豁免机器人、不豁免人**。
 *
 * 直觉方案是「把 GitHub Actions 加进 ruleset 的绕过名单」，但**做不到**：
 *   · GitHub 文档给出的绕过候选是穷举的：仓库/组织/企业管理员、maintain|write 角色、
 *     Teams、Deploy keys（仅 GHES）、**可安装的 GitHub Apps**、Dependabot、Copilot cloud agent
 *     —— 里面没有「GitHub Actions」；
 *   · 实测：用 API 传 `actor_type: "Integration", actor_id: 15368`（github-actions 的 App ID）
 *     返回 **HTTP 422**：`Actor GitHub Actions integration must be part of the ruleset source
 *     or owner organization`。
 *   根因：`github-actions`（15368）是**平台原生身份**（每次 GITHUB_TOKEN 调用的背后都是它），
 *   并不是「安装在仓库上的 GitHub App」，所以不满足绕过名单的前置条件。
 *
 * 也**不能**走「机器人开 PR + 自动合并」绕开：用 GITHUB_TOKEN 建的 PR 不会触发
 * `pull_request` workflow（GitHub 的防递归规定），`gate` 永远 pending，自动合并永远等不到。
 *
 * 于是唯一的正解：给机器人一个**可安装的 GitHub App** 身份，把这个 App 单独加进绕过名单。
 * 本脚本负责把「App 私钥」换成「一次性的 installation token」。
 *
 * ── 用法（CI 里由 collect.yml 调用）────────────────────────────────────────
 *   COLLECT_APP_ID=123456 \
 *   COLLECT_APP_PRIVATE_KEY="$(cat app.pem)" \
 *   GITHUB_REPOSITORY=owner/repo \
 *   node scripts/tools/app-token.js
 *
 * 输出（写进 $GITHUB_OUTPUT，**从不把 token 打到日志里**）：
 *   token        installation access token，供 git push 使用
 *   bot_name     git 提交者名字，如 `ai-deals-collect-bot[bot]`
 *   bot_email    git 提交者邮箱，如 `123456+ai-deals-collect-bot[bot]@users.noreply.github.com`
 *   expires_at   token 到期时间（GitHub 侧固定 1 小时）
 *
 * 本地调试可以加 `--repo=owner/repo`；没有 $GITHUB_OUTPUT 时只打印脱敏摘要。
 */

const crypto = require('crypto');
const fs = require('fs');

const API = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/** GitHub 规定 App JWT 有效期**最长 10 分钟**；取 9 分钟留余量 */
const JWT_TTL_SECONDS = 540;
/** 往前回拨 60 秒，容忍 runner 与本机之间的时钟偏差 */
const JWT_SKEW_SECONDS = 60;
/** slug 拿不到时的兜底（正常路径不该走到这里） */
const FALLBACK_SLUG = 'ai-deals-collect-bot';

/** base64url（**无 padding**）：JWT 三个部分都必须是这个形态 */
function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * 私钥规范化。两个真实会踩的点：
 *  ① 存进 Secret 时换行被压成字面量 `\n`（GitHub 的 Secret 输入框常见误操作）；
 *  ② 首尾混入空白。
 * 处理结果会在日志里**明确说明**做过哪种修正，不静默改数据。
 */
function normalizePrivateKey(raw) {
  let key = String(raw == null ? '' : raw).trim();
  const notes = [];
  if (!key.includes('\n') && key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n').trim();
    notes.push('私钥里的字面量 \\n 已还原成真换行');
  }
  if (!key.startsWith('-----BEGIN')) {
    throw new Error('私钥不是 PEM 格式（应以 -----BEGIN ... PRIVATE KEY----- 开头）');
  }
  if (!/-----END [A-Z ]*PRIVATE KEY-----/.test(key)) {
    throw new Error('私钥 PEM 不完整（缺少 -----END ... PRIVATE KEY----- 结尾行）');
  }
  return { key, notes };
}

/** 生成 App JWT（RS256）。`now` 可注入，便于自测。 */
function createJwt({ appId, privateKey, now = Math.floor(Date.now() / 1000) }) {
  if (!appId) throw new Error('createJwt 需要 appId');
  if (!privateKey) throw new Error('createJwt 需要 privateKey');
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iat: now - JWT_SKEW_SECONDS,
    exp: now - JWT_SKEW_SECONDS + JWT_TTL_SECONDS,
    iss: String(appId)
  }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

/** 一个极薄的 GitHub API 客户端：只为了能注入假的 fetch 做自测。 */
async function githubRequest(path, { token, method = 'GET', fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': API_VERSION,
      'user-agent': 'ai-deals-aggregator-app-token'
    }
  });
  const text = typeof response.text === 'function' ? await response.text() : '';
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch (error) { body = null; }
  }
  return { ok: Boolean(response.ok), status: response.status, body, text };
}

/** git 提交者身份：GitHub 对 App 机器人的固定约定 */
function botIdentity(appId, slug) {
  const safeSlug = slug || FALLBACK_SLUG;
  return {
    name: `${safeSlug}[bot]`,
    email: `${appId}+${safeSlug}[bot]@users.noreply.github.com`
  };
}

/**
 * 三步换取 installation token：
 *   ① `GET /app`                      —— 拿 slug（拼提交者身份用）
 *   ② `GET /repos/{repo}/installation` —— 拿这个仓库上的 installation id
 *   ③ `POST /app/installations/{id}/access_tokens` —— 换 token
 * 三步的 Authorization **都是 App JWT**（不是上一步的结果）——这是最容易写错的地方，
 * 自测里有一条专门盯它。
 */
async function mintInstallationToken({ appId, privateKey, repo, now, fetchImpl = fetch }) {
  if (!repo || !repo.includes('/')) throw new Error(`需要 owner/repo 形式的仓库名，收到 ${JSON.stringify(repo)}`);
  const jwt = createJwt({ appId, privateKey, now });

  const app = await githubRequest('/app', { token: jwt, fetchImpl });
  if (!app.ok) {
    throw new Error(`GET /app 失败（HTTP ${app.status}）—— 通常是 App ID 与私钥不配对：${app.text.slice(0, 200)}`);
  }
  const slug = (app.body && app.body.slug) || FALLBACK_SLUG;

  const installation = await githubRequest(`/repos/${repo}/installation`, { token: jwt, fetchImpl });
  if (installation.status === 404) {
    throw new Error(`这个 GitHub App 没有安装到 ${repo}（GET /repos/${repo}/installation 返回 404）—— 去 App 页面点 Install，把它装到这个仓库上`);
  }
  if (!installation.ok) {
    throw new Error(`GET /repos/${repo}/installation 失败（HTTP ${installation.status}）：${installation.text.slice(0, 200)}`);
  }
  const installationId = installation.body && installation.body.id;
  if (!installationId) throw new Error('installation 响应里没有 id，无法继续换取 token');

  const minted = await githubRequest(`/app/installations/${installationId}/access_tokens`, {
    token: jwt, method: 'POST', fetchImpl
  });
  if (!minted.ok) {
    throw new Error(`换取 installation token 失败（HTTP ${minted.status}）：${minted.text.slice(0, 200)}`);
  }
  const token = minted.body && minted.body.token;
  if (!token) throw new Error('token 响应里没有 token 字段');

  return {
    token,
    expiresAt: (minted.body && minted.body.expires_at) || null,
    slug,
    installationId,
    appId: String(appId),
    ...botIdentity(appId, slug)
  };
}

/** 把结果写进 $GITHUB_OUTPUT（不经过 stdout，避免 token 落进日志） */
function writeOutputs(pairs, file = process.env.GITHUB_OUTPUT) {
  if (!file) return false;
  const body = Object.entries(pairs).map(([key, value]) => `${key}=${value}`).join('\n');
  fs.appendFileSync(file, `${body}\n`);
  return true;
}

function repoFromArgs(argv) {
  const found = argv.find(a => a.startsWith('--repo='));
  return found ? found.slice('--repo='.length) : null;
}

function fail(title, message, hint) {
  console.error(`::error title=${title}::${message}`);
  if (hint) console.error(hint);
  process.exitCode = 1;
}

async function main() {
  const repo = repoFromArgs(process.argv.slice(2)) || process.env.GITHUB_REPOSITORY;
  const appId = (process.env.COLLECT_APP_ID || '').trim();
  const rawKey = process.env.COLLECT_APP_PRIVATE_KEY;

  if (!appId) {
    return fail(
      '缺少 COLLECT_APP_ID',
      '没有拿到 GitHub App 的 App ID（secrets.COLLECT_APP_ID 是空的）',
      '采集链路的推送依赖这个 App 身份：master 设了「必须走 PR + 必须过 gate」之后，\n'
      + 'GITHUB_TOKEN 推送会被挡下，而 github-actions 又不能被加进绕过名单。\n'
      + '建法与填法见 README 的「采集机器人的身份」一节。'
    );
  }
  if (!rawKey || !String(rawKey).trim()) {
    return fail(
      '缺少 COLLECT_APP_PRIVATE_KEY',
      '没有拿到 GitHub App 私钥（secrets.COLLECT_APP_PRIVATE_KEY 是空的）',
      '在 App 设置页最下方 Generate a private key，把下载到的 .pem **全文**（含 BEGIN/END 两行）\n'
      + '存成仓库 Secret COLLECT_APP_PRIVATE_KEY。'
    );
  }

  let privateKey;
  try {
    const normalized = normalizePrivateKey(rawKey);
    privateKey = normalized.key;
    for (const note of normalized.notes) console.log(`::notice::${note}`);
  } catch (error) {
    return fail('COLLECT_APP_PRIVATE_KEY 无法解析', error.message,
      '存 Secret 时要连 -----BEGIN ... PRIVATE KEY----- / -----END ... PRIVATE KEY----- 两行一起存。');
  }

  let minted;
  try {
    minted = await mintInstallationToken({ appId, privateKey, repo });
  } catch (error) {
    return fail('换取 GitHub App token 失败', error.message,
      `仓库参数：${repo || '(未提供 owner/repo)'}`);
  }

  // 先登记掩码，再写输出：任何后续打印都不会泄露 token 明文。
  console.log(`::add-mask::${minted.token}`);
  const wrote = writeOutputs({
    token: minted.token,
    bot_name: minted.name,
    bot_email: minted.email,
    expires_at: minted.expiresAt || ''
  });

  console.log(`已用 App「${minted.slug}」(id ${minted.appId}) 换取 installation token`);
  console.log(`  提交者身份：${minted.name} <${minted.email}>`);
  console.log(`  到期：${minted.expiresAt || '(未返回)'}`);
  console.log(wrote
    ? '  token 已写入 $GITHUB_OUTPUT（日志里不会出现明文）'
    : '::warning title=没有 $GITHUB_OUTPUT::本地运行：token 未写出（也不会打印），仅用于验证凭据链是否通');
}

module.exports = {
  base64url,
  createJwt,
  githubRequest,
  mintInstallationToken,
  normalizePrivateKey,
  botIdentity,
  writeOutputs,
  JWT_TTL_SECONDS,
  JWT_SKEW_SECONDS,
  API_VERSION
};

if (require.main === module) {
  main().catch(error => {
    fail('app-token.js 未预期的失败', String(error && error.message ? error.message : error));
  });
}
