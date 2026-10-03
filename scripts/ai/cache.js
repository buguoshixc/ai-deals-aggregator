/**
 * AI 缓存与运行期产物目录（`.ai-cache/`，**整个目录 gitignore**）。
 *
 * ## 两条不能破的纪律
 *
 * ① **key 里不许有时间戳、随机数、`Date.now()`。**
 *    同一个 `task + promptVersion + provider + model + inputHash` 在任何机器上都必须算出同一个 key。
 *    这是「同一份输入不重复调模型」的前提，也是 `check-reproducible` 不会被破坏的前提
 *    （那个门禁查的是 deals.json 的定点性，而它要求任何一轮重放都得到同一个结果）。
 *
 * ② **`.ai-cache/` 永远不会被采集/合并/构建读到。**
 *    AI 产出走的是「候选 → 人工确认 → curated_*.json / audience-overrides.json」这条路，
 *    缓存只是省钱用的，不是数据来源。所以缓存损坏、丢失、被清空都不影响任何生产数据。
 *
 * ③ **AI 生成侧只能写 `.ai-cache/**` 与 `research/**`**（`assertAiOutputPath`）。
 *    生产真值（`deals.json` / `plans.json` / `api-plans.json` / `models.json` /
 *    `model-registry-links.json` / `scripts/data/**` …）是**硬拒绝**清单，白名单放宽也越不过；
 *    `--out=deals.json`、`--out=../deals.json`、`.ai-cache/../deals.json` 这类穿越路径一律拒绝。
 *    这条纪律不是"参数校验"，而是生成物写盘路径上的一层结构 —— 见 `检查.md` §8.10 / §10.5。
 *
 * 含第三方网页正文的缓存**不提交**（整个目录都不提交，这条纪律是结构性的，不靠人记得）。
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

/**
 * 生产真值：AI **生成**侧的产物一个字节都不许写到这里。
 *
 * 为什么写成一份显式清单（而不是"凡是 tracked 文件"那种动态判据）：
 * 判据必须**可读、可审、且不依赖 git**。清单里的每一项都是「站点发布的数据来源或站点本体」，
 * 写坏其中任何一个都等于让 AI 的话变成读者看到的事实（`检查.md` §8.10 / §10.5 的红线）。
 *
 * 它与下面的**硬拒绝**一起用：白名单只管"能落在哪"，这里管"绝对不许落在哪"——
 * 两者独立，所以将来有人把白名单放宽（比如把 `research/` 换成更宽的东西）也越不过这一层。
 */
const PROTECTED_FILES = [
  'deals.json',
  'plans.json',
  'api-plans.json',
  'models.json',
  'model-registry-links.json',
  'index.html'
];
/** 整棵目录都算生产真值：`scripts/data/**` 里是策展、译文、覆盖层、心跳、历史、账本与模型登记 */
const PROTECTED_DIRS = ['scripts/data', '.git'];
/**
 * **只读取证目录**：不是"生产数据"，但同样是别人依赖的事实 —— 审计/取证的结论就长在这些文件里，
 * 让一条 AI 生成命令改写它们，等于让证据被覆盖且没人看得出来（本仓库对 `research/audit/**`
 * 一直是只读纪律，这里把它变成结构）。
 */
const READONLY_DIRS = ['research/audit'];

function cacheDir() {
  return process.env.AI_CACHE_DIR || path.join(ROOT, '.ai-cache');
}

