/**
 * B 类资讯线索采集器（beta，2026-11 供给端 P2）。
 *
 * ## 这个采集器要解决什么
 *
 * 有些 AI 限时免费 / 降价事件**不会出现在任何结构化页面上**：没有 deal 页、没有活动页，
 * 厂商也不发公告，但科技媒体会写稿。典型例子是「腾讯 WorkBuddy 里 DeepSeek 限时免费」
 * （2026-09，媒体稿 c114：https://www.c114.net.cn/ainews/122276.html）—— 厂商定价页上
 * 永远查不到它。P0/P1 两个结构化来源（AppSumo / OpenRouter）覆盖不到这一类。
 *
 * 所以 B 类只做一件事：**在可信科技媒体的 RSS 里发现「像线索」的文章，按线索登记**。
 * 它不核验、不下结论：一条线索只存**四个事实**（标题 / 原文链接 / 日期 / 来源），
 * 外加 schema 必需的簿记字段（id / 类型 / 收录渠道）。判据、TTL、三道门的唯一出处是
 * `scripts/lib/lead-radar.js`，本文件只负责「抓哪个 feed、怎么把候选变成记录、怎么留日志」。
 *
 * ## 为什么是「一个 feed 一个采集器」而不是「一个大采集器抓所有 feed」
 *
 * 采集器 id 是**来源级健康/熔断/结构探针的最小单位**（`source-health.json`、
 * `source-probes.json`、P3 的源级熔断都按 id 记账）。如果 8 个 feed 共用一个采集器，
 * 任何一个 feed 改版都会把整条「线索来源」记成失败，健康表也看不出是哪一个坏。
 * 所以这里用工厂函数生成 8 个采集器，每个有自己的 id / name / fixture / 探针。
 *
 * ## 来源可达性验证（2026-11-09 本机实测，详见 OVERNIGHT-REPORT.md）
 *
 * 需求要求「先做可达性验证，能访问且有 RSS 的优先」。2026-11-09 从本机逐个实测：
 *
 * | 候选 | 结果 | 处置 |
 * |---|---|---|
 * | IT之家 | 200，RSS 2.0（60 条） | ✅ 收录 |
 * | 36氪 | `www.36kr.com/feed` 200 / RSS（30 条；`36kr.com/feed` 返回 HTML） | ✅ 收录 |
 * | 量子位 | 200，RSS（10 条，AI 垂直） | ✅ 收录 |
 * | 爱范儿 | 200，RSS（20 条） | ✅ 收录 |
 * | 少数派 | 200，RSS（10 条） | ✅ 收录 |
 * | 极客公园 | 200，RSS（30 条，覆盖约 10 天） | ✅ 收录 |
 * | 快科技 | 200，RSS（100 条；`rss.mydrivers.com`） | ✅ 收录（本轮唯一真实线索来源） |
 * | 钛媒体 | 200，RSS（16 条） | ✅ 收录 |
 * | V2EX | 超时（www / hk / global 三个入口均 25s 无响应） | ❌ 本机不可达 |
 * | 机器之心 | `/rss`、`/feed` 均返回 SPA HTML，没有可用 RSS | ❌ 无 RSS |
 * | 即刻 | 无公开 RSS | ❌ 无 RSS |
 * | 虎嗅 | 反爬 WAF 返回 HTML | ❌ 无 RSS |
 * | 雷峰网 | HTTP 403 | ❌ 不可达 |
 * | 智东西 | HTTP 500 | ❌ 不可达 |
 * | 品玩 | `/feed`、`/rss` 均 404/HTML | ❌ 无 RSS |
 * | InfoQ | RSS 可达，但 robots.txt 明示 `Disallow: /feed/` | ❌ 遵从而排除 |
 *
 * ## 记录形态：为什么 `type` 是 `tool` 而不是 `deal`
 *
 * 线索**没有被核验**，把它写成 `type:"deal"` 会让它进首页优惠列表、进「优惠 ↔ 套餐」等
 * 只该由真实优惠参与的判据。`type:"tool"` 是数据契约里「不是优惠」的那一档，恰好是
 * 「一条待核验的资讯」。同时 `validateDeal` 对 `type:"deal"` 要求 `discountInfo` 非空，
 * 而给线索编一句「优惠说明」本身就是下结论 —— 这条边界也由 type 的选择守住。
 *
 * 页面侧按 `sourceFacts.sourceType === "lead"` 把线索从优惠列表里排除，只留在「变化雷达」，
 * 并按 `SOURCE_WORDING.SOURCE_TYPE.lead` 显示「线索 · 未核验」；雷达行的链接直接指向原文
 * （线索没有站内详情页）。这一层改动见 `lib/changes.js` 与 `index.html` 的注释。
 *
 * ## 本轮改动历史
 *
 * 2026-11-09 首次上线。首轮真实产出 1 条线索（快科技《每天白赚几百 AI大模型免费薅羊毛》），
 * 其余 7 个 feed 当日 0 条 —— 判据按「宁可 0 条，不要 5 条假的」执行，这是预期结果，
 * 不是失败。每个来源为什么 0 条，采集日志里逐源打印了「7 天窗口内条目数 / 命中数 /
 * 近失配样本」。
 */

