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
 *
 * ## v3.0 A1：第三条交叉断言 —— `vendorKey`（A 空间键）
 *
 * 上面前两条只管得到「显示名 → slug」这一层；它们对**厂商键**一无所知，于是
 * `moonshotai` / `moonshot` 那一类「同一家公司两个键」的裂缝在两边都不报红。
 * v3.0 起每条 provider 显式写下它在 **A 空间**（`index.html` 的 RENDER-CORE 里的
 * `VENDOR_RULES`）的键 —— `vendorKey`；在 deals 侧没有身份的公司显式写 `null`
 * （「这家在 A 空间没有身份」本身就必须写出来，而不是靠字段缺席去推断）。
 *
 * 判据只有一条、且**只做精确相等**：对每个非 null `vendorKey`，从 A 空间取回的
 * 显示名必须逐字等于本表的 `name`（`validateVendorKeyAgreement()`）。
 * A 空间的键/名表由 `index.html` 的 `vendorKeyNames()` 提供（`VENDOR_RULES` 是 `const`，
 * 在 `lib/render-core.js` 的沙箱里不会挂到 context 上，所以必须有那个访问器）。
 * 这里刻意**不做子串/正则**：`/krea/i` 命中「Kreado AI」的教训见文件头。
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

/**
 * `vendorKey` 这个字段名只在这里写一次：它是 providers.json 每条记录里指向
 * **A 空间**（index.html RENDER-CORE 的 `VENDOR_RULES`）的键。多个工具要按名字找它，
 * 散着写字符串就会有人拼错一个字母而没有任何东西报红（少一个字段 = 静默退化）。
 */
const VENDOR_KEY_FIELD = 'vendorKey';

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
 * provider key → **A 空间（deals 侧 VENDOR_RULES）的厂商键**。
 *
 * **只做精确匹配**：参数就是 provider key 本身（`providers.json` 的键），不做别名解析 ——
 * 别名解析是 `resolveProvider()` 的职责，两者混在一起会让「原始串 → provider」与
 * 「provider → A 空间键」这两步在同一个函数里纠缠，出错时看不出是哪一步错了。
 * 找不到这个 provider、字段缺席、或字段是 `null` 时返回 `null`
 * （provider-only 公司就是 `null`：它们在 deals 侧没有身份，事实如此，不编一个）。
 *
 * @param {string} key
 * @param {object} [table] 默认读盘；自测可注入
 * @returns {string|null}
 */
function vendorKeyOf(key, table = null) {
  const source = table || load().table;
  const name = String(key === null || key === undefined ? '' : key);
  if (!name) return null;
  const entry = Object.prototype.hasOwnProperty.call(source, name) ? source[name] : null;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const vendorKey = entry[VENDOR_KEY_FIELD];
  if (vendorKey === null || vendorKey === undefined) return null;
  return String(vendorKey);
}

/**
 * 把 A 空间的规则表归一成 `{key, name}` 对。
 *
 * 两种形态都收：`index.html` 的 `vendorKeyNames()` 给的是 `{key, name}` 对象；
 * 若调用方直接拿到 RENDER-CORE 的原始规则元组 `[正则, key, 显示名, logo]`，也能用
 * （自测里手写夹具时更省事）。**正则在归一中被丢掉**：这一层的判据是精确相等，
 * 不需要也不允许再跑一遍正则（子串/正则匹配在本仓库有 `/krea/` 命中 `Kreado AI` 的实测教训）。
 */
function vendorKeyPairs(vendorKeys) {
  const out = [];
  for (const item of Array.isArray(vendorKeys) ? vendorKeys : []) {
    if (!item) continue;
    if (Array.isArray(item)) {
      out.push({ key: String(item[1] === null || item[1] === undefined ? '' : item[1]), name: String(item[2] === null || item[2] === undefined ? '' : item[2]) });
    } else if (typeof item === 'object') {
      out.push({ key: String(item.key === null || item.key === undefined ? '' : item.key), name: String(item.name === null || item.name === undefined ? '' : item.name) });
    }
  }
  return out;
}

