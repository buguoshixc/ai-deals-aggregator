'use strict';
/**
 * 页面级说明的构建期意图清单（notes-manifest-v1），从 scripts/tools/build-local.js 拆出。
 */
const fs = require('fs');
const path = require('path');

function createNotesManifest({ OUT, NOTES_MANIFEST_FILE, NOTES_MANIFEST_PATH, listPageFiles }) {
/* ------------------------------------------------------------------ */
/* 页面级说明的**构建期意图清单**（notes-manifest-v1）                    */
/* ------------------------------------------------------------------ */

/**
 * ## 这一节解决什么问题
 *
 * 长期挂在 `NEXT-STEPS.md` 里 `secondary-page-layout-unification` 一节「剩余事项」第 4 条的那条 P1 是：
 * **判据只认 `.snote` 这个类名**
 * （把类名换掉、或者把说明换进别的容器，门禁就再也看不见它了）。今天所有与说明有关的
 * 断言（`verify-site.js` §22c 的窄柱 / 字迹 / 同轴 / 未渲染、构建期的 Markdown 记号扫描、
 * 「每页冻结串恰好 1 次」）都是**只看渲染结果**的：它们回答的是「已经叫 `.snote` 的那些
 * 元素长得对不对」，从来没有人问过**「这一页本来打算输出几条说明、每条在哪一类容器里」**。
 * 于是「故意改个名」是一次静默的失效，而不是一次会红的决定。
 *
 * 修法是**跨源对账**，两个来源互相独立：
 *
 *   ① **意图源（本文件）** —— 在**内容构造点**登记：这一页打算输出几条说明、每条的槽位
 *      （`snote` / `pnote` / `vsnote`）与**完整 class token 集合**、以及它是哪一处构造分支
 *      产出的。登记与输出是同一次调用（`noteDeclare()` 返回它收到的 HTML，
 *      「先登记、后输出」），所以**登记不出来的说明也输出不出去**。
 *      ⚠️ 意图源**不读产物、也不拿正则去扫 HTML**：它只由代码里的构造分支说出口。
 *   ② **渲染源（产物 / DOM）** —— 构建期自检回读**刚生成的 HTML**、§22c 回读**真浏览器里的
 *      DOM**，按同一把尺子（`<main>` 内、class token 级、按 token 集合分组计数）数出来。
 *
 * 两侧相等才放行；不等就点名 `route#index` 并**同时给出两侧读数**。改名（`snote` → 别的）、
 * 换容器（`<p>` → `<div>`、或换成一个不含该 token 的 class）、漏渲染，三种都会让渲染侧
 * 比意图侧少一条 ⇒ 构建期或 §22c 至少一处红。
 *
 * ## 为什么清单落成 `_notes.ndjson` 而不是 `_notes.json`
 *
 * 当年的判据是：产物里**每一个 `*.json` 都必须被某个注册表认领**（那条 fail-closed 判据原在
 * `lib/data-docs.js` 的 §10.7 方向 2，**随数据出口子系统整体下架**；今天对应的纪律由
 * `lib/published-assets.js` 承重：产物里不许有数据文件）。而把一个内部清单塞进当年的
 * `PUBLIC_DATASETS` 会让它出现在 `/docs/data/` 的公开数据集索引里（那是产品面变化，
 * 不只是多一个文件）—— 这两处现在都已下架，但命名沿用了下来。
 * ⚠️ 今天更直接的理由是：**这份清单根本不在产物目录里**（见上面的 `NOTES_MANIFEST_PATH`），
 * 所以它连"产物里的文件"都不是。用 **NDJSON**（一行一个 JSON 对象：首行头部，其余每行一页）
 * 是为了机器可读、可 `grep`、可逐字节重建。
 *
 * ## 覆盖边界（**写在代码里，不写在别处**）
 *
 * 意图源只能登记**它自己代码路径上**的说明构造点。全站 `<main>` 里的说明容器实测
 * （2026-10-08，`dist` 186 页）分三类：`.snote` 271 条 · `.pnote` 159 条 · `.vsnote` 150 条。
 * **这三类现在全部逐条登记**（`notes-manifest-residual-v1`，2026-10-08）：原先落在范围之外的
 * 构造点已经接管 —— `lib/models-page.js` / `lib/plans-page.js` / `lib/api-plans-page.js` /
 * `lib/plans-hub-page.js` / `lib/archive.js` / `index.html` 的 RENDER-CORE
 * 区块（`changesPageHtml`）都按 route 收到登记入口 `ctx.note`，在**产出那一段 HTML 的同一次调用**里
 * 登记（与 `lib/vendor-page.js` 同形）。⚠️ 当年这份名单里还有一个 `lib/data-docs.js` ——
 * 它随 `/docs/data/` 数据文档页在「去数据暴露」里整体下架，**已不在列**（那个模块已删除）。**台账（`untracked`）因此从 58 页清到 0 页** ——
 * `noteUntracked()` 这个机制保留（下一个「构造点确实不在本文件路径上」的页面族还得能用它如实登记），
 * 但当前**没有任何调用点**：整份清单每一页都是 `complete`，构建期与 §22c 都按「逐字相等」判。
 *
 * 文件名常量 `NOTES_MANIFEST_FILE` 与它的落盘位置 `NOTES_MANIFEST_PATH` 放在一起（产物清单那一段，
 * 见 `PUBLIC_FILES` / `GENERATED_FILES`）。⚠️ 它**不在** `GENERATED_FILES` 里 —— 清单不进产物目录。
 */

/**
 * 说明槽位 —— 全站只有这三种容器 token（`<main>` 内、class token 级匹配）。
 *
 * ⚠️ token 必须**互为非前缀**且不与站点别处的 class 撞名：`snote` / `vsnote` 之间靠
 * **token 边界**区分（`vendor-page.js` 里那条历史教训：`class="snote aliasnote"` 用
 * `class="snote"` 精确串匹配时一条都照不到，`.vsnote` 反过来又会被 `\bsnote\b` 放过）。
 * 这里一律按**分词后的 token 集合**比，不做子串匹配。
 */
const NOTE_SLOTS = [
  { id: 'main-snote', token: 'snote', description: '页面级说明（§22c 逐条几何判据的对象）' },
  { id: 'main-pnote', token: 'pnote', description: '底部折叠说明（<details class="page-notes"> 内）' },
  { id: 'main-vsnote', token: 'vsnote', description: '厂商资料页的区段说明' }
];

/** 意图登记表：route → { pageKind, notes[], floors{}, untracked }。构建期一次性，持在内存里。 */
const noteIntent = new Map();

/** 取（或建）某一页的意图登记项。路由用站根相对形式，**首页是空串**（与全站其它登记口径一致）。 */
function notePageEntry(route) {
  if (typeof route !== 'string') {
    throw new Error(`说明登记：route 必须是页面路由字符串（得到 ${JSON.stringify(route)}）`);
  }
  if (!noteIntent.has(route)) {
    noteIntent.set(route, { route, pageKind: null, notes: [], floors: {}, untracked: null });
  }
  return noteIntent.get(route);
}

/** 归一化 class token 串 → 排序后的 token 数组（两侧对账用的「签名」口径） */
function noteSignatureOf(classes) {
  return String(classes || '').trim().split(/\s+/).filter(Boolean).sort();
}

/**
 * **登记一条页面级说明，并原样返回它的 HTML**。
 *
 * 这是「先登记、后输出」的唯一入口：模板再也不能「直接把一段 `<p class="snote">` 写进
 * 页面」—— 想输出就得先说出（槽位 / 完整 class token / 哪一处构造分支）。
 *
 * @param {string} route 该页的站根相对路由（首页是 `''`）
 * @param {{kind:string, slot:string, classes:string, declaredBy:string}} decl
 *        `kind` 是**类型标签**（给读者看的分类：`alias-note` / `page-note` / `noscript-hint` / …）；
 *        `classes` 是**完整** class token 串（两侧对账按排序后的集合比）；
 *        `declaredBy` 是构造点位置（`文件:函数`），出错时点名用。
 * @param {string} html 这一段说明的 HTML（原样返回，保证「登记与输出是同一次调用」）
 */
function noteDeclare(route, decl, html) {
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error(`说明登记：${route} 的 ${decl.kind} 没有可输出的 HTML —— 「先登记、后输出」不接受空说明`);
  }
  noteRegister(route, decl);
  return html;
}

