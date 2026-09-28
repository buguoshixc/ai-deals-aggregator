#!/usr/bin/env node
/**
 * 采集机器人身份（GitHub App token）自测：零依赖、纯函数、离线、秒级。
 *
 * 为什么必须自测：这条凭据链是**无人值守采集的命门**。它一旦写错，症状是
 * 「定时采集每天两次静默失败」或者更糟——「换了不该换的身份去推送」。
 * 而它偏偏有三处极易写错、且写错后本地一切正常的地方：
 *
 *   ① **JWT 的有效期**：GitHub 硬性规定 App JWT 最长 10 分钟，超了直接 401；
 *   ② **三步的 Authorization 都是 App JWT**，不是上一步的返回值（第二步拿到的
 *      installation id 不是 token；最容易写成"拿 installation 的响应去当凭据"）；
 *   ③ **token 绝不能进日志**：只能进 $GITHUB_OUTPUT，且要先 ::add-mask::。
 *
 * 外加三条失败路径必须是**明确报错**而不是含糊崩掉：缺 App ID、缺私钥、私钥格式不对
 * （后两种是配置期最常见的手滑，报错里必须写清怎么修）。
 *
 * 全程不发网络请求：`fetch` 由本文件注入。
 *
 * 用法：node scripts/tools/app-token-selftest.js
 */

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  base64url, createJwt, githubRequest, mintInstallationToken,
  normalizePrivateKey, botIdentity, writeOutputs,
  JWT_TTL_SECONDS, JWT_SKEW_SECONDS, API_VERSION
} = require('./app-token');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'scripts', 'tools', 'app-token.js');

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { pass++; return; }
  failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}
function checkEqual(name, actual, expected) {
  check(name, actual === expected, `期望 ${JSON.stringify(expected)}，实得 ${JSON.stringify(actual)}`);
}
function decodePart(part) {
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

/* ── 一次性密钥对：自测自己生成，不依赖任何真实凭据 ───────────────── */
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
const APP_ID = 1234567;
const REPO = 'example-owner/example-repo';

/* ── 1) base64url ───────────────────────────────────────────────── */
checkEqual('base64url 不含 + 号', base64url('???>??').includes('+'), false);
checkEqual('base64url 不含 / 号', base64url('???>??').includes('/'), false);
checkEqual('base64url 不含 padding', base64url('a').includes('='), false);
checkEqual('base64url 可逆', Buffer.from(base64url('中文 payload'), 'base64url').toString('utf8'), '中文 payload');

/* ── 2) JWT 结构与签名 ──────────────────────────────────────────── */
const NOW = 1800000000;
const jwt = createJwt({ appId: APP_ID, privateKey, now: NOW });
const parts = jwt.split('.');
checkEqual('JWT 恰好三段', parts.length, 3);
checkEqual('JWT 头部 alg=RS256', decodePart(parts[0]).alg, 'RS256');
checkEqual('JWT 头部 typ=JWT', decodePart(parts[0]).typ, 'JWT');
checkEqual('JWT iss 是字符串形式的 App ID', decodePart(parts[1]).iss, String(APP_ID));
checkEqual('JWT iat 往前回拨了时钟容差', decodePart(parts[1]).iat, NOW - JWT_SKEW_SECONDS);

const { iat, exp } = decodePart(parts[1]);
check('JWT 有效期不超过 GitHub 的 10 分钟硬上限', exp - iat <= 600, `实得 ${exp - iat} 秒`);
checkEqual('JWT_TTL_SECONDS 与 GitHub 上限一致地保守', JWT_TTL_SECONDS + JWT_SKEW_SECONDS <= exp - iat + JWT_SKEW_SECONDS, true);
check('JWT 未过期（exp 在未来）', exp > NOW, `exp=${exp} now=${NOW}`);

const signingInput = `${parts[0]}.${parts[1]}`;
const signature = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
check('JWT 签名用公钥验得过',
  crypto.createVerify('RSA-SHA256').update(signingInput).verify(publicKey, signature), '签名验证失败');
check('改动 payload 后签名验不过（防伪造兜底）',
  crypto.createVerify('RSA-SHA256').update(`${parts[0]}.${base64url('{"iss":"1"}')}`).verify(publicKey, signature) === false,
  '篡改后竟然还能验过');
check('换了 now 就换一个 payload（不是硬编码常量）',
  createJwt({ appId: APP_ID, privateKey, now: NOW + 1 }) !== jwt);

/* ── 3) 私钥规范化 ──────────────────────────────────────────────── */
const literal = privateKey.replace(/\n/g, '\\n');
const normalized = normalizePrivateKey(literal);
check('字面量 \\n 会被还原成真换行', normalized.key === privateKey.trim(), '还原结果与原文不一致');
check('还原这件事会明确告知（不静默改数据）', normalized.notes.length === 1, `实得 ${normalized.notes.length} 条说明`);
check('正常 PEM 不产生多余说明', normalizePrivateKey(privateKey).notes.length === 0);

let threw = null;
try { normalizePrivateKey('not-a-pem'); } catch (error) { threw = error.message; }
check('非 PEM 开头 → 明确报错', Boolean(threw) && /PEM/.test(threw), String(threw));
threw = null;
try { normalizePrivateKey('-----BEGIN RSA PRIVATE KEY-----\nabc\n'); } catch (error) { threw = error.message; }
check('PEM 缺结尾行 → 明确报错', Boolean(threw) && /不完整/.test(threw), String(threw));

/* ── 3b) GitHub 实际下载的私钥是 PKCS#1（BEGIN RSA PRIVATE KEY）── */
/* 官方文档：下载到的 .pem 是 `PKCS#1 RSAPrivateKey` 格式。
   上面用的是 PKCS#8（BEGIN PRIVATE KEY），两种都必须能用 —— 否则用户在 App 页面
   点一下 "Generate a private key"，拿到的文件反而跑不通。 */
const pkcs1 = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
});
check('PKCS#1 私钥（GitHub 下载的那一种）能通过规范化',
  normalizePrivateKey(pkcs1.privateKey).key.startsWith('-----BEGIN RSA PRIVATE KEY-----'),
  normalizePrivateKey(pkcs1.privateKey).key.slice(0, 40));