/**
 * 从 A 空间的键/名表里按**精确相等**取显示名。取不到返回 `null` ——
 * 调用方必须把它当成错误（不许退化成「跳过」或原样返回键）。
 *
 * @param {Array<{key:string,name:string}>|Array<Array>} vendorKeys
 * @param {string} key
 * @returns {string|null}
 */
function vendorDisplayNameFrom(vendorKeys, key) {
  const want = String(key === null || key === undefined ? '' : key);
  if (!want) return null;
  for (const pair of vendorKeyPairs(vendorKeys)) {
    if (pair.key === want) return pair.name;
  }
  return null;
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
  const seenVendorKey = new Map();

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

    // v3.0 A1：`vendorKey` 是 A 空间（RENDER-CORE 的 VENDOR_RULES）的厂商键。
    // 字段**必须存在**（在 deals 侧没有身份的公司显式写 null）：「身份必须显式」这条纪律
    // 要连「这家在 A 空间没有身份」也写出来，而不是靠字段缺席去推断 —— 缺席与写 null
    // 在产物里长得一模一样，只有这里能对上账（与 curated_* 的入口对账同一条理由）。
    if (!Object.prototype.hasOwnProperty.call(entry, VENDOR_KEY_FIELD)) {
      problems.push(`${where}: 缺少 ${VENDOR_KEY_FIELD} 字段（A 空间厂商键；这家在 deals 侧没有身份就显式写 null）`);
    } else {
      const vendorKey = entry[VENDOR_KEY_FIELD];
      if (vendorKey !== null) {
        if (typeof vendorKey !== 'string' || !KEY_RE.test(vendorKey)) {
          problems.push(`${where}: ${VENDOR_KEY_FIELD}「${vendorKey}」必须是 null 或匹配 ^[a-z0-9][a-z0-9-]*$ 的字符串`);
        } else if (seenVendorKey.has(vendorKey)) {
          problems.push(`${where}: ${VENDOR_KEY_FIELD}「${vendorKey}」已被 ${seenVendorKey.get(vendorKey)} 占用（A 空间的键只能指向一家 provider）`);
        } else {
          seenVendorKey.set(vendorKey, key);
        }
      }
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
    // 规范显示名必须能被认回自己。少了这一条，「MiniMax（稀宇科技）」这类带全角括号的
    // 显示名会稳定地掉进未登记分支（v2.4 为此写了一条 providerOverride），
    // 而错误信息只会说「未登记」，看不出「它其实就是这一家」。
    const normalizedName = normalizeProviderName(name);
    if (normalizedName && !aliases.includes(normalizedName)) {
      problems.push(`${where}: 规范显示名「${name}」归一后是「${normalizedName}」，但它不在本条的 aliases 里 —— 显示名必须能被 resolveProvider 认回自己`);
    }
  }
  return problems;
}

/**
 * 与 deals 侧 slug 表的交叉一致性（硬断言 ①）。
 *
 * 判据刻意只有一条：**同一个显示名上的 slug 必须逐字相同**。没登记的厂商不构成约束
 * （只有 1 条优惠、够不到落地页门槛的公司在 vendor-slugs.json 里本来就没有行）。
 *
 * v3.0 A1 补了一处**假绿**：原实现遇到 vendorSlugs 读不到东西（文件缺失 / 损坏 /
 * 传进来一个空对象）时，两边**一个都不比**，于是"一致性检查"永远通过。缺文件不是通过 ——
 * 现在直接报红（交叉断言没有输入就等于没做，而没做过的检查不许算绿）。
 */