const { getText } = require('../lib/http');
const radar = require('../lib/lead-radar');
const { cleanText } = require('../lib/schema');

/**
 * 已实测可达且有 RSS 的媒体源（按需求「能访问且有 RSS 的优先」）。
 *
 * `homepage` 只用于日志；`url` 是 RSS 地址，也是记录的「收录渠道」（sourceUrl）。
 * 顺序无优先级含义：每个采集器独立运行，不因为前面的源失败而跳过后面的。
 */
const FEEDS = [
  {
    id: 'leads_ithome',
    name: 'IT之家',
    url: 'https://www.ithome.com/rss/',
    homepage: 'https://www.ithome.com/'
  },
  {
    id: 'leads_36kr',
    name: '36氪',
    // 实测：36kr.com/feed 返回 HTML，www.36kr.com/feed 才是 RSS。
    url: 'https://www.36kr.com/feed',
    homepage: 'https://www.36kr.com/'
  },
  {
    id: 'leads_qbitai',
    name: '量子位',
    url: 'https://www.qbitai.com/feed',
    homepage: 'https://www.qbitai.com/'
  },
  {
    id: 'leads_ifanr',
    name: '爱范儿',
    url: 'https://www.ifanr.com/feed',
    homepage: 'https://www.ifanr.com/'
  },
  {
    id: 'leads_sspai',
    name: '少数派',
    url: 'https://sspai.com/feed',
    homepage: 'https://sspai.com/'
  },
  {
    id: 'leads_geekpark',
    name: '极客公园',
    url: 'https://www.geekpark.net/rss',
    homepage: 'https://www.geekpark.net/'
  },
  {
    id: 'leads_mydrivers',
    name: '快科技',
    url: 'https://rss.mydrivers.com/rss.aspx?Tid=1',
    homepage: 'https://www.mydrivers.com/'
  },
  {
    id: 'leads_tmtpost',
    name: '钛媒体',
    url: 'https://www.tmtpost.com/rss',
    homepage: 'https://www.tmtpost.com/'
  }
];

/** 每个来源每轮最多验证多少条候选原文（「原文可点开」要真去 GET 一次，不能无限抓） */
const MAX_URL_CHECKS = 10;
/** 近失配样本最多打印多少条（无人值守时用来抽查判据有没有漏掉正常写法） */
const MAX_NEAR_MISS_LOGGED = 10;
/** 被窗口/结构筛掉的样本最多打印多少条 */
const MAX_DROPPED_LOGGED = 10;

/**
 * 基本信息元组 + 来源。**只放四个事实**（标题 / 原文链接 / 日期 / 收录来源）与 schema 簿记：
 *   · `title`     —— RSS `<title>`，已 cleanText（≤150 字，与 makeDeal 同一把尺子）
 *   · `url`       —— RSS `<link>`，读者点开就能看原文
 *   · `firstSeen` —— **原文日期**（RSS `<pubDate>` 归一成 YYYY-MM-DD）。
 *     契约里没有独立的「原文日期」字段，而 firstSeen 是详情/雷达上唯一展示的日期行；
 *     把它填成原文日期，TTL 才能按新闻的时效算（见 lead-radar.js 文件头最后一段）。
 *   · `source`    —— 媒体名（写进记录的「来源」行；类型由 provenance.SOURCE_TYPES 登记为 lead）
 * 另两个是 schema 必需/出处簿记，不是内容字段：
 *   · `sourceUrl` —— 该 feed 的地址（页面「收录渠道」行；点开可复核我们读的是哪一路 RSS）
 *   · `type`      —— `tool`（不是优惠，理由见文件头「记录形态」）；makeDeal 会按无优惠信号保持 tool
 *
 * **刻意不填**：description / discountInfo / validity / expiresAt / 六字段 / verified ——
 * 「不填六字段、不下结论、不写已核验」是本阶段的硬要求，由 ai-selftest 的「线索草稿形状」断言盯着。
 */
function toDraft(item, feed) {
  return {
    title: item.title,
    url: item.url,
    source: feed.name,
    sourceUrl: feed.url,
    firstSeen: item.date,
    type: 'tool'
  };
}

/**
 * 纯解析入口（fixture 回放用）：RSS 文本 → 未筛选的线索草稿列表。
 *
 * 与 `collect()` 的分工和 AppSumo / OpenRouter 一致：**parse 不做筛选**（筛选要注入 now，
 * 见 selectLeads），这样 fixture 回放钉住的是「RSS 结构解析」，判据由 ai-selftest 用注入时间
 * 的用例单独钉。fixture-test 比对的 expected.json 就是本函数在最小真实片段上的输出。
 */
function parseFeedAsDrafts(xml, feed) {
  return radar.parseFeed(xml, feed.name).map(item => toDraft(item, feed));
}

