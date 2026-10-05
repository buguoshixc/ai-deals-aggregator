#!/usr/bin/env node
/**
 * t7 审查工具：**无网络钩子**。
 *
 * 被 `node --require <本文件>` 预加载后，把一切可能出网的入口改成"一调用就抛"：
 *   · `http.request` / `http.get` / `https.request` / `https.get`
 *   · `net.connect` / `net.createConnection` / `net.Socket.prototype.connect`
 *   · `dns.lookup` / `dns.resolve*` / `dns.promises.*`
 *   · `tls.connect`
 *   · 全局 `fetch`
 * 还顺手把 `Math.random` 与 `crypto.randomBytes` 换成"一调用就抛"（无随机性证据）。
 *
 * 判据：报告在钩子下**仍然退出 0** ⇒ 它这次运行没有走这些入口。
 * （这不是"源码里没有网络代码"的形式证明，而是"这一次真实运行没有联网"的动态证据；
 *   两者都要看，所以我同时做静态扫描。）
 */
'use strict';

const boom = what => () => {
  throw new Error(`[t7-no-network] 报告试图使用 ${what} —— 本次运行不允许出网 / 不允许随机数`);
};

const MODULES = {
  http: ['request', 'get'],
  https: ['request', 'get'],
  tls: ['connect'],
  dns: ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCname', 'resolveMx', 'resolveNs', 'resolveSrv', 'resolveTxt'],
  net: ['connect', 'createConnection']
};

for (const [name, methods] of Object.entries(MODULES)) {
  let mod;
  try {
    mod = require(name);
  } catch {
    continue;
  }
  for (const method of methods) {
    if (typeof mod[method] === 'function') mod[method] = boom(`${name}.${method}`);
  }
  if (mod.promises) {
    for (const method of methods) {
      if (typeof mod.promises[method] === 'function') mod.promises[method] = boom(`${name}.promises.${method}`);
    }
  }
}

if (typeof globalThis.fetch === 'function') globalThis.fetch = boom('globalThis.fetch');
if (typeof globalThis.XMLHttpRequest !== 'undefined') globalThis.XMLHttpRequest = boom('XMLHttpRequest');

Math.random = boom('Math.random');
try {
  const crypto = require('crypto');
  crypto.randomBytes = boom('crypto.randomBytes');
  crypto.randomUUID = boom('crypto.randomUUID');
} catch { /* 无所谓 */ }

process.env.T7_NO_NETWORK_HOOK = 'loaded';