function validateSlugAgreement(table, vendorSlugs) {
  const problems = [];
  const slugs = vendorSlugs && typeof vendorSlugs === 'object' && !Array.isArray(vendorSlugs) ? vendorSlugs : {};
  if (!Object.keys(slugs).length) {
    return ['vendor-slugs.json 里没有任何厂商 slug —— 与 providers.json 的交叉一致性断言没有输入，会假绿（缺文件/坏文件不是通过）'];
  }
  for (const [key, entry] of Object.entries(table || {})) {
    const name = String((entry && entry.name) || '');
    if (!name || !Object.prototype.hasOwnProperty.call(slugs, name)) continue;
    const mine = String((entry && entry.slug) || '');
    const theirs = String(slugs[name] || '');
    if (mine !== theirs) {
      problems.push(`providers.json 的 ${key}（显示名「${name}」）slug 是「${mine}」，但 vendor-slugs.json 里同一个显示名登记的是「${theirs}」—— 同一家公司不能有两个 slug`);
    }
  }
  return problems;
}

/**
 * 与 deals 侧厂商键（A 空间）的交叉一致性（硬断言 ②）。
 *
 * v3.0 A1 新增。它对每个非 null 的 `vendorKey` 要求：
 *   从 A 空间（`index.html` RENDER-CORE 的 `VENDOR_RULES`，经 `vendorKeyNames()` 取出）
 *   按**精确相等**取回的显示名，必须逐字等于本条的 `name`。
 *
 * 这条正是把「同一家公司两个键」那一类裂缝变红的牙：`vendorKey` 写错一个键
 * （例如把月之暗面写成 logo 资产键 `moonshotai`）时，A 空间根本没有那个键，
 * 或者取回来的名字不是「月之暗面」——两种都在这里报红。
 *
 * 另外顺手钉住 A 空间自己的裂缝：同一个键挂着两个不同显示名（重复键）。
 *
 * @param {object} table providers.json（已去掉 `_` 开头的元信息键）
 * @param {Array<{key:string,name:string}>|Array<Array>} vendorKeys A 空间的键/名表
 * @returns {string[]} 问题列表（空 = 通过）
 */
function validateVendorKeyAgreement(table, vendorKeys) {
  const pairs = vendorKeyPairs(vendorKeys);
  if (!pairs.length) {
    return ['A 空间（index.html RENDER-CORE 的 vendorKeyNames()）没有取到任何厂商键 —— 交叉一致性断言没有输入，会假绿（取不到 A 空间不是通过）'];
  }
  const problems = [];

  // ① A 空间自身：同一个键不许挂两个显示名
  const byKey = new Map();
  for (const pair of pairs) {
    if (!pair.key) continue;
    if (!byKey.has(pair.key)) byKey.set(pair.key, pair.name);
    else if (byKey.get(pair.key) !== pair.name) {
      problems.push(`VENDOR_RULES 里键「${pair.key}」对应两个显示名（「${byKey.get(pair.key)}」与「${pair.name}」）—— A 空间自己就分裂了`);
    }
  }

  // ② 每个非 null vendorKey 必须能在 A 空间取回同名显示名
  for (const [key, entry] of Object.entries(table || {})) {
    const vendorKey = vendorKeyOf(key, table);
    if (vendorKey === null) continue; // provider-only 公司：在 A 空间没有身份，显式写 null，无约束
    const name = String((entry && entry.name) || '');
    const fromA = vendorDisplayNameFrom(pairs, vendorKey);
    if (fromA === null) {
      problems.push(`providers.json 的 ${key}: ${VENDOR_KEY_FIELD}「${vendorKey}」在 VENDOR_RULES 里不存在（A 空间没有这个厂商键）`);
      continue;
    }
    if (fromA !== name) {
      problems.push(`providers.json 的 ${key}: ${VENDOR_KEY_FIELD}「${vendorKey}」在 VENDOR_RULES 里的显示名是「${fromA}」，而这里的 name 是「${name}」—— 同一家公司在两套身份空间里名字不同`);
    }
  }
  return problems;
}

