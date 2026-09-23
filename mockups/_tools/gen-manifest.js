/**
 * 从样稿阶段的品牌路径数据（mockups/logos/_brand-svg.json）播种 assets/logos/manifest.json。
 *
 * **这个脚本已中性化：它只做并集，绝不减键。**
 *
 * 曾经的形态是「一次性生成、整文件覆盖」。那是个会破坏构建的陷阱：脚本自认的种子只有
 * 38 个 key，而 manifest 是人工维护的、已经长到 49 个 key——重跑会把 ai360 / huggingface /
 * mistral / together / midjourney / xai / ideogram / leonardo / krea / coze / modelscope
 * 这 11 条登记整段删掉，接着 `node scripts/tools/build-local.js` 立刻 exit 1
 * （build-local.js 的 checkLogoCoverage：「RENDER-CORE 引用了未登记的 logo」）。
 *
 * 现在的语义：
 *   ① 目标文件不存在 → 照旧生成（首次播种这条路不变）；
 *   ② 目标文件已存在 → **逐条并集**：已有条目的值一个字节都不动（人工字段优先），
 *      只把种子里有、manifest 里没有的 key 补进去；
 *   ③ 任何情况下都不会让已登记的条目变少；真出现种子带来的键数倒退就抛错中止（不写盘）。
 *
 * 因此重跑本脚本对当前 manifest 是**字节无变化**的操作，可以放心当自检跑。
 * 日常改 manifest 仍然直接编辑 assets/logos/manifest.json（人工维护的唯一事实来源）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MANIFEST_FILE = path.join(ROOT, 'assets', 'logos', 'manifest.json');
const brand = JSON.parse(fs.readFileSync(path.join(ROOT, 'mockups', 'logos', '_brand-svg.json'), 'utf8'));

/** 品牌底色调：极浅的品牌色，让矢量剪影不显得孤零零 */
const TINTS = {
  baidu: '#eef0ff', alibabacloud: '#fff3ea', anthropic: '#f2f3f5', deepseek: '#eef1ff',
  figma: '#fff0ec', github: '#f2f3f5', githubcopilot: '#f2f3f5', google: '#eef3ff',
  elevenlabs: '#f2f3f5', notion: '#f2f3f5', perplexity: '#e9f9fb', qwen: '#f1f0ff',
  replit: '#fff1e9', zapier: '#fff0ea', moonshotai: '#f2f3f5', ollama: '#f2f3f5',
  openrouter: '#f0f1ff', dify: '#eef2ff'
};

/** 每个品牌图形的来源说明（可复核） */
const BRAND_SOURCE = 'simple-icons 官方品牌路径（矢量，随构建生成为独立 SVG）';