/**
 * **组装点登记（pin）**：这一条说明的构造点在**本轮范围之外**的模块里，由组装点按它的
 * 容器签名把意图说出来（并写明它在哪个模块的哪一行输出）。
 *
 * 它与 `noteDeclare()` 的区别是**可验证的方向相反**：`noteDeclare` 自己产出 HTML，
 * `notePinned` 只能被产物/ DOM 验证（登记说「这一页应当恰好有 1 条这个签名的说明」，
 * 谁去渲染由那个模块负责）。为什么仍然要登记：改名 / 换容器 / 不再输出，三种都会让
 * 渲染侧比意图侧少一条 ⇒ 构建期或 §22c 至少一处红。清单里它带 `pinned: true` 与
 * `source`（下一轮把构造点接管过来时，这两项就是待删的「已接管」标记）。
 */
function notePinned(route, decl, pin) {
  if (!pin || !pin.source || !pin.reason) {
    throw new Error(`说明登记：${route} 的 ${decl.kind} 是组装点登记，必须写明 source 与 reason`);
  }
  noteRegister(route, Object.assign({}, decl, { pinned: pin.source, pinnedReason: pin.reason }));
}

/** `noteDeclare` / `notePinned` 共用的校验与入表 */
function noteRegister(route, decl) {
  const page = notePageEntry(route);
  const slot = NOTE_SLOTS.find(item => item.id === decl.slot);
  if (!slot) {
    throw new Error(`说明登记：${route} 的 ${decl.kind} 用了未登记的槽位「${decl.slot}」` +
      `（合法值：${NOTE_SLOTS.map(item => item.id).join(' / ')}）`);
  }
  const tokens = noteSignatureOf(decl.classes);
  if (!tokens.includes(slot.token)) {
    throw new Error(`说明登记：${route} 的 ${decl.kind} 声明 class="${decl.classes}"，`
      + `但槽位 ${slot.id} 要求 token「${slot.token}」在其中 —— 声明与容器不符，登记没有意义`);
  }
  if (!decl.declaredBy) {
    throw new Error(`说明登记：${route} 的 ${decl.kind} 没有 declaredBy（说明是哪一处构造点产出的）`);
  }
  page.notes.push({
    kind: decl.kind, slot: slot.id, signature: tokens.join(' '), declaredBy: decl.declaredBy,
    pinned: decl.pinned || null, pinnedReason: decl.pinnedReason || null
  });
}