/**
 * 交叉一致性硬断言 ③：**同一条真实 vendor 串，两套空间必须归到同一家**。
 *
 * v3.0 A1 补（队长裁决后把 `_aliases_v3` 的准入判据常驻化）。
 * 判据：对 deals.json 里真实出现过的每一条 vendor 原始串，
 *   · 若 A 空间（`VENDOR_RULES`）把它归到某个厂商键 X（`aKeyOf(raw)` ∈ `vendorKeys`），
 *   · 且 B 空间（本表）能把它解析成 provider Y（`resolveProvider`），
 *   则 **Y 的 `vendorKey` 必须正好等于 X**。
 * 没被 A 空间命中的串（`aKeyOf` 返回原名/空）不构成约束；B 空间没登记的串也不构成约束
 * （"没登记"是如实缺失，由 `resolveProvider === null` 那条断言管）。
 *
 * 这条挡的是"往 aliases 里塞一条看起来像的串"：只要 A 空间把它归到别家，这里就红。
 * A 空间的键/名解析**由调用方注入** `aKeyOf`（保持本模块不 require index.html，
 * 也就能被自测零依赖地驱动）——但调用方必须传"真 A 空间的键"，不能传原始串。
 *
 * @param {object} table providers.json（已去掉 `_` 开头的元信息键）
 * @param {Array<{key:string,name:string}>|Array<Array>} vendorKeys A 空间的键/名表
 * @param {string[]} rawVendors 真实出现过的 vendor 原始串（可含重复；调用方去重更省）
 * @param {(raw:string)=>string|null} aKeyOf 原始串 → A 空间键（命中不了返回 null）
 * @returns {string[]} 问题列表（空 = 通过）
 */
function validateVendorSpaceAgreement(table, vendorKeys, rawVendors, aKeyOf) {
  const problems = [];
  const pairs = vendorKeyPairs(vendorKeys);
  if (!pairs.length) {
    return ['A 空间（vendorKeyNames()）没有取到任何厂商键 —— 两套空间的归属比对没有输入，会假绿'];
  }
  if (typeof aKeyOf !== 'function') {
    return ['两套空间的归属比对缺少 A 空间取值器（aKeyOf）—— 没有取值器这条检查等于没做'];
  }
  const aKeys = new Set(pairs.map(pair => pair.key).filter(Boolean));
  const rawList = Array.isArray(rawVendors) ? [...new Set(rawVendors.map(raw => String(raw === null || raw === undefined ? '' : raw)))] : [];
  if (!rawList.filter(Boolean).length) {
    return ['deals 侧没有取到任何 vendor 原始串 —— 两套空间的归属比对没有输入，会假绿'];
  }
  for (const raw of rawList) {
    if (!raw) continue;
    const aKey = aKeyOf(raw);
    if (!aKey || !aKeys.has(aKey)) continue; // A 空间没这条规则：不构成约束
    const hit = resolveProvider(raw, table);
    if (!hit) continue; // B 空间没登记：如实缺失（由"未登记返回 null"那条管）
    const declared = vendorKeyOf(hit.key, table);
    if (declared !== aKey) {
      problems.push(`deals 的 vendor 串「${raw}」被 A 空间归到「${aKey}」，却在 providers.json 里解析成「${hit.key}」（vendorKey=${declared === null ? 'null' : `「${declared}」`}）—— 同一家公司在两套身份空间里归属不同`);
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
  VENDOR_KEY_FIELD,
  withoutMeta,
  normalizeProviderName,
  load,
  byAliasOf,
  resolveProvider,
  providerNameOf,
  providerSlugOf,
  vendorKeyOf,
  vendorKeyPairs,
  vendorDisplayNameFrom,
  validateProviderTable,
  validateSlugAgreement,
  validateVendorKeyAgreement,
  validateVendorSpaceAgreement,
  loadVendorSlugs,
  suggestProviderSlug
};