/** 官网文件：file / 来源 / 质量 / 适配 */
const FILES = {
  'openai': { name: 'OpenAI', file: 'openai.png', source: 'https://openai.com/apple-icon.png', quality: '高清 180×180', note: '官网 apple-icon' },
  'tencent-cloud': { name: '腾讯云', file: 'tencent-cloud.png', source: 'https://cloudcache.tencent-cloud.com/qcloud/favicon.ico', quality: '高清 300×300', note: '由官网 ICO 最高一帧转出' },
  'volcengine': { name: '火山引擎', file: 'volcengine.png', source: 'https://portal.volccdn.com/obj/volcfe/misc/favicon.png', quality: '高清 192×192' },
  'zhipu': { name: '智谱AI', file: 'zhipu.png', source: 'https://www.bigmodel.cn/static/images/favicon.png', quality: '够用 90×90' },
  'iflytek': { name: '科大讯飞', file: 'iflytek.png', source: 'https://www.xfyun.cn/static/favicon.ico', quality: '偏小 32×32', note: '官网只有 32px favicon 可用，待品牌方提供矢量素材' },
  'siliconflow': { name: '硅基流动', file: 'siliconflow.svg', source: 'https://siliconflow.cn/logo-new.svg', quality: '矢量', fit: 'wide', note: '原图 156×32 长条，用横向胶囊承载' },
  'stepfun': { name: '阶跃星辰', file: 'stepfun.svg', source: 'https://www.stepfun.com/step_favicon.svg', quality: '矢量' },
  'sensetime': { name: '商汤科技', file: 'sensetime.png', source: 'https://www.sensetime.com/assets/favicon.ico', quality: '偏小 120×184', note: '方形图标偏小；站内 logo-frame10.png 是 3.5:1 长条词标，不适合方块位' },
  'baichuan': { name: '百川智能', file: 'baichuan.png', source: 'https://www.baichuan-ai.com/apple-touch-icon.png', quality: '高清 180×180' },
  'groq': { name: 'Groq', file: 'groq.svg', source: 'https://groq.com/favicon.svg', quality: '矢量', pad: 0, note: '图形自带品牌底色，不留内缩' },
  'runway': { name: 'Runway', file: 'runway.png', source: 'https://runwayml.com/icon.png', quality: '高清 320×320' },
  'aws': { name: 'AWS', file: 'aws.png', source: 'https://a0.awsstatic.com/libra-css/images/site/touch-icon-ipad-144-smile.png', quality: '高清 144×144' },
  'canva': { name: 'Canva', file: 'canva.png', source: 'https://static.canva.com/static/images/apple-touch-icon.png', quality: '够用' },
  'cursor': { name: 'Cursor', file: 'cursor.svg', source: 'https://cursor.com/favicon.svg', quality: '矢量 512×512' },
  'make': { name: 'Make', file: 'make.png', source: 'https://www.make.com/apple-touch-icon.png', quality: '高清 180×180' },
  'n8n': { name: 'n8n', file: 'n8n.png', source: 'https://n8n.io/apple-touch-icon.png', quality: '高清 180×180' },
  'cohere': { name: 'Cohere', file: 'cohere.png', source: 'https://cohere.com/apple-touch-icon.png', quality: '高清 180×180' },
  'recraft': { name: 'Recraft', file: 'recraft.png', source: 'https://www.recraft.ai/favicon', quality: '够用 64×64' },
  'windsurf': { name: 'Windsurf', file: 'windsurf.svg', source: 'https://windsurf.com/favicon.svg', quality: '矢量 1024×1024', pad: 0, note: '图形自带品牌底色' }
};

const logos = {};

for (const key of Object.keys(brand).sort()) {
  const b = brand[key];
  logos[key] = {
    name: b.name,
    kind: 'brand',
    viewBox: b.viewBox || '0 0 24 24',
    color: b.color,
    bg: TINTS[key] || '#f2f3f5',
    scale: '72%',
    d: b.d,
    source: BRAND_SOURCE,
    quality: '矢量'
  };
}

// Microsoft 四色方块：simple-icons 抓取时被限流，这里是官方几何（四个等宽方块）的矢量重建
logos.microsoft = {
  name: 'Microsoft',
  kind: 'brand',
  viewBox: '0 0 24 24',
  bg: '#f4f5f7',
  scale: '66%',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<path fill="#F25022" d="M2 2h9.4v9.4H2z"/>' +
    '<path fill="#7FBA00" d="M12.6 2H22v9.4h-9.4z"/>' +
    '<path fill="#00A4EF" d="M2 12.6h9.4V22H2z"/>' +
    '<path fill="#FFB900" d="M12.6 12.6H22V22h-9.4z"/>' +
    '</svg>',
  source: '官方四色方块几何，矢量重建（simple-icons 抓取微软时被限流）',
  quality: '矢量'
};

for (const key of Object.keys(FILES).sort()) {
  const item = FILES[key];
  logos[key] = {
    name: item.name,
    kind: 'file',
    file: item.file,
    bg: item.pad === 0 ? 'transparent' : '#ffffff',
    pad: item.pad === 0 ? '0' : '3px',
    source: item.source,
    quality: item.quality,
    note: item.note
  };
  if (item.fit) logos[key].fit = item.fit;
}

