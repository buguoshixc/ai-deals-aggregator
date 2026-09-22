/**
 * 一次性生成 assets/logos/manifest.json：
 *   把样稿阶段的品牌路径数据（mockups/logos/_brand-svg.json）与人工核定的元数据合并，
 *   落到项目自己的资产目录里，之后 manifest 就是唯一事实来源。
 *
 * 只跑一次；生成后请直接编辑 assets/logos/manifest.json。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
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

const manifest = {
  note: '厂商品牌图形登记表。页面只写 data-logo="key"，图形由 scripts/lib/logos.js 在构建期生成为 dist/logos/ 与 dist/logos.css。品牌图形版权归各厂商所有，本站仅作标识用途。',
  order: Object.keys(logos).sort(),
  logos: logos
};

fs.writeFileSync(path.join(ROOT, 'assets', 'logos', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
const brandCount = Object.values(logos).filter(l => l.kind === 'brand').length;
console.log(`✅ assets/logos/manifest.json 已生成：${Object.keys(logos).length} 个 logo（矢量 ${brandCount} / 官网文件 ${Object.keys(logos).length - brandCount}）`);
