/**
 * plans.json 的 Provider 归一（`scripts/data/providers.json` 的唯一读入口）。
 *
 * ## 为什么另立一张表，而不是复用 deals 的 VENDOR_RULES
 *
 * deals 的厂商归一住在 `index.html` 的 RENDER-CORE 里（`vendorOf()`，由 `lib/render-core.js`
 * 在无 DOM 的沙箱里求值），它的输入是一条 **deal 记录**，行为是「命中规则就归一名，命中不了就
 * 原样返回」。那个「命中不了就原样返回」对优惠是合适的（宁可显示原始名，也不要给没有规则的
 * 条目硬套一个厂商），但对 Plans 正是**题面点名要避免的失败模式**：同一个平台多写几个别名，
 * 就会在套餐页上分裂成好几个 provider 身份。
 *
 * 所以这一层的规矩刻意更严，而且入口只有两个：
 *
 *   1. **未登记一律硬红**（`resolveProvider()` 返回 null ⇒ 构建期报错并给出建议 key），
 *      逼人做一次显式登记，而不是静默产生新身份；
 *   2. **匹配是精确相等**，不做子串/正则。子串匹配在本仓库有实测教训：`/krea/i` 会命中
 *      「Kreado AI」（见 index.html 的 VENDOR_RULES 注释）。精确匹配不会误并，代价是
 *      新别名要手写一行 —— 在 5–10 条数据集的规模上这是划算的。
 *
 * ## 与 deals 侧的交叉一致性
 *
 * 两边是两套身份空间（deals 的 `vendor` 是原始串；plans 的 `provider` 是规范 key），
 * 但我们不允许它们在**同一家公司**上互相矛盾：若某个 provider 的 `name` 恰好也是
 * `scripts/data/vendor-slugs.json` 的键，两边的 slug 必须逐字相同（`/vendor/<slug>/` 与
 * `/plans/.../<slug>/` 将来会同时挂在同一个站上，同公司两个 slug 是不能接受的）。
 *
 * 反过来，**同一家公司允许有两个 provider**（字节跳动的「火山引擎」与 Trae 是两条产品线），
 * 但这类决定必须在 providers.json 的表头与阶段报告里逐条登记。
 */

const fs = require('fs');
const path = require('path');

const PROVIDERS_FILE = path.join(__dirname, '..', 'data', 'providers.json');
const VENDOR_SLUGS_FILE = path.join(__dirname, '..', 'data', 'vendor-slugs.json');

/**
 * slug 的形状判据。**刻意在这里再写一遍**（而不是 require landing.js 的 SLUG_RE）：
 * landing.js 拖着 audience / categories / feeds 一大串依赖，而这一层要能在
 * `plans-selftest` 里被零依赖地直接调用。两份判据不许分家 ——
 * `plans-selftest.js` 有一条断言逐字比对两者的 `String(...)`。
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const KEY_RE = /^[a-z0-9][a-z0-9-]*$/;

const MAX_ALIASES = 16;
const MAX_ALIAS_LENGTH = 40;
const MAX_NAME_LENGTH = 60;

/** 去掉 `_` 开头的元信息键（与 vendor-slugs.json / aliases.json 的既有约定一致） */
function withoutMeta(object) {
  const out = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (key.startsWith('_')) continue;
    out[key] = value;
  }
  return out;
}

/**
 * 输入归一：NFKC → 去首尾空白 → 折叠内部空白 → 转小写。
 *
 * 为什么必须先 NFKC：全角括号/全角字母在 JSON 里与半角是不同的码点
 * （`MiniMax（稀宇科技）` 与 `MiniMax(稀宇科技)` 肉眼几乎一样），不归一就会出现
 * 「看起来一样的两个身份」。表里的 aliases 必须**已经是**这个形态（由校验器断言）。
 */
