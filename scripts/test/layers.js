'use strict';
/**
 * 测试分层声明表（L1–L6）—— **「每个测试属于哪一层」的唯一出处**。
 *
 * ## 这份表回答什么
 *
 * 一个测试失败时，第一件要知道的是「它属于哪一层」：Unit 红了是纯函数坏了；Domain 红了是
 * 数据/判据坏了；Build 红了是产物坏了；Browser 红了是**只有浏览器能证明的**那类东西
 * （布局、可见性、溢出、交互）坏了。没有这份声明时，三十多个扁平脚本各红各的，定位全靠点开看。
 *
 * ## 它**不是**第三份平行注册表（这一点很关键）
 *
 * 「有哪些测试」仍然只有两个出处：`package.json`（存在性）与
 * `.github/actions/gate/action.yml`（CI 真的跑到，由 `check-ci-consistency.js` 的断言
 * (17)/(19) 双向把守）。这份表只补第三条信息 —— **层归属**，并由 `scripts/test/fitness.js`
 * 用一条断言守住三件本表该负责的事：
 *   ① 表里不能有**幽灵条目**（写着 package.json 里不存在的 script）；
 *   ② 每个 `selftest:*` 必须**恰好属于一层**（加了测试忘了分层会红）；
 *   ③ 同一个 script 不能同时出现在两层。
 * 「每个测试都被门禁真的跑到」这个方向**刻意不在这里重复**——它已有唯一 owner
 * （`check-ci-consistency.js` 的 (17)/(19)）。同一个不变量两处证明，正是本轮要消灭的形态。
 *
 * ## 层的定义（判据是「它需要什么才能跑」，不是「它测什么」）
 *
 *   L1 unit               纯函数 / parser / 映射：不需要仓库数据，也不需要 dist
 *   L2 domain integration  需要仓库数据（scripts/data/**、deals.json、各注册表…），**不需要 dist**
 *   L3 build integration   需要 `dist/`：产物级对账（路由闭包 / sitemap / manifest / 逐字节可复现）
 *   L4 browser             需要真浏览器：布局 / 可见性 / 溢出 / 交互 / 响应式 / JS 错误
 *   L5 release smoke       只对**已部署**站点抽少量关键页，不重复整个门禁
 *   L6 mutation            **不是一套独立文件**，而是一份从源码派生的清单（见下）
 *
 * ## 为什么 L2/L3 的划分可信（可机器验证）
 *
 * 判据是「跑得起来的前提」，而且**与门禁自己的步骤顺序一致**：门禁里排在
 * 「Assemble site」之前的检查都不需要 dist，排在之后的都需要（`GATE_ARTIFACT_STEPS`
 * 是同一件事的另一份表达）。`run.js` 因此可以在**没有 dist/** 的干净检出里跑 L1+L2 ——
 * 若某个「L2」测试其实偷偷读了 dist，在那里它会红，这正是分层要暴露的隐藏依赖。
 */

/**
 * 层 → 该层的 npm script 名（**引用 package.json，不复制命令**）。
 *
 * 层的顺序即执行顺序；层内按此顺序跑。分类依据（本轮实测）：
 *   · L3 成员都在源码里真的读 `dist/`（`zh`/`planshub`/`models`/`vendor`/`archive`/
 *     `analytics` 自测读产物，`verify:seo` 从 dist 解析）；
 *   · L2 里的 `check:*` 是**仓库内部派生文件**的可复现门禁（重建后与仓库里那份逐字节比），
 *     不碰 dist —— 所以它们能、也确实跑在门禁的构建步骤**之前**。
 *
 * t2：原 L3 里还有 `selftest:data-docs`（读 `/docs/data/` 与 `/data/index.json`）与
 * `check:feeds:reproducible`（构建两次比对 Feed 产物），L2 里有 `selftest:feeds`。
 * 这三条随「订阅层 + 数据出口整族下架」一起删 —— 它们的被测对象在产物里已经不存在，
 * 留着只会得到「找不到文件」这种离原因很远的红。删 script 与删文件**必须同批**：
 * `check-ci-consistency.js` 的反向登记断言（磁盘上每个 `*-selftest.js` 都要能被某条
 * npm script 跑到）会抓半删状态。
 */
