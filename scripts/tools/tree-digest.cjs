#!/usr/bin/env node
/**
 * 产物全树摘要（逐文件 sha256 + 全树摘要 + 清单摘要）—— 「产物逐字节未变」的**仓库内**证据工具。
 *
 *   node scripts/tools/tree-digest.cjs [dir=dist] [--json] [--out=<file.json>]
 *   npm run report:digest                                      # 等价于上面 dir=dist
 *
 * ## 为什么它该在仓库里（而不是 `.arch-v1/` 的 scratch）
 *
 * 历轮「本轮只动判据 / 文档，产物逐字节不变」这类结论，靠的是一份放在 `.arch-v1/tree-digest.cjs` 的
 * 一次性脚本。`.arch-v1/` 在 `.gitignore` 里（Tier-3 scratch，`docs/EVIDENCE-POLICY.md`）⇒ **复核者拿不到它**：
 * 想独立复现，只能自己再写一个（口径未必一致，反而制造第二套口径），或者选择相信我们的读数。
 * 进仓后，任何一轮的产物面对账都变成一条命令 + 两个摘要串，任何人可在干净检出上重跑并逐字符比对。
 *
 * ## 口径（与历轮 scratch 版 `sha256=1d89e46a977fb6156cd2b634b8847e37554ff2d24803ba2fcf36731377b43fa7` 逐字段一致）
 *
 * 遍历：`fs.readdirSync(dir, { withFileTypes: true })`，**每层先按目录项名升序**，再深度优先递归；
 *   `files[]` 的顺序就是这个顺序（同层里目录与文件混在一个已排序序列里，先进先出）。
 * 相对路径：`path.relative(dir, full)`，分隔符统一成 `/`（Windows 上也是 `/`，否则摘要跟平台走）。
 * perFile：`<rel>\t<sha256>`（制表符分隔，顺序即遍历顺序）。
 * treeDigest：`sha256( 依次 update(`${rel}\u0000${sha256}\n`) )`。
 *   · 用 NUL 而不是空格/制表符：路径里可以合法出现空格与制表符，NUL 不行 ⇒ 拼接无歧义。
 *   · 每条都带 LF：少了它，`a`+`bc` 与 `ab`+`c` 会撞成同一串。
 * manifestSha256：`sha256( perFile 的 rel\0sha 用 LF join，**不带尾 LF** )` —— 与 treeDigest 只差
 *   字段形式与尾 LF，作用不同：它是「清单文本」的摘要，便于与别处写出的清单逐字节比对。
 * bytes：所有文件 `statSync().size` 之和（磁盘字节数，不是字符数）。
 *
 * ## 摘要的稳定性来自三件（缺一就会随机）
 *
 *   ① **每层显式排序** —— `readdirSync` 返回的顺序由文件系统给，NTFS 与 ext4 就不一样；
 *   ② 比较符固定为 UTF-16 码元序的 `<` / `>`（**不用** `localeCompare`：它随 ICU / locale 变）；
 *   ③ 分隔符与换行写死（`/`、`\t`、NUL、LF），不跟平台走。
 *   ⇒ 同一棵目录树在任何机器、任何次运行都得同一串。本仓 304 文件产物实测：连跑两次逐字节相同。
 *
 * 只读：除 `--out=` 指定的文件外不写盘，不联网。目录不存在 / 不是目录 ⇒ **非零退出**（绝不静默成功）。
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const outArg = args.find(a => a.startsWith('--out='));
const jsonOut = args.includes('--json');
const dirArg = args.find(a => !a.startsWith('--')) || 'dist';
const dir = path.resolve(dirArg);

if (!fs.existsSync(dir)) {
  console.error(`找不到目录：${dirArg}（解析为 ${dir}）—— 摘要器拒绝在一个不存在的目录上给出「成功」读数。`);
  console.error('先跑 `npm run build`（产物落在 dist/），或显式给一个存在的目录：node scripts/tools/tree-digest.cjs <dir>');
  process.exit(2);
}
if (!fs.statSync(dir).isDirectory()) {
  console.error(`不是目录：${dirArg}（解析为 ${dir}）`);
  process.exit(2);
}
if (outArg) {
  const outDir = path.dirname(path.resolve(outArg.slice('--out='.length)));
  if (!fs.existsSync(outDir)) {
    console.error(`--out 的目标目录不存在：${outDir} —— 先建目录再重跑（今天不替你创建目录，免得把写错路径变成静默落盘）。`);
    process.exit(2);
  }
}

const files = [];
const walk = current => {
  // ① 每层显式排序；② 比较符 = UTF-16 码元序（不是 locale 序）
  const entries = fs.readdirSync(current, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    const rel = path.relative(dir, full).split(path.sep).join('/');
    files.push({
      rel,
      size: fs.statSync(full).size,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')
    });
  }
};
walk(dir);

const tree = crypto.createHash('sha256');
for (const file of files) tree.update(`${file.rel}\u0000${file.sha256}\n`);

const report = {
  dir: path.basename(dir),
  files: files.length,
  bytes: files.reduce((sum, file) => sum + file.size, 0),
  treeDigest: tree.digest('hex'),
  manifestSha256: crypto.createHash('sha256').update(files.map(f => `${f.rel}\u0000${f.sha256}`).join('\n'), 'utf8').digest('hex'),
  perFile: files.map(f => `${f.rel}\t${f.sha256}`)
};

if (outArg) {
  const outFile = outArg.slice('--out='.length);
  fs.writeFileSync(path.resolve(outFile), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (!jsonOut) console.log(`写出 ${outFile}`);
}

if (jsonOut) {
  // `--json`：stdout 只有这一段 JSON（与仓内其它 report:* 工具的约定一致）
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${report.dir}: ${report.files} 文件 / ${report.bytes} B · 全树摘要 ${report.treeDigest}`);
  console.log(`清单摘要 ${report.manifestSha256}`);
}