function normalizeProviderName(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * 读取 provider 表。**永不 throw**（缺失/坏文件由调用方按 `missing` / `broken` 决定怎么办）：
 * 与 `lib/health.js` / `lib/history.js` 的读入口同一套约定。
 *
 * @returns {{table:object, byAlias:Map<string,string>, file:string, missing:boolean, broken:string|null}}
 */
function load({ file = PROVIDERS_FILE } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { table: {}, byAlias: new Map(), file, missing: true, broken: null };
    throw new Error(`providers.json 读取失败: ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { table: {}, byAlias: new Map(), file, missing: false, broken: `不是合法 JSON：${error.message}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { table: {}, byAlias: new Map(), file, missing: false, broken: '不是 JSON 对象' };
  }

  const table = withoutMeta(parsed);
  return { table, byAlias: byAliasOf(table), file, missing: false, broken: null };
}

/** alias（已归一）→ provider key。冲突时后者被丢弃，由 validateProviderTable 报红 */
function byAliasOf(table) {
  const map = new Map();
  for (const [key, entry] of Object.entries(table || {})) {
    for (const alias of (entry && Array.isArray(entry.aliases) ? entry.aliases : [])) {
      const normalized = normalizeProviderName(alias);
      if (!normalized || map.has(normalized)) continue;
      map.set(normalized, key);
    }
  }
  return map;
}

/**
 * 原始平台串 → 规范身份。**未登记返回 null**（调用方必须当成错误，不许原样放行）。
 *
 * @param {string} raw
 * @param {object} [table] 默认读盘；自测可注入
 * @returns {{key:string, name:string, slug:string, logo:string|null, raw:string}|null}
 */
function resolveProvider(raw, table = null) {
  const value = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!value) return null;
  const source = table || load().table;
  const normalized = normalizeProviderName(value);

  if (Object.prototype.hasOwnProperty.call(source, normalized)) {
    // 容错：有人直接写了 key（key 与 alias 不同名时才可能走到这里）
    return withKey(normalized, source[normalized], value);
  }
  for (const [key, entry] of Object.entries(source)) {
    const aliases = entry && Array.isArray(entry.aliases) ? entry.aliases : [];
    if (aliases.some(alias => normalizeProviderName(alias) === normalized)) {
      return withKey(key, entry, value);
    }
  }
  return null;
}

function withKey(key, entry, raw) {
  return {
    key,
    name: String((entry && entry.name) || ''),
    slug: String((entry && entry.slug) || ''),
    logo: entry && typeof entry.logo === 'string' ? entry.logo : null,
    raw
  };
}

/** provider key → 显示名（渲染层用；键不存在时原样返回 key，绝不编一个名字） */
function providerNameOf(key, table = null) {
  const source = table || load().table;
  const entry = source[key];
  return entry && entry.name ? entry.name : String(key || '');
}

/** provider key → slug（同上） */
function providerSlugOf(key, table = null) {
  const source = table || load().table;
  const entry = source[key];
  return entry && entry.slug ? entry.slug : null;
}

/**
 * 表自身的校验。返回问题列表（空 = 通过）。**判据只写在这里**：validate.js 与
 * plans-selftest 都调它，不各写一份。
 */