const pkcs1Parts = createJwt({ appId: APP_ID, privateKey: pkcs1.privateKey, now: NOW }).split('.');
checkEqual('PKCS#1 私钥签出的 JWT 也是三段', pkcs1Parts.length, 3);
check('PKCS#1 私钥签出的 JWT 能用对应公钥验过',
  crypto.createVerify('RSA-SHA256')
    .update(`${pkcs1Parts[0]}.${pkcs1Parts[1]}`)
    .verify(pkcs1.publicKey, Buffer.from(pkcs1Parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
  'PKCS#1 私钥签不动或验不过');

/* ── 3c) 换行被压成字面量 \\n 时，PKCS#1 也要能还原 ───────────── */
check('PKCS#1 + 字面量 \\n 一起出现时也能还原',
  normalizePrivateKey(pkcs1.privateKey.replace(/\n/g, '\\n')).key === pkcs1.privateKey.trim());

/* ── 3d) 「从 .pem 复制粘贴到 Secret 输入框」的真实变体 ──────────
   这一段测的是**用户实际会交上来的东西**，不是理想输入：
   Windows 记事本打开 .pem 再复制 → 剪贴板里是 CRLF；手选时容易漏掉结尾换行或多带空白。
   实测（OpenSSL）：CRLF 与各种空白变体都能签，**只有字面量 \n 会炸**
   （error:1E08010C DECODER routines::unsupported）—— 而那一种正是 normalizePrivateKey 修的。
   把这四类钉住，免得日后「顺手简化」normalize 时把唯一真正需要修的那种弄丢。 */
const signOk = (pem) => {
  try {
    crypto.createSign('RSA-SHA256').update('probe').sign(pem);
    return true;
  } catch (error) {
    return false;
  }
};
check('CRLF 换行（记事本复制的 .pem）可以直接签', signOk(pkcs1.privateKey.replace(/\n/g, '\r\n')));
check('CRLF 且没有结尾换行也可以签', signOk(pkcs1.privateKey.replace(/\n/g, '\r\n').trim()));
check('漏掉结尾换行也可以签', signOk(pkcs1.privateKey.trim()));
check('首尾多带空白也可以签', signOk(`  \n${pkcs1.privateKey}\n\n  `));
check('**未经规范化**的字面量 \\n 确实签不动（证明 normalize 那一步不是多余的）',
  signOk(pkcs1.privateKey.replace(/\n/g, '\\n')) === false);
check('经规范化后同一条字面量 \\n 私钥能签',
  signOk(normalizePrivateKey(pkcs1.privateKey.replace(/\n/g, '\\n')).key));

/* ── 4) 提交者身份 ──────────────────────────────────────────────── */
const id = botIdentity(APP_ID, 'ai-deals-collect-bot');
checkEqual('提交者名字是 <slug>[bot]', id.name, 'ai-deals-collect-bot[bot]');
checkEqual('提交者邮箱是 <id>+<slug>[bot]@users.noreply.github.com',
  id.email, '1234567+ai-deals-collect-bot[bot]@users.noreply.github.com');
check('没有 slug 时有兜底（不至于拼出 undefined[bot]）',
  !/undefined/.test(botIdentity(APP_ID, null).email));

/* ── 5) 薄客户端：URL / 方法 / 头 ───────────────────────────────── */
const calls = [];
/**
 * 每次调用都新建一个**自带游标**的假 fetch。
 * 用共享游标（按 calls.length 取响应）会让「上一次调用的次数」污染下一次的响应序列 ——
 * 自测第一版就是这么写的，结果三条失败路径用例全部拿到错的响应、假装通过/假装失败。
 */
const fakeFetch = (expected) => {
  let cursor = 0;
  return async (url, init) => {
    calls.push({ url, init });
    const next = expected[cursor++] || { status: 200, body: '{}' };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: async () => next.body
    };
  };
};

(async () => {
  calls.length = 0;
  await githubRequest('/app', { token: 'tok', fetchImpl: fakeFetch([{ status: 200, body: '{"slug":"x"}' }]) });
  checkEqual('请求打到 api.github.com', calls[0].url, 'https://api.github.com/app');
  checkEqual('默认方法是 GET', calls[0].init.method, 'GET');
  checkEqual('Authorization 用 Bearer', calls[0].init.headers.authorization, 'Bearer tok');
  checkEqual('Accept 是 github+json', calls[0].init.headers.accept, 'application/vnd.github+json');
  checkEqual('带上 API 版本头', calls[0].init.headers['x-github-api-version'], API_VERSION);

  calls.length = 0;
  await githubRequest('/x', { token: 't', method: 'POST', fetchImpl: fakeFetch([{ status: 200, body: 'not json' }]) });
  checkEqual('POST 会透传方法', calls[0].init.method, 'POST');

  const notJson = await githubRequest('/x', { token: 't', fetchImpl: fakeFetch([{ status: 200, body: 'oops' }]) });
  check('非 JSON 响应不抛异常（body 为 null）', notJson.body === null && notJson.ok === true,
    `body=${JSON.stringify(notJson.body)} ok=${notJson.ok}`);

  /* ── 6) 换取 token 的三步 ────────────────────────────────────── */
  calls.length = 0;
  const minted = await mintInstallationToken({
    appId: APP_ID, privateKey, repo: REPO, now: NOW,
    fetchImpl: fakeFetch([
      { status: 200, body: JSON.stringify({ id: APP_ID, slug: 'ai-deals-collect-bot' }) },
      { status: 200, body: JSON.stringify({ id: 42 }) },
      { status: 201, body: JSON.stringify({ token: 'ghs_abc', expires_at: '2026-09-29T00:00:00Z' }) }
    ])
  });
  checkEqual('第一步问 /app', calls[0].url, 'https://api.github.com/app');
  checkEqual('第二步问仓库上的 installation', calls[1].url, `https://api.github.com/repos/${REPO}/installation`);
  checkEqual('第三步用 installation id 换 token',
    calls[2].url, 'https://api.github.com/app/installations/42/access_tokens');
  checkEqual('第三步是 POST', calls[2].init.method, 'POST');
  const jwtUsed = `Bearer ${jwt}`;
  check('三步的 Authorization **都是 App JWT**（不是上一步的返回值）',
    calls.every(c => c.init.headers.authorization === jwtUsed),
    `实得 ${JSON.stringify(calls.map(c => c.init.headers.authorization.slice(0, 24)))}`);
  checkEqual('拿到了 token', minted.token, 'ghs_abc');
  checkEqual('带回了到期时间', minted.expiresAt, '2026-09-29T00:00:00Z');
  checkEqual('带回了 installation id', minted.installationId, 42);
  checkEqual('提交者身份跟着 App slug 走', minted.email,
    `${APP_ID}+ai-deals-collect-bot[bot]@users.noreply.github.com`);

  /* ── 7) 三条必须明确的失败路径 ──────────────────────────────── */
  const expectThrow = async (name, opts, pattern) => {
    let message = null;
    try { await mintInstallationToken(opts); } catch (error) { message = error.message; }
    check(name, Boolean(message) && pattern.test(message), String(message));
  };
  await expectThrow('App 没装到仓库 → 报错说清「没安装」',
    { appId: APP_ID, privateKey, repo: REPO, now: NOW, fetchImpl: fakeFetch([{ status: 200, body: '{"slug":"x"}' }, { status: 404, body: '{"message":"Not Found"}' }]) },
    /没有安装到/);
  await expectThrow('App ID 与私钥不配对（/app 401）→ 报错指向配对问题',
    { appId: APP_ID, privateKey, repo: REPO, now: NOW, fetchImpl: fakeFetch([{ status: 401, body: '{"message":"Bad credentials"}' }]) },
    /不配对/);
  await expectThrow('仓库名不是 owner/repo → 直接拒绝',
    { appId: APP_ID, privateKey, repo: 'just-a-name', now: NOW, fetchImpl: fakeFetch([]) },
    /owner\/repo/);
  await expectThrow('installation 响应缺 id → 不继续瞎试',
    { appId: APP_ID, privateKey, repo: REPO, now: NOW, fetchImpl: fakeFetch([{ status: 200, body: '{"slug":"x"}' }, { status: 200, body: '{}' }]) },
    /没有 id/);
  await expectThrow('换 token 失败（403）→ 带出原始原因',
    { appId: APP_ID, privateKey, repo: REPO, now: NOW, fetchImpl: fakeFetch([{ status: 200, body: '{"slug":"x"}' }, { status: 200, body: '{"id":7}' }, { status: 403, body: '{"message":"Forbidden"}' }]) },
    /403/);

  /* ── 8) 输出只走 $GITHUB_OUTPUT ─────────────────────────────── */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-token-selftest-'));
  const outFile = path.join(tmp, 'out.txt');
  checkEqual('没有 $GITHUB_OUTPUT 时返回 false（本地运行不炸）', writeOutputs({ token: 't' }, ''), false);
  checkEqual('有 $GITHUB_OUTPUT 时返回 true', writeOutputs({ token: 'ghs_x', bot_name: 'b[bot]' }, outFile), true);
  checkEqual('写出的是 key=value 行', fs.readFileSync(outFile, 'utf8'), 'token=ghs_x\nbot_name=b[bot]\n');
  writeOutputs({ token: 'second' }, outFile);
  check('是追加而不是覆盖（多步写输出不互相吃掉）',
    fs.readFileSync(outFile, 'utf8').endsWith('token=second\n'));
  fs.rmSync(tmp, { recursive: true, force: true });

  /* ── 9) CLI 的失败路径：必须明确、且绝不泄露 token ───────────── */
  const baseEnv = { ...process.env };
  delete baseEnv.COLLECT_APP_ID;
  delete baseEnv.COLLECT_APP_PRIVATE_KEY;
  delete baseEnv.GITHUB_OUTPUT;

  const runCli = (env) => {
    const r = spawnSync(process.execPath, [CLI], { cwd: ROOT, encoding: 'utf8', env: { ...baseEnv, ...env } });
    return { code: typeof r.status === 'number' ? r.status : 1, out: `${r.stdout || ''}${r.stderr || ''}` };
  };

  const noEnv = runCli({});
  checkEqual('CLI：两个变量都缺 → 退出码 1', noEnv.code, 1);
  check('CLI：报错点名 COLLECT_APP_ID', /COLLECT_APP_ID/.test(noEnv.out), noEnv.out.slice(0, 200));
  check('CLI：缺凭据时绝不打 ::add-mask::（根本没换到 token）', !/::add-mask::/.test(noEnv.out));

  const noKey = runCli({ COLLECT_APP_ID: String(APP_ID) });
  checkEqual('CLI：只有 App ID → 退出码 1', noKey.code, 1);
  check('CLI：报错点名 COLLECT_APP_PRIVATE_KEY', /COLLECT_APP_PRIVATE_KEY/.test(noKey.out), noKey.out.slice(0, 200));

  const badKey = runCli({ COLLECT_APP_ID: String(APP_ID), COLLECT_APP_PRIVATE_KEY: 'lol-not-a-key' });
  checkEqual('CLI：私钥格式不对 → 退出码 1', badKey.code, 1);
  check('CLI：私钥报错说清是 PEM 问题', /PEM/.test(badKey.out), badKey.out.slice(0, 200));
  check('CLI：私钥报错给出修法（连 BEGIN/END 一起存）', /BEGIN/.test(badKey.out), badKey.out.slice(0, 300));
  check('CLI：任何失败路径都不出现 ::add-mask::', !/::add-mask::/.test(badKey.out));

  console.log(`\n${failures.length ? '❌' : '✅'} 采集机器人身份自测：${pass} 项通过，${failures.length} 项失败`);
  for (const line of failures) console.log(`   ✗ ${line}`);
  if (failures.length) process.exit(1);
})();