const LAYERS = {
  L1: {
    label: 'Unit（纯函数 / parser / 映射）',
    needs: [],
    scripts: [
      'selftest:expiry',
      'selftest:app-token'
    ]
  },
  L2: {
    label: 'Domain integration（仓库数据 → 判据，不需要 dist）',
    needs: ['scripts/data/**', 'deals.json', 'plans.json', 'api-plans.json', 'models.json', '各注册表与历史日志'],
    scripts: [
      'validate',
      'check:reproducible',
      'check:history',
      'migrate:audience:verify',
      'selftest:text',
      'selftest:audience',
      'selftest:roles-note',
      'selftest:provenance',
      'selftest:history',
      'selftest:changes',
      'selftest:health',
      'selftest:plans',
      'selftest:api-plans',
      'selftest:model-registry',
      'selftest:plan-history',
      'selftest:deal-plan-links',
      'selftest:seo',
      'selftest:coverage-targets',
      'selftest:freshness',
      'selftest:model-roles',
      'check:plans:reproducible',
      'check:api-plans:reproducible',
      'check:models:reproducible',
      'check:model-registry-links',
      'check:plan-history',
      'check:api-plan-history',
      'ai:selftest'
    ]
  },
  L3: {
    label: 'Build integration（dist/ → 产物级对账）',
    needs: ['dist/**（先跑 npm run build）'],
    scripts: [
      'selftest:zh',
      'selftest:planshub',
      'selftest:models',
      'selftest:vendor',
      'selftest:archive',
      'selftest:analytics',
      'verify:seo'
    ]
  },
  L4: {
    label: 'Browser（只有真浏览器能证明的）',
    needs: ['dist/**', 'playwright-core', 'DSH_EDGE 或系统 Edge/Chrome'],
    scripts: [
      'verify',
      'verify:regress'
    ]
  },
  L5: {
    label: 'Release smoke（已部署站点，少量关键页）',
    needs: ['网络', '线上站点'],
    scripts: ['smoke']
  }
};

/** 层内实际执行的 npm script */
function scriptsOf(layer) {
  const def = LAYERS[layer];
  if (!def) throw new Error(`未知的测试层「${layer}」（合法：${Object.keys(LAYERS).join(' / ')}）`);
  return [...def.scripts];
}

/** 本表声明的全部 npm script（已按「一个 script 只属于一层」去重校验） */
function allDeclaredScripts() {
  const seen = new Map();
  for (const layer of Object.keys(LAYERS)) {
    for (const s of LAYERS[layer].scripts) {
      if (seen.has(s)) throw new Error(`script「${s}」同时出现在 ${seen.get(s)} 与 ${layer} —— 一个测试只能属于一层`);
      seen.set(s, layer);
    }
  }
  return [...seen.keys()].sort();
}

/**
 * 变异牙清单：从源码派生，**不另立一份手写目录**。
 *
 * 判据刻意粗粒度（「文件里出现变异标记」）：它要回答的是「哪几个测试里带着牙」，
 * 不是「每颗牙叫什么、属于哪一类」。分类登记（CORE / REGRESSION / ADVERSARIAL /
 * THEORETICAL）与「什么时候**不该**加 Mutation」写在 `docs/TESTING.md` ——
 * 因为分类要写理由，而理由是人写的。
 */
function mutationInventory(root) {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(root, 'scripts', 'tools');
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(dir, name), 'utf8');
    if (!/变异牙|mutation|tamper|篡改/i.test(src)) continue;
    out.push({
      file: `scripts/tools/${name}`,
      anchors: (src.match(/tamper|mutate\(|leafMutate|变异牙|篡改/gi) || []).length
    });
  }
  return out;
}

module.exports = { LAYERS, scriptsOf, allDeclaredScripts, mutationInventory };