function validateProviderTable(table) {
  const problems = [];
  if (!table || typeof table !== 'object' || Array.isArray(table)) {
    return ['providers.json 必须是一个对象（键 = provider key）'];
  }
  const keys = Object.keys(table);
  if (!keys.length) problems.push('providers.json 里没有任何 provider');

  const seenSlug = new Map();
  const seenName = new Map();
  const seenAlias = new Map();

  for (const key of keys) {
    const where = `providers.json 的 ${key}`;
    const entry = table[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${where}: 必须是对象`);
      continue;
    }
    if (!KEY_RE.test(key)) problems.push(`${where}: key 必须匹配 ^[a-z0-9][a-z0-9-]*$`);

    const name = String(entry.name || '');
    if (!name.trim()) problems.push(`${where}: name 不能为空`);
    else if (name.length > MAX_NAME_LENGTH) problems.push(`${where}: name 超过 ${MAX_NAME_LENGTH} 字`);
    else if (seenName.has(name)) problems.push(`${where}: name「${name}」与 ${seenName.get(name)} 重复（显示名必须唯一）`);
    else seenName.set(name, key);

    const slug = String(entry.slug || '');
    if (!SLUG_RE.test(slug)) problems.push(`${where}: slug「${slug}」必须匹配 ^[a-z0-9][a-z0-9-]*$`);
    else if (seenSlug.has(slug)) problems.push(`${where}: slug「${slug}」与 ${seenSlug.get(slug)} 重复`);
    else seenSlug.set(slug, key);

    if (entry.logo !== null && typeof entry.logo !== 'string') {
      problems.push(`${where}: logo 必须是字符串或 null`);
    }

    const aliases = entry.aliases;
    if (!Array.isArray(aliases) || !aliases.length) {
      problems.push(`${where}: aliases 必须是非空数组`);
      continue;
    }
    if (aliases.length > MAX_ALIASES) problems.push(`${where}: aliases 超过 ${MAX_ALIASES} 条`);
    const localSeen = new Set();
    for (const alias of aliases) {
      if (typeof alias !== 'string') {
        problems.push(`${where}: alias 必须是字符串`);
        continue;
      }
      if (normalizeProviderName(alias) !== alias) {
        problems.push(`${where}: alias「${alias}」不是归一形态（应为「${normalizeProviderName(alias)}」）—— 表里必须存 NFKC + 小写 + 折叠空白后的形态`);
        continue;
      }
      if (alias.length > MAX_ALIAS_LENGTH) problems.push(`${where}: alias「${alias}」超过 ${MAX_ALIAS_LENGTH} 字`);
      if (localSeen.has(alias)) problems.push(`${where}: alias「${alias}」在本条内重复`);
      localSeen.add(alias);
      if (seenAlias.has(alias)) {
        problems.push(`${where}: alias「${alias}」已被 ${seenAlias.get(alias)} 占用（同一别名只能指向一个 provider）`);
      } else {
        seenAlias.set(alias, key);
      }
    }
    // key 自己也应当是一个可用输入：要么在 aliases 里，要么等于某个 alias
    if (!aliases.includes(key) && normalizeProviderName(key) !== key) {
      problems.push(`${where}: key 不是归一形态`);
    }
  }
  return problems;
}

/**
 * 与 deals 侧 slug 表的交叉一致性。
 *
 * 判据刻意只有一条：**同一个显示名上的 slug 必须逐字相同**。没登记的厂商不构成约束
 * （Notion / Microsoft 那几家在 plans 里根本没有套餐，不需要为它们编 slug）。
 */
function validateSlugAgreement(table, vendorSlugs) {
  const problems = [];
  for (const [key, entry] of Object.entries(table || {})) {
    const name = String((entry && entry.name) || '');
    if (!name || !Object.prototype.hasOwnProperty.call(vendorSlugs || {}, name)) continue;
    const mine = String((entry && entry.slug) || '');
    const theirs = String(vendorSlugs[name] || '');
    if (mine !== theirs) {
      problems.push(`providers.json 的 ${key}（显示名「${name}」）slug 是「${mine}」，但 vendor-slugs.json 里同一个显示名登记的是「${theirs}」—— 同一家公司不能有两个 slug`);
    }
  }
  return problems;
}

/** 读取 deals 侧的 slug 表（只读，不校验它本身：那是 feeds/landing 的职责） */
function loadVendorSlugs({ file = VENDOR_SLUGS_FILE } = {}) {
  try {
    return withoutMeta(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (error) {
    return {};
  }
}

/** 给未登记的平台提一个可读的建议 slug（与 landing.suggestSlug 同思路，此处只要可读） */
function suggestProviderSlug(raw) {
  const latin = normalizeProviderName(raw).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (latin) return latin;
  let hash = 0;
  const text = String(raw || '');
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 1000000;
  return `provider-${hash.toString(36)}`;
}

module.exports = {
  PROVIDERS_FILE,
  VENDOR_SLUGS_FILE,
  SLUG_RE,
  KEY_RE,
  MAX_ALIASES,
  MAX_ALIAS_LENGTH,
  MAX_NAME_LENGTH,
  withoutMeta,
  normalizeProviderName,
  load,
  byAliasOf,
  resolveProvider,
  providerNameOf,
  providerSlugOf,
  validateProviderTable,
  validateSlugAgreement,
  loadVendorSlugs,
  suggestProviderSlug
};
