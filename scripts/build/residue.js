'use strict';
/**
 * 产物文件枚举与「删掉不许回流 / 扫描面不许收缩」扫描器（secondary-page-residue-v2），
 * 从 scripts/tools/build-local.js 拆出，build-local.js 原样 re-export 全部符号以保持兼容。
 */
const fs = require('fs');
const path = require('path');
const publishedAssets = require('../lib/published-assets');

const ROOT = path.join(__dirname, '..', '..');
const NON_PAGE_HTML_FILES = [...publishedAssets.NON_PAGE_HTML_PATHS];
function showOut(dir) {
  return `${path.relative(ROOT, dir) || '.'}/`;
}

/**
 * 产物里全部文件的相对路径（POSIX 形式）。
 *
 * §10.7 的方向 2 要的是"磁盘上真的有什么"，所以**不读任何清单**：目录里出现的每个文件都算，
 * 由 `dataDocs.assertArtifactCoverage()` 去问"它被哪个注册表认领"。
 */
function listArtifactFiles(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const nextAbs = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(nextAbs, nextRel);
      else out.push(nextRel);
    }
  };
  walk(dir, '');
  return out.sort();
}

/* ------------------------------------------------------------------ */
/* 新扫描面（secondary-page-residue-v2）：删掉不许回流 + 扫描面不许收缩   */
/* ------------------------------------------------------------------ */

/**
 * ## 这一段解决什么问题
 *
 * 上一轮（residue-v1）把「删掉不许回流」做成了三颗牙：首屏说明扫描（intro 区 `.snote` = 0）、
 * 题注形状牙（只允许 `共 N 条。` / `共 N 个入口。`）、以及 §22c 的几何 / 同轴判据。
 * 它们的共同点是**只守一个容器的形状**：`.snote` 里的说明必须为空、`<caption>` 必须匹配两种形状。
 * 于是「把删掉的那句话搬到**另一个容器**里」是一条静默旁路 —— 形状牙看不见它，
 * 因为那句话既不在 `.snote` 里，也不在 `<caption>` 里。
 *
 * 本轮（residue-v2）把扫描面扩到 8 类小字容器（`.dsrc-note` / `.ddesc` / `.fdesc` / `.chgnote` /
 * `.pchnote` / `.pftdesc` / `.chgmeta` / `.hint`，逐条裁定见
 * `research/secondary-page-residue-v2-census.md`），并新增**两段产物扫描**：
 *
 *   ⚠️ **合并后退役一类（现役 7 类）**：`/feeds/` 订阅中心被「去数据暴露」那一轮**整族下架**
 *   （连同 25 份 Feed 与 `/docs/data/`），而 `.fdesc` **只存在于那一族**（每份 Feed 一行说明）
 *   ⇒ 它的地板 `18` 永远无法满足、**构建会被永久卡死**。故**有记录地退役**它
 *   （登记表 `scripts/data/residue-guard.json` 的 `_retiredFloors`），**不是**把地板改成 0 ——
 *   后者正是 `RESIDUE_MIN_FLOOR_RATIO_HARD` 与 `_floorSelfGuard` 要挡的动作。
 *   退役必须**两处同步**（本处 `RESIDUE_CONTAINER_CLASSES` 与登记表的 `containerFloors`），
 *   否则下面的 `tabulated !== declared` 一致性检查会红 —— 那条检查本身就是防「静默缩表」的。
 *
 *   ⚠️ **第二次退役：`.chgnote`（2026-10-16，现役 6 类）** —— 与 `.fdesc` **不是同一类问题**，
 *   别把两次退役的理由混起来读。`.chgnote` 的容器还在、渲染器一行没动，红的是**条数**：
 *   它数的是 `/changes/` 上「创建 / 重新出现」事件行的生命周期说明行，而那个窗口的基准日是
 *   `deals.json` 的 `updatedAt`（数据日）——**每天跟着往前滚**。数据日前进一天，「最近 7 天」里
 *   就有创建事件滚出去：实测同一份 `deal-history.json`、只把数据日从 10-14 推到 10-16，
 *   条数从 **16 掉到 1**，而阈值型下限 14 的 25% 余量吸收不了这种正常的窗口轮换 ⇒
 *   采集链每轮红在「产物自检」，`Commit and push` 被 skip，数据两天没能入库。
 *   阈值型下限的前提是「**数据量静态快照**」（登记表 `_why` 里那条边界自己写明了），
 *   对 `.chgnote` 不成立 ⇒ 它换成**关系式**（见下面 `relationReadings` 的 `chgnote` 那条：
 *   `chgnote ≥ /changes/ 上 created/restored 事件行数`）。判据**更紧**了，不是放宽：
 *   原来只在 16→14 以下才红，现在每一行事件都必须有它自己的说明行，一行都不许少。
 *
 *   ① **删掉不许回流** —— 本轮与上一轮**被删掉的每一段文案**（登记在
 *      `scripts/data/residue-guard.json` 的 `deletedCopy`），在**整篇产物**里
 *      （HTML 剥离 `<script>` / `<style>` / HTML 注释之后）出现次数必须为 **0**。
 *      它不看容器、不看类名、不看页面结构 —— 只要那段字面重新出现在读者的渲染路径上就红。
 *   ② **扫描面不许收缩** —— 6 类容器（原 8 类，见上方两条退役说明）在产物里的**存在性下限**
 *      （同一份登记的 `containerFloors`）。`.chgnote` 不在下限表里，它由下面的关系式守。
 *      ① 的判据形态是「这些字面都不出现」，而「把承重容器整族删掉 / 改名」会让**两件事同时发生**：
 *      容器没了、① 也不再命中它 —— ① 自己**证不了**扫描面还在。下限就是补这一刀的。
 *
 * ## 判据边界（不许把它说成比实际更强的东西）
 *
 *   · ① 是**字面**级：换一个说法（同义改写）它照不到。这是刻意的 —— 「同义改写」没有机器判据
 *     （语义等价不可判定），登记式字面是这条纪律唯一能落地的形态。所以每条登记都带两个面：
 *     `literal` = census 的 `exactSubstring`（含源码写法，挡「整行粘回源码」），
 *     `visible` = 人工核定的**渲染面字面**（挡「把同一句话重新渲染出来」）。
 *   · ① **跑三遍**（t10 / F3）：原样字面（现有）、**归一化后比对**（标签 / 实体 / 零宽 / 空白 /
 *     全角 / 大小写 / 标点）、以及**只对 `.json` / `.ndjson` 产物**额外做一遍 `\uXXXX` 解码后比对。
 *     三遍**并行存在**，缺一不可：原样那一遍挡「整行粘回」，归一化那一遍挡「等价的写法」，
 *     JSON 那一遍挡「同一句话在产物 JSON 里被 `\uXXXX` 转义」。⚠️ `\uXXXX` 解码**只对 JSON 产物**
 *     —— 把内联脚本里真实存在的转义串也算进来会造出误报。
 *   · 扫描前**剥离 script / style / HTML 注释**：注释里出现的字面不算 —— 源码里到处是
 *     「这里删了什么」的台账注释，那是证据不是产物。代价如实报出来：只在注释 / 脚本里的命中
 *     会**单独报一个数**（`commentOnly`），但它不进判据；要判的文字必须真能到读者眼前。
 *     ⚠️ **已知边界（t6 F2）**：整段剥离 `<script>` 意味着**运行期由 JS 渲染出来的文案不在射程内**。
 *     这一面由真浏览器读数覆盖（`research/_raw/secondary-page-residue-v2/mutation/browser-*.json`：
 *     `innerText` / `textContent` / 剥脚本序列化 / **不剥脚本**的整份 DOM 四个面），**不是**本扫描。
 *     ⚠️ 另一条已知边界（t6 F4）：UTF-16LE + BOM 的产物页按 UTF-8 读会读不出内容 ⇒ 扫不到。
 *   · **没有豁免名单**（t10 / F1 **删掉的机制**，理由写在下面对应位置）：
 *     上一版允许「共享页脚自己含的被删字面」在每一页的 `<footer>` 里出现 —— 取值面（产物 index.html
 *     的 SHARED 页脚元素）与作用域（每页 `<footer>`）**同源** ⇒ **白名单自证**：
 *     把被删文案写进 SHARED 页脚，它就同时把自己写进了白名单，整条门禁链照样绿。
 *     实测那种写法的产物里该句出现 186 次 / 186 页而构建 exit 0，且该机制的**基线受益者 0 条**
 *     （页脚保留句「最终以官方页面为准。」与登记字面不是同一串）⇒ 删机制、不留通路。
 *     原来想挡的那件事改成**正面断言**：见下面 `footerProblems`（页脚该有的一句不少、
 *     不该有的一句不多）。
 */
