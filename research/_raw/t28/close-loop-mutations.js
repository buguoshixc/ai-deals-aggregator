#!/usr/bin/env node
'use strict';
/**
 * t28 · t14 闭环核验：F1（关系层缺失判红）+ F2（索引身份对账）的**定向变异**。
 *
 * 全程只用 %TEMP% 副本：
 *   · F1 在「整仓副本」上做（coverage-report.js 需要脚本/数据/模板齐备）；
 *   · F2 在「产物副本」上做（用 t28 的新构建 t28site.building 作基线，避免拿陈旧 dist 量）。
 * 脚本开头/结尾各算一次两个生产文件的 sha256，自证共享 worktree 未被写入。
 *
 * 用法：node research/_raw/t28/close-loop-mutations.js
 * 退出码：0 = 全部符合预期且共享 worktree 哈希未变；1 = 有不符合预期的项。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const WT = path.join(__dirname, '..', '..', '..');
const TMP = process.env.TEMP || '/tmp';
const REPO_COPY = path.join(TMP, 'cev1-t28-repo');
const SITE_COPY = path.join(TMP, 'cev1-t28-site');
const SRC_SITE = path.join(WT, 't28site.building');

const WATCHED = ['scripts/data/model-registry-links.json', 'dist/models/index.html'];
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(WT, f))).digest('hex');
const before = Object.fromEntries(WATCHED.map(f => [f, sha256(f)]));

const robocopy = (src, dst, extra = []) => {
  fs.rmSync(dst, { recursive: true, force: true });
  const r = spawnSync('robocopy', [src, dst, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', ...extra], { stdio: 'ignore' });
  if (r.status !== undefined && r.status >= 8) throw new Error('robocopy 失败 ' + r.status + ' ' + src);
};
const readText = p => fs.readFileSync(p, 'utf8');
const writeText = (p, s) => fs.writeFileSync(p, s, 'utf8');

/* ── F1：整仓副本 ─────────────────────────────────────────────── */
function buildRepoCopy() {
  robocopy(WT, REPO_COPY, ['/XD', 'node_modules', '.git', 'dist', '.worktrees', '*.building', '*.stale']);
  const junction = path.join(REPO_COPY, 'node_modules');
  fs.rmSync(junction, { recursive: true, force: true });
  fs.symlinkSync(path.join(WT, 'node_modules'), junction, 'junction');
}
function runReport(cwd) {
  const r = spawnSync(process.execPath, [path.join(cwd, 'scripts/tools/coverage-report.js')], { cwd, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  return { exit: r.status, lines: out.split('\n').filter(Boolean), out };
}

/* ── F2：产物副本 ─────────────────────────────────────────────── */
function buildSiteCopy() {
  robocopy(SRC_SITE, SITE_COPY);
}
function runModelsSelftest() {
  const r = spawnSync(process.execPath,
    [path.join(WT, 'scripts/tools/models-page-selftest.js'), '--dir=' + SITE_COPY],
    { cwd: WT, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  return { exit: r.status, fails: out.split('\n').filter(l => l.trim().startsWith('✗')), out };
}

const results = [];
const record = (label, expectRed, got) => {
  const red = got.exit !== 0;
  const ok = expectRed ? red : !red;
  results.push({ label, ok, exit: got.exit, expectRed });
  console.log('\n===== ' + label + ' =====');
  console.log('  ' + (ok ? '✓ 符合预期' : '✗ 不符合预期') + ' · 期望' + (expectRed ? '非 0' : '0') + ' · 实际 exit=' + got.exit);
  if (got.lines) got.lines.slice(-2).forEach(l => console.log('     尾行: ' + l.trim().slice(0, 190)));
  (got.fails || []).slice(0, 3).forEach(l => console.log('     红: ' + l.trim().slice(0, 190)));
};

/* ═══ F1 ═══ */
console.log('######## F1：关系层缺失必须判红（整仓副本 ' + REPO_COPY + '）########');
buildRepoCopy();
record('F1-C 对照：副本原样（预期 exit 0）', false, runReport(REPO_COPY));
fs.rmSync(path.join(REPO_COPY, 'scripts/data/model-registry-links.json'), { force: true });
record('F1-V 变异：删掉 scripts/data/model-registry-links.json（预期非 0 且点名关系层）', true, runReport(REPO_COPY));
{
  const got = runReport(REPO_COPY);
  const names = got.lines.filter(l => /关系层|model-registry-links/.test(l)).slice(0, 3);
  console.log('  → 点名关系层的行数 = ' + names.length);
  names.forEach(l => console.log('     ' + l.trim().slice(0, 200)));
}

/* ═══ F2 ═══ */
console.log('\n######## F2：索引身份对账必须判红（产物副本 ' + SITE_COPY + '，基线 = t28site.building 新构建）########');
buildSiteCopy();
record('F2-C 对照：产物原样（预期 exit 0）', false, runModelsSelftest());

const INDEX = path.join(SITE_COPY, 'models/index.html');
const baseIndex = readText(INDEX);

// V1 两者都改（slug + 详情链接）
writeText(INDEX, baseIndex.split('glm-5.3').join('glm-5.3x'));
record('F2-V1 slug 与链接一起改（glm-5.3 → glm-5.3x 全量替换）', true, runModelsSelftest());

// V2 只改链接不改 slug
writeText(INDEX, baseIndex.split('models/glm-5.3/').join('models/glm-5.3x/'));
record('F2-V2 **只改链接**（models/glm-5.3/ → models/glm-5.3x/，行身份属性不动）', true, runModelsSelftest());

// V3 只改 slug 不改链接
writeText(INDEX, baseIndex.split('"glm-5.3"').join('"glm-5.3x"'));
record('F2-V3 **只改 slug**（data-model/data-item 的 "glm-5.3" → "glm-5.3x"，href 保持正确）', true, runModelsSelftest());

writeText(INDEX, baseIndex);
{
  const restored = readText(INDEX) === baseIndex;
  console.log('\n  产物副本逐字还原 = ' + restored);
}

/* ── 自证 ─────────────────────────────────────────────────────── */
const after = Object.fromEntries(WATCHED.map(f => [f, sha256(f)]));
const intact = WATCHED.every(f => before[f] === after[f]);
console.log('\n===== 共享 worktree 自证 =====');
WATCHED.forEach(f => console.log('  ' + (before[f] === after[f] ? '✓' : '✗') + ' ' + f + '  '
  + before[f].slice(0, 16) + ' → ' + after[f].slice(0, 16)));
console.log('  逐字未变：' + intact);

fs.rmSync(REPO_COPY, { recursive: true, force: true });
fs.rmSync(SITE_COPY, { recursive: true, force: true });

console.log('\n===== 汇总 =====');
results.forEach(r => console.log('  ' + (r.ok ? '✓' : '✗') + ' ' + r.label + '  (exit ' + r.exit + ')'));
const bad = results.filter(r => !r.ok);
console.log('\n' + ((bad.length === 0 && intact) ? '✅ 全部符合预期，共享 worktree 未被触碰'
  : '❌ ' + bad.length + ' 项不符合预期' + (intact ? '' : '；哈希变化！')));
process.exitCode = (bad.length === 0 && intact) ? 0 : 1;