function subdir(...parts) {
  const dir = path.join(cacheDir(), ...parts);
  assertAiOutputPath(dir, { label: 'AI 缓存目录' });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/** 稳定的 JSON 序列化：递归排序键，保证同一份对象在任何键序下得到同一个哈希 */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter(key => value[key] !== undefined).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

/** 输入内容的指纹（候选信封里那个 `inputHash`） */
function inputHashOf(content) {
  return `sha256:${sha256(typeof content === 'string' ? content : canonicalJson(content))}`;
}

/** 缓存 key：只由这五项决定，逐项用 \0 隔开避免拼接歧义 */
function cacheKeyOf({ task, promptVersion, provider, model, inputHash }) {
  return sha256([task, promptVersion, provider, model, inputHash].join('\0'));
}

function pathFor(task, key) {
  return path.join(cacheDir(), task, `${key}.json`);
}

/* ---------------- 落点白名单（生成物 vs 生产真值的那道墙） ---------------- */

/** 路径是否在 dir 之内（dir 自身算在内） */
function insideDir(target, dir) {
  const rel = path.relative(path.resolve(dir), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * 用真实路径判落点：`..` 穿越由 `path.resolve` 归一，符号链接则由 `realpath` 兜住。
 * 逐级上溯到第一个存在的祖先再做 realpath —— 目标文件通常还不存在，直接 realpath 会抛。
 */
function realPathOf(file) {
  let current = path.resolve(file);
  const tail = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    tail.unshift(path.basename(current));
    current = parent;
  }
  try {
    return path.join(fs.realpathSync(current), ...tail);
  } catch (error) {
    return path.resolve(file);
  }
}

/** 命中生产真值就返回原因（人话），否则 null */
function protectedReason(file) {
  const abs = realPathOf(file);
  if (abs === realPathOf(ROOT)) return '仓库根目录';
  for (const rel of PROTECTED_FILES) {
    if (abs === realPathOf(path.join(ROOT, rel))) return `生产真值文件 ${rel}`;
  }
  for (const rel of PROTECTED_DIRS) {
    if (insideDir(abs, realPathOf(path.join(ROOT, rel)))) return `生产目录 ${rel}/`;
  }
  for (const rel of READONLY_DIRS) {
    if (insideDir(abs, realPathOf(path.join(ROOT, rel)))) return `只读取证目录 ${rel}/`;
  }
  return null;
}

/**
 * AI 生成物**允许**落在哪：`.ai-cache/**`（含 `AI_CACHE_DIR` 覆盖的位置）与 `research/**`。
 * `research/` 是取证与草稿区；除这两处之外的任何位置都要显式改这份白名单才能写 —— 这是有意的。
 */
function allowedOutputDirs() {
  const dirs = [cacheDir(), path.join(ROOT, '.ai-cache'), path.join(ROOT, 'research')];
  const seen = new Set();
  return dirs.filter(dir => {
    const key = realPathOf(dir).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 生成物的落点断言（**唯一实现**）。拒绝时抛错，调用方负责把它变成 exit≠0 与一句人话。
 *
 * 两道独立的判据，缺一不可：
 *   ① 硬拒绝：命中生产真值清单 → 拒绝（与白名单无关，白名单放宽也越不过）；
 *   ② 白名单：必须落在 `.ai-cache/**` 或 `research/**` 之内 → 否则拒绝。
 * `--out=deals.json`、`--out=../deals.json`、`--out=scripts/data/<生产文件>`、
 * `.ai-cache/../deals.json` 这类穿越路径在这里全部被拒（`path.resolve` + `realpath` 双重归一）。
 */
function assertAiOutputPath(file, { label = 'AI 生成物' } = {}) {
  const abs = path.resolve(file);
  const deny = protectedReason(abs);
  if (deny) throw new Error(`${label}不许写进${deny}：${path.relative(ROOT, abs) || abs}`);
  const dirs = allowedOutputDirs();
  if (!dirs.some(dir => insideDir(realPathOf(abs), realPathOf(dir)))) {
    throw new Error(
      `${label}只允许落在 ${dirs.map(dir => path.relative(ROOT, dir) || dir).join(' / ')} 之类的明确目录里：` +
      `${path.relative(ROOT, abs) || abs}`
    );
  }
  return abs;
}

/**
 * 读缓存。损坏的文件**不抛**：当作未命中，并把损坏事实报给调用方（写进 run summary）。
 * @returns {{hit:boolean, payload:object|null, broken:string|null}}
 */
function read(task, key) {
  const file = pathFor(task, key);
  if (!fs.existsSync(file)) return { hit: false, payload: null, broken: null };
  try {
    return { hit: true, payload: JSON.parse(fs.readFileSync(file, 'utf8')), broken: null };
  } catch (error) {
    return { hit: false, payload: null, broken: `${path.relative(ROOT, file)}: ${error.message}` };
  }
}

function write(task, key, payload) {
  const file = pathFor(task, key);
  assertAiOutputPath(file, { label: 'AI 缓存文件' });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return file;
}

/* ---------------- 运行期产物 ---------------- */

function candidatesDir() {
  return subdir('candidates');
}

function mockDir() {
  return subdir('mock');
}

function invalidPath(task) {
  return path.join(subdir('invalid'), `${task}.jsonl`);
}

/** 落一条「AI 输出不合格」的记录，供人回看模型到底吐了什么（不进候选列表） */
function appendInvalid(task, entry) {
  assertAiOutputPath(invalidPath(task), { label: '无效输出归档' });
  fs.appendFileSync(invalidPath(task), `${JSON.stringify(entry)}\n`, 'utf8');
  return invalidPath(task);
}

/** 清空一次任务目录（只在 --fresh 时用；不清 usage 账本） */
function resetTask(task) {
  const dir = path.join(cacheDir(), task);
  assertAiOutputPath(dir, { label: '缓存任务目录' });
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  return dir;
}

module.exports = {
  ROOT,
  PROTECTED_FILES,
  PROTECTED_DIRS,
  READONLY_DIRS,
  cacheDir,
  subdir,
  sha256,
  canonicalJson,
  inputHashOf,
  cacheKeyOf,
  pathFor,
  read,
  write,
  insideDir,
  realPathOf,
  protectedReason,
  allowedOutputDirs,
  assertAiOutputPath,
  candidatesDir,
  mockDir,
  invalidPath,
  appendInvalid,
  resetTask
};