const RESIDUE_GUARD_FILE = path.join(ROOT, 'scripts', 'data', 'residue-guard.json');
/**
 * 登记表自身的**反空洞下限**：可判字面数 < 它即红。
 *
 * 为什么要有它：`deletedCopy` 是**数据文件**，删条目是静默的 —— 而「删掉登记」与「让判据失效」
 * 是同一个动作的两半：只守产物、不守登记表，下一个人只要连同登记一起删，① 就跟着静默。
 * 30 = 当前实测 32 条向下留 2 条余量；改这个数必须是一次**显式**动作 —— 门槛写在判据旁边
 * （不是写进被判的数据里），与本仓 `MIN_PRERENDERED_CARDS = 45` 是同一条纪律。
 */
const RESIDUE_MIN_ENTRIES = 30;
/**
 * **活字面**下限（t10 / F5）—— 数的是「去重后的非空字面条数」，不是 `deletedCopy` 的数组长度。
 *
 * 为什么必须另加这一条：上一版的反空洞只数 `entries.length`，于是「把 26/32 条的 `literal`
 * 字段清空」——条目数仍 32、活字面 44→6 —— 构建**照样绿**（t6 实测）。条目数不是判据的输入，
 * 字面才是。所以：① 逐条校验 `literal` 非空且不重复（点名 id）；② 再加这条**活字面总数下限**。
 * 40 = 当前实测 44 条向下留 4 条（约 9%）余量：低于它意味着登记面被整块清空 / 大批置空，
 * 而不是正常增删；要减必须显式改这个常量（与本文件 `MIN_PRERENDERED_CARDS = 45` 同一纪律）。
 */
const RESIDUE_MIN_LIVE_LITERALS = 40;
/**
 * 下限自守的**硬比例**（t10 / F6）：登记表声明的 `floorRatio` 不得低于它。
 *
 * 为什么（t6 实测）：上一版把 8 类 floor 全改成 1（或只把 `.dsrc-note` 123→1）⇒ 构建**exit 0**。
 * 「把门槛改 0/改 1 让牙变绿」是这条守卫最直白的旁路，所以下限本身要被守：每条
 * `floor >= measured × floorRatio`，且 `floorRatio` 自身不得低于这个硬下限。
 * 比例值写在登记表里（可评审），硬下限写在判据里（改它必须动代码）。
 */
const RESIDUE_MIN_FLOOR_RATIO_HARD = 0.5;
/** 小字容器扫描面（现役 6 类；原 8 类）—— 与 census 的扫描面逐字一致
 *  （改这里 = 改扫描面，必须**两处同步**改登记表：`containerFloors` 摘掉这一条、
 *   `_retiredFloors` 补上它并写清退役理由，否则下面的 `tabulated !== declared` 会红）。
 *
 *  两次退役，理由**不同**，不许混为一谈：
 *   · `.fdesc`（2026-10-09，随 `/feeds/` 族在「去数据暴露」那一轮下架）—— 容器从此**不可能**
 *     出现 ⇒ 地板永远无法满足。这是「容器存在性」这一类。
 *   · `.chgnote`（2026-10-16）—— 容器还在、渲染器没动，但它的条数**跟着滚动窗口走**：
 *     采集日每前进一天，「最近 7 天」里就有创建事件滚出去 ⇒ 条数可以从 16 掉到 1。
 *     阈值型下限的前提是「数据量静态快照」（见登记表 `_why` 里那条边界），对它不成立。
 *     它换成了**关系式** `chgnote ≥ created/restored 事件行数`（下面 relationReadings），
 *     判据反而更紧：原来只在 16→14 以下才红，现在每一行都必须有它自己的说明行。 */
const RESIDUE_CONTAINER_CLASSES = ['dsrc-note', 'ddesc', 'pchnote', 'pftdesc', 'chgmeta', 'hint'];
/**
 * 关系式**只用关系式守**的容器类（不在下限表里，但必须照样逐文件计数）。
 *
 * ⚠️ 为什么必须有这一条：计数表是从「扫描面声明」播种的（`new Map(…map(cls => [cls, 0]))`），
 * 而计数循环也只遍历它 —— 把 `.chgnote` 从声明里摘掉，它就会从**计数**里一起消失，
 * 于是关系式拿到 `counts.get('chgnote') ?? 0` = 0，判据静默退化成「0 ≥ 0」而构建**照样绿**。
 * 那正是这条纪律最该避免的失效形态（判据还在、但什么也不判）。
 * 下面的 `counted ⊇ declared` 断言把这个旁路钉死：谁往声明里加类却忘了加计数，构建当场红。
 */