const seed = {
  note: '厂商品牌图形登记表。页面只写 data-logo="key"，图形由 scripts/lib/logos.js 在构建期生成为 dist/logos/ 与 dist/logos.css。品牌图形版权归各厂商所有，本站仅作标识用途。',
  order: Object.keys(logos).sort(),
  logos: logos
};

/* ---------------- 并集写入（绝不覆盖人工条目） ---------------- */

const stableStringify = obj => JSON.stringify(obj, null, 2) + '\n';

const existing = fs.existsSync(MANIFEST_FILE)
  ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'))
  : null;

const seedKeys = Object.keys(seed.logos);
let next;
let added = [];
let kept = [];
let mode;

if (!existing) {
  // ① 首次播种
  mode = 'seeded';
  next = seed;
} else {
  // ② 逐条并集：已有条目的值原样保留（人工维护的字段优先），只补种子里新出现的 key
  const existingLogos = (existing && typeof existing.logos === 'object' && existing.logos) || {};
  const existingKeys = Object.keys(existingLogos);
  added = seedKeys.filter(key => !(key in existingLogos));
  kept = existingKeys;

  const merged = {};
  // 键序也要稳定：沿用 manifest 自己的顺序（`order` 是排序后的清单，
  // 但 `logos` 的键序是人工累积下来的，重排会让整份文件无谓地改字节）。
  // 种子新增的 key 追加在末尾，待人工把顺序归置好。
  for (const key of existingKeys) merged[key] = existingLogos[key];
  for (const key of added) merged[key] = seed.logos[key];

  // ③ 键数恒等式：merged 由「现有全部 key + 种子里的新 key」构成，所以并集语义下
  //    键数只增不减——这一行在当前实现里**不可能**为真。留着它不是为了兜住今天的逻辑，
  //    而是给未来改动加一道闸：谁要是把上面的构造改成「先清空再填种子」，
  //    这里会立刻炸在写盘之前，而不是等到构建期才发现 11 条 logo 登记没了。
  if (Object.keys(merged).length < existingKeys.length) {
    throw new Error(
      `并集结果 ${Object.keys(merged).length} 个 key 少于现有 ${existingKeys.length} 个——拒绝写盘。`
    );
  }

  const note = existing.note || seed.note;
  mode = added.length ? 'merged' : 'unchanged';
  next = { note, order: Object.keys(merged).sort(), logos: merged };
}

// 内容不变就不碰文件：既保持字节稳定，也避免无意义的 mtime 变化
const before = existing ? fs.readFileSync(MANIFEST_FILE, 'utf8') : null;
const after = stableStringify(next);
if (before !== after) fs.writeFileSync(MANIFEST_FILE, after, 'utf8');

const total = Object.keys(next.logos).length;
const brandCount = Object.values(next.logos).filter(l => l.kind === 'brand').length;
const rel = path.relative(ROOT, MANIFEST_FILE).replace(/\\/g, '/');

if (mode === 'seeded') {
  console.log(`✅ ${rel} 首次生成：${total} 个 logo（矢量 ${brandCount} / 官网文件 ${total - brandCount}）`);
} else {
  console.log(`ℹ️  ${rel} 是人工维护的唯一事实来源，本脚本**只做并集、绝不减键**（禁止整文件覆盖）。`);
  console.log(`    现有登记 ${kept.length} 个 key，种子 ${seedKeys.length} 个 key；` +
    `本次新增 ${added.length} 个，保留 ${kept.length} 个。`);
  if (added.length) console.log(`    新增：${added.join(', ')}`);
  console.log(before === after
    ? `    结果：${rel} 内容无变化（${total} 个 logo，矢量 ${brandCount} / 官网文件 ${total - brandCount}）`
    : `    结果：已并集写回 ${total} 个 logo（矢量 ${brandCount} / 官网文件 ${total - brandCount}）`);
}