/** 给某一页登记「这一页属于哪一族」与**结构下限**（页面族不变式，与具体哪几条说明无关）。 */
function notePage(route, spec = {}) {
  const page = notePageEntry(route);
  if (spec.kind) page.pageKind = spec.kind;
  if (spec.floors) {
    for (const [slotId, floor] of Object.entries(spec.floors)) {
      if (!NOTE_SLOTS.some(item => item.id === slotId)) {
        throw new Error(`说明登记：${route} 的 floors 里有未登记的槽位「${slotId}」`);
      }
      page.floors[slotId] = floor;
    }
  }
  return page;
}

/**
 * **台账**：这一页的 `.snote` 由**范围之外**的模块构造（本清单不逐条登记它们）。
 *
 * 台账必须写明归属模块与该模块里**无条件**产出那一条说明的位置 —— 它是「下一轮要接管
 * 哪些构造点」的可执行清单，也是 `minNotes` 这条下限的依据。台账不是豁免：构建期与
 * §22c 都要求这些页面**仍然至少有 `minNotes` 条 `.snote`**（整族改名 / 整族被删 ⇒ 红）。
 *
 * ⚠️ **当前 0 个调用点**（`notes-manifest-residual-v1`，2026-10-08）：原先登记的 58 页 / 8 族
 * 全部在构造点接管（见本节开头的覆盖边界），台账已清零。机制保留 —— 下一个构造点确实不在
 * 本文件代码路径上的页面族，仍然可以用它如实登记（而不是悄悄少登记几条）。
 */
