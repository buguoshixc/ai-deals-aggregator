#!/usr/bin/env node
/**
 * t42：**依赖数据规模的字面量期望**全仓扫描（只读、可复跑、输出稳定排序）。
 *
 * 用法：
 *   node research/_raw/t42/scan.cjs            # 人类可读 + 末尾 JSON 摘要
 *   node research/_raw/t42/scan.cjs --json     # 只输出 JSON（供逐字节对拍）
 *
 * ## 它找什么
 *
 * 「把期望钉在某个**计数**上」的代码形态 —— 这类判据在数据变长/变多时会漂移：
 *   ① `x.length === 4` / `x.length !== 4` / `x.length > 3`（比较紧邻 length）
 *   ② `=== 4` / `!== 23` / `=== 44` 这类**与数字字面量的等值/不等比较**（排除 0/1/-1/NaN 这类通用哨兵）
 *   ③ `startsWith('4')` / `endsWith(...)` 之类**拿数字前缀当结构**的匹配（数列扩张时会误命中）
 *   ④ 正则可读形态里的**计数文本**：`/\d+ 条/`、`N 项`、`N 行`、`N 个` 之类
 *   ⑤ `expect-checks=<N>` / `--expect-checks=N` 这类**外部传入的期望项数**
 *
 * ## 它怎么分类（只允许三种；判据写死在 CLASSIFY 里，可复核）
 *
 * · `契约冻结` —— **有意**钉死、改动必须留痕（CI 门禁步骤数、实跑项数、自测登记面、
 *   协议版本号、schemaVersion）。这类**不是**风险，报告里只登记、不建议改。
 *   判据关键词（路径/上下文）：check-ci-consistency、verify.yml、action.yml、expect-checks、
 *   schemaVersion、stepCount、GATE_STEP、SELFTEST 面、package.json 的 scripts 计数。
 * · `数据依赖` —— 比较对象是**随数据增长而变**的集合/计数（providers / plans / api-plans /
 *   models / links / declarations / 页面 / 条目 / 身份 / skip 记录…）。**属风险**。
 * · `无风险` —— 对象不是数据规模：常量枚举数（MODEL_ROLES、API_UNITS…）、字段键序、
 *   HTTP 状态码、索引上界、时间字段、版本常量。
 *
 * ## 为什么输出是确定的
 *
 * 扫描是**纯读文件 + 纯函数分类**：不联网、不读时钟、不用随机数；结果按
 * `(文件路径, 行号, 代码行)` 排序后再输出；JSON 摘要里的 `totals` 也是排序后的计数。
 * 于是同一棵树跑两次的 stdout 逐字节相同（验收 ⑥ 的第二条命令就是对拍这个）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const JSON_ONLY = process.argv.includes('--json');

/** 扫描面：任务点名的三类 + 页面层（页面层的计数断言同样属这类风险）*/
const SCAN_DIRS = ['scripts/tools', 'scripts/lib', 'scripts/collectors'];
const SCAN_EXTRA_FILES = [
  path.join(ROOT, '.github', 'workflows', 'verify.yml'),
  path.join(ROOT, '.github', 'actions', 'gate', 'action.yml'),
  path.join(ROOT, 'package.json')
];

/** 通用哨兵值：这些数字在任何语境下都是「空/未找到/循环起点」，不算数据规模期望 */
const SENTINEL_NUMBERS = new Set(['0', '1', '-1', '0.5', '2']);

/* ------------------------------------------------------------------ */
/* 分类判据（写死在这里，便于复核）                                       */
/* ------------------------------------------------------------------ */

/** 契约冻结：有意钉死、改动必须留痕 */
const FROZEN_RULES = [
  { id: 'ci-consistency', re: /check-ci-consistency|GATE_STEP|FROZEN_/, why: '门禁登记制的实跑项数与步骤体指纹 —— 加断言就是改口径，必须留痕' },
  { id: 'ci-config', re: /\.github[\\/]|action\.yml|verify\.yml|expect-checks/, why: 'CI 配置与 --expect-checks：外部钉住的实跑项数（唯一出处是 verify.yml 的调用行）' },
  { id: 'package-scripts', re: /package\.json|scriptsCount|selftest:|selftestNames/, why: 'package.json 的 scripts / selftest 登记面：登记制本身，改动要留痕' },
  { id: 'schema-version', re: /schemaVersion|SCHEMA_VERSION|schemaCapability/, why: '协议版本号：常量，不是数据规模' },
  { id: 'gate-step-count', re: /stepCount|gateStep|steps\.length|stepNames/, why: '门禁步骤数：有意冻结' }
];