const RESIDUE_RELATION_ONLY_CLASSES = ['chgnote'];
/** 真正**逐文件计数**的容器类 = 声明表 ∪ 关系式专用类（下面有 `counted ⊇ declared` 断言） */
const RESIDUE_COUNTED_CONTAINER_CLASSES = [...RESIDUE_CONTAINER_CLASSES, ...RESIDUE_RELATION_ONLY_CLASSES];
/** 共享页脚的锚点（唯一出处是 index.html；与 `lib/page-shell.js` 抽页脚用的是同一对标记） */
const SHARED_FOOTER_RE = /<!--SHARED:footer:START-->([\s\S]*?)<!--SHARED:footer:END-->/;
/** 每一页的页脚区间（**正面断言**的作用域：页脚保留句必须每页都在） */
const PAGE_FOOTER_RE = /<footer[\s>][\s\S]*?<\/footer>/g;
/** SHARED 区间里的**页脚元素本体**（正面断言的取值面） */
const SHARED_FOOTER_ELEMENT_RE = /<footer[\s>][\s\S]*?<\/footer>/;
/**
 * **页脚保留句**（t10 / F1 的正面断言）。
 *
 * 它是共享页脚里那句「…最终以官方页面为准。」—— 与登记里的任何被删字面**都不是同一串**
 * （登记里的是「…最终以**厂商**官方页面为准。」），所以它从来不需要豁免。
 * 断言：① 每一页的 `<footer>` 区间里这句都在（该有的一句不少）；② index.html 的 SHARED 页脚
 * 元素里**不含任何登记字面**（不该有的一句不多）。
 */
const FOOTER_KEPT_SENTENCE = '最终以官方页面为准。';
/**
 * 扫描前的剥离：`<script>` / `<style>` / HTML 注释 → **一个空格**。
 *
 * 为什么用空格而不是直接删掉：删掉会让跨边界的文字拼成一条本来不存在的字面
 * （`…为准` + `。…` 撞出一个新句子），那是这条扫描自己的假阳性来源。
 */
const residueStrip = text => String(text)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

/* ---- 归一化比对（t10 / F3）：等价写法必须照得到 ---- */

/** 零宽字符：不占宽度、肉眼不可见，是「同一句话」最省事的伪装 */
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF]/g;
/** 全角 ASCII（U+FF01–FF5E）+ 全角空格 */
const FULLWIDTH_RE = /[\uFF01-\uFF5E\u3000]/g;
/**
 * **同类**标点归一（t10/F3）：只把「同一类标点的不同写法」映到同一个字符。
 *
 * ⚠️ 这里刻意**不做**「去掉全部标点」。理由是本条判据自己的实测（t10 现场）：
 * 被删的「最终以厂商官方页面为准**。**」与保留下来的 `.dpane-src` 那句
 * 「本站只做收录与整理，最终以厂商官方页面为准**；**排序与推荐理由不出售。」只差一个标点 ——
 * 去掉标点后两者逐字相同，于是**80 张详情页**会被判成回流。跨类合并标点会把「不同的句子」
 * 说成「同一句话」，那不是收紧，是把守卫变成误报源（误报的处置历史上就是「关掉守卫」）。
 * 所以：引号 / 破折号 / 省略号 / 顿号↔逗号 / 句号类 / 分号 / 冒号 各自归一，**不跨类**。
 */
const PUNCT_CANON_MAP = new Map([
  ['「', '"'], ['」', '"'], ['『', '"'], ['』', '"'], ['“', '"'], ['”', '"'], ['‘', "'"], ['’', "'"],
  ['″', '"'], ['′', "'"],
  ['—', '-'], ['–', '-'], ['―', '-'], ['─', '-'], ['‐', '-'], ['‑', '-'], ['‒', '-'],
  ['…', '...'],
  ['、', ','], ['，', ','], ['‚', ','],
  ['。', '.'], ['．', '.'],
  ['；', ';'], ['：', ':']
]);
const PUNCT_CANON_RE = new RegExp(`[${[...PUNCT_CANON_MAP.keys()]
  .map(ch => ch.replace(/[\\\]^$.*+?()[\]{}|/-]/g, '\\$&')).join('')}]`, 'g');
/** 归一化针的**最短长度**：太短的针（例如只剩几个字的片段）在归一化这一遍里天然会误报 */
const RESIDUE_MIN_NORM_NEEDLE = 12;
/** 命名实体表（只收录会出现的那一批；未收录的命名实体原样保留，不假装解出来） */
const NAMED_ENTITIES = {
  nbsp: '\u00A0', amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'',
  hellip: '…', mdash: '—', ndash: '–', middot: '·', times: '×', ge: '≥', le: '≤',
  rarr: '→', larr: '←', copy: '©', reg: '®', shy: '\u00AD', zwnj: '\u200C', zwj: '\u200D'
};

/** 解一轮 HTML 实体（十进制 / 十六进制 / 命名三类） */
function decodeEntitiesOnce(text) {
  return String(text).replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10FFFF) return whole;
      try { return String.fromCodePoint(code); } catch (error) { return whole; }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/**
 * 实体解码到**不动点**（t6 F3 实测：`&amp;#8203;` 这类双重/多重编码真的存在）。
 *
 * 轮数有上限：解不动就停，不引入无限循环 —— 未收录的命名实体原样保留，读数里照实计。
 */