function noteUntracked(route, spec) {
  const page = notePageEntry(route);
  if (page.untracked) {
    throw new Error(`说明登记：${route} 重复登记台账（先登记的是 ${page.untracked.family}）`);
  }
  const minNotes = spec.minNotes === undefined ? 1 : spec.minNotes;
  if (!spec.family || !spec.owner || !spec.structural) {
    throw new Error(`说明登记：${route} 的台账缺 family / owner / structural —— 台账必须能指出「下一轮接管哪一处」`);
  }
  page.untracked = { family: spec.family, owner: spec.owner, structural: spec.structural, minNotes };
  return page;
}

/** 某一页 → 产物内路径（首页是 `index.html`，其余是 `<route>index.html`） */
function noteArtifactPathOf(route) {
  return route ? `${route}index.html` : 'index.html';
}

/**
 * 把某一页绑成一个「先登记、后输出」的登记入口，交给**别的模块**在它自己的构造点调用。
 *
 * 为什么需要它：厂商资料页的六节说明由 `lib/vendor-page.js` 构造。清单的意图必须从
 * **构造点**说出口，而不是由调用方猜（猜出来的数字就是回扫产物）。所以登记入口连同 route
 * 一起注入（`ctx.note`），模块在它构造那一条说明的同一次调用里登记 —— 登记与输出仍然是
 * 同一次调用，只是这次跨了一层模块边界。
 */
function noteDeclarerFor(route) {
  return (decl, html) => noteDeclare(route, decl, html);
}

/**
 * 把 `<main>` 里的说明容器按**槽位 × class token 集合**分组计数。
 *
 * 只用刚生成的 HTML（构建期自检）——**不是**清单的来源，是清单的对照面。
 * 扫描面刻意与浏览器侧的同名实现（`verify-site.js` 的 `wideMeasure`）保持同一口径：
 * 去注释 / 去 `<script>` / 去 `<style>`、`class` 属性分词、按排序后的 token 集合分组。
 * 检测是「token 级」（含槽位 token 即算），判定是「集合级」（签名必须逐字相等）——
 * 前者决定能不能看见，后者才是判据，改名只会让后者对不上。
 */
function noteSignaturesInMain(html) {
  const out = new Map(NOTE_SLOTS.map(slot => [slot.id, new Map()]));
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/);
  if (!mainMatch) return out;
  const body = mainMatch[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const tagRe = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;
  let match;
  while ((match = tagRe.exec(body))) {
    const attr = (match[2].match(/(?:^|\s)class\s*=\s*"([^"]*)"/i) || [])[1];
    if (!attr) continue;
    const tokens = noteSignatureOf(attr);
    const slot = NOTE_SLOTS.find(item => tokens.includes(item.token));
    if (!slot) continue;
    const signature = tokens.join(' ');
    const bucket = out.get(slot.id);
    bucket.set(signature, (bucket.get(signature) || 0) + 1);
  }
  return out;
}