/** 无风险：对象不是数据规模 */
const NORISK_RULES = [
  { id: 'empty-check', re: /(?:===|!==|==|!=)\s*0\b/, why: '「空集合」判据（length === 0 / 无漏检）：数据结构未变时恒成立，与数据规模增长无关' },
  { id: 'fixture-scope', re: /fixture|it\(|describe\(|cases|samples|probe|mutat|fixtureDir/i, why: '测试夹具内部计数：夹具是自带的、不随生产数据增长' },
  { id: 'enum-constant', re: /MODEL_ROLES|API_UNITS|API_CHANNELS|MODEL_VARIANTS|FREE_TIER|MEDIA_RATE|TOKEN_RATE|RESTRICTION_|QUOTA_TYPES|BILLING_PERIODS|CURRENCIES|CATALOG_STATUS|MODEL_STATUS|LINK_BASIS|GAP_REASONS|KNOWN_|_ENUM|LABEL\)/, why: '常量枚举长度：由代码定义，不由数据规模决定' },
  { id: 'key-order', re: /KEY_ORDER|keyOrder|Object\.keys\(.*\)\.join|hasOwnProperty/, why: '字段键序/存在性：契约形状，不是计数' },
  { id: 'status-code', re: /status ===|httpStatus ===|\.status !==/, why: 'HTTP 状态码：协议常量' },
  { id: 'index-bound', re: /index ===|\[0\]|slice\(|substring\(|\.length - 1/, why: '索引/切片上界：算法边界，不是数据规模期望' },
  { id: 'text-length', re: /title\.length|description\.length|quote\.length|contentLength|textLength|字符/, why: '文本长度上限：单条字段长度约束，不是集合规模' },
  { id: 'date-time', re: /Date|timestamp|elapsed|ms\b|durationMs|capturedAt|updatedAt/, why: '时间量：与数据规模无关（另有不读时钟的纪律）' },
  { id: 'precision', re: /toFixed|Math\.|Number\(|parseFloat|round/, why: '数值精度/解析：与数据规模无关' }
];

/** 数据依赖：比较对象随数据增长而变 */
const DATA_RULES = [
  { id: 'dataset-count', re: /providers|plans|apiPlans|models|links|declarations|registry|targets|entries|items|rows|deals|sources|feeds|pages|variants|identities/i, why: '比较对象是数据集计数' },
  { id: 'skip-route', re: /skipped|skippedNoIdentity|noIdentity|route|vendorSlug/i, why: '比较对象是「被跳过的身份/路由」计数，随 provider 身份增长' },
  { id: 'text-count', re: /条|项|行|个|家|座|张/, why: '中文计数文本：条数/项数变化会让匹配结果变化' },
  { id: 'array-length', re: /\.length\s*[=!<>]==?\s*\d+|\.length\s*>\s*\d+/, why: '直接对 length 做比较' }
];

function classify(file, lineText, value) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const haystack = `${rel}\n${lineText}`;
  for (const rule of FROZEN_RULES) {
    if (rule.re.test(haystack)) return { kind: '契约冻结', rule: rule.id, why: rule.why };
  }
  for (const rule of NORISK_RULES) {
    if (rule.re.test(haystack)) return { kind: '无风险', rule: rule.id, why: rule.why };
  }
  for (const rule of DATA_RULES) {
    if (rule.re.test(haystack)) return { kind: '数据依赖', rule: rule.id, why: rule.why };
  }
  // 兜底：找不出数据面的，按「未判定」计入报告（不硬塞进三分类）
  return { kind: '未判定', rule: null, why: '扫描器无法从上下文判定比较对象（需人工看一行）', value };
}

/* ------------------------------------------------------------------ */
/* 扫描                                                                */
/* ------------------------------------------------------------------ */
function collectFiles() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs).sort()) {
      if (!name.endsWith('.js')) continue;
      files.push(path.join(abs, name));
    }
  }
  for (const file of SCAN_EXTRA_FILES) if (fs.existsSync(file)) files.push(file);
  return files;
}

/** 语句形态过滤：只在**断言/判红**语境里才算「期望」，解析守卫（`cells.length < 3`）不算 */
const ASSERTION_CONTEXT = /\b(check|assert|expect|fail|problem|problems\.push|violation|throw|strictEqual|deepEqual|equal)\b/;
/** 解析/结构守卫的已知对象名：它们比较的是**页面结构**而不是数据规模 */
const STRUCTURAL_GUARD_OBJECTS = /\b(cells|children|trs|rows?\.length\s*&&|parts|segments|levels|depth|columns|tracks|gap|fontSize|lineHeight|width|height|bytes|codePoint|charCode)\b/;

