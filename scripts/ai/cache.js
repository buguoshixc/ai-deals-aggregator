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
 * 含第三方网页正文的缓存**不提交**（整个目录都不提交，这条纪律是结构性的，不靠人记得）。
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function cacheDir() {
  return process.env.AI_CACHE_DIR || path.join(ROOT, '.ai-cache');
}

function subdir(...parts) {
  const dir = path.join(cacheDir(), ...parts);
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
  fs.appendFileSync(invalidPath(task), `${JSON.stringify(entry)}\n`, 'utf8');
  return invalidPath(task);
}

/** 清空一次任务目录（只在 --fresh 时用；不清 usage 账本） */
function resetTask(task) {
  const dir = path.join(cacheDir(), task);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  return dir;
}

module.exports = {
  ROOT,
  cacheDir,
  subdir,
  sha256,
  canonicalJson,
  inputHashOf,
  cacheKeyOf,
  pathFor,
  read,
  write,
  candidatesDir,
  mockDir,
  invalidPath,
  appendInvalid,
  resetTask
};