function decodeEntitiesToFixpoint(text, maxRounds = 6) {
  let out = String(text);
  for (let round = 0; round < maxRounds; round++) {
    const next = decodeEntitiesOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * 归一化：**等价变体**比对用的那一份文本（haystack 与 needle 都过这个函数）。
 *
 * 顺序与理由（每一步都被 t6 的某一类旁路逼出来）：
 *   ① 实体解码到不动点（十进制 / 十六进制 / 命名 / 双重编码）；
 *   ② **剥掉全部标签 → 空串**（不是空格）：`价格<span>与条款` 与「标签之间折行」在浏览器里
 *      是同一句话，用空格替换会留下缝，仍然匹配不上。这是本函数**最宽松**的一步，
 *      也是最可能引入误报的一步 —— 所以基线必须实测为 0 命中（读数里逐条打印）；
 *   ③ 去掉零宽字符（U+200B/200C/200D/FEFF）；
 *   ④ 全角 → 半角；⑤ 大小写归一（`toLowerCase`）；
 *   ⑥ **同类**标点归一（引号 / 破折号 / 省略号 / 顿号↔逗号 / 句号类 / 分号 / 冒号各自归一，
 *      **不跨类**：去掉全部标点会把「…为准。」与保留下来的「…为准；」说成同一句话，实测 80 页误报）；
 *   ⑦ 空白**整体去掉**（不是压缩成单空格）—— 「拆字」与「标签间折行」都会在中间留下空白，
 *      压缩成单空格照样匹配不上；
 */
function normalizeForCompare(text) {
  return decodeEntitiesToFixpoint(text)
    .replace(/<[^>]*>/g, '')
    .replace(ZERO_WIDTH_RE, '')
    .replace(FULLWIDTH_RE, ch => (ch === '\u3000' ? ' ' : String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)))
    .toLowerCase()
    .replace(PUNCT_CANON_RE, ch => PUNCT_CANON_MAP.get(ch))
    .replace(/[\s\u00A0]+/g, '');
}

/**
 * 「渲染面字面」判定：这段字面在读者的屏幕上**就是它自己**（而不是源码写法）。
 *
 * 归一化那一遍只对渲染面字面（或该条**人工核定的 `visible` 可见核**）成立 —— 理由同样是实测：
 * `c1-23` 的 literal 是源码写法（`<span class="vsrc">全部来自 <a href="${…}">…</a> 的同一份数据</span>`），
 * 归一化会剥掉标签、只剩「全部来自 API / Token 计费对比 的同一份数据」——
 * 而那串文字在 `/models/` 上是**保留下来的另一句话**的尾巴（实测 1 处误报）。
 * 源码写法字面在**原样那一遍**里照常判（整行粘回去必红）；归一化那一遍则要求该条有可见核。
 */
function isRenderedLiteral(lit) {
  return !/[<>`]/.test(lit) && !/\$\{/.test(lit);
}

/**
 * JSON 字符串里的 `\uXXXX` → 字符（**只用于 `.json` / `.ndjson` 产物的那一遍**）。
 *
 * ⚠️ 刻意**不**对 HTML 用：`dist/index.html` 的内联 RENDER-CORE 里真实存在 `\u2026` 这类转义串，
 * 把它们解出来当正文判会造成误报（上一轮的教训）。而**产物 JSON 文件里**写成 `\uXXXX` 的同一句话
 * 是另一回事 —— 它下载下来就是那句话，必须照到。
 *
 * 解到**不动点**，并且先把 `\\uXXXX`（在文件里被双重转义的那一种）折成单转义再解：
 *   · 单转义 `"\u4ef7\u683c"` = 产物里真的写着这句中文（Python `ensure_ascii=True` / 各种 escaper 都会这样落盘）；
 *   · 双转义 `"\\u4ef7\\u683c"` = 一个**逐字**写着反斜杠-u 的字符串值 —— 折一次再解。
 *   两种形态解出来都是那句话，所以两种都算回流（一次不动点循环把两件一起办了）。
 */
function decodeJsonUnicodeEscapes(text, maxRounds = 4) {
  let out = String(text);
  for (let round = 0; round < maxRounds; round++) {
    const next = out
      .replace(/\\\\u([0-9a-fA-F]{4})/g, '\\u$1')
      .replace(/\\u([0-9a-fA-F]{4})/g, (whole, hex) => String.fromCharCode(parseInt(hex, 16)));
    if (next === out) break;
    out = next;
  }
  return out;
}

/** 同一个字面的非重叠出现次数（`indexOf` 循环，不用正则 —— 字面里含正则元字符） */
function countOccurrences(hay, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = hay.indexOf(needle);
  while (i >= 0) { n += 1; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

/** 读登记表。读不到 / 解析失败 ⇒ **抛错**：宁可拦住发布，也不静默变成「没有可判的字面」 */
function loadResidueGuard() {
  if (!fs.existsSync(RESIDUE_GUARD_FILE)) {
    throw new Error(`找不到 ${path.relative(ROOT, RESIDUE_GUARD_FILE).replace(/\\/g, '/')}`
      + ' ——「删掉不许回流」的判据依赖它，拒绝继续构建（判据不许退化为空转）');
  }
  return JSON.parse(fs.readFileSync(RESIDUE_GUARD_FILE, 'utf8'));
}

/**
 * 产物扫描：① 被删文案不许回流 ② 6 类容器（原 8 类，见上方两条退役说明）的存在性下限
 * ③ 关系式：`.chgnote ≥ /changes/ 上 created/restored 事件行数`（窗口派生，基准量从产物现算）。
 *
 * 只读 `dir`，不写任何东西 —— 所以同一个函数既能被构建期（对暂存目录）调用，
 * 也能被 `scripts/tools/check-residue.js` 对着**任意一份产物副本**调用（变异演练用）。
 * 两份调用**同一份实现**：复制第二份扫描逻辑必然会分叉，而分叉的扫描器
 * 与「没有扫描器」在判据上是同一件事。
 *
 * @param {string} dir 产物目录（构建期是暂存目录）
 * @returns {{problems: string[], readings: object}}
 */
function scanResidue(dir) {
  const problems = [];
  const doc = loadResidueGuard();
  const entries = Array.isArray(doc.deletedCopy) ? doc.deletedCopy : [];
  const floors = Array.isArray(doc.containerFloors) ? doc.containerFloors : [];
  const floorRatio = Number(doc.floorRatio);

  // ---- 登记表自身的反空洞（先判它：判据的输入坏了，后面的读数都不作数） ----
  //
  // 两层：① 条目数（上一版就有）；② **活字面**（t10 / F5 新增，见 RESIDUE_MIN_LIVE_LITERALS 的注释）。
  if (entries.length < RESIDUE_MIN_ENTRIES) {
    problems.push(`被删文案登记表只有 ${entries.length} 条 < 下限 ${RESIDUE_MIN_ENTRIES}`
      + `（${path.relative(ROOT, RESIDUE_GUARD_FILE).replace(/\\/g, '/')} 的 deletedCopy）——`
      + '删条目必须同时显式改 build-local.js 的 RESIDUE_MIN_ENTRIES，不许静默缩表');
  }
  const declared = [...RESIDUE_CONTAINER_CLASSES].sort().join(',');
  const tabulated = floors.map(row => String(row && row.class)).sort().join(',');
  if (tabulated !== declared) {
    problems.push(`容器下限表与扫描面声明不一致（表里：${tabulated || '空'}；扫描面声明：${declared}）——`
      + '少一类 = 那一类的反空洞守卫消失');
  }
  // 声明表 ⊆ 计数表：**判据不许静默变成空转**。
  // 计数表是从声明表播种的，所以「摘掉一个类」会同时把它从计数里摘掉 —— 关系式于是拿到 0，
  // 判据还在、却什么也不判（`.chgnote` 那条一旦这样退化，窗口再怎么轮换都不会红）。
  // 这条断言把那个旁路钉死在构建期：往声明里加类必须同时进计数表。
  const uncounted = RESIDUE_CONTAINER_CLASSES.filter(cls => !RESIDUE_COUNTED_CONTAINER_CLASSES.includes(cls));
  if (uncounted.length) {
    problems.push(`扫描面声明里有 ${uncounted.length} 类不在逐文件计数表里：${uncounted.join('、')} ——`
      + '计数表由声明表 ∪ RESIDUE_RELATION_ONLY_CLASSES 组成（见 build-local.js），'
      + '漏掉的那一类在关系式里恒为 0，判据会静默变成「0 ≥ 0」');
  }

  // ---- 下限自守（t10 / F6）：`floor >= measured × floorRatio`，且比例自身不得低于硬下限 ----
  if (!Number.isFinite(floorRatio) || floorRatio < RESIDUE_MIN_FLOOR_RATIO_HARD) {
    problems.push(`登记表声明的下限比例 floorRatio=${JSON.stringify(doc.floorRatio)} 低于硬下限 `
      + `${RESIDUE_MIN_FLOOR_RATIO_HARD} —— 「把门槛改 0 / 改 1 让牙变绿」必须被这条挡住`
      + '（比例写在登记表里可评审，硬下限写在 build-local.js 里）');
  } else {
    for (const row of floors) {
      const measured = Number(row && row.measured);
      const floor = Number(row && row.floor);
      if (!Number.isFinite(measured) || !Number.isFinite(floor) || measured <= 0 || floor <= 0) {
        problems.push(`.${row && row.class} 的 measured / floor 不是正数`
          + `（measured=${JSON.stringify(row && row.measured)} · floor=${JSON.stringify(row && row.floor)}）——`
          + '下限表被改成非数或 0 时，这条守卫必须红而不是静默失效');
        continue;
      }
      if (floor < measured * floorRatio) {
        problems.push(`.${row.class} 的下限 ${floor} < 实测 ${measured} × ${floorRatio}`
          + ` = ${(measured * floorRatio).toFixed(1)} —— 下限被改小的方向必须红（「下限自守」，t6 F6）`);
      }
    }
  }

  // ---- 断言字面：literal + visible，按字面去重（同一条可能被多条登记引用） ----
  // t10 / F5：先把**不是活字面**的条目逐条点名（缺失 / 空串 / 纯空白 / 与另一条逐字重复）。
  const seenLiteralField = new Map();   // literal → 首个使用它的 id
  const deadLiteral = [];
  entries.forEach((entry, index) => {
    const id = String((entry && entry.id) || `#${index}`);
    const lit = entry && entry.literal;
    if (typeof lit !== 'string' || !lit.trim()) {
      deadLiteral.push(`${id}（literal 缺失 / 空串 / 纯空白）`);
      return;
    }
    if (seenLiteralField.has(lit)) {
      deadLiteral.push(`${id}（literal 与 ${seenLiteralField.get(lit)} 逐字重复）`);
      return;
    }
    seenLiteralField.set(lit, id);
  });
  if (deadLiteral.length) {
    problems.push(`登记表里有 ${deadLiteral.length} 条不是「活字面」：${deadLiteral.slice(0, 6).join('、')}`
      + `${deadLiteral.length > 6 ? ' …' : ''} —— 清空 / 重复 literal 等于把这条判据关掉`
      + '（条目数不变，只数数组长度的反空洞骗得过去；t6 F5 实测 44→6 而构建仍绿）');
  }
  const literals = new Map();   // 字面 → { lit, who: ['id/面' …] }
  for (const entry of entries) {
    for (const [surface, lit] of [['literal', entry.literal], ['visible', entry.visible]]) {
      if (typeof lit !== 'string' || !lit) continue;
      if (!literals.has(lit)) literals.set(lit, { lit, who: [] });
      literals.get(lit).who.push(`${entry.id}/${surface}`);
    }
  }
  // 活字面总数下限（去重后的非空字面）：条目数够、字面被清空的那种形态由它挡。
  if (literals.size < RESIDUE_MIN_LIVE_LITERALS) {
    problems.push(`活字面只有 ${literals.size} 条 < 下限 ${RESIDUE_MIN_LIVE_LITERALS}`
      + `（去重后的非空字面数；建表时实测 44）—— 登记面被整块清空 / 大批置空时必须红，`
      + '要减字面请显式改 build-local.js 的 RESIDUE_MIN_LIVE_LITERALS');
  }
  // 归一化针（F3 那一遍用的）：**只取渲染面字面**——
  // ① 该条有人工核定的 `visible` ⇒ 用可见核（它就是读者屏幕上的那一串）；
  // ② 否则用 `literal`，但仅当它是**渲染面字面**（不是源码写法，见 isRenderedLiteral）；
  // ③ 归一化后短于 `RESIDUE_MIN_NORM_NEEDLE` 的针丢弃（太短的针在归一化这一遍里天然误报），
  //    丢弃的每一条都点名进读数（`normSkipped`），不许静默少判。
  const normNeedles = new Map();   // 归一化针 → { norm, who: ['id/面' …] }
  const normSkipped = [];
  for (const entry of entries) {
    const id = String((entry && entry.id) || '?');
    const visible = typeof entry.visible === 'string' ? entry.visible.trim() : '';
    const literal = typeof entry.literal === 'string' ? entry.literal : '';
    const face = visible ? 'visible' : (isRenderedLiteral(literal) ? 'literal' : '');
    if (!face) {
      normSkipped.push(`${id}（源码写法且没有核定可见核 ⇒ 只有原样那一遍在判它）`);
      continue;
    }
    const source = face === 'visible' ? visible : literal;
    const norm = normalizeForCompare(source);
    if (norm.length < RESIDUE_MIN_NORM_NEEDLE) {
      normSkipped.push(`${id}（归一化后只有 ${norm.length} 字 < ${RESIDUE_MIN_NORM_NEEDLE}，太短会误报）`);
      continue;
    }
    if (!normNeedles.has(norm)) normNeedles.set(norm, { norm, who: [] });
    normNeedles.get(norm).who.push(`${id}/${face}`);
  }

  // ---- 共享页脚：**正面断言**（取代 t10/F1 删掉的豁免机制） ----
  //
  // 上一版这里是一个**豁免名单**：从 index.html 的 SHARED 页脚元素现算「哪些被删字面允许出现」，
  // 并允许它们落在每一页的 `<footer>` 里。t6 的真构建实测把它推翻了 —— 取值面与作用域同源 ⇒
  // **白名单自证**：把被删文案写回 SHARED 页脚，它就把自己写进了白名单，产物里出现 186 次 / 186 页
  // 而 `npm run build` 照样 exit 0。而该机制的基线受益者是 **0 条**（页脚保留句
  // 「最终以官方页面为准。」与登记字面不是同一串，差「厂商」二字）⇒ 只留通路、没有收益 ⇒ 删掉。
  //
  // 原来想挡的那件事（「页脚自己含这句话会不会假红」）改成两条正面断言：
  //   ① index.html 的 SHARED 页脚元素里**不含任何登记字面**（不该有的一句不多）；
  //   ② 页脚保留句 `FOOTER_KEPT_SENTENCE` 在**每一页**的 `<footer>` 区间里都在（该有的一句不少）。
  // 两条都不依赖任何名单 —— 名单没了，通路也就没了。
  const footerProblems = [];
  let sharedFooter = '';
  const indexPath = path.join(dir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    problems.push('产物里没有 index.html —— 共享页脚的正面断言（不该有的一句不多 / 该有的一句不少）无从判，拒绝静默放行');
  } else {
    const shared = fs.readFileSync(indexPath, 'utf8').match(SHARED_FOOTER_RE);
    if (!shared) {
      problems.push('产物 index.html 里找不到 `<!--SHARED:footer:START/END-->` ⇒ 共享页脚的正面断言失去锚点'
        + '（它与 `lib/page-shell.js` 抽页脚用的是同一对标记；锚点消失本身必须有人知道）');
    } else {
      const block = shared[1].match(SHARED_FOOTER_ELEMENT_RE);
      if (!block) {
        problems.push('index.html 的 `<!--SHARED:footer:START/END-->` 区间里没有 `<footer>` 元素 ⇒'
          + '「共享页脚」这件事本身没了定义，拒绝静默跳过两条正面断言');
      } else {
        sharedFooter = residueStrip(block[0]);
        const leaked = [...literals.keys()].filter(lit => sharedFooter.includes(lit));
        for (const lit of leaked) {
          footerProblems.push(`SHARED 页脚元素里出现登记字面「${lit.slice(0, 40)}」`
            + `（登记 ${literals.get(lit).who.join('、')}）—— 页脚不是被删文案的合法落点`);
        }
        if (!sharedFooter.includes(FOOTER_KEPT_SENTENCE)) {
          footerProblems.push(`SHARED 页脚元素里没有保留句「${FOOTER_KEPT_SENTENCE}」`
            + '—— 该有的一句被删掉了（这条断言是「页脚该有的一句不少」那一半）');
        }
      }
    }
  }

  // ---- 逐文件扫描 ----
  const files = listArtifactFiles(dir);
  const counts = new Map(RESIDUE_COUNTED_CONTAINER_CLASSES.map(cls => [cls, 0]));
  const hits = new Map([...literals.keys()].map(lit => [lit, {
    lit, total: 0, faces: { raw: 0 }, violations: []
  }]));
  const normHits = new Map([...normNeedles.keys()].map(norm => [norm, {
    norm, total: 0, files: [], samples: [], who: normNeedles.get(norm).who
  }]));
  // JSON 那一遍用**同一批归一化针**（只是 haystack 换成「先解 \uXXXX 再归一化」的那一份）
  const jsonHits = new Map([...normNeedles.keys()].map(norm => [norm, {
    norm, total: 0, files: [], samples: [], who: normNeedles.get(norm).who
  }]));
  let htmlPages = 0;
  let footerPages = 0;
  let footerKeptPages = 0;
  let commentOnly = 0;
  const dealPageRels = files.filter(rel => /^deal\/[^/]+\/index\.html$/.test(rel));
  for (const rel of files) {
    const raw = fs.readFileSync(path.join(dir, rel), 'utf8');
    const isHtml = /\.html?$/i.test(rel);
    // 站点归属验证文件是**非页面** HTML（见 `NON_PAGE_HTML_FILES`）：它的字节照旧参与下面三遍残留比对，
    // 但「每页恰好一个 <footer> 锚点」这类**页面形状**判据不适用于它（它本来就不是页面）。
    const isPage = isHtml && !NON_PAGE_HTML_FILES.includes(rel);
    // 非 HTML（json / xml / ndjson / txt / svg…）没有「脚本 / 样式 / HTML 注释」这回事，
    // 原样判：Feed、公开数据文件里的字面同样会到读者眼前（下载的那一份就是产物）。
    const text = isHtml ? residueStrip(raw) : raw;
    let footerRegions = [];
    if (isHtml) {
      if (isPage) {
        htmlPages += 1;
        footerRegions = [...text.matchAll(PAGE_FOOTER_RE)].map(m => [m.index, m.index + m[0].length]);
        if (footerRegions.length === 1) footerPages += 1;
        else {
          problems.push(`${rel} 的 <footer> 锚点有 ${footerRegions.length} 个（共享页脚纪律要求恰好 1 个；`
            + '「页脚保留句每页都在」这条正面断言的作用域也靠它指认）');
        }
        // 页脚保留句：每一页的页脚区间里都必须在（t10 / F1 的正面断言，不依赖任何名单）
        if (footerRegions.some(([a, b]) => text.slice(a, b).includes(FOOTER_KEPT_SENTENCE))) footerKeptPages += 1;
      }
      // 6 类声明容器 + 关系式专用类（`.chgnote`）计数：**class token 级**（不是
      // `class="dsrc-note"` 精确串）——
      // 后者照不到多 class 形状，而「换个类名就静默失去覆盖」正是本文件反复记录的那类失效。
      // t10 / F7：取值前先做**实体解码** —— `class="ddes&#99;"` 在浏览器里就是 `ddesc`，
      // 不解码就会把它算漏（t6 实测 20 处这样的改名仍能骗过阈值下限）。
      for (const m of text.matchAll(/class="([^"]*)"/g)) {
        const tokens = decodeEntitiesToFixpoint(m[1]).split(/\s+/);
        for (const cls of RESIDUE_COUNTED_CONTAINER_CLASSES) {
          if (tokens.includes(cls)) counts.set(cls, counts.get(cls) + 1);
        }
      }
    }
    // ---- 三遍比对（t10 / F3）：原样 · 归一化 · JSON `\uXXXX` ----
    // 同一个文件里同一条针只报**最先命中的那一遍**（三遍都红也只是同一件事），
    // 但三遍各自都在跑：原样那一遍挡「整行粘回」，归一化那一遍挡「等价写法」，
    // JSON 那一遍挡「在产物 JSON 里被 \uXXXX 转义」。
    // ⚠️ 归一化那一遍的针是 `normNeedles`（渲染面字面 / 核定可见核），**不是**全部 44 条：
    //    源码写法字面的归一化形式会退化成「别人家保留句的尾巴」，实测撞过一次（见 isRenderedLiteral）。
    const isJson = /\.(json|ndjson)$/i.test(rel);
    for (const [lit, row] of hits) {
      const count = countOccurrences(text, lit);
      if (!count) continue;
      row.total += count;
      row.faces.raw += count;
      row.violations.push(`${rel}（原样字面）×${count}`);
      row.samples = row.samples || [];
      if (row.samples.length < 2) {
        const at = text.indexOf(lit);
        row.samples.push(`…${text.slice(Math.max(0, at - 24), at + lit.length + 24).replace(/\s+/g, ' ')}…`);
      }
    }
    const normalizedText = normalizeForCompare(text);
    for (const [norm, row] of normHits) {
      const count = countOccurrences(normalizedText, norm);
      if (!count) continue;
      row.total += count;
      row.files.push(rel);
      row.samples = row.samples || [];
      if (row.samples.length < 2) {
        const at = normalizedText.indexOf(norm);
        row.samples.push(`…${normalizedText.slice(Math.max(0, at - 24), at + norm.length + 24)}…`);
      }
    }
    if (isJson) {
      const jsonText = normalizeForCompare(decodeJsonUnicodeEscapes(text));
      for (const [norm, row] of jsonHits) {
        const count = countOccurrences(jsonText, norm);
        if (!count) continue;
        row.total += count;
        row.files.push(rel);
        row.samples = row.samples || [];
        if (row.samples.length < 2) {
          const at = jsonText.indexOf(norm);
          row.samples.push(`…${jsonText.slice(Math.max(0, at - 24), at + norm.length + 24)}…`);
        }
      }
    }
    // 只在 script / style / 注释里的命中：**只报不判**（剥离是纪律，报出来是为了让「台账注释」
    // 与「真的回流」在读数上分得开，而不是让人以为扫描面漏了它们）
    if (isHtml) {
      for (const lit of literals.keys()) {
        const inRaw = countOccurrences(raw, lit);
        const inStripped = countOccurrences(text, lit);
        if (inRaw > inStripped) commentOnly += inRaw - inStripped;
      }
    }
  }

  // ---- 判据：① 回流（三遍各自报出来，点名登记 id 与命中面） ----
  let violatingLiterals = 0;
  for (const [, row] of hits) {
    if (!row.violations.length) continue;
    violatingLiterals += 1;
    const who = literals.get(row.lit).who.join('、');
    problems.push(`删掉的字面又回到了产物里（${row.violations.length} 个文件 · 原样 ${row.faces.raw} 处 · 登记 ${who}）：`
      + `「${row.lit.length > 46 ? `${row.lit.slice(0, 46)}…` : row.lit}」`
      + ` ⇒ ${row.violations.slice(0, 2).join('；')}${row.violations.length > 2 ? ` …（另有 ${row.violations.length - 2} 个文件）` : ''}`
      + `${row.samples && row.samples.length ? ` · 现场：${row.samples[0]}` : ''}`);
  }
  for (const [, row] of normHits) {
    if (!row.total) continue;
    violatingLiterals += 1;
    problems.push(`删掉的字面以**等价写法**回到了产物里（归一化后 ${row.total} 处 · ${row.files.length} 个文件 ·`
      + ` 登记 ${row.who.join('、')}）：归一化针「${row.norm.length > 46 ? `${row.norm.slice(0, 46)}…` : row.norm}」`
      + ` ⇒ ${row.files.slice(0, 2).join('、')}${row.files.length > 2 ? ` …（另有 ${row.files.length - 2} 个文件）` : ''}`
      + `${row.samples && row.samples.length ? ` · 现场（归一化后）：${row.samples[0]}` : ''}`);
  }
  for (const [, row] of jsonHits) {
    if (!row.total) continue;
    violatingLiterals += 1;
    problems.push(`删掉的字面在**产物 JSON 里被 \\uXXXX 转义**后回流（${row.total} 处 · ${row.files.length} 个文件 ·`
      + ` 登记 ${row.who.join('、')}）：归一化针「${row.norm.length > 46 ? `${row.norm.slice(0, 46)}…` : row.norm}」`
      + ` ⇒ ${row.files.slice(0, 2).join('、')}${row.files.length > 2 ? ` …（另有 ${row.files.length - 2} 个文件）` : ''}`);
  }
  for (const problem of footerProblems) problems.push(`共享页脚正面断言：${problem}`);

  // ---- 判据：② 扫描面不许收缩（阈值型下限 + 关系式，t10 / F7 两条并存） ----
  const floorReadings = [];
  for (const row of floors) {
    const got = counts.get(row.class) || 0;
    floorReadings.push(`.${row.class} ${got}/${row.floor}`);
    if (got < row.floor) {
      problems.push(`.${row.class} 在产物里只有 ${got} 次 < 下限 ${row.floor} ——`
        + '这一族容器可能被整族删掉 / 改名了（容器没了，逐条扫描自然也不再命中它；'
        + '实测值与取值依据见 scripts/data/residue-guard.json 的 containerFloors）');
    }
  }
  // 关系式（t6 F7）：阈值型下限的 25% 余量允许「静默消失 20 处」（实测 `.ddesc` 20 处仍 60/60 绿），
  // 关系式把余量收成 0 —— 且**不动任何现有下限**（两条并存，谁严谁生效）。
  // 基准量从**产物现算**（详情页数），所以数据收缩时它自己跟着走，不是又一张静态快照。
  //
  // v3.2（2026-10-16）：第三条关系式 `.chgnote` —— 它数的是 `/changes/` 上「创建 / 重新出现」
  // 事件行的那条生命周期说明行。它的条数**跟着滚动窗口走**（基准日是数据日 `updatedAt`，每天
  // 往前滚），阈值型下限对它不成立：实测同一份历史日志、只把数据日 10-14 → 10-16，条数 16 → 1，
  // 于是采集链每轮红在产物自检、`Commit and push` 被 skip、数据两天没能入库（run 55–58）。
  // 换成关系式之后余量同样收成 0，基准量由产物**自己**给出。
  //
  // ⚠️ 基准量的口径必须**可证**，不是「看起来差不多」：渲染器（index.html 的 `changesRowHtml`）
  // 只在 `created` / `restored` 两种分支上**无条件**产出 `.chgnote`（`endingSoon` 出 `.chgnew`、
  // `ended` 出 `.chgold`，其余事件只在 `origin === 'derived'` 时出）。所以基准量取
  // 「`created` / `restored` 两个分栏里的行数」：每一行都**保证**带一条说明行 ⇒ `≥` 成立。
  // 刻意**不**把 `changed` 分栏里的行算进来（那里的行只有一部分带说明行，混进来会假红），
  // 也刻意**不**去动渲染器补一个 `data-origin` —— 那会同时改到 `markChangesRows()` 的
  // 行标记正则（它按 `<li class="chgi" data-kind="…" data-deal-id="…">` 精确形态匹配，
  // 多一个属性就静默标不上，ItemList 对账当场红）。判据的价值在可证，不在把话说过头。
  const changesPageRel = path.join(dir, 'changes', 'index.html');
  const hasChangesPage = fs.existsSync(changesPageRel);
  const changesPageHtml = hasChangesPage ? fs.readFileSync(changesPageRel, 'utf8') : '';
  if (!hasChangesPage) {
    // `/changes/` 是「变化雷达」的**唯一**页面。它不在产物里 ⇒ `.chgnote` 的关系式失去基准量，
    // 而它的缺页本身有别的步骤在守（构建期缺页会红）—— 这里只把「判据没做」如实说出来，
    // 不让它静默退化成「要求 0 ≥ 0」。
    problems.push('关系式 .chgnote 无从判：产物里没有 changes/index.html（变化雷达的唯一页面）——'
      + '缺少基准量时这条判据会静默变成「0 ≥ 0」，必须红而不是照绿');
  }
  /** 取一个分栏的 `<section class="chgsec" id="…">…</section>` 区间（只认优惠雷达自己的分栏） */
  const changesSectionSlice = id => {
    const re = new RegExp(`<section class="chgsec" id="${id}">([\\s\\S]*?)</section>`);
    const m = changesPageHtml.match(re);
    return m ? m[1] : '';
  };
  let changesLifecycleRows = 0;
  const changesLifecycleBySection = [];
  for (const id of ['created', 'restored']) {
    const body = changesSectionSlice(id);
    const n = (body.match(/<li class="chgi"[^>]*>/g) || []).length;
    changesLifecycleBySection.push(`${id} ${n}`);
    changesLifecycleRows += n;
  }
  const relationReadings = [];
  for (const rel of [
    { cls: 'ddesc', factor: 1, op: '>=', why: '每张详情页一条来源行（`.ddesc` 就是那 17 页唯一的来源说明）', base: dealPageRels.length, baseName: '详情页数' },
    { cls: 'dsrc-note', factor: 2, op: '>=', why: '每张详情页两条说明（来源块免责句 + 变更记录说明）', base: dealPageRels.length, baseName: '详情页数' },
    { cls: 'chgnote', factor: 1, op: '>=', why: '`/changes/` 的「今日新增」与「重新出现」两个分栏里，每一行都由渲染器**无条件**产出一条生命周期说明行（`created` / `restored` 两个分支）', base: changesLifecycleRows, baseName: 'changes 生命周期事件行', baseDetail: changesLifecycleBySection.join(' + ') }
  ]) {
    const got = counts.get(rel.cls) || 0;
    const expect = rel.factor * rel.base;
    const detail = rel.baseDetail ? `${rel.base} = ${rel.baseDetail}` : String(rel.base);
    relationReadings.push(`.${rel.cls} ${got} ${rel.op} ${rel.factor}×${rel.baseName}(${detail})=${expect}`);
    if (!(got >= expect)) {
      problems.push(`关系式不成立：.${rel.cls} 在产物里 ${got} 次，但要求 ${rel.op} ${rel.factor} × ${rel.baseName}`
        + `（${rel.base}）= ${expect} —— ${rel.why}。`
        + '关系式的取用理由：它把阈值型下限的 25% 余量收成 0（数据收缩时基准量跟着产物走，不是静态快照）。'
        + (rel.cls === 'chgnote'
          ? '这一条取代了原先的阈值型下限 14（登记表 `_retiredFloors` 有退役记录）：那个数字是窗口里'
            + '恰好有一批创建事件时的快照，数据日每前进一天就会有事件滚出「最近 7 天」，它必然假红。'
          : ''));
    }
  }

  const readings = {
    dir: showOut(dir),
    entries: entries.length,
    literals: literals.size,
    deadLiteralEntries: deadLiteral.length,
    normNeedles: normNeedles.size,
    normSkipped,
    files: files.length,
    htmlPages,
    footerPages,
    footerKeptPages,
    dealPages: dealPageRels.length,
    rawHits: [...hits.values()].reduce((n, row) => n + row.total, 0),
    rawFiles: [...hits.values()].reduce((n, row) => n + row.violations.length, 0),
    normHits: [...normHits.values()].reduce((n, row) => n + row.total, 0),
    normFiles: [...normHits.values()].reduce((n, row) => n + row.files.length, 0),
    jsonHits: [...jsonHits.values()].reduce((n, row) => n + row.total, 0),
    totalHits: [...hits.values()].reduce((n, row) => n + row.total, 0)
      + [...normHits.values()].reduce((n, row) => n + row.total, 0)
      + [...jsonHits.values()].reduce((n, row) => n + row.total, 0),
    violatingLiterals,
    commentOnly,
    floors: floorReadings,
    relations: relationReadings,
    // 已移除的机制：读数里必须显式说「没有豁免面」，否则复核者会以为它还在。
    exemption: '本机制已在 t10/F1 移除（取值面与作用域同源 ⇒ 白名单自证；基线受益者 0 条）',
    runtimeBoundary: '脚本整段剥离 ⇒ 运行期 JS 渲染的文案不在本扫描射程内（t6 F2），'
      + '那一面由真浏览器四面读数覆盖：research/_raw/secondary-page-residue-v2/mutation/browser-*.json'
  };
  return { problems, readings };
}

module.exports = {
  listArtifactFiles,
  scanResidue,
  loadResidueGuard,
  countOccurrences,
  residueStrip,
  normalizeForCompare,
  decodeEntitiesToFixpoint,
  decodeJsonUnicodeEscapes,
  isRenderedLiteral,
  RESIDUE_GUARD_FILE,
  RESIDUE_MIN_ENTRIES,
  RESIDUE_MIN_LIVE_LITERALS,
  RESIDUE_MIN_FLOOR_RATIO_HARD,
  RESIDUE_MIN_NORM_NEEDLE,
  RESIDUE_CONTAINER_CLASSES,
  FOOTER_KEPT_SENTENCE,
  RESIDUE_RELATION_ONLY_CLASSES,
  RESIDUE_COUNTED_CONTAINER_CLASSES
};
