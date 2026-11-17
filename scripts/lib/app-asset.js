'use strict';
/**
 * 首页应用脚本（`assets/app.js`）的**唯一产物名派生处**。
 *
 * 为什么要有这个模块：脚本文件名里带内容哈希（`app.<hash>.js`），而这个名字同时出现在
 * 三个地方——构建期写盘、`index.html` 的 `<script src>`、产物资产白名单（逐路径登记）。
 * 三处各算一次哈希，任何一处漏改都会变成「白名单拒绝一个真实文件」或「HTML 指向 404」。
 * 所以哈希只在这里算一次，另外两处都从 `file` 取。
 *
 * 为什么不用 `Date.now()` / 构建序号：`npm run check:reproducible` 要求两次构建逐字节一致；
 * 文件名只能由**源码内容**决定（sha256 前 16 位十六进制，碰撞概率可忽略）。
 *
 * 源文件故意放在 `assets/` 而不是产物根：它是源码，构建期才复制成带哈希的产物；
 * `PUBLIC_FILES` 不整目录拷贝 `assets/`，所以源码不会以 `assets/app.js` 的名义进 dist
 *（否则白名单会看到第二份未登记文件，而且浏览器会加载到没有哈希的旧副本）。
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** 源码相对仓库根的位置（`index.html` 的 `<script src>` 也写这个值） */
const SOURCE_REL = 'assets/app.js';
const SOURCE_PATH = path.join(__dirname, '..', '..', SOURCE_REL);
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

/** 内容哈希：足够长以避免碰撞，又足够短以保持 URL 可读 */
const HASH = crypto.createHash('sha256').update(SOURCE, 'utf8').digest('hex').slice(0, 16);
const FILE = `app.${HASH}.js`;

module.exports = {
  SOURCE_REL,
  SOURCE_PATH,
  SOURCE,
  HASH,
  FILE
};