/** 逐行提取「依赖数据规模的字面量期望」的具体形态 */
function findingsIn(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const isSelftest = /selftest/i.test(file);
  const out = [];
  const patterns = [
    // ① length 比较（断言语境才收）
    { id: 'length-compare', re: /(\w[\w.$[\]]*)\.length\s*(?:===|!==|==|!=|>=|<=|>|<)\s*(\d+)/, needsAssertion: true },
    // ② 与数字字面量等值比较（排除哨兵；断言语境才收）
    { id: 'numeric-equality', re: /(?:===|!==)\s*(\d+)\b/, needsAssertion: true },
    // ③ 数字前缀当结构（本身就是结构断言，不需要额外语境）
    { id: 'string-numeric-affix', re: /(?:startsWith|endsWith)\(\s*['"](\d+)/, needsAssertion: false },
    // ④ 计数文本正则（已经是"期望某种计数文本"的形态）
    { id: 'count-text-regex', re: /\\d\+\s*(?:条|项|行|个|家)/, needsAssertion: false },
    // ⑤ 外部传入的期望项数
    { id: 'expect-checks', re: /expect-checks[='"]\s*=?\s*(\d+)/, needsAssertion: false }
  ];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    // 打印行不是期望（`console.log('=== 3) hasKnown …')` 里的数字是标题序号）
    if (/console\.(log|warn|error)\(/.test(trimmed)) return;
    // 解析守卫：整行看起来是在校验**页面/文本结构**而不是数据规模 ⇒ 跳过（这些不是"期望"）
    if (STRUCTURAL_GUARD_OBJECTS.test(trimmed) && !ASSERTION_CONTEXT.test(trimmed)) return;
    for (const pattern of patterns) {
      const match = pattern.re.exec(line);
      if (!match) continue;
      const value = match[2] !== undefined ? match[2] : (match[1] !== undefined ? match[1] : match[0]);
      // **空集合哨兵**：`length === 0` 与 `length > 0` 都判「有没有」，与集合规模无关
      //（判据：值本身是 0，或代码里是 `> 0` / `>= 1` 这类"非空"形态）
      if (String(value) === '0') continue;
      if (/(?:>|>=)\s*0\b/.test(match[0])) continue;
      if (pattern.id === 'numeric-equality' && SENTINEL_NUMBERS.has(String(value))) continue;
      if (pattern.needsAssertion) {
        // 断言语境：本行有断言调用，或（自测文件里）本行参与了 check(...) 的多行参数
        const inAssertion = ASSERTION_CONTEXT.test(line) || isSelftest;
        if (!inAssertion) continue;
      }
      out.push({
        file: path.relative(ROOT, file).split(path.sep).join('/'),
        line: index + 1,
        pattern: pattern.id,
        value: String(value),
        code: trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed,
        ...classify(file, line, value)
      });
      break;   // 一行只记一条（最左最具体的形态）
    }
  });
  return out;
}

function main() {
  const files = collectFiles();
  const findings = [];
  for (const file of files) findings.push(...findingsIn(file));

  // 稳定排序：文件 → 行号 → 代码文本（同一棵树两次运行顺序恒等）
  findings.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });

  const totals = { 契约冻结: 0, 数据依赖: 0, 无风险: 0, 未判定: 0 };
  for (const item of findings) totals[item.kind] = (totals[item.kind] || 0) + 1;

  const payload = {
    scanner: 'research/_raw/t42/scan.cjs',
    scannedFiles: files.map(file => path.relative(ROOT, file).split(path.sep).join('/')).sort(),
    findings,
    totals,
    counts: { findings: findings.length, files: files.length }
  };

  if (JSON_ONLY) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return 0;
  }

  console.log(`t42 扫描：${files.length} 个文件，命中 ${findings.length} 条「依赖数据规模的字面量期望」`);
  console.log(`分类：契约冻结 ${totals['契约冻结']} · 数据依赖 ${totals['数据依赖']} · 无风险 ${totals['无风险']} · 未判定 ${totals['未判定']}`);
  console.log('');
  for (const kind of ['数据依赖', '未判定', '契约冻结', '无风险']) {
    const list = findings.filter(item => item.kind === kind);
    if (!list.length) continue;
    console.log(`── ${kind}（${list.length}）${'─'.repeat(Math.max(0, 50 - kind.length))}`);
    for (const item of list) {
      console.log(`  ${item.file}:${item.line}  [${item.pattern}=${item.value}]  ${item.code.slice(0, 96)}`);
    }
    console.log('');
  }
  console.log('提示：完整机器可读结果用 `node research/_raw/t42/scan.cjs --json`。');
  return 0;
}

process.exit(main());