/** 清单文本（NDJSON；页按 route 排序 ⇒ 与登记顺序无关，连续两次构建逐字节一致） */
function notesManifestText() {
  const routes = [...noteIntent.keys()].sort();
  const declaredBySlot = new Map(NOTE_SLOTS.map(slot => [slot.id, 0]));
  for (const page of noteIntent.values()) {
    for (const note of page.notes) declaredBySlot.set(note.slot, declaredBySlot.get(note.slot) + 1);
  }
  const header = {
    kind: 'header',
    schemaVersion: 1,
    generator: 'scripts/tools/build-local.js',
    slots: NOTE_SLOTS.map(slot => ({ id: slot.id, token: slot.token, description: slot.description })),
    totals: {
      pages: routes.length,
      declaredNotes: [...declaredBySlot.values()].reduce((sum, n) => sum + n, 0),
      declaredBySlot: Object.fromEntries(NOTE_SLOTS.map(slot => [slot.id, declaredBySlot.get(slot.id)])),
      untrackedPages: [...noteIntent.values()].filter(page => page.untracked).length
    }
  };
  const lines = [JSON.stringify(header)];
  for (const route of routes) {
    const page = noteIntent.get(route);
    const declared = {};
    for (const slot of NOTE_SLOTS) declared[slot.id] = page.notes.filter(note => note.slot === slot.id).length;
    lines.push(JSON.stringify({
      kind: 'page',
      route: route,
      pageKind: page.pageKind,
      // complete = 「本页 `<main>` 里的 `.snote` 全在清单里」 ⇒ 构建期与 §22c 都要求**逐字相等**
      complete: !page.untracked,
      declared: declared,
      floors: page.floors,
      untracked: page.untracked,
      notes: page.notes.map((note, index) => Object.assign({ index }, note))
    }));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * 构建期自检：清单 ↔ **刚生成的 HTML** 逐页对账。
 *
 * 判据四条（与 §22c 的 ⑨ 同一套，两侧口径必须一致）：
 *   ① 路由集双向相等：产物里每个 HTML 都登记过意图，反之亦然（漏登记的页面族 = 红）；
 *   ② 逐页逐槽位：清单声明的每个「token 集合 × 条数」都必须与 HTML 里数出来的相等，
 *      反向也成立（多出来的说明 = 有人绕过了登记 ⇒ 红）；不等时点名 `route#index` 并给两侧读数；
 *   ③ 结构下限：页面族不变式（如别名页恰好 1 条页面级说明）—— 它防的是「登记与模板一起被删」；
 *   ④ 台账下限：`untracked` 页面仍必须有 `minNotes` 条 `.snote`。
 *
 * @returns {{ problems: string[], readings: object[] }}
 */
function noteManifestSelfCheck() {
  const problems = [];
  const readings = [];
  const htmlFiles = listPageFiles(OUT);
  const diskRoutes = new Set(htmlFiles.map(file => file.replace(/index\.html$/, '')));
  for (const route of [...diskRoutes].sort()) {
    if (!noteIntent.has(route)) {
      problems.push(`${route || '(首页)'} 有产物页面但清单里没有这一页的说明意图 `
        + `—— 新增页面族必须显式登记（notePage(route, …)），否则它就是一个新的隐形说明面`);
    }
  }
  for (const route of [...noteIntent.keys()].sort()) {
    if (!diskRoutes.has(route)) {
      problems.push(`清单登记了 ${route || '(首页)'} 的说明意图，但产物里没有这一页 —— 清单与产物分家了`);
    }
  }
  for (const route of [...noteIntent.keys()].sort()) {
    if (!diskRoutes.has(route)) continue;
    const page = noteIntent.get(route);
    const html = fs.readFileSync(path.join(OUT, noteArtifactPathOf(route)), 'utf8');
    const dom = noteSignaturesInMain(html);
    const where = route || '(首页)';
    const declaredTotals = new Map(NOTE_SLOTS.map(slot => [slot.id, 0]));
    for (const note of page.notes) declaredTotals.set(note.slot, declaredTotals.get(note.slot) + 1);
    const domTotals = new Map(NOTE_SLOTS.map(slot => [slot.id, [...dom.get(slot.id).values()].reduce((sum, n) => sum + n, 0)]));

    // ① 逐签名对账（双向）：签名 = 排序后的完整 class token 集合
    for (const slot of NOTE_SLOTS) {
      const domBucket = dom.get(slot.id);
      const declaredSignatures = new Map();
      page.notes.filter(note => note.slot === slot.id).forEach(note => {
        declaredSignatures.set(note.signature, (declaredSignatures.get(note.signature) || 0) + 1);
      });
      const signatures = new Set([...declaredSignatures.keys(), ...domBucket.keys()]);
      for (const signature of signatures) {
        const declaredCount = declaredSignatures.get(signature) || 0;
        const domCount = domBucket.get(signature) || 0;
        if (declaredCount === domCount) continue;
        // 台账页面只做**单向**对账：多出来的说明属于范围之外的那个模块（它们由 minNotes 下限守），
        // 但「清单声明的容器必须真的渲染出来」这一条对台账页面同样成立。
        if (page.untracked && domCount > declaredCount) continue;
        // 报错位点：取该签名在清单里的第一条（没有登记时取 slot 的第 0 条）—— route#index 可定位
        const noteIndex = page.notes.findIndex(note => note.slot === slot.id && note.signature === signature);
        const at = `${where}#${noteIndex === -1 ? 0 : noteIndex}`;
        problems.push(`${at} 槽位 ${slot.id} 签名 <${signature || slot.token}>：`
          + `清单声明 ${declaredCount} 条、产物里数出 ${domCount} 条 —— `
          + (declaredCount > domCount
            ? '说明没有按登记的容器渲染（换名 / 换容器 / 漏渲染）'
            : '产物里出现了没有登记的说明容器（绕过 noteDeclare() 直接写进页面）'));
      }
    }

    // ② 结构下限（页面族不变式）
    for (const [slotId, floor] of Object.entries(page.floors)) {
      const min = floor && floor.min !== undefined ? floor.min : 0;
      const actual = domTotals.get(slotId) || 0;
      if (actual < min) {
        problems.push(`${where} 槽位 ${slotId}：页面族的**结构下限**是 ${min} 条，产物里只有 ${actual} 条 `
          + `—— 这一族的说明被整条删掉或改成了别的容器（登记与模板一起消失时，只有下限能挡住它）`);
      }
      if (floor && floor.max !== undefined && actual > floor.max) {
        problems.push(`${where} 槽位 ${slotId}：页面族的上限是 ${floor.max} 条，产物里有 ${actual} 条`);
      }
    }

    // ③ 台账下限（范围之外的模块构造的说明）
    if (page.untracked) {
      const actual = domTotals.get('main-snote') || 0;
      if (actual < page.untracked.minNotes) {
        problems.push(`${where} 台账 ${page.untracked.family}（${page.untracked.owner}）：`
          + `要求至少 ${page.untracked.minNotes} 条 .snote，产物里只有 ${actual} 条 `
          + `—— 无条件的说明（${page.untracked.structural}）没有渲染出来`);
      }
    }

    // ④ complete 页面：整页 `.snote` 总数逐字相等（两侧读数都记进报告）
    if (!page.untracked) {
      const declared = declaredTotals.get('main-snote') || 0;
      const actual = domTotals.get('main-snote') || 0;
      if (declared !== actual) {
        problems.push(`${where} 整页 .snote：清单声明 ${declared} 条、产物里数出 ${actual} 条（完整对账不许有差额）`);
      }
    }
    readings.push({
      route,
      kind: page.pageKind,
      declared: Object.fromEntries(declaredTotals),
      dom: Object.fromEntries(domTotals),
      complete: !page.untracked,
      untracked: page.untracked ? page.untracked.family : null
    });
  }
  return { problems, readings };
}

/**
 * 把页面级说明的**意图清单**写到产物目录的**兄弟文件**（`<FINAL_OUT>.notes.ndjson`）。
 *
 * 时机：`main()` 里是 `assemble()` → `selfCheck()` → `promoteStaging()` **之后**（t3 调整过顺序）。
 * 理由：清单描述的是「这一份产物打算输出哪些说明」，所以它应当**跟着产物一起出现**。
 * 失效方式（这就是调整顺序的原因）：留在 `selfCheck()` 之前写 —— 一次失败的构建（说明对不上、
 * 或任何别的自检红）也会在仓库根留下一份「描述了一份从未就位的产物」的清单，
 * 接着跑 `verify-site --dir=<产物副本>` 的人会把这份陈旧清单当成意图侧，看到一堆无法解释的红。
 *
 * 与自检的关系：`noteManifestSelfCheck()` **不读这个文件**（它用内存里的 `noteIntent` +
 * 回读 `OUT` 的 HTML 做对账），所以把它放到 `selfCheck()` 之后不影响自检；真正读它的是
 * 独立进程的真浏览器门禁（`verify-site.js` §22c ⑨）。
 * 文件是 NDJSON（见本节开头「为什么不是 `.json`」），页按 route 排序 ⇒ 连续两次构建逐字节一致。
 */
function writeNotesManifest() {
  fs.mkdirSync(path.dirname(NOTES_MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(NOTES_MANIFEST_PATH, notesManifestText(), 'utf8');
}

  return {
    NOTE_SLOTS,
    noteIntent,
    notePageEntry,
    noteSignatureOf,
    noteDeclare,
    notePinned,
    noteRegister,
    notePage,
    noteUntracked,
    noteArtifactPathOf,
    noteDeclarerFor,
    noteSignaturesInMain,
    notesManifestText,
    noteManifestSelfCheck,
    writeNotesManifest
  };
}

module.exports = { createNotesManifest };