/** 采集日志：命中 / 近失配 / 窗口筛掉的读数（0 也要打印，且每类样本都带标题） */
function logSelection(feed, stats, dropped, nearMisses, leads) {
  console.log(`[${feed.name}] RSS 条目 ${stats.feedItems} · 7 天窗口内 ${stats.inWindow} · 三闸命中 ${stats.matched}`);
  if (nearMisses.length) {
    console.log(`[${feed.name}] 近失配（平台名 + 免费/降价 都命中、只差时间词）${nearMisses.length} 条；` +
      `前 ${Math.min(nearMisses.length, MAX_NEAR_MISS_LOGGED)} 条：`);
    nearMisses.slice(0, MAX_NEAR_MISS_LOGGED).forEach((row, index) => {
      console.log(`  ${String(index + 1).padStart(2, ' ')}. ${row.title}（命中平台：${row.platform}；缺：${row.missing}）`);
    });
    if (nearMisses.length > MAX_NEAR_MISS_LOGGED) {
      console.log(`  …另有 ${nearMisses.length - MAX_NEAR_MISS_LOGGED} 条未列出`);
    }
  }
  if (dropped.length) {
    console.log(`[${feed.name}] 窗口/结构筛掉 ${dropped.length} 条；前 ${Math.min(dropped.length, MAX_DROPPED_LOGGED)} 条：`);
    dropped.slice(0, MAX_DROPPED_LOGGED).forEach((row, index) => {
      console.log(`  ${String(index + 1).padStart(2, ' ')}. ${row.title}（${row.reason}）`);
    });
  }
  if (!leads.length) {
    console.log(`[${feed.name}] 本轮 0 条线索（判据：平台/产品名 + 免费/限免/降价 + 时间词，三闸同时命中）`);
    return;
  }
  console.log(`[${feed.name}] 本轮线索 ${leads.length} 条：`);
  leads.forEach((item, index) => {
    console.log(`  ${String(index + 1).padStart(2, ' ')}. [${item.date}] ${item.title}`);
    console.log(`      ${item.url}`);
  });
}

/**
 * 单 feed 采集：抓 RSS → 解析 → 三道门 + 7 天窗口 → 逐条验证原文可点开 → 变成草稿。
 *
 * 「单条候选坏掉」只筛掉这一条并打印原因，绝不抛错；
 * 只有「整份 feed 抓不到 / 结构变了（0 条目）」才抛错，让编排器把它记成**来源失败**
 * （而不是静默 0 条 —— 那会伪装成「今天确实没有线索」）。
 */
async function collectFeed(feed) {
  const xml = await getText(feed.url, {
    timeout: 30000,
    headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8' }
  });
  const parsed = radar.parseFeed(xml, feed.name);
  if (!parsed.length) {
    throw new Error(`${feed.url} 没有解析到任何 RSS 条目（feed 结构可能已改版）`);
  }

  const { items: candidates, dropped, nearMisses, stats } = radar.selectLeads(parsed, {});
  const verified = [];
  const quota = candidates.slice(0, MAX_URL_CHECKS);

  // 「原文可点开」是硬门：一条点不开的线索等于没有。逐条 GET 一次原文（走 lib/http.js，遵守 robots）。
  for (const item of quota) {
    try {
      await getText(item.url, { timeout: 20000, retries: 0 });
      verified.push(item);
    } catch (error) {
      dropped.push({ title: item.title, reason: `原文不可点开：${error.message}` });
    }
  }
  if (candidates.length > quota.length) {
    candidates.slice(quota.length).forEach(item => {
      dropped.push({ title: item.title, reason: `本轮原文核验配额（${MAX_URL_CHECKS} 条）用尽，未收录` });
    });
  }

  const leads = verified.filter(item => radar.leadSignal(item).ok);
  logSelection(feed, stats, dropped, nearMisses, leads);
  return leads.map(item => toDraft(item, feed));
}

/**
 * 生成采集器对象。每个对象都带：
 *   · `fixture`            —— 对应 `scripts/data/fixtures/<id>.feeds/`
 *   · `zeroOutputExpected`  —— 线索判据刻意严格，**0 条是正常结果**。健康表据此不把
 *     「今天没有值得收的线索」记成 degraded/failed（见 lib/health.js 的同名字段）；
 *     否则 8 个媒体源会在 3 轮后集体「熔断」，把一个按设计空转的雷达关掉。
 *   · `radar`              —— 标记这是线索来源（P3 源级熔断/报告分类用；与 headless 同级的声明位）
 */
function makeCollector(feed) {
  return {
    id: feed.id,
    name: feed.name,
    region: 'cn',
    radar: true,
    zeroOutputExpected: true,
    fixture: `${feed.id}.feeds`,
    parse: xml => parseFeedAsDrafts(xml, feed),
    collect: () => collectFeed(feed)
  };
}

const collectors = FEEDS.map(makeCollector);

/* 自测用出口（不进注册表）：判据、TTL、日志上限、草稿形状都要能被逐格钉住 */
module.exports = collectors;
module.exports.__test = {
  FEEDS,
  MAX_URL_CHECKS,
  MAX_NEAR_MISS_LOGGED,
  MAX_DROPPED_LOGGED,
  toDraft,
  parseFeedAsDrafts,
  collectFeed
};
